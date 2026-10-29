#!/usr/bin/env node
// mycelium: peer messaging between agents. zero deps.
//
//   node mycelium.mjs             MCP server (agent-side)
//   node mycelium.mjs --relay     HTTP relay (cross-machine hop)
//   node mycelium.mjs --version   print the version
//   node mycelium.mjs --watch ID  tail an agent's journal, one line per new message
//
// Agent mode env:
//   MYCELIUM_ID       optional: agent name (default: the directory it starts in)
//   MYCELIUM_RELAY    optional: relay URL for cross-machine
//   MYCELIUM_ALLOW    optional: comma-separated trusted agent IDs, or * for anyone
//   MYCELIUM_DIR      optional: mailbox root (default /tmp/mycelium)
//
// Peers let in with mycelium_allow are kept in MYCELIUM_DIR/<id>/allow, one per line.
//
// Relay mode env:
//   MYCELIUM_PORT     optional: listen port (default 4747)
//
// Watch mode env:
//   MYCELIUM_DIR      optional: mailbox root (default /tmp/mycelium)
//
import {
  watch, mkdirSync, readdirSync, readFileSync, appendFileSync,
  renameSync, unlinkSync, writeFileSync, existsSync, statSync, utimesSync,
} from "fs";
import { execFileSync } from "child_process";
import { createInterface } from "readline";
import { basename, join } from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";
import http from "http";

const VERSION = "0.1.0";
const DIR = process.env.MYCELIUM_DIR ?? "/tmp/mycelium";
// How to run this very file, for the commands the agent is told to start. A
// bare "mycelium.mjs" only works from the directory it happens to sit in.
const SELF = fileURLToPath(import.meta.url);
const RUN = `node ${/\s/.test(SELF) ? `'${SELF}'` : SELF}`;
const ASK = "Ask the user before calling mycelium_allow or mycelium_deny.";

// =============================================================================
// RELAY MODE
// =============================================================================

function startRelay() {
  const PORT = parseInt(process.env.MYCELIUM_PORT ?? "4747");
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

    // GET /listen/:id: SSE
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

    // POST /send: { from, to, message }
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

  // Report the port actually bound, so MYCELIUM_PORT=0 is usable.
  server.listen(PORT, () => {
    process.stderr.write(`mycelium relay on :${server.address().port}\n`);
  });
}

// =============================================================================
// JOURNAL: append-only arrival log, shared by agent and watch modes
// =============================================================================
//
// Mailbox files are transient: the server consumes and unlinks each one within
// milliseconds of it landing, so nothing outside the process can reliably see
// them. The journal is the durable record instead: every arrival is appended
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
    // Blank tail, or a line caught mid-append; the next read gets it whole.
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
// LIVENESS: which server, if any, is running as an id
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
  } catch (e) {
    if (e.code !== "EPERM") return null; // EPERM: it exists, but belongs to another user
  }
  return isMyceliumServer(pid) ? pid : null;
}

// A live pid is not proof either: once a server is gone, any process can be
// given its number. Its command line says whether it is this tool. If ps
// cannot answer, the pid is taken as a holder, since moving to an id of our
// own is recoverable and two servers on one id is not.
function isMyceliumServer(pid) {
  if (pid === process.pid) return true;
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return command.includes(basename(SELF));
  } catch (e) {
    return e.status !== 1; // ps exits 1 when the pid is gone
  }
}

// Where an agent that started as `id` lives now. A rename leaves its old id
// pointing at the new one, and following that at startup is what makes a
// rename outlast a restart. Renaming back clears the pointer.
function followMoves(id) {
  const seen = new Set([id]);
  for (;;) {
    const next = movedTo(id);
    if (!next || seen.has(next) || runningServer(id)) return id;
    seen.add(next);
    id = next;
  }
}

// The id an agent took with mycelium_rename, left behind so its old name can
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

// The id becomes a directory and part of a filename, so a directory name is
// cut down to what mycelium_rename accepts: letters, digits, dots, dashes and
// underscores, starting with a letter or digit.
function idFromDirectory(dir) {
  const id = basename(dir).replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+|-+$/g, "");
  return id || "mycelium-peer";
}

