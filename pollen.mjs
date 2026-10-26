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
//   POLLEN_ALLOW    optional — comma-separated trusted agent IDs, or * for anyone
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
  renameSync, unlinkSync, writeFileSync, existsSync, statSync, utimesSync,
} from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";
import http from "http";

const VERSION = "0.1.0";
const DIR = process.env.POLLEN_DIR ?? "/tmp/pollen";
// How to run this very file, for the commands the agent is told to start. A
// bare "pollen.mjs" only works from the directory it happens to sit in.
const SELF = fileURLToPath(import.meta.url);
const RUN = `node ${/\s/.test(SELF) ? `'${SELF}'` : SELF}`;
const ASK = "Ask the user before calling pollen_allow or pollen_deny.";

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
function serverPath(id) { return join(DIR, id, "server.json"); }

function readJournal(id) {
  let raw = "";
  try { raw = readFileSync(journalPath(id), "utf-8"); } catch {}
  return raw.split("\n").flatMap((line) => {
    // Blank tail, or a line caught mid-append — the next read gets it whole.
    try { return JSON.parse(line); } catch { return []; }
  });
}

// `seq` is numbered from the journal at write time, not from a counter taken at
// start: another process may have appended since, and a reused seq hides a
// message behind the cursor. `fields` may carry its own ts, for an entry moved
// from another journal that should keep the time it first arrived.
function appendEntry(id, fields) {
  const entry = { seq: topSeq(id) + 1, ts: new Date().toISOString(), ...fields };
  appendFileSync(journalPath(id), JSON.stringify(entry) + "\n");
  return entry;
}

