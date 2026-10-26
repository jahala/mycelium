// pollen tests — node --test. Zero dependencies, like the thing it tests.
//
// Every test drives a real MCP server over stdio and a real mailbox on disk.
// Nothing is mocked: if these pass, two agents can actually talk.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const POLLEN = join(dirname(fileURLToPath(import.meta.url)), "pollen.mjs");

// One mailbox root per run, left in place afterwards — it lives under the
// system temp dir, which the OS clears.
const DIR = mkdtempSync(join(tmpdir(), "pollen-test-"));

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
  const proc = spawn(process.execPath, [POLLEN], {
    env: { ...process.env, POLLEN_DIR: DIR, POLLEN_ID: id, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  running.push(proc);

  const waiting = new Map(); // request id → resolve
  createInterface({ input: proc.stdout }).on("line", (line) => {
    const msg = JSON.parse(line);
    const resolve = waiting.get(msg.id); // notifications have no id
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
    ready: () => call("initialize", {}),
    tool: (name, args = {}) =>
      call("tools/call", { name, arguments: args }).then((r) => r.content[0].text),
    alive: () => proc.exitCode === null && proc.signalCode === null,
    stop: () => { proc.kill(); return once(proc, "exit"); },
  };
}

function watcher(id) {
  const proc = spawn(process.execPath, [POLLEN, "--watch", id], {
    env: { ...process.env, POLLEN_DIR: DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.push(proc);

  const lines = [];
  createInterface({ input: proc.stdout }).on("line", (line) => lines.push(line));

  let attached = false;
  proc.stderr.setEncoding("utf-8");
  proc.stderr.on("data", (chunk) => { if (chunk.includes("pollen watching")) attached = true; });

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
  const alpha = agent("alpha", { POLLEN_ALLOW: "beta" });
  const beta = agent("beta", { POLLEN_ALLOW: "alpha" });
  await Promise.all([alpha.ready(), beta.ready()]);

  assert.equal(await beta.tool("pollen_send", { to: "alpha", message: "the Q4 files are in /tmp/drop" }), "Sent to alpha.");
  await waitFor("alpha to take the message off disk", () => taken("alpha"));

  // alpha never read it — this is where the old in-memory buffer lost it.
  await alpha.stop();

  const revived = agent("alpha", { POLLEN_ALLOW: "beta" });
  await revived.ready();
  assert.equal(await revived.tool("pollen_inbox"), "[beta]: the Q4 files are in /tmp/drop");
});

test("a message is handed over once, not on every check", async () => {
  const carla = agent("carla", { POLLEN_ALLOW: "dan" });
  const dan = agent("dan", { POLLEN_ALLOW: "carla" });
  await Promise.all([carla.ready(), dan.ready()]);

  await dan.tool("pollen_send", { to: "carla", message: "first" });
  await dan.tool("pollen_send", { to: "carla", message: "second" });
  await waitFor("both messages to land", () => taken("carla"));

  assert.equal(await carla.tool("pollen_inbox"), "[dan]: first\n[dan]: second");
  assert.equal(await carla.tool("pollen_inbox"), "No new messages.");
});

test("the trust gate holds a stranger's message out of the inbox", async () => {
  const erin = agent("erin");            // trusts nobody
  const frank = agent("frank");
  await Promise.all([erin.ready(), frank.ready()]);

  await frank.tool("pollen_send", { to: "erin", message: "let me in" });
  await waitFor("erin to take the message off disk", () => taken("erin"));

  assert.equal(journal("erin")[0].status, "pending");
  assert.equal(await erin.tool("pollen_inbox"), "No new messages.");

  assert.match(await erin.tool("pollen_allow", { agent: "frank" }), /has been delivered/);
  assert.equal(await erin.tool("pollen_inbox"), "[frank]: let me in");
});

test("--watch prints a line the moment a message lands", async () => {
  const gina = agent("gina", { POLLEN_ALLOW: "hugo" });
  const hugo = agent("hugo", { POLLEN_ALLOW: "gina" });
  await Promise.all([gina.ready(), hugo.ready()]);

  const eyes = watcher("gina");
  await eyes.ready();

  await hugo.tool("pollen_send", { to: "gina", message: "radio check" });
  await waitFor("a watch line", () => eyes.lines.length === 1);
  assert.equal(eyes.lines[0], "[pollen] message from hugo — pollen_inbox to read: radio check");

  // A stranger's knock rouses the agent without leaking what they said.
  const ivan = agent("ivan");
  await ivan.ready();
  await ivan.tool("pollen_send", { to: "gina", message: "secret payload" });
  await waitFor("a second watch line", () => eyes.lines.length === 2);
  assert.equal(eyes.lines[1], "[pollen] ivan is knocking — pollen_allow or pollen_deny");
});

test("--watch rings for messages that are already waiting", async () => {
  const jo = agent("jo", { POLLEN_ALLOW: "kim" });
  const kim = agent("kim", { POLLEN_ALLOW: "jo" });
  await Promise.all([jo.ready(), kim.ready()]);

  await kim.tool("pollen_send", { to: "jo", message: "you were out" });
  await waitFor("the message to land", () => taken("jo"));

  const eyes = watcher("jo");           // armed after the fact — must not start deaf
  await waitFor("a watch line", () => eyes.lines.length === 1);
  assert.equal(eyes.lines[0], "[pollen] 1 message waiting — pollen_inbox to read");
});

test("messages route through the relay, journal and all", async () => {
  const relay = spawn(process.execPath, [POLLEN, "--relay"], {
    env: { ...process.env, POLLEN_PORT: "0" },   // any free port
    stdio: ["ignore", "ignore", "pipe"],
  });
  running.push(relay);

  let port;
  relay.stderr.setEncoding("utf-8");
  relay.stderr.on("data", (chunk) => { port ??= chunk.match(/on :(\d+)/)?.[1]; });
  await waitFor("the relay to bind", () => port);

  const url = `http://127.0.0.1:${port}`;
  const nia = agent("nia", { POLLEN_ALLOW: "otto", POLLEN_RELAY: url });
  const otto = agent("otto", { POLLEN_ALLOW: "nia", POLLEN_RELAY: url });
  await Promise.all([nia.ready(), otto.ready()]);

  await otto.tool("pollen_send", { to: "nia", message: "over the air" });
  await waitFor("nia to journal it", () => journal("nia").length === 1);
  assert.equal(await nia.tool("pollen_inbox"), "[otto]: over the air");
});

test("the sender is told when a message is held at the trust gate", async () => {
  const opal = agent("opal");            // trusts nobody
  const pete = agent("pete");
  await Promise.all([opal.ready(), pete.ready()]);

  assert.equal(
    await pete.tool("pollen_send", { to: "opal", message: "knock knock" }),
    `Held at opal's trust gate — opal must allow "pete" before this is delivered.`,
  );
});

test("the sender is told when the receiver's pollen is not running", async () => {
  const quinn = agent("quinn", { POLLEN_ALLOW: "rosa" });
  const rosa = agent("rosa", { POLLEN_ALLOW: "quinn" });
  await Promise.all([quinn.ready(), rosa.ready()]);

  await quinn.stop();                    // mailbox stays on disk, nobody home
  assert.match(await rosa.tool("pollen_send", { to: "quinn", message: "anyone there" }), /^Queued for quinn/);
});

test("a second message from a stranger does not overwrite the first", async () => {
  const sam = agent("sam");
  const tess = agent("tess");
  await Promise.all([sam.ready(), tess.ready()]);

  await tess.tool("pollen_send", { to: "sam", message: "first" });
  await tess.tool("pollen_send", { to: "sam", message: "second" });
  await waitFor("both to be journalled", () => journal("sam").length === 2);

  await sam.tool("pollen_allow", { agent: "tess" });
  assert.equal(await sam.tool("pollen_inbox"), "[tess]: first\n[tess]: second");
});

test("--watch rings for messages held at the trust gate", async () => {
  const uma = agent("uma");
  const vic = agent("vic");
  await Promise.all([uma.ready(), vic.ready()]);

  await vic.tool("pollen_send", { to: "uma", message: "let me in" });
  await waitFor("the message to be journalled", () => journal("uma").length === 1);

  const eyes = watcher("uma");           // armed after the fact — must not start deaf
  await waitFor("a watch line", () => eyes.lines.length === 1);
  assert.equal(eyes.lines[0], "[pollen] 1 knock waiting at the gate — pollen_allow or pollen_deny");
});

test("a knock held at the gate can still be allowed after a restart", async () => {
  const yuri = agent("yuri");             // trusts nobody
  const zoe = agent("zoe");
  await Promise.all([yuri.ready(), zoe.ready()]);

  await zoe.tool("pollen_send", { to: "yuri", message: "let me in" });
  await waitFor("the knock to be journalled", () => journal("yuri").length === 1);

  // The gate is rung by the journal, so it has to survive with the journal —
  // otherwise the watcher reports a knock nobody can ever action.
  await yuri.stop();
  const revived = agent("yuri");
  await revived.ready();

  assert.match(await revived.tool("pollen_allow", { agent: "zoe" }), /has been delivered/);
  assert.equal(await revived.tool("pollen_inbox"), "[zoe]: let me in");

  const eyes = watcher("yuri");
  await eyes.ready();
  await sleep(300);
  assert.deepEqual(eyes.lines, [], `settled knock still ringing: ${eyes.lines.join(" | ")}`);
});

test("an unreachable relay fails the call, not the pollen", async () => {
  const far = agent("far", { POLLEN_RELAY: "http://127.0.0.1:1" });
  await far.ready();

  const said = await far.tool("pollen_send", { to: "anyone", message: "hi" });
  assert.match(said, /could not reach/i);
  assert.ok(far.alive(), "the pollen died along with the request");

  // Still serving afterwards — a failed send must not cost the agent its radio.
  assert.equal(await far.tool("pollen_inbox"), "No new messages.");
});

test("a denied message is not rung out by --watch", async () => {
  const wes = agent("wes");
  const xena = agent("xena");
  await Promise.all([wes.ready(), xena.ready()]);

  const eyes = watcher("wes");
  await eyes.ready();

  await xena.tool("pollen_send", { to: "wes", message: "sensitive payload" });
  await waitFor("the knock", () => eyes.lines.length === 1);

  await wes.tool("pollen_deny", { agent: "xena" });
  await sleep(300);                      // give a wrong implementation time to leak it
  assert.equal(eyes.lines.length, 1, `denied text leaked: ${eyes.lines.join(" | ")}`);
});

test("--watch survives the journal being wiped under it", async () => {
  const lena = agent("lena", { POLLEN_ALLOW: "milo" });
  const milo = agent("milo", { POLLEN_ALLOW: "lena" });
  await Promise.all([lena.ready(), milo.ready()]);

  const eyes = watcher("lena");
  await eyes.ready();

  await milo.tool("pollen_send", { to: "lena", message: "before" });
  await waitFor("the first line", () => eyes.lines.length === 1);

  // /tmp gets cleared and the agent starts a fresh journal from seq 1. The
  // watcher must notice the sequence restarted rather than ignore everything.
  writeFileSync(
    join(DIR, "lena", "journal.jsonl"),
    JSON.stringify({ seq: 1, ts: "2026-01-01T00:00:00.000Z", from: "milo", message: "after", status: "delivered" }) + "\n"
  );
  await waitFor("the line after the wipe", () => eyes.lines.length === 2);
  assert.match(eyes.lines[1], /message from milo — pollen_inbox to read: after/);
});

test("a peer allowed once stays allowed after a restart", async () => {
  const ada = agent("ada");               // trusts nobody
  const bo = agent("bo");
  await Promise.all([ada.ready(), bo.ready()]);

  await bo.tool("pollen_send", { to: "ada", message: "let me in" });
  await ada.tool("pollen_allow", { agent: "bo" });

  // POLLEN_ALLOW is fixed when the server starts. A pollen_allow that lived
  // only in memory would be forgotten here and hold bo at the gate again.
  await ada.stop();
  const revived = agent("ada");
  await revived.ready();

  assert.equal(await bo.tool("pollen_send", { to: "ada", message: "back again" }), "Sent to ada.");
});

test("an allow written to the file takes effect without a restart", async () => {
  const cy = agent("cy");                 // trusts nobody
  const dot = agent("dot");
  await Promise.all([cy.ready(), dot.ready()]);

  // A person, or a second pollen with the same id, allows dot while cy runs.
  writeFileSync(join(DIR, "cy", "allow"), "dot\n");

  assert.equal(await dot.tool("pollen_send", { to: "cy", message: "hello" }), "Sent to cy.");
});

test("pollen_allow refuses an id that would write more than one peer", async () => {
  const eli = agent("eli");
  await eli.ready();

  assert.match(await eli.tool("pollen_allow", { agent: "fay\nmallory" }), /^Cannot allow/);
  assert.equal(existsSync(join(DIR, "eli", "allow")), false);
});