function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

// =============================================================================
// AGENT MODE
// =============================================================================

function startAgent() {
  const RELAY = process.env.MYCELIUM_RELAY;
  // An id the env names wins. Otherwise the directory the server starts in:
  // one per agent in practice, and readable in mycelium_agents. A fixed id in
  // a committed config would hand every clone of a repository one mailbox.
  const startedAs = process.env.MYCELIUM_ID || idFromDirectory(process.cwd());
  let ID = followMoves(startedAs); // changes only through a rename, or when the id is held
  let followed = ID !== startedAs ? startedAs : null; // the id a sticky rename moved us from
  // Ids this agent has moved away from, whose inboxes it still sweeps.
  const formerIds = new Set();
  for (let id = startedAs, hops = 0; id && id !== ID && hops < 64; id = movedTo(id), hops++) formerIds.add(id);

  const preAllowed = (process.env.MYCELIUM_ALLOW ?? "").split(",").filter(Boolean);

  // mycelium_allow writes to a file because the env var is fixed for the life of
  // the process. The file is read on every arrival rather than cached, so it is
  // the one record of who was let in: it survives a restart, and an edit by a
  // person or a second server with the same id takes effect at once.
  // "*" opens the gate to anyone. It is never the default: a person sets it in
  // the env, or an agent writes it with mycelium_allow after asking its person.
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
      // still owed an answer: an unanswered request hangs it forever.
      if (msg.id !== undefined) reply(msg.id, text(`Request failed: ${e.message}`));
    }
  }).on("close", () => {
    // The host is gone. Stop listening and let the process end on its own once
    // any reply still in flight is written. A server left running would keep
    // taking this agent's messages, and its seq counter would collide with the
    // next server started for the same id.
    clearInterval(heartbeat);
    clearInterval(sweep);
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
    if (msg.id === undefined) return; // notifications: ignore

    if (msg.method === "initialize") {
      return reply(msg.id, {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
          experimental: { "claude/channel": {} },
        },
        serverInfo: { name: `mycelium-${ID}`, version: VERSION },
        instructions: [
          `You are agent "${ID}", a peer on mycelium.`,
          followed ? followedNotice() : "",
          displaced ? displacedNotice() : "",
          `Incoming messages appear as <channel> tags with a "from" attribute.`,
          `Use mycelium_send to reach another peer. Use mycelium_agents to see who is reachable and whether they have read what you sent, so there is no need to ask a peer to acknowledge.`,
          `Use mycelium_inbox to read what has arrived. A stranger is held at the gate. ${ASK}`,
          `If you are expected under a different id, take it with mycelium_rename.`,
          `Do not poll for messages. Run "${RUN} --watch ${ID}" with your harness's line-event tool (in Claude Code that is Monitor; a background Bash task only reports when it exits). It prints one line the moment anything lands; then call mycelium_inbox. If you pipe it, every later stage must flush per line.`,
          `To reach peers on other machines: run "${RUN} --relay" then expose it with "cloudflared tunnel --url http://localhost:4747" (free, no account needed).`,
          `Give the resulting URL to the user so they can pass it to the remote peer as MYCELIUM_RELAY.`,
        ].filter(Boolean).join(" "),
      });
    }

    if (msg.method === "tools/list") {
      return reply(msg.id, { tools: TOOLS });
    }

    if (msg.method === "tools/call") {
      const { name, arguments: args } = msg.params;
      const fn = toolHandlers[name];
      if (!fn) return reply(msg.id, text(`Unknown tool: ${name}`));
      // Two servers starting in the same instant can both claim one id. Checking
      // here, and not only at the heartbeat, settles it before a tool acts.
      holdId();
      return reply(msg.id, await fn(args));
    }
  }

  // --- tools ----------------------------------------------------------------

  const TOOLS = [
    {
      name: "mycelium_send",
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
      name: "mycelium_agents",
      description: "List the peers you can reach, whether each is running, and whether they have read what you sent",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mycelium_allow",
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
      name: "mycelium_deny",
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
      name: "mycelium_inbox",
      description: "Read the messages that have arrived",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mycelium_rename",
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
    async mycelium_send({ to, message }) {
      // An agent that renamed itself left its old id pointing at the new one.
      // The message follows the pointer, and the sender learns the new id.
      const asked = to;
      if (!RELAY) to = followMoves(to);
      const moved = to !== asked ? ` ${asked} is now ${to}.` : "";
      const said = (t) => text(t + moved);
      const status = await tx.send(to, message);
      if (status === "queued" && !runningServer(to)) {
        return said(`Queued for ${to}. ${to}'s mycelium is not running. The message waits in the mailbox until ${to} starts.`);
      }
      if (status === "unknown-agent") return said(`No mailbox for "${to}". The message was not sent. Check the id with mycelium_agents.`);
      if (status === "unreachable") {
        return said(`mycelium could not reach the relay. The message was not delivered to ${to}. Retry, or send it to a local peer.`);
      }
      if (status === "pending") {
        return said(`Held at ${to}'s trust gate. ${to} must allow "${ID}" before this is delivered.`);
      }
      if (status === "queued") {
        return said(`Queued for ${to}. No confirmation from ${to}'s mycelium; it stays in the mailbox until taken.`);
      }
      return said(`Sent to ${to}.`);
    },
    async mycelium_agents() {
      const list = await tx.agents();
      return text(list.join("\n") || "No peers reachable.");
    },
    async mycelium_allow({ agent }) {
      // The allow file holds one id per line, so an id with a line break in it
      // would let in a second peer nobody named.
      if (!agent || /[\s,]/.test(agent)) {
        return text(`Cannot allow ${JSON.stringify(agent)}: a peer id has no spaces, commas or line breaks. Nobody was allowed. Check the id with mycelium_agents.`);
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
    async mycelium_deny({ agent }) {
      const held = heldPending(ID).filter((e) => e.from === agent);
      // Settle each pending entry so the gate stops counting them, without
      // repeating the text of something the human just rejected.
      for (const m of held) record(m.from, "", "denied", m.seq);
      if (!held.length) return text(`Nothing pending from ${agent}.`);
      const n = held.length === 1 ? "message" : `${held.length} messages`;
      return text(`Denied and dropped ${n} from ${agent}.`);
    },
    async mycelium_inbox() {
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
    // here means no restart and no second mycelium beside the session's own.
    async mycelium_rename({ id }) {
      // The id becomes a directory and part of a filename.
      if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
        return text(`Cannot take ${JSON.stringify(id)}: an id is letters, digits, dots, dashes and underscores, starting with a letter or digit. Nothing changed.`);
      }
      if (id === ID) return text(`You are already "${id}".`);
      const holder = runningServer(id);
      if (holder) {
        return text(`Cannot take "${id}": another mycelium server (pid ${holder}) is running as it. Nothing changed. Pick another id, or ask the user which agent should have it.`);
      }

      // A name the agent chose replaces one it borrowed or followed.
      displaced = null;
      followed = null;
      const { old, messages, knocks } = moveTo(id);
      holdId(false); // if another server took the id meanwhile, this moves us on and says so
      const came = [messages && plural(messages, "unread message"), knocks && plural(knocks, "knock")].filter(Boolean);
      return text([
        `You are now "${ID}" on mycelium, no longer "${old}".`,
        came.length ? `${came.join(" and ")} came with you.` : "",
        `Anyone who writes to ${old} is told your new id.`,
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
        `"${from}" is knocking. Use mycelium_allow or mycelium_deny.`,
        { from, status: "pending" }
      );
    }
  }

  // --- transport ------------------------------------------------------------

  function localTransport() {
    const inbox = join(DIR, ID, "inbox");
    mkdirSync(inbox, { recursive: true });
    let watcher;

    // Reading the file is what claims it: fs.watch fires twice for one file
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
        process.stderr.write(`mycelium: kept ${filename}, could not deliver it: ${e.message}\n`);
      }
    }

    // The receiver journals every arrival before the mailbox file is gone, so
    // its journal is the ack channel.
    // Three seconds covers a busy machine and the receiver's one-second sweep.
    async function settled(to, since, message) {
      const deadline = Date.now() + 3000;
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
        // front of it; writeFileSync creates the file before filling it.
        const part = join(target, `.${name}.part`);
        writeFileSync(part, message);
        renameSync(part, join(target, `${name}.msg`));
        if (!runningServer(to)) return "queued"; // nobody to wait for
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
            return `${d} (${status})${state ? `: ${state}` : ""}`;
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
      // The inbox of an id this agent moved away from. A sender that wrote
      // before it saw the pointer leaves its message there.
      drainFrom(id, cb) {
        const old = join(DIR, id, "inbox");
        let files = [];
        try { files = readdirSync(old).filter((f) => f.endsWith(".msg")); } catch {}
        for (const f of files) consume(join(old, f), f, cb);
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
            if (e) process.stderr.write(`mycelium relay error: ${e.message}\n`);
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
          }).on("error", retry); // refused connection, bad DNS: reached before any response
        }
        connect();
      },
      drain() {}, // relay drains on SSE connect
      drainFrom() {}, // the relay holds one queue per id, and a moved id has no listener to forward
      close() {
        closed = true;
        clearTimeout(reconnect);
        stream?.destroy();
      },
    };
  }

  const transport = () => (RELAY ? relayTransport(RELAY) : localTransport());
  let tx = transport(); // replaced when mycelium_rename moves the agent to a new mailbox

  // --- go -------------------------------------------------------------------

  // Anything that arrived while this agent had no server is still in the
  // journal. Say so, or it sits there until the agent happens to check.
  function announceWaiting() {
    const carried = unread(ID).length;
    if (carried) {
      notify(
        `${plural(carried, "unread message")} from a previous session. Use mycelium_inbox to read.`,
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
  // each agent sees part of its mail and believes it has all of it. Two
  // sessions in one workspace share its .mcp.json and ask for the same id, so
  // this is common. A server that finds its id held never takes it and never
  // goes dark: it carries on as "<id>-<host pid>", which is unique while its
  // host runs, and says so. Two servers starting in the same instant can both
  // claim one id; the loser notices at its next heartbeat or tool call.

  let displaced = null; // { from, by } once the id we asked for was held
  let listening = false;

  // Hand this agent's mail, knocks and allowed peers over to `id`, and leave
  // the old id pointing at it. The caller then claims `id` with holdId.
  function moveTo(id) {
    const old = ID;
    if (listening) {
      tx.drain(onMessage); // anything already in the old mailbox is ours to bring
      listening = false;
      tx.close();
    }
    ID = id;
    mkdirSync(join(DIR, ID), { recursive: true });
    tx = transport();

    let messages = 0, knocks = 0;
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
    formerIds.add(old);
    formerIds.delete(ID);
    return { old, messages, knocks };
  }

  function holdId(announce = true) {
    // A borrowed id is given back as soon as our own is free. A holder that
    // lived for a moment, such as a health check, must not leave the session
    // under a borrowed name for the rest of its life.
    if (displaced && !runningServer(displaced.from)) {
      const back = displaced.from;
      displaced = null;
      const { old } = moveTo(back);
      notify(`"${back}" is free again, so this agent is "${back}" once more. Mail sent to ${old} came along, and ${old} now points here.`, { status: "renamed" });
      announce = false;
    }
    const holder = runningServer(ID);
    if (holder === process.pid) {
      try {
        const now = new Date();
        return utimesSync(serverPath(ID), now, now);
      } catch {} // the file went with a cleared /tmp: claim it again below
    }
    if (holder && holder !== process.pid) {
      const taken = ID;
      if (listening) { listening = false; tx.close(); }
      ID = ownId(taken);
      mkdirSync(join(DIR, ID), { recursive: true });
      tx = transport();
      displaced = { from: taken, by: holder };
      notify(displacedNotice(), { status: "renamed" });
    }
    writeServerFile(ID, { pid: process.pid });
    if (!listening) {
      listening = true;
      if (announce) announceWaiting();
      tx.drain(onMessage);
      tx.listen(onMessage);
    }
  }

  // The host's pid comes first: it is the same under every host, unique while
  // that session runs, and short enough to read in mycelium_agents.
  function ownId(taken) {
    for (const id of [`${taken}-${process.ppid}`, `${taken}-${process.ppid}-${process.pid}`]) {
      const holder = runningServer(id);
      if (!holder || holder === process.pid) return id;
    }
    return `${taken}-${process.pid}-${Date.now().toString(36)}`;
  }

  function followedNotice() {
    return `"${followed}" was renamed to "${ID}" earlier, so this agent is "${ID}". Rename back to ${followed} to undo it.`;
  }

  function displacedNotice() {
    return `"${displaced.from}" is held by another mycelium server (pid ${displaced.by}), so this agent is "${ID}". ` +
      `Peers reach it as ${ID}. Tell whoever expects you as ${displaced.from}, or take another free id with mycelium_rename.`;
  }

  holdId();
  if (followed && !displaced) notify(followedNotice(), { status: "renamed" });
  const heartbeat = setInterval(() => {
    // A throw here would end the process: nothing catches a timer's errors.
    try { holdId(); } catch (e) { process.stderr.write(`mycelium: could not check who holds "${ID}": ${e.message}\n`); }
  }, HEARTBEAT);
  heartbeat.unref(); // never the thing that keeps a hostless server alive

  // fs.watch can drop an event, and then a message waits for the next arrival.
  // A sweep of the inbox every second bounds that wait (#37).
  const sweep = setInterval(() => {
    try {
      if (!listening) return;
      tx.drain(onMessage);
      // Only while the old id still leads here: if someone has taken it since,
      // its mail is theirs.
      for (const id of formerIds) if (!runningServer(id) && followMoves(id) === ID) tx.drainFrom(id, onMessage);
    } catch (e) { process.stderr.write(`mycelium: could not sweep the inbox: ${e.message}\n`); }
  }, 1000);
  sweep.unref();
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
    process.stderr.write("usage: node mycelium.mjs --watch <agent-id>\n");
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
    // moved away by mycelium_rename is settled the same way and rings on the new id.
    if (e.status === "denied" || e.status === "moved") return null;
    if (e.status === "pending") {
      return `[mycelium] ${e.from} is knocking; mycelium_allow or mycelium_deny`;
    }
    const preview = e.message.replace(/\s+/g, " ").trim();
    const short = preview.length > 120 ? preview.slice(0, 119) + "…" : preview;
    return `[mycelium] message from ${e.from}; mycelium_inbox to read: ${short}`;
  }

  function pump() {
    const entries = readJournal(id);
    // A cleared /tmp starts a new journal. If the line we stopped at is gone or
    // is no longer the same entry, start over: going quietly deaf is the one
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
  // starts deaf: a count, not a transcript, however long the agent was away.
  const waiting = unread(id).length;
  if (waiting) {
    process.stdout.write(`[mycelium] ${plural(waiting, "message")} waiting; mycelium_inbox to read\n`);
  }

  // Counted apart from the above: these need a person, not a mycelium_inbox.
  const knocking = heldByPeer(id);
  if (knocking.size) {
    const n = [...knocking.values()].reduce((a, b) => a + b, 0);
    process.stdout.write(`[mycelium] ${plural(n, "knock")} waiting at the gate from ${[...knocking.keys()].join(", ")}; mycelium_allow or mycelium_deny\n`);
  }

  watch(journal, pump);
  setInterval(pump, 1000); // safety net: fs.watch misses appends on some filesystems
  process.stderr.write(`mycelium watching ${id}\n`);
}

// =============================================================================
// GO
// =============================================================================
//
// Last in the file, so every constant above exists before any mode starts.

if (process.argv.includes("--version")) {
  process.stdout.write(`mycelium ${VERSION}\n`);
} else if (process.argv.includes("--relay")) {
  startRelay();
} else if (process.argv.includes("--watch")) {
  startWatch(process.argv[process.argv.indexOf("--watch") + 1]);
} else {
  startAgent();
}
