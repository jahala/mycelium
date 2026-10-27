// mycelium tests — node --test. Zero dependencies, like the thing it tests.
//
// Every test drives a real MCP server over stdio and a real mailbox on disk.
// Nothing is mocked: if these pass, two agents can actually talk.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const MYCELIUM = join(dirname(fileURLToPath(import.meta.url)), "mycelium.mjs");

// One mailbox root per run, left in place afterwards — it lives under the
// system temp dir, which the OS clears.
const DIR = mkdtempSync(join(tmpdir(), "mycelium-test-"));

// --- harness -----------------------------------------------------------------

// Everything spawned gets torn down even when a test fails — otherwise a live
// child's open pipes keep the runner from ever exiting.
const running = [];
afterEach(() => Promise.all(running.splice(0).map((p) => {
  if (p.exitCode !== null || p.signalCode !== null) return; // already gone
  p.kill();
  return once(p, "exit");
})));

function agent(id, env = {}) {
  return serve(spawn(process.execPath, [MYCELIUM], {
    env: { ...process.env, MYCELIUM_DIR: DIR, MYCELIUM_ID: id, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

// Speaks MCP to a server already spawned, however it was started.
function serve(proc) {
  running.push(proc);

  const waiting = new Map(); // request id → resolve
  const notes = [];          // channel notifications, in arrival order
  createInterface({ input: proc.stdout }).on("line", (line) => {
    const msg = JSON.parse(line);
    if (msg.method === "notifications/claude/channel") return void notes.push(msg.params.content);
    const resolve = waiting.get(msg.id);
    if (resolve) { waiting.delete(msg.id); resolve(msg.result); }
  });

  // A server that never answers fails the test rather than hanging the runner.
  let n = 0;
  const call = (method, params) => {
    const id = ++n;
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return Promise.race([
      new Promise((resolve) => waiting.set(id, resolve)),
      sleep(5000, null, { ref: false }).then(() => assert.fail(`${id} got no reply to ${method}`)),
    ]);
  };

  return {
    notes,
    ready: () => call("initialize", {}),
    tool: (name, args = {}) =>
      call("tools/call", { name, arguments: args }).then((r) => r.content[0].text),
    alive: () => proc.exitCode === null && proc.signalCode === null,
    stop: () => { proc.kill(); return once(proc, "exit"); },
    // What the host does when it goes away: its end of the pipe closes.
    hangUp: () => proc.stdin.end(),
    exited: () => Promise.race([
      once(proc, "exit"),
      sleep(5000, null, { ref: false }).then(() => assert.fail("the server outlived its host")),
    ]),
  };
}

function watcher(id) {
  const proc = spawn(process.execPath, [MYCELIUM, "--watch", id], {
    env: { ...process.env, MYCELIUM_DIR: DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.push(proc);

  const lines = [];
  createInterface({ input: proc.stdout }).on("line", (line) => lines.push(line));

  let attached = false;
  proc.stderr.setEncoding("utf-8");
  proc.stderr.on("data", (chunk) => { if (chunk.includes("mycelium watching")) attached = true; });

  return { lines, ready: () => waitFor("the watcher to attach", () => attached) };
}

function journal(id) {
  try {
    return readFileSync(join(DIR, id, "journal.jsonl"), "utf-8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

// The mailbox file is gone once the server has taken the message off disk.
// Waiting on that — rather than on the journal — keeps these tests honest:
// they describe delivery, not the mechanism that happens to implement it.
function taken(id) {
  try { return readdirSync(join(DIR, id, "inbox")).every((f) => !f.endsWith(".msg")); }
  catch { return false; }
}

// Inbox lines carry when each message arrived and its journal seq. Most tests
// are about what was said and by whom, so they compare without the stamp.
function plain(inbox) {
  return inbox.replace(/^\[(\S+) \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ #\d+\]:/gm, "[$1]:");
}

async function waitFor(what, predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${what}`);
}

// --- tests -------------------------------------------------------------------

test("an unread message survives a server restart", async () => {
  const alpha = agent("alpha", { MYCELIUM_ALLOW: "beta" });
  const beta = agent("beta", { MYCELIUM_ALLOW: "alpha" });
  await Promise.all([alpha.ready(), beta.ready()]);

  assert.equal(await beta.tool("mycelium_send", { to: "alpha", message: "the Q4 files are in /tmp/drop" }), "Sent to alpha.");
  await waitFor("alpha to take the message off disk", () => taken("alpha"));

  // alpha never read it — this is where the old in-memory buffer lost it.
  await alpha.stop();

  const revived = agent("alpha", { MYCELIUM_ALLOW: "beta" });
  await revived.ready();
  assert.equal(plain(await revived.tool("mycelium_inbox")), "[beta]: the Q4 files are in /tmp/drop");
});

test("a message is handed over once, not on every check", async () => {
  const carla = agent("carla", { MYCELIUM_ALLOW: "dan" });
  const dan = agent("dan", { MYCELIUM_ALLOW: "carla" });
  await Promise.all([carla.ready(), dan.ready()]);

  await dan.tool("mycelium_send", { to: "carla", message: "first" });
  await dan.tool("mycelium_send", { to: "carla", message: "second" });
  await waitFor("both messages to land", () => taken("carla"));

  assert.equal(plain(await carla.tool("mycelium_inbox")), "[dan]: first\n[dan]: second");
  assert.equal(plain(await carla.tool("mycelium_inbox")), "No new messages.");
});

test("the trust gate holds a stranger's message out of the inbox", async () => {
  const erin = agent("erin");            // trusts nobody
  const frank = agent("frank");
  await Promise.all([erin.ready(), frank.ready()]);

  await frank.tool("mycelium_send", { to: "erin", message: "let me in" });
  await waitFor("erin to take the message off disk", () => taken("erin"));

  assert.equal(journal("erin")[0].status, "pending");
  assert.equal(
    await erin.tool("mycelium_inbox"),
    "No new messages.\nHeld at the gate: frank (1 message). Ask the user before calling mycelium_allow or mycelium_deny.",
  );

  assert.match(await erin.tool("mycelium_allow", { agent: "frank" }), /has been delivered/);
  assert.equal(plain(await erin.tool("mycelium_inbox")), "[frank]: let me in");
});

test("--watch prints a line the moment a message lands", async () => {
  const gina = agent("gina", { MYCELIUM_ALLOW: "hugo" });
  const hugo = agent("hugo", { MYCELIUM_ALLOW: "gina" });
  await Promise.all([gina.ready(), hugo.ready()]);

  const eyes = watcher("gina");
  await eyes.ready();

  await hugo.tool("mycelium_send", { to: "gina", message: "radio check" });
  await waitFor("a watch line", () => eyes.lines.length === 1);
  assert.equal(eyes.lines[0], "[mycelium] message from hugo — mycelium_inbox to read: radio check");

  // A stranger's knock rouses the agent without leaking what they said.
  const ivan = agent("ivan");
  await ivan.ready();
  await ivan.tool("mycelium_send", { to: "gina", message: "secret payload" });
  await waitFor("a second watch line", () => eyes.lines.length === 2);
  assert.equal(eyes.lines[1], "[mycelium] ivan is knocking — mycelium_allow or mycelium_deny");
});

test("--watch rings for messages that are already waiting", async () => {
  const jo = agent("jo", { MYCELIUM_ALLOW: "kim" });
  const kim = agent("kim", { MYCELIUM_ALLOW: "jo" });
  await Promise.all([jo.ready(), kim.ready()]);

  await kim.tool("mycelium_send", { to: "jo", message: "you were out" });
  await waitFor("the message to land", () => taken("jo"));

  const eyes = watcher("jo");           // armed after the fact — must not start deaf
  await waitFor("a watch line", () => eyes.lines.length === 1);
  assert.equal(eyes.lines[0], "[mycelium] 1 message waiting — mycelium_inbox to read");
});

test("messages route through the relay, journal and all", async () => {
  const relay = spawn(process.execPath, [MYCELIUM, "--relay"], {
    env: { ...process.env, MYCELIUM_PORT: "0" },   // any free port
    stdio: ["ignore", "ignore", "pipe"],
  });
  running.push(relay);

  let port;
  relay.stderr.setEncoding("utf-8");
  relay.stderr.on("data", (chunk) => { port ??= chunk.match(/on :(\d+)/)?.[1]; });
  await waitFor("the relay to bind", () => port);

  const url = `http://127.0.0.1:${port}`;
  const nia = agent("nia", { MYCELIUM_ALLOW: "otto", MYCELIUM_RELAY: url });
  const otto = agent("otto", { MYCELIUM_ALLOW: "nia", MYCELIUM_RELAY: url });
  await Promise.all([nia.ready(), otto.ready()]);

  await otto.tool("mycelium_send", { to: "nia", message: "over the air" });
  await waitFor("nia to journal it", () => journal("nia").length === 1);
  assert.equal(plain(await nia.tool("mycelium_inbox")), "[otto]: over the air");
});

test("the sender is told when a message is held at the trust gate", async () => {
  const opal = agent("opal");            // trusts nobody
  const pete = agent("pete");
  await Promise.all([opal.ready(), pete.ready()]);

  assert.equal(
    await pete.tool("mycelium_send", { to: "opal", message: "knock knock" }),
    `Held at opal's trust gate — opal must allow "pete" before this is delivered.`,
  );
});

test("the sender is told when the receiver's mycelium is not running", async () => {
  const quinn = agent("quinn", { MYCELIUM_ALLOW: "rosa" });
  const rosa = agent("rosa", { MYCELIUM_ALLOW: "quinn" });
  await Promise.all([quinn.ready(), rosa.ready()]);

  await quinn.stop();                    // mailbox stays on disk, nobody home
  assert.match(await rosa.tool("mycelium_send", { to: "quinn", message: "anyone there" }), /^Queued for quinn/);
});

test("a second message from a stranger does not overwrite the first", async () => {
  const sam = agent("sam");
  const tess = agent("tess");
  await Promise.all([sam.ready(), tess.ready()]);

  await tess.tool("mycelium_send", { to: "sam", message: "first" });
  await tess.tool("mycelium_send", { to: "sam", message: "second" });
  await waitFor("both to be journalled", () => journal("sam").length === 2);

  await sam.tool("mycelium_allow", { agent: "tess" });
  assert.equal(plain(await sam.tool("mycelium_inbox")), "[tess]: first\n[tess]: second");
});

test("--watch rings for messages held at the trust gate", async () => {
  const uma = agent("uma");
  const vic = agent("vic");
  await Promise.all([uma.ready(), vic.ready()]);

  await vic.tool("mycelium_send", { to: "uma", message: "let me in" });
  await waitFor("the message to be journalled", () => journal("uma").length === 1);

  const eyes = watcher("uma");           // armed after the fact — must not start deaf
  await waitFor("a watch line", () => eyes.lines.length === 1);
  assert.equal(eyes.lines[0], "[mycelium] 1 knock waiting at the gate from vic — mycelium_allow or mycelium_deny");
});

test("a knock held at the gate can still be allowed after a restart", async () => {
  const yuri = agent("yuri");             // trusts nobody
  const zoe = agent("zoe");
  await Promise.all([yuri.ready(), zoe.ready()]);

  await zoe.tool("mycelium_send", { to: "yuri", message: "let me in" });
  await waitFor("the knock to be journalled", () => journal("yuri").length === 1);

  // The gate is rung by the journal, so it has to survive with the journal —
  // otherwise the watcher reports a knock nobody can ever action.
  await yuri.stop();
  const revived = agent("yuri");
  await revived.ready();

  assert.match(await revived.tool("mycelium_allow", { agent: "zoe" }), /has been delivered/);
  assert.equal(plain(await revived.tool("mycelium_inbox")), "[zoe]: let me in");

  const eyes = watcher("yuri");
  await eyes.ready();
  await sleep(300);
  assert.deepEqual(eyes.lines, [], `settled knock still ringing: ${eyes.lines.join(" | ")}`);
});

test("an unreachable relay fails the call, not the mycelium", async () => {
  const far = agent("far", { MYCELIUM_RELAY: "http://127.0.0.1:1" });
  await far.ready();

  const said = await far.tool("mycelium_send", { to: "anyone", message: "hi" });
  assert.match(said, /could not reach/i);
  assert.ok(far.alive(), "the mycelium died along with the request");

  // Still serving afterwards — a failed send must not cost the agent its radio.
  assert.equal(plain(await far.tool("mycelium_inbox")), "No new messages.");
});

test("a denied message is not rung out by --watch", async () => {
  const wes = agent("wes");
  const xena = agent("xena");
  await Promise.all([wes.ready(), xena.ready()]);

  const eyes = watcher("wes");
  await eyes.ready();

  await xena.tool("mycelium_send", { to: "wes", message: "sensitive payload" });
  await waitFor("the knock", () => eyes.lines.length === 1);

  await wes.tool("mycelium_deny", { agent: "xena" });
  await sleep(300);                      // give a wrong implementation time to leak it
  assert.equal(eyes.lines.length, 1, `denied text leaked: ${eyes.lines.join(" | ")}`);
});

test("--watch survives the journal being wiped under it", async () => {
  const lena = agent("lena", { MYCELIUM_ALLOW: "milo" });
  const milo = agent("milo", { MYCELIUM_ALLOW: "lena" });
  await Promise.all([lena.ready(), milo.ready()]);

  const eyes = watcher("lena");
  await eyes.ready();

  await milo.tool("mycelium_send", { to: "lena", message: "before" });
  await waitFor("the first line", () => eyes.lines.length === 1);

  // /tmp gets cleared and the agent starts a fresh journal from seq 1. The
  // watcher must notice the sequence restarted rather than ignore everything.
  writeFileSync(
    join(DIR, "lena", "journal.jsonl"),
    JSON.stringify({ seq: 1, ts: "2026-01-01T00:00:00.000Z", from: "milo", message: "after", status: "delivered" }) + "\n"
  );
  await waitFor("the line after the wipe", () => eyes.lines.length === 2);
  assert.match(eyes.lines[1], /message from milo — mycelium_inbox to read: after/);
});

test("a peer allowed once stays allowed after a restart", async () => {
  const ada = agent("ada");               // trusts nobody
  const bo = agent("bo");
  await Promise.all([ada.ready(), bo.ready()]);

  await bo.tool("mycelium_send", { to: "ada", message: "let me in" });
  await ada.tool("mycelium_allow", { agent: "bo" });

  // MYCELIUM_ALLOW is fixed when the server starts. A mycelium_allow that lived
  // only in memory would be forgotten here and hold bo at the gate again.
  await ada.stop();
  const revived = agent("ada");
  await revived.ready();

  assert.equal(await bo.tool("mycelium_send", { to: "ada", message: "back again" }), "Sent to ada.");
});

test("an allow written to the file takes effect without a restart", async () => {
  const cy = agent("cy");                 // trusts nobody
  const dot = agent("dot");
  await Promise.all([cy.ready(), dot.ready()]);

  // A person, or a second mycelium with the same id, allows dot while cy runs.
  writeFileSync(join(DIR, "cy", "allow"), "dot\n");

  assert.equal(await dot.tool("mycelium_send", { to: "cy", message: "hello" }), "Sent to cy.");
});

test("mycelium_allow refuses an id that would write more than one peer", async () => {
  const eli = agent("eli");
  await eli.ready();

  assert.match(await eli.tool("mycelium_allow", { agent: "fay\nmallory" }), /^Cannot allow/);
  assert.equal(existsSync(join(DIR, "eli", "allow")), false);
});

test("the server exits when its host goes away", async () => {
  const hal = agent("hal");
  await hal.ready();

  // An orphan keeps taking messages for an agent that is gone, with a seq
  // counter that a later server with the same id will collide with.
  hal.hangUp();
  await hal.exited();
});

test("a reply in flight when the host hangs up is still written", async () => {
  const ike = agent("ike", { MYCELIUM_ALLOW: "jin" });
  const jin = agent("jin", { MYCELIUM_ALLOW: "ike" });
  await Promise.all([ike.ready(), jin.ready()]);

  // A host that pipes requests and closes its end, a script or a FIFO, is
  // still owed every answer it asked for.
  const said = jin.tool("mycelium_send", { to: "ike", message: "last words" });
  jin.hangUp();
  assert.equal(await said, "Sent to ike.");
  await jin.exited();
});

test("a server on an unreachable relay still exits with its host", async () => {
  const kai = agent("kai", { MYCELIUM_RELAY: "http://127.0.0.1:1" });
  await kai.ready();

  // The reconnect timer must not keep a hostless server alive.
  kai.hangUp();
  await kai.exited();
});

test("an entry another writer appended is not numbered over", async () => {
  const lou = agent("lou", { MYCELIUM_ALLOW: "max" });
  const max = agent("max", { MYCELIUM_ALLOW: "lou" });
  await Promise.all([lou.ready(), max.ready()]);

  // A second server for lou, or one left behind, appends while lou runs.
  writeFileSync(
    join(DIR, "lou", "journal.jsonl"),
    JSON.stringify({ seq: 1, ts: new Date().toISOString(), from: "max", message: "via the other server", status: "delivered" }) + "\n",
  );

  await max.tool("mycelium_send", { to: "lou", message: "via this one" });
  assert.deepEqual(journal("lou").map((e) => e.seq), [1, 2]);
  assert.equal(plain(await lou.tool("mycelium_inbox")), "[max]: via the other server\n[max]: via this one");
});

test("--watch rings each arrival once when the journal repeats a seq", async () => {
  // The shape of a journal two servers wrote to before #28: a duplicated seq
  // and a series out of order. Read up to the end, so nothing is waiting.
  const entry = (seq, message) => JSON.stringify({ seq, ts: `2026-09-08T10:00:0${seq}.000Z`, from: "pia", message, status: "delivered" });
  mkdirSync(join(DIR, "oz"), { recursive: true });
  writeFileSync(join(DIR, "oz", "journal.jsonl"), [entry(1, "a"), entry(2, "b"), entry(2, "b"), entry(3, "c"), entry(5, "e"), entry(4, "d")].join("\n") + "\n");
  writeFileSync(join(DIR, "oz", "cursor"), "5");

  const eyes = watcher("oz");
  await eyes.ready();

  appendFileSync(join(DIR, "oz", "journal.jsonl"), entry(6, "new") + "\n");
  await waitFor("the new line", () => eyes.lines.length >= 1);
  await sleep(1300);                     // past the safety-net tick, where the replay used to start
  assert.deepEqual(eyes.lines, ["[mycelium] message from pia — mycelium_inbox to read: new"]);
});

test("a restarted server says who is waiting at the gate", async () => {
  const quill = agent("quill");           // trusts nobody
  const reed = agent("reed");
  await Promise.all([quill.ready(), reed.ready()]);

  await reed.tool("mycelium_send", { to: "quill", message: "let me in" });
  await quill.stop();

  const revived = agent("quill");
  await revived.ready();
  assert.deepEqual(revived.notes, ["1 message held at the gate from reed. Ask the user before calling mycelium_allow or mycelium_deny."]);
});

test("a knock journaled by another server can be allowed", async () => {
  const sol = agent("sol");               // trusts nobody
  await sol.ready();

  // The journal is the gate, so a knock taken in by a different process is
  // as much sol's to settle as one sol took in itself.
  writeFileSync(
    join(DIR, "sol", "journal.jsonl"),
    JSON.stringify({ seq: 1, ts: new Date().toISOString(), from: "tam", message: "let me in", status: "pending" }) + "\n",
  );

  assert.match(await sol.tool("mycelium_allow", { agent: "tam" }), /has been delivered/);
  assert.equal(plain(await sol.tool("mycelium_inbox")), "[tam]: let me in");
});

test("the instructions name a watch command that runs from anywhere", async () => {
  const ula = agent("ula");
  const { instructions } = await ula.ready();
  assert.ok(instructions.includes(`node ${MYCELIUM} --watch ula`), instructions);
});

test("mycelium_agents says which peers are running", async () => {
  const vera = agent("vera");
  const wyn = agent("wyn");
  await Promise.all([vera.ready(), wyn.ready()]);

  assert.match(await vera.tool("mycelium_agents"), /^wyn \(running\)$/m);

  await wyn.stop();
  assert.match(
    await vera.tool("mycelium_agents"),
    /^wyn \(not running, last seen \d{4}-\d\d-\d\d \d\d:\d\dZ\)$/m,
  );
});

test("the sender is told up front that the receiver is not running", async () => {
  const yan = agent("yan");
  const zed = agent("zed");
  await Promise.all([yan.ready(), zed.ready()]);
  await zed.stop();

  assert.equal(
    await yan.tool("mycelium_send", { to: "zed", message: "are you there" }),
    "Queued for zed — zed's mycelium is not running. The message waits in the mailbox until zed starts.",
  );
});

test("a second server on the same id stands aside until the first is gone", async () => {
  const first = agent("xia", { MYCELIUM_ALLOW: "bea" });
  await first.ready();
  const second = agent("xia", { MYCELIUM_ALLOW: "bea" });
  await second.ready();
  const bea = agent("bea");
  await bea.ready();

  // Two servers on one id take each other's messages and share one cursor,
  // so each agent sees part of its mail and believes it has all of it.
  assert.match(await second.tool("mycelium_inbox"), /^mycelium is not running for "xia": another mycelium server \(pid \d+\) already uses this id\./);
  assert.match(second.notes.join("\n"), /another mycelium server \(pid \d+\) already uses this id/);

  await bea.tool("mycelium_send", { to: "xia", message: "for the first" });
  await waitFor("the first server to take it", () => first.notes.includes("for the first"));
  assert.ok(!second.notes.includes("for the first"), "the server standing aside took a message");

  // Once the holder is gone, the next call takes the id over, mailbox and all.
  await first.stop();
  await bea.tool("mycelium_send", { to: "xia", message: "for whoever is left" });
  assert.equal(plain(await second.tool("mycelium_inbox")), "[bea]: for the first\n[bea]: for whoever is left");
});

test("mycelium_inbox says when each message arrived and where it sits in the journal", async () => {
  const nod = agent("nod", { MYCELIUM_ALLOW: "pax" });
  const pax = agent("pax", { MYCELIUM_ALLOW: "nod" });
  await Promise.all([nod.ready(), pax.ready()]);

  await pax.tool("mycelium_send", { to: "nod", message: "first" });
  await pax.tool("mycelium_send", { to: "nod", message: "second" });

  // Several messages between two reads lose their order and spacing without
  // these; the journal has had them all along.
  const [a, b] = journal("nod");
  const stamp = (e) => `${e.ts.slice(0, 19)}Z #${e.seq}`;
  assert.equal(await nod.tool("mycelium_inbox"), `[pax ${stamp(a)}]: first\n[pax ${stamp(b)}]: second`);
});

test("mycelium_agents says whether a peer has read what you sent", async () => {
  const ash = agent("ash", { MYCELIUM_ALLOW: "bryn" });
  const bryn = agent("bryn", { MYCELIUM_ALLOW: "ash" });
  await Promise.all([ash.ready(), bryn.ready()]);

  // Without this, delivered-and-unread and lost look the same from the
  // sender's side, and agents trade "ack" messages to tell them apart.
  await ash.tool("mycelium_send", { to: "bryn", message: "one" });
  await ash.tool("mycelium_send", { to: "bryn", message: "two" });
  assert.match(await ash.tool("mycelium_agents"), /^bryn \(running\) — has not read your 2 messages$/m);

  await bryn.tool("mycelium_inbox");
  await ash.tool("mycelium_send", { to: "bryn", message: "three" });
  assert.match(await ash.tool("mycelium_agents"), /^bryn \(running\) — has not read 1 of your 3 messages$/m);

  await bryn.tool("mycelium_inbox");
  assert.match(await ash.tool("mycelium_agents"), /^bryn \(running\) — has read all 3 of your messages$/m);
});

test("mycelium_agents says when a peer holds or denies your message at the gate", async () => {
  const cass = agent("cass");             // trusts nobody
  const dov = agent("dov");
  await Promise.all([cass.ready(), dov.ready()]);

  await dov.tool("mycelium_send", { to: "cass", message: "let me in" });
  assert.match(await dov.tool("mycelium_agents"), /^cass \(running\) — holds your message at the gate$/m);

  // A denial is never rung out, but the sender is still owed the outcome.
  await cass.tool("mycelium_deny", { agent: "dov" });
  assert.match(await dov.tool("mycelium_agents"), /^cass \(running\) — denied your message$/m);
});

test("mycelium_rename takes the id a director expects, and the mail comes along", async () => {
  // The launcher named this agent after its worktree; its director expects
  // "quad" and has pre-allowed only that.
  const dou = agent("dou", { MYCELIUM_ALLOW: "kit" });
  const boss = agent("boss", { MYCELIUM_ALLOW: "quad" });
  const kit = agent("kit", { MYCELIUM_ALLOW: "dou,quad" });
  const zip = agent("zip");
  await Promise.all([dou.ready(), boss.ready(), kit.ready(), zip.ready()]);

  await kit.tool("mycelium_send", { to: "dou", message: "before the rename" });
  await zip.tool("mycelium_send", { to: "dou", message: "held text" });
  const eyes = watcher("dou");
  await waitFor("the watcher's startup lines", () => eyes.lines.length === 2);

  assert.match(await dou.tool("mycelium_rename", { id: "quad" }), /^You are now "quad" on mycelium, no longer "dou"\. 1 unread message and 1 knock came with you\./);
  assert.equal(plain(await dou.tool("mycelium_inbox")), "[kit]: before the rename\nHeld at the gate: zip (1 message). Ask the user before calling mycelium_allow or mycelium_deny.");
  assert.equal(await dou.tool("mycelium_send", { to: "boss", message: "reporting in" }), "Sent to boss.");

  // Whoever still writes to the old id is pointed at the new one.
  assert.equal(
    await kit.tool("mycelium_send", { to: "dou", message: "where did you go" }),
    `dou is now quad. The message was not sent; send it to quad.`,
  );
  assert.match(await kit.tool("mycelium_agents"), /^dou \(now quad\)$/m);

  // Carrying the knock over must not ring anything out on the old journal.
  await sleep(300);
  assert.equal(eyes.lines.length, 2, `the rename rang: ${eyes.lines.slice(2).join(" | ")}`);
});

test("a server standing aside can rename its way out", async () => {
  const first = agent("mo");
  await first.ready();
  const second = agent("mo");
  await second.ready();

  assert.match(await second.tool("mycelium_inbox"), /^mycelium is not running for "mo"/);
  assert.match(await second.tool("mycelium_rename", { id: "mo2" }), /^You are now "mo2" on mycelium, no longer "mo"\./);
  assert.equal(await second.tool("mycelium_inbox"), "No new messages.");

  // The id it left belongs to the first server, which is untouched.
  assert.match(await second.tool("mycelium_agents"), /^mo \(running\)$/m);
});

test("mycelium_rename refuses an id that is taken or unsafe", async () => {
  const rex = agent("rex");
  const sid = agent("sid");
  await Promise.all([rex.ready(), sid.ready()]);

  assert.match(await rex.tool("mycelium_rename", { id: "../escape" }), /^Cannot take "\.\.\/escape"/);
  assert.match(await rex.tool("mycelium_rename", { id: "sid" }), /^Cannot take "sid": another mycelium server \(pid \d+\) is running as it\./);
});

test("MYCELIUM_ALLOW=* lets anyone in", async () => {
  // A fleet night: every peer on the machine is the owner's own.
  const fen = agent("fen", { MYCELIUM_ALLOW: "*" });
  const gil = agent("gil");
  await Promise.all([fen.ready(), gil.ready()]);

  assert.equal(await gil.tool("mycelium_send", { to: "fen", message: "no knock needed" }), "Sent to fen.");
});

test("mycelium_allow * opens the gate, delivers everyone waiting, and stays open", async () => {
  const ivy = agent("ivy");               // trusts nobody
  const jax = agent("jax");
  const kip = agent("kip");
  await Promise.all([ivy.ready(), jax.ready(), kip.ready()]);

  await jax.tool("mycelium_send", { to: "ivy", message: "from jax" });
  await kip.tool("mycelium_send", { to: "ivy", message: "from kip" });

  assert.match(await ivy.tool("mycelium_allow", { agent: "*" }), /^Opened the gate to everyone, now and after a restart\. 2 held messages delivered\./);
  assert.equal(plain(await ivy.tool("mycelium_inbox")), "[jax]: from jax\n[kip]: from kip");

  await ivy.stop();
  const revived = agent("ivy");
  const lux = agent("lux");
  await Promise.all([revived.ready(), lux.ready()]);
  assert.equal(await lux.tool("mycelium_send", { to: "ivy", message: "a stranger" }), "Sent to ivy.");
});

test("two clones in two directories get two different ids, neither of them cape-town", async () => {
  // What an agent host runs in a fresh clone: the committed .mcp.json, from
  // the clone's own directory. The file once named a fixed id, and every
  // workspace of this repository took over the umbrella agent's mailbox.
  const config = JSON.parse(readFileSync(join(dirname(MYCELIUM), ".mcp.json"), "utf-8")).mcpServers.mycelium;
  const ids = [];
  for (const name of ["clone-one", "clone two!"]) {
    const clone = join(DIR, "clones", name);
    mkdirSync(clone, { recursive: true });
    copyFileSync(MYCELIUM, join(clone, "mycelium.mjs"));
    const env = { ...process.env, MYCELIUM_DIR: DIR };
    delete env.MYCELIUM_ID;              // only the committed config may name one
    const server = serve(spawn(config.command === "node" ? process.execPath : config.command, config.args, {
      cwd: clone,
      env: { ...env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    }));
    ids.push((await server.ready()).instructions.match(/You are agent "([^"]+)"/)[1]);
  }
  assert.deepEqual(ids, ["clone-one", "clone-two"]);
});