function allowedBy(id) {
  let raw = "";
  try { raw = readFileSync(allowPath(id), "utf-8"); } catch {}
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
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

// Who is waiting at the gate and with how much, oldest knock first.
function heldByPeer(id) {
  const counts = new Map();
  for (const e of heldPending(id)) counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
  return counts;
}

// =============================================================================
// LIVENESS — which server, if any, is running as an id
// =============================================================================
//
// The server holding an id writes its pid to server.json and touches the file
// every HEARTBEAT. A pid alone is not proof: once its process is gone the
// number can be reused by anything, so the file must also be fresh. When the
// server stops, the file stays behind and its mtime is when it was last seen.

const HEARTBEAT = 5000;
const STALE = 4 * HEARTBEAT;

function serverFile(id) {
  try { return JSON.parse(readFileSync(serverPath(id), "utf-8")); } catch { return null; }
}

// Write beside, then rename in, so a reader never sees half a file.
function writeServerFile(id, content) {
  mkdirSync(join(DIR, id), { recursive: true });
  const part = join(DIR, id, `.server.json.${process.pid}`);
  writeFileSync(part, JSON.stringify(content));
  renameSync(part, serverPath(id));
}

function runningServer(id) {
  let pid;
  try {
    if (Date.now() - statSync(serverPath(id)).mtimeMs > STALE) return null;
    pid = serverFile(id)?.pid;
    if (!pid) return null; // released by a rename
    process.kill(pid, 0); // signal 0 delivers nothing; it only asks if pid exists
    return pid;
  } catch (e) {
    return e.code === "EPERM" ? pid : null; // exists, but belongs to another user
  }
}

// The id an agent took with pollen_rename, left behind so its old name can
// point senders at the new one.
function movedTo(id) { return serverFile(id)?.movedTo ?? null; }

function lastSeen(id) {
  try { return statSync(serverPath(id)).mtime.toISOString().slice(0, 16).replace("T", " ") + "Z"; }
  catch { return null; }
}

// What became of the messages `from` sent to `id`, read off id's journal and
// cursor: the receiver already records all of it, so no receipt is sent.
// Returns "" when `from` has sent nothing.
function readState(id, from) {
  const cursor = readCursor(id);
  const sent = readJournal(id).filter((e) => e.from === from);
  const mine = sent.filter((e) => e.status === "delivered");
  const n = mine.length;
  const u = mine.filter((e) => e.seq > cursor).length;
  const h = heldPending(id).filter((e) => e.from === from).length;
  const d = sent.filter((e) => e.status === "denied").length;
  const parts = [];
  if (n && !u) parts.push(n === 1 ? "has read your message" : `has read all ${n} of your messages`);
  else if (n && u === n) parts.push(n === 1 ? "has not read your message" : `has not read your ${n} messages`);
  else if (n) parts.push(`has not read ${u} of your ${n} messages`);
  if (h) parts.push(`holds ${h === 1 ? "your message" : `${h} of your messages`} at the gate`);
  if (d) parts.push(`denied ${d === 1 ? "your message" : `${d} of your messages`}`);
  return parts.join("; ");
}

function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

// =============================================================================
// AGENT MODE
// =============================================================================

function startAgent() {
  const RELAY = process.env.POLLEN_RELAY;
  let ID = process.env.POLLEN_ID; // changes only through pollen_rename
  if (!ID) { process.stderr.write("POLLEN_ID is required. pollen cannot start without an id; set it in the env of your .mcp.json entry.\n"); process.exit(1); }

  const preAllowed = (process.env.POLLEN_ALLOW ?? "").split(",").filter(Boolean);

  // pollen_allow writes to a file because the env var is fixed for the life of
  // the process. The file is read on every arrival rather than cached, so it is
  // the one record of who was let in: it survives a restart, and an edit by a
  // person or a second server with the same id takes effect at once.
  // "*" opens the gate to anyone. It is never the default: a person sets it in
  // the env, or an agent writes it with pollen_allow after asking its person.
  function trusts(from) {
    const list = [...preAllowed, ...allowedBy(ID)];
    return list.includes("*") || list.includes(from);
  }

  mkdirSync(join(DIR, ID), { recursive: true });

  function record(from, message, status, resolves) {
    return appendEntry(ID, { from, message, status, resolves });
  }

  // A delivered message, pushed to the agent as a <channel> tag. The seq and
  // time ride along so messages that land close together keep their order.
  function deliver(entry) {
    notify(entry.message, { from: entry.from, ts: entry.ts, seq: String(entry.seq) });
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
    clearInterval(heartbeat);
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
          `Use pollen_send to reach another peer. Use pollen_agents to see who is reachable and whether they have read what you sent, so there is no need to ask a peer to acknowledge.`,
          `Use pollen_inbox to read what has arrived. A stranger is held at the gate. ${ASK}`,
          `If you are expected under a different id, take it with pollen_rename.`,
          `Do not poll for messages. Run "${RUN} --watch ${ID}" with your harness's line-event tool (in Claude Code that is Monitor; a background Bash task only reports when it exits). It prints one line the moment anything lands; then call pollen_inbox. If you pipe it, every later stage must flush per line.`,
          `To reach peers on other machines: run "${RUN} --relay" then expose it with "cloudflared tunnel --url http://localhost:4747" (free, no account needed).`,
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
      if (standingAside) holdId(); // the other server may have gone since
      // pollen_rename stays open: taking an id of its own is the way out.
      if (standingAside && name !== "pollen_rename") return reply(msg.id, text(clash(standingAside)));
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
      description: "List the peers you can reach, whether each is running, and whether they have read what you sent",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "pollen_allow",
      description: "Allow a peer to reach you, now and after a restart, and deliver anything they have waiting at the gate. \"*\" allows everyone; use it only when the user says so",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Peer id to allow, or * for everyone" },
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
    {
      name: "pollen_rename",
      description: "Take a different peer id for the rest of this session, such as the one your director expects. Unread messages, knocks and allowed peers come with you.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "The id to take" },
        },
        required: ["id"],
      },
    },
  ];

  function text(t) {
    return { content: [{ type: "text", text: t }] };
  }

  const toolHandlers = {
    async pollen_send({ to, message }) {
      const moved = !RELAY && movedTo(to);
      if (moved && !runningServer(to)) {
        return text(`${to} is now ${moved}. The message was not sent; send it to ${moved}.`);
      }
      const status = await tx.send(to, message);
      if (status === "queued" && !runningServer(to)) {
        return text(`Queued for ${to} — ${to}'s pollen is not running. The message waits in the mailbox until ${to} starts.`);
      }
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
      return text(list.join("\n") || "No peers reachable.");
    },
    async pollen_allow({ agent }) {
      // The allow file holds one id per line, so an id with a line break in it
      // would let in a second peer nobody named.
      if (!agent || /[\s,]/.test(agent)) {
        return text(`Cannot allow ${JSON.stringify(agent)}: a peer id has no spaces, commas or line breaks. Nobody was allowed. Check the id with pollen_agents.`);
      }
      const everyone = agent === "*";
      const already = everyone ? [...preAllowed, ...allowedBy(ID)].includes("*") : trusts(agent);
      if (!already) appendFileSync(allowPath(ID), agent + "\n");
      // The gate is read from the journal, not kept in memory: a knock taken in
      // before a restart, or by another process, is just as much ours to settle.
      const held = heldPending(ID).filter((e) => everyone || e.from === agent);
      if (everyone) {
        for (const m of held) deliver(record(m.from, m.message, "delivered", m.seq));
        const sent = held.length ? `${plural(held.length, "held message")} delivered. ` : "";
        return text(`Opened the gate to everyone, now and after a restart. ${sent}To close it again, remove the "*" line from ${allowPath(ID)}.`);
      }
      if (held.length) {
        for (const m of held) {
          deliver(record(m.from, m.message, "delivered", m.seq));
        }
        const what = held.length === 1 ? "Their message has" : `Their ${held.length} messages have`;
        return text(`Allowed ${agent}. ${what} been delivered.`);
      }
      return text(`Allowed ${agent}.`);
    },
    async pollen_deny({ agent }) {
      const held = heldPending(ID).filter((e) => e.from === agent);
      // Settle each pending entry so the gate stops counting them, without
      // repeating the text of something the human just rejected.
      for (const m of held) record(m.from, "", "denied", m.seq);
      if (!held.length) return text(`Nothing pending from ${agent}.`);
      const n = held.length === 1 ? "message" : `${held.length} messages`;
      return text(`Denied and dropped ${n} from ${agent}.`);
    },
    async pollen_inbox() {
      const msgs = unread(ID);
      if (msgs.length) writeFileSync(cursorPath(ID), String(msgs.at(-1).seq));
      const read = msgs.length
        ? msgs.map((m) => `[${m.from} ${m.ts.slice(0, 19)}Z #${m.seq}]: ${m.message}`).join("\n")
        : "No new messages.";
      // "No new messages" alone, with knocks waiting, reads as "nothing arrived"
      // and the agent tells its person so.
      const held = [...heldByPeer(ID)].map(([peer, n]) => `${peer} (${plural(n, "message")})`);
      if (!held.length) return text(read);
      return text(`${read}\nHeld at the gate: ${held.join(", ")}. ${ASK}`);
    },
    // A launcher names an agent before anyone knows what its director will
    // call it, and the env cannot change once the server runs. Taking the id
    // here means no restart and no second pollen beside the session's own.
    async pollen_rename({ id }) {
      // The id becomes a directory and part of a filename.
      if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
        return text(`Cannot take ${JSON.stringify(id)}: an id is letters, digits, dots, dashes and underscores, starting with a letter or digit. Nothing changed.`);
      }
      if (id === ID) return text(`You are already "${id}".`);
      const holder = runningServer(id);
      if (holder) {
        return text(`Cannot take "${id}": another pollen server (pid ${holder}) is running as it. Nothing changed. Pick another id, or ask the user which agent should have it.`);
      }

      const old = ID;
      // The old mailbox is ours to hand over only if we held it. A server that
      // was standing aside leaves it to the server that does.
      const ours = !standingAside;
      if (listening) { listening = false; tx.close(); }
      ID = id;
      mkdirSync(join(DIR, ID), { recursive: true });
      tx = transport();

      let messages = 0, knocks = 0;
      if (ours) {
        const waiting = [...unread(old), ...heldPending(old)].sort((a, b) => a.seq - b.seq);
        for (const e of waiting) {
          appendEntry(ID, { ts: e.ts, from: e.from, message: e.message, status: e.status });
          if (e.status !== "pending") { messages++; continue; }
          knocks++;
          // Settled on the old side so its gate stops counting the knock. The
          // text is not repeated: it lives on in the new journal.
          appendEntry(old, { from: e.from, message: "", status: "moved", resolves: e.seq });
        }
        writeFileSync(cursorPath(old), String(topSeq(old)));
        const kept = allowedBy(ID);
        for (const peer of allowedBy(old)) if (!kept.includes(peer)) appendFileSync(allowPath(ID), peer + "\n");
        writeServerFile(old, { pid: null, movedTo: ID });
      }

      standingAside = null;
      holdId(false);
      if (standingAside) return text(clash(standingAside));
      const came = [messages && plural(messages, "unread message"), knocks && plural(knocks, "knock")].filter(Boolean);
      return text([
        `You are now "${ID}" on pollen, no longer "${old}".`,
        came.length ? `${came.join(" and ")} came with you.` : "",
        ours ? `Anyone who writes to ${old} is told your new id.` : "",
        `Restart your watcher as "${RUN} --watch ${ID}".`,
      ].filter(Boolean).join(" "));
    },
  };

  // --- trust gate -----------------------------------------------------------

  function onMessage(from, message) {
    if (trusts(from)) {
      deliver(record(from, message, "delivered"));
    } else {
      // Every knock is kept. Holding only the latest would mean a stranger's
      // follow-up destroys the message it is asking about.
      record(from, message, "pending");
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
        return readdirSync(DIR)
          .filter((d) => d !== ID && existsSync(join(DIR, d, "inbox")))
          .map((d) => {
            // Its mail went along with it, so the new id is all there is to say.
            const moved = movedTo(d);
            if (moved && !runningServer(d)) return `${d} (now ${moved})`;
            const seen = lastSeen(d);
            const status = runningServer(d) ? "running" : seen ? `not running, last seen ${seen}` : "not running";
            const state = readState(d, ID);
            return `${d} (${status})${state ? ` — ${state}` : ""}`;
          });
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
        closed = false;
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

  const transport = () => (RELAY ? relayTransport(RELAY) : localTransport());
  let tx = transport(); // replaced when pollen_rename moves the agent to a new mailbox

  // --- go -------------------------------------------------------------------

  // Anything that arrived while this agent had no server is still in the
  // journal. Say so, or it sits there until the agent happens to check.
  function announceWaiting() {
    const carried = unread(ID).length;
    if (carried) {
      notify(
        `${plural(carried, "unread message")} from a previous session. Use pollen_inbox to read.`,
        { status: "unread" }
      );
    }
    // A knock that came in while no server was running is just as easy to miss.
    const knocking = heldByPeer(ID);
    if (knocking.size) {
      const n = [...knocking.values()].reduce((a, b) => a + b, 0);
      notify(
        `${plural(n, "message")} held at the gate from ${[...knocking.keys()].join(", ")}. ${ASK}`,
        { status: "pending" }
      );
    }
  }

  // --- one server per id ------------------------------------------------------
  //
  // Two servers on one id take each other's messages and share one cursor, so
  // each agent sees part of its mail and believes it has all of it. The second
  // one stands aside: it does not touch the mailbox, every tool says why, and it
  // takes the id over once the first is gone. Two servers starting in the same
  // instant can both claim it; the loser notices at its next heartbeat.

  let standingAside = null; // pid of the server holding our id
  let listening = false;

  function holdId(announce = true) {
    const holder = runningServer(ID);
    if (holder === process.pid) {
      try {
        const now = new Date();
        return utimesSync(serverPath(ID), now, now);
      } catch {} // the file went with a cleared /tmp: claim it again below
    }
    if (holder && holder !== process.pid) {
      if (standingAside !== holder) notify(clash(holder), { status: "clash" });
      standingAside = holder;
      if (listening) { listening = false; tx.close(); }
      return;
    }
    writeServerFile(ID, { pid: process.pid });
    standingAside = null;
    if (!listening) {
      listening = true;
      if (announce) announceWaiting();
      tx.drain(onMessage);
      tx.listen(onMessage);
    }
  }

  function clash(pid) {
    return `pollen is not running for "${ID}": another pollen server (pid ${pid}) already uses this id. ` +
      `Two agents on one id take each other's messages, so this one stays off. ` +
      `Take an id of your own with pollen_rename, or ask the user to stop the other agent.`;
  }

  holdId();
  const heartbeat = setInterval(() => {
    // A throw here would end the process: nothing catches a timer's errors.
    try { holdId(); } catch (e) { process.stderr.write(`pollen: could not check who holds "${ID}": ${e.message}\n`); }
  }, HEARTBEAT);
  heartbeat.unref(); // never the thing that keeps a hostless server alive
}

// =============================================================================
// WATCH MODE
// =============================================================================
//
// One line per message on stdout, forever. Point anything that reports each
// line as it comes at it (Claude Code's Monitor, `&`, systemd) and the agent
// gets woken instead of polling.

function startWatch(id) {
  if (!id) {
    process.stderr.write("usage: node pollen.mjs --watch <agent-id>\n");
    process.exit(1);
  }

  const journal = journalPath(id);
  mkdirSync(join(DIR, id), { recursive: true });
  appendFileSync(journal, ""); // create it if the agent hasn't started yet

  // Position is counted in lines, never in seq. The journal is append-only, so
  // line N stays line N; a seq can repeat or arrive out of order, and keying on
  // it once made a watcher ring the whole journal on every tick.
  const at = (e) => e && `${e.seq} ${e.ts}`;
  const start = readJournal(id);
  let seen = start.length;
  let mark = at(start.at(-1));

  function line(e) {
    // A denial is a settlement entry, not an arrival. Ringing it out would put
    // the text the human just rejected on the very channel they watch. A knock
    // moved away by pollen_rename is settled the same way and rings on the new id.
    if (e.status === "denied" || e.status === "moved") return null;
    if (e.status === "pending") {
      return `[pollen] ${e.from} is knocking — pollen_allow or pollen_deny`;
    }
    const preview = e.message.replace(/\s+/g, " ").trim();
    const short = preview.length > 120 ? preview.slice(0, 119) + "…" : preview;
    return `[pollen] message from ${e.from} — pollen_inbox to read: ${short}`;
  }

  function pump() {
    const entries = readJournal(id);
    // A cleared /tmp starts a new journal. If the line we stopped at is gone or
    // is no longer the same entry, start over — going quietly deaf is the one
    // thing a watcher must never do.
    if (entries.length < seen || at(entries[seen - 1]) !== mark) seen = 0;
    for (const e of entries.slice(seen)) {
      const l = line(e);
      if (l) process.stdout.write(l + "\n");
    }
    seen = entries.length;
    mark = at(entries.at(-1));
  }

  // Ring once for whatever is already waiting, so arming the watcher never
  // starts deaf — a count, not a transcript, however long the agent was away.
  const waiting = unread(id).length;
  if (waiting) {
    process.stdout.write(`[pollen] ${plural(waiting, "message")} waiting — pollen_inbox to read\n`);
  }

  // Counted apart from the above: these need a person, not a pollen_inbox.
  const knocking = heldByPeer(id);
  if (knocking.size) {
    const n = [...knocking.values()].reduce((a, b) => a + b, 0);
    process.stdout.write(`[pollen] ${plural(n, "knock")} waiting at the gate from ${[...knocking.keys()].join(", ")} — pollen_allow or pollen_deny\n`);
  }

  watch(journal, pump);
  setInterval(pump, 1000); // safety net — fs.watch misses appends on some filesystems
  process.stderr.write(`pollen watching ${id}\n`);
}

// =============================================================================
// GO
// =============================================================================
//
// Last in the file, so every constant above exists before any mode starts.

if (process.argv.includes("--version")) {
  process.stdout.write(`pollen ${VERSION}\n`);
} else if (process.argv.includes("--relay")) {
  startRelay();
} else if (process.argv.includes("--watch")) {
  startWatch(process.argv[process.argv.indexOf("--watch") + 1]);
} else {
  startAgent();
}
