# pollen

**carry what matters.**

Peer messaging between AI agents, with a human at the gate. One file, zero dependencies.

## What it does

One agent asks another a question and uses the answer, without a supervisor having to relay it. Works with any MCP-compatible agent (Claude Code, Codex CLI, Gemini CLI, etc.).

- **Same machine**: messages go through file mailboxes at `/tmp/pollen/`
- **Different machines**: messages route through an HTTP relay
- **The gate**: strangers knock; you decide. An agent nobody has vouched for cannot simply talk to yours

## Install

Tell your agent:

> Install pollen from https://github.com/jahala/pollen

Or do it manually:

```bash
curl -O https://raw.githubusercontent.com/jahala/pollen/main/pollen.mjs
```

Then add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "pollen": {
      "command": "node",
      "args": ["./pollen.mjs"],
      "env": { "POLLEN_ID": "my-agent" }
    }
  }
}
```

That's it. The agent now has five tools: `pollen_send`, `pollen_agents`, `pollen_inbox`, `pollen_allow`, `pollen_deny`.

## Getting woken

An agent that has to remember to check its inbox will miss things. Run the watcher instead:

```
node pollen.mjs --watch my-agent
```

It prints one line per message and keeps running, so any harness that reads lines can rouse the agent — Claude Code's `Monitor`, a `&` in a shell, `systemd`, a tmux pane. Two things keep the lines from going nowhere. A harness tool that reports only when a process exits never hears a watcher that runs forever; in Claude Code that is a background Bash task, so use `Monitor`. And if you pipe the watcher, every later stage must flush per line (`grep --line-buffered`, not plain `cut`), or lines wait in a buffer and silence looks like an empty inbox.

The MCP server tells the agent the full path of the command, so it works from any directory.

```
[pollen] message from beta — pollen_inbox to read: the Q4 answers are in /tmp/drop
[pollen] stranger is knocking — pollen_allow or pollen_deny
```

The line is a doorbell, not the message: `pollen_inbox` is still what hands the text over. Messages held at the trust gate ring without quoting what they said.

On startup it also rings once for anything already outstanding, counting the two separately — because they need different things from you:

```
[pollen] 2 messages waiting — pollen_inbox to read
[pollen] 1 knock waiting at the gate from gamma — pollen_allow or pollen_deny
```

A denial is never rung out. Echoing the text a human just rejected onto the channel they watch would defeat the point of denying it.

Don't watch `/tmp/pollen/<id>/inbox` directly. Those files are consumed within milliseconds of landing, so a poll almost always finds an empty directory. Watch the journal — it is append-only and nothing is ever removed from it.

## Cross-machine

Start the relay on one machine:

```
node pollen.mjs --relay
```

Expose it (free, no account):

```
cloudflared tunnel --url http://localhost:4747
```

Point remote agents at the URL:

```json
"env": {
  "POLLEN_ID": "remote-agent",
  "POLLEN_RELAY": "https://verb-noun-thing.trycloudflare.com"
}
```

Any tunnel or VPN works. pollen just speaks HTTP to a URL.

## The gate

Strangers knock; you decide. An unvouched peer is held, and a person allows or denies it.

The sender is told, rather than left guessing — `pollen_send` reports what the receiver actually did with the message:

```
Sent to beta.
Held at beta's trust gate — beta must allow "alpha" before this is delivered.
Queued for beta — beta's pollen is not running. The message waits in the mailbox until beta starts.
Queued for beta — no confirmation from beta's pollen; it stays in the mailbox until taken.
```

`pollen_agents` says the same thing before you send: `beta (running), gamma (not running, last seen 2026-09-05 14:02Z)`.

An agent waiting on a reply that can never come is worse than one told to go ask a human. Over a relay only the first is possible: the gate runs in the receiver's process on the far side, and its verdict has no route back, so cross-machine senders learn the message left but not whether it was let in.

Knocks queue rather than replace each other, so a stranger's follow-up doesn't destroy the message it's asking about — `pollen_allow` delivers all of them, oldest first.

Nobody waiting at the gate goes unnamed. `pollen_inbox` lists them after any messages, and a server that starts with knocks already held says who they are from:

```
No new messages.
Held at the gate: gamma (2 messages). Ask the user before calling pollen_allow or pollen_deny.
```

Pre-approve agents you trust:

```json
"env": {
  "POLLEN_ID": "my-agent",
  "POLLEN_ALLOW": "trusted-agent-1,trusted-agent-2"
}
```

A peer you let in with `pollen_allow` stays allowed. pollen writes its id to `/tmp/pollen/<id>/allow`, one id per line, and reads that file on every arrival. A restarted server still trusts the peer, and an id you add to the file by hand works at once. To take trust back, remove the line.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `POLLEN_ID` | yes | Agent name |
| `POLLEN_RELAY` | no | Relay URL for cross-machine |
| `POLLEN_ALLOW` | no | Comma-separated trusted agent IDs |
| `POLLEN_DIR` | no | Mailbox root (default `/tmp/pollen`) |
| `POLLEN_PORT` | no | Relay port (default `4747`) |

## How it works

~740 lines of JavaScript. Raw MCP protocol over stdio (no SDK). Three modes:

- `node pollen.mjs` — MCP server that Claude Code (or any MCP host) spawns as a subprocess
- `node pollen.mjs --relay` — HTTP relay with SSE streams for real-time delivery
- `node pollen.mjs --watch ID` — tails an agent's journal, one line per new message

Local transport uses the filesystem. Remote transport uses HTTP + SSE. The agent doesn't know or care which one it's using.

Every arrival is appended to `/tmp/pollen/<id>/journal.jsonl` before the mailbox file is removed, and `/tmp/pollen/<id>/cursor` records how far the agent has read. That journal is the inbox: a message that arrived but was never read is still there after the MCP server restarts, and on startup the agent is told how many are waiting. Both transports write it, so a relayed message is as durable as a local one.

## Notes

- `pollen_inbox` lets any agent check for received messages. Each line says who sent it, when it arrived and its place in the journal: `[beta 2026-09-09T21:14:03Z #7]: …`. Claude Code agents also get automatic push via [channels](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/notifications#channels) (research preview), but `pollen_inbox` works everywhere.
- The journal is append-only and never rotated. It lives under `/tmp`, which the OS clears on reboot. The allow file lives beside it and is cleared with it, so after a reboot only `POLLEN_ALLOW` is trusted.
- A message held at the trust gate survives a restart — the gate is read from the journal, so a knock you were rung about is still there to allow or deny.
- One server per id. Two servers on one id would take each other's messages, so a second one stands aside: every tool tells the agent why, and it takes over once the first is gone. The running server keeps its pid in `/tmp/pollen/<id>/server.json` and touches the file every few seconds; the file's age is the "last seen" in `pollen_agents`.
- A server exits when its host closes its stdin, so a session that ends does not leave a server behind.
- Tests: `node --test`. They drive real MCP servers over stdio against a real mailbox — nothing is mocked.
- Requires Node.js 18+. Nothing else.

## Support

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/jahala)

---

Part of the plotplot garden · built with [petals](https://github.com/jahala/petals)
