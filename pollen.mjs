#!/usr/bin/env node
// pollen — peer messaging between agents. zero deps.
//
//   node pollen.mjs             MCP server (agent-side)
//   node pollen.mjs --relay     HTTP relay (cross-machine hop)
//   node pollen.mjs --version   print the version
//   node pollen.mjs --watch ID  tail an agent's journal — one line per new message
//
// Agent mode env:
//   POLLEN_ID       required — agent name
//   POLLEN_RELAY    optional — relay URL for cross-machine
//   POLLEN_ALLOW    optional — comma-separated trusted agent IDs
//   POLLEN_DIR      optional — mailbox root (default /tmp/pollen)
//
// Peers let in with pollen_allow are kept in POLLEN_DIR/<id>/allow, one per line.
//
// Relay mode env:
//   POLLEN_PORT     optional — listen port (default 4747)
//
// Watch mode env:
//   POLLEN_DIR      optional — mailbox root (default /tmp/pollen)
//
import {
  watch, mkdirSync, readdirSync, readFileSync, appendFileSync,
  renameSync, unlinkSync, writeFileSync, existsSync,
} from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";
import http from "http";

const VERSION = "0.1.0";
const DIR = process.env.POLLEN_DIR ?? "/tmp/pollen";

if (process.argv.includes("--version")) {
  process.stdout.write(`pollen ${VERSION}\n`);
} else if (process.argv.includes("--relay")) {
  startRelay();
} else if (process.argv.includes("--watch")) {
  startWatch(process.argv[process.argv.indexOf("--watch") + 1]);
} else {
  startAgent();
}

// =============================================================================
// RELAY MODE
// =============================================================================

function startRelay() {
  const PORT = parseInt(process.env.POLLEN_PORT ?? "4747");
  const listeners = new Map(); // id → (from, message) => void
  const queues = new Map();    // id → [{ from, message }]

  function body(req) {
    return new Promise((r) => {
      let d = "";
      req.on("data", (c) => (d += c));
      req.on("end", () => r(d));
    });
  }

  const server = http.createServer(async (req, res) => {
    const [, action, id] = req.url.split("/");

    // GET /agents
    if (action === "agents") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify([...listeners.keys()]));
    }

    // GET /listen/:id — SSE
    if (action === "listen" && id) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": connected\n\n");

      const push = (from, message) => {
        res.write(`data: ${JSON.stringify({ from, message })}\n\n`);
      };
      listeners.set(id, push);

      for (const msg of queues.get(id) ?? []) push(msg.from, msg.message);
      queues.delete(id);

      req.on("close", () => listeners.delete(id));
      return;
    }

    // POST /send — { from, to, message }
    if (action === "send" && req.method === "POST") {
      const { from, to, message } = JSON.parse(await body(req));
      const push = listeners.get(to);
      if (push) {
        push(from, message);
      } else {
        const q = queues.get(to) ?? [];
        q.push({ from, message });
        queues.set(to, q);
      }
      res.writeHead(200);
      return res.end("ok");
    }

    res.writeHead(404);
    res.end("not found");
  });

  // Report the port actually bound, so POLLEN_PORT=0 is usable.
  server.listen(PORT, () => {
    process.stderr.write(`pollen relay on :${server.address().port}\n`);
  });
}

// =============================================================================
// JOURNAL — append-only arrival log, shared by agent and watch modes
// =============================================================================
//
// Mailbox files are transient: the server consumes and unlinks each one within
// milliseconds of it landing, so nothing outside the process can reliably see
// them. The journal is the durable record instead — every arrival is appended
// as one JSON line and never removed. That makes it both the inbox (messages
// survive a server restart) and the one file a watcher can tail.
//
// `seq` is one more than the highest seq in the file when the entry is
// written, so it stays unique even if two processes append to one journal.
// `cursor` holds the seq of the last message the agent actually read.

function journalPath(id) { return join(DIR, id, "journal.jsonl"); }
function cursorPath(id) { return join(DIR, id, "cursor"); }
function allowPath(id) { return join(DIR, id, "allow"); }

function readJournal(id) {
  let raw = "";
  try { raw = readFileSync(journalPath(id), "utf-8"); } catch {}
  return raw.split("\n").flatMap((line) => {
    // Blank tail, or a line caught mid-append — the next read gets it whole.
    try { return JSON.parse(line); } catch { return []; }
  });
}

function topSeq(id) {
  return readJournal(id).reduce((top, e) => Math.max(top, e.seq ?? 0), 0);
}

function readCursor(id) {
  try { return parseInt(readFileSync(cursorPath(id), "utf-8"), 10) || 0; } catch { return 0; }
}

function unread(id) {
  const cursor = readCursor(id);
  return readJournal(id).filter((e) => e.seq > cursor && e.status === "delivered");
}

// Arrivals still sitting at the trust gate. The journal never mutates, so an
// allow or deny is its own entry pointing back at the pending one it settles.
function heldPending(id) {
  const entries = readJournal(id);
  const settled = new Set(entries.map((e) => e.resolves).filter((s) => s != null));
  return entries.filter((e) => e.status === "pending" && !settled.has(e.seq));
}

// =============================================================================
// AGENT MODE
// =============================================================================

function startAgent() {
  const RELAY = process.env.POLLEN_RELAY;
  const ID = process.env.POLLEN_ID;
  if (!ID) { process.stderr.write("POLLEN_ID is required. pollen cannot start without an id; set it in the env of your .mcp.json entry.\n"); process.exit(1); }

  const preAllowed = (process.env.POLLEN_ALLOW ?? "").split(",").filter(Boolean);

  // pollen_allow writes to a file because the env var is fixed for the life of
  // the process. The file is read on every arrival rather than cached, so it is
  // the one record of who was let in: it survives a restart, and an edit by a
  // person or a second server with the same id takes effect at once.
  function allowed() {
    let raw = "";
    try { raw = readFileSync(allowPath(ID), "utf-8"); } catch {}
    return raw.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  function trusts(from) {
    return preAllowed.includes(from) || allowed().includes(from);
  }

  const pending = new Map(); // agent → [{ from, message, seq }]

  mkdirSync(join(DIR, ID), { recursive: true });

  // The journal is what rings the gate, so the gate is rebuilt from it — a
  // knock the watcher reports has to still be there to allow or deny.
  for (const e of heldPending(ID)) {
    pending.set(e.from, [...(pending.get(e.from) ?? []), { from: e.from, message: e.message, seq: e.seq }]);
  }

  function record(from, message, status, resolves) {
    // Numbered from the journal at write time, not from a counter taken at
    // start: another process may have appended since, and a reused seq hides
    // a message behind the cursor.
    const seq = topSeq(ID) + 1;
    const entry = { seq, ts: new Date().toISOString(), from, message, status };
    if (resolves !== undefined) entry.resolves = resolves;
    appendFileSync(journalPath(ID), JSON.stringify(entry) + "\n");
    return entry.seq;
  }

  // --- mcp protocol ---------------------------------------------------------

  createInterface({ input: process.stdin, terminal: false }).on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    try {
      await handle(msg);
    } catch (e) {
      // Nothing a tool does may cost the agent its radio, and the caller is
      // still owed an answer — an unanswered request hangs it forever.
      if (msg.id !== undefined) reply(msg.id, text(`Request failed: ${e.message}`));
    }
  }).on("close", () => {
    // The host is gone. Stop listening and let the process end on its own once
    // any reply still in flight is written. A server left running would keep
    // taking this agent's messages, and its seq counter would collide with the
    // next server started for the same id.
    tx.close();
  });

  function send(msg) {
    process.stdout.write(JSON.stringify(msg) + "\n");
  }

  function reply(id, result) {
    send({ jsonrpc: "2.0", id, result });
  }

  function notify(content, meta) {
    send({
      jsonrpc: "2.0",
      method: "notifications/claude/channel",
      params: { content, meta },
    });
  }

  async function handle(msg) {
    if (msg.id === undefined) return; // notifications — ignore

    if (msg.method === "initialize") {
      return reply(msg.id, {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
          experimental: { "claude/channel": {} },
        },
        serverInfo: { name: `pollen-${ID}`, version: VERSION },
        instructions: [
          `You are agent "${ID}", a peer on pollen.`,
          `Incoming messages appear as <channel> tags with a "from" attribute.`,
          `Use pollen_send to reach another peer. Use pollen_agents to see who is reachable.`,
          `Use pollen_inbox to read what has arrived. A stranger is held at the gate: ask the user before calling pollen_allow or pollen_deny.`,
          `Do not poll for messages. Run "node pollen.mjs --watch ${ID}" as a background task in your harness — it rings one line the moment anything lands, then you call pollen_inbox to read it.`,
          `To reach peers on other machines: run "node pollen.mjs --relay" then expose it with "cloudflared tunnel --url http://localhost:4747" (free, no account needed).`,
          `Give the resulting URL to the user so they can pass it to the remote peer as POLLEN_RELAY.`,
        ].join(" "),
      });
    }

    if (msg.method === "tools/list") {
      return reply(msg.id, { tools: TOOLS });
    }

    if (msg.method === "tools/call") {
      const { name, arguments: args } = msg.params;
      const fn = toolHandlers[name];
      if (!fn) return reply(msg.id, text(`Unknown tool: ${name}`));
      return reply(msg.id, await fn(args));
    }
  }

  // --- tools ----------------------------------------------------------------

  const TOOLS = [
    {
      name: "pollen_send",
      description: "Send a message to another peer",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Peer id to reach" },
          message: { type: "string", description: "The message" },
        },
        required: ["to", "message"],
      },
    },
    {
      name: "pollen_agents",
      description: "List the peers you can reach",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "pollen_allow",
      description: "Allow a peer to reach you, now and after a restart, and deliver anything they have waiting at the gate",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Peer id to allow" },
        },
        required: ["agent"],
      },
    },
    {
      name: "pollen_deny",
      description: "Deny a peer held at the gate and drop their message",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Peer id to deny" },
        },
        required: ["agent"],
      },
    },
    {
      name: "pollen_inbox",
      description: "Read the messages that have arrived",
      inputSchema: { type: "object", properties: {} },
    },
  ];

  function text(t) {
    return { content: [{ type: "text", text: t }] };
  }

  const toolHandlers = {
    async pollen_send({ to, message }) {
      const status = await tx.send(to, message);
      if (status === "unknown-agent") return text(`No mailbox for "${to}". The message was not sent. Check the id with pollen_agents.`);
      if (status === "unreachable") {
        return text(`pollen could not reach the relay. The message was not delivered to ${to}. Retry, or send it to a local peer.`);
      }
      if (status === "pending") {
        return text(`Held at ${to}'s trust gate — ${to} must allow "${ID}" before this is delivered.`);
      }
      if (status === "queued") {
        return text(`Queued for ${to} — no confirmation from ${to}'s pollen; it stays in the mailbox until taken.`);
      }
      return text(`Sent to ${to}.`);
    },
    async pollen_agents() {
      const list = await tx.agents();
      return text(list.join(", ") || "No peers reachable.");
    },
    async pollen_allow({ agent }) {
      // The allow file holds one id per line, so an id with a line break in it
      // would let in a second peer nobody named.
      if (!agent || /[\s,]/.test(agent)) {
        return text(`Cannot allow ${JSON.stringify(agent)}: a peer id has no spaces, commas or line breaks. Nobody was allowed. Check the id with pollen_agents.`);
      }
      if (!trusts(agent)) appendFileSync(allowPath(ID), agent + "\n");
      const held = pending.get(agent) ?? [];
      if (held.length) {
        pending.delete(agent);
        for (const m of held) {
          record(m.from, m.message, "delivered", m.seq);
          notify(m.message, { from: m.from });
        }
        const what = held.length === 1 ? "Their message has" : `Their ${held.length} messages have`;
        return text(`Allowed ${agent}. ${what} been delivered.`);
      }
      return text(`Allowed ${agent}.`);
    },
    async pollen_deny({ agent }) {
      const held = pending.get(agent) ?? [];
      pending.delete(agent);
      // Settle each pending entry so the gate stops counting them, without
      // repeating the text of something the human just rejected.
      for (const m of held) record(m.from, "", "denied", m.seq);
      if (!held.length) return text(`Nothing pending from ${agent}.`);
      const n = held.length === 1 ? "message" : `${held.length} messages`;
      return text(`Denied and dropped ${n} from ${agent}.`);
    },
    async pollen_inbox() {
      const msgs = unread(ID);
      if (!msgs.length) return text("No new messages.");
      writeFileSync(cursorPath(ID), String(msgs.at(-1).seq));
      return text(msgs.map((m) => `[${m.from}]: ${m.message}`).join("\n"));
    },
  };

  // --- trust gate -----------------------------------------------------------

  function onMessage(from, message) {
    if (trusts(from)) {
      record(from, message, "delivered");
      notify(message, { from });
    } else {
      // Every knock is kept. Holding only the latest would mean a stranger's
      // follow-up destroys the message it is asking about.
      const seq = record(from, message, "pending");
      pending.set(from, [...(pending.get(from) ?? []), { from, message, seq }]);
      notify(
        `"${from}" is knocking. Use pollen_allow or pollen_deny.`,
        { from, status: "pending" }
      );
    }
  }

  // --- transport ------------------------------------------------------------

  function localTransport() {
    const inbox = join(DIR, ID, "inbox");
    mkdirSync(inbox, { recursive: true });
    let watcher;

    // Reading the file is what claims it — fs.watch fires twice for one file
    // and the second pass finds it gone. The unlink comes after the callback
    // has journalled the message, so a crash mid-handover retries rather than
    // loses it.
    function consume(filepath, filename, cb) {
      try {
        const message = readFileSync(filepath, "utf-8");
        const from = filename.match(/from_(.+)\.msg$/)?.[1] ?? "unknown";
        cb(from, message);
        unlinkSync(filepath);
      } catch (e) {
        if (e.code === "ENOENT") return; // already taken
        process.stderr.write(`pollen: kept ${filename}, could not deliver it: ${e.message}\n`);
      }
    }

    // The receiver journals every arrival before the mailbox file is gone, so
    // its journal is the ack channel.
    async function settled(to, since, message) {
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline) {
        const mine = readJournal(to).find(
          (e) => e.seq > since && e.from === ID && e.message === message,
        );
        if (mine) return mine.status;
        await sleep(25);
      }
      return "queued";
    }

    return {
      async send(to, message) {
        const target = join(DIR, to, "inbox");
        if (!existsSync(target)) return "unknown-agent";
        // Baseline the receiver's journal before handing the message over, so
        // whatever turns up afterwards is provably ours and not an earlier one.
        const since = topSeq(to);
        const name = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_from_${ID}`;
        // Write beside the mailbox, then rename in. The receiver is watching
        // this directory, and rename is the only way to put a whole file in
        // front of it — writeFileSync creates the file before filling it.
        const part = join(target, `.${name}.part`);
        writeFileSync(part, message);
        renameSync(part, join(target, `${name}.msg`));
        return settled(to, since, message);
      },
      async agents() {
        return readdirSync(DIR).filter(
          (d) => d !== ID && existsSync(join(DIR, d, "inbox"))
        );
      },
      listen(cb) {
        watcher = watch(inbox, (_, f) => {
          if (f?.endsWith(".msg")) consume(join(inbox, f), f, cb);
        });
      },
      close() { watcher?.close(); },
      drain(cb) {
        for (const f of readdirSync(inbox).filter((f) => f.endsWith(".msg"))) {
          consume(join(inbox, f), f, cb);
        }
      },
    };
  }

  function relayTransport(relay) {
    let closed = false;
    let stream;    // the open /listen request
    let reconnect; // the timer that will open the next one
    return {
      // The trust gate runs in the receiver's process, on the far side of the
      // relay, and its verdict has no route back here. Cross-machine senders
      // learn the message left; not whether it was let in.
      async send(to, message) {
        try {
          const res = await fetch(`${relay}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: ID, to, message }),
          });
          return res.ok ? "sent" : "unreachable";
        } catch {
          return "unreachable";
        }
      },
      async agents() {
        const res = await fetch(`${relay}/agents`);
        return res.json();
      },
      listen(cb) {
        function connect() {
          let reconnecting = false;
          const retry = (e) => {
            if (reconnecting || closed) return; // end and error can both fire
            reconnecting = true;
            if (e) process.stderr.write(`pollen relay error: ${e.message}\n`);
            reconnect = setTimeout(connect, 1000);
          };
          stream = http.get(`${relay}/listen/${ID}`, (res) => {
            createInterface({ input: res }).on("line", (line) => {
              if (!line.startsWith("data: ")) return; // comments and frame breaks
              try {
                const { from, message } = JSON.parse(line.slice(6));
                cb(from, message);
              } catch {}
            });
            res.on("end", retry);
            res.on("error", retry);
          }).on("error", retry); // refused connection, bad DNS — reached before any response
        }
        connect();
      },
      drain() {}, // relay drains on SSE connect
      close() {
        closed = true;
        clearTimeout(reconnect);
        stream?.destroy();
      },
    };
  }

  const tx = RELAY ? relayTransport(RELAY) : localTransport();

  // --- go -------------------------------------------------------------------

  // Anything that arrived last session but was never read is still in the
  // journal. Say so, or it sits there until the agent happens to check.
  const carried = unread(ID).length;
  if (carried) {
    notify(
      `${carried} unread message${carried === 1 ? "" : "s"} from a previous session. Use pollen_inbox to read.`,
      { status: "unread" }
    );
  }

  tx.drain(onMessage);
  tx.listen(onMessage);
}

// =============================================================================
// WATCH MODE
// =============================================================================
//
// One line per message on stdout, forever. Point a harness background task at
// it (Claude Code's Monitor, `&`, systemd — anything that reads lines) and the
// agent gets woken instead of polling.

function startWatch(id) {
  if (!id) {
    process.stderr.write("usage: node pollen.mjs --watch <agent-id>\n");
    process.exit(1);
  }

  const journal = journalPath(id);
  mkdirSync(join(DIR, id), { recursive: true });
  appendFileSync(journal, ""); // create it if the agent hasn't started yet

  const last = readJournal(id).pop();
  let lastSeq = last?.seq ?? 0;
  let lastTs = last?.ts;

  function line(e) {
    // A denial is a settlement entry, not an arrival. Ringing it out would put
    // the text the human just rejected on the very channel they watch.
    if (e.status === "denied") return null;
    if (e.status === "pending") {
      return `[pollen] ${e.from} is knocking — pollen_allow or pollen_deny`;
    }
    const preview = e.message.replace(/\s+/g, " ").trim();
    const short = preview.length > 120 ? preview.slice(0, 119) + "…" : preview;
    return `[pollen] message from ${e.from} — pollen_inbox to read: ${short}`;
  }

  function pump() {
    const entries = readJournal(id);
    // A cleared /tmp restarts the journal at seq 1. If the entry we stopped at
    // is no longer where we left it, start over — going quietly deaf is the one
    // thing a watcher must never do.
    if (entries[lastSeq - 1]?.ts !== lastTs) {
      lastSeq = 0;
      lastTs = undefined;
    }
    for (const e of entries) {
      if (e.seq <= lastSeq) continue;
      lastSeq = e.seq;
      lastTs = e.ts;
      const l = line(e);
      if (l) process.stdout.write(l + "\n");
    }
  }

  // Ring once for whatever is already waiting, so arming the watcher never
  // starts deaf — a count, not a transcript, however long the agent was away.
  const waiting = unread(id).length;
  if (waiting) {
    process.stdout.write(`[pollen] ${waiting} message${waiting === 1 ? "" : "s"} waiting — pollen_inbox to read\n`);
  }

  // Counted apart from the above: these need a person, not a pollen_inbox.
  const held = heldPending(id).length;
  if (held) {
    process.stdout.write(`[pollen] ${held} knock${held === 1 ? "" : "s"} waiting at the gate — pollen_allow or pollen_deny\n`);
  }

  watch(journal, pump);
  setInterval(pump, 1000); // safety net — fs.watch misses appends on some filesystems
  process.stderr.write(`pollen watching ${id}\n`);
}
