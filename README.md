# mycelium

**what passes between, underground.**

Peer messaging between AI agents, with a human at the gate. One file, zero dependencies.

mycelium was called pollen until October 2026.

## What it does

One agent asks another a question and uses the answer, without a supervisor having to relay it. Works with any MCP-compatible agent (Claude Code, Codex CLI, Gemini CLI, etc.).

- **Same machine**: messages go through file mailboxes at `/tmp/mycelium/`
- **Different machines**: messages route through an HTTP relay
- **The gate**: strangers knock; you decide. An agent nobody has vouched for cannot simply talk to yours

## Install

Tell your agent:

> Install mycelium from https://github.com/jahala/mycelium

Or do it manually:

```bash
curl -O https://raw.githubusercontent.com/jahala/mycelium/main/mycelium.mjs
```

Then add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "mycelium": {
      "command": "node",
      "args": ["./mycelium.mjs"]
    }
  }
}
```

The agent's id is the name of the directory it starts in, so every project and worktree gets its own mailbox. Set `MYCELIUM_ID` in `env` to choose a different one. The same holds for one global registration shared by every agent on a machine: point it at the full path of `mycelium.mjs` and give it no id.

That's it. The agent now has six tools: `mycelium_send`, `mycelium_agents`, `mycelium_inbox`, `mycelium_allow`, `mycelium_deny`, `mycelium_rename`.

## Taking the id you are expected under

A launcher often names an agent before anyone knows what its director will call it. A global registration might name it after its worktree directory (`douala`), while the director expects and has allowed `quadrat`. The environment cannot change once the server is running, so the agent takes the id instead:

```
mycelium_rename quadrat
You are now "quadrat" on mycelium, no longer "douala". 1 unread message came with you. Anyone who writes to douala is told your new id. Restart your watcher as "node /path/to/mycelium.mjs --watch quadrat".
```

Unread messages, held knocks and allowed peers come along. A send to the old id is refused with the new one named, and `mycelium_agents` lists it as `douala (now quadrat)`. An id that another running server holds cannot be taken. A server standing aside because its id is taken can rename its way out.

## Getting woken

An agent that has to remember to check its inbox will miss things. Run the watcher instead:

```
node mycelium.mjs --watch my-agent
```

It prints one line per message and keeps running, so any harness that reads lines can rouse the agent — Claude Code's `Monitor`, a `&` in a shell, `systemd`, a tmux pane. Two things keep the lines from going nowhere. A harness tool that reports only when a process exits never hears a watcher that runs forever; in Claude Code that is a background Bash task, so use `Monitor`. And if you pipe the watcher, every later stage must flush per line (`grep --line-buffered`, not plain `cut`), or lines wait in a buffer and silence looks like an empty inbox.

The MCP server tells the agent the full path of the command, so it works from any directory.

```
[mycelium] message from beta — mycelium_inbox to read: the Q4 answers are in /tmp/drop
[mycelium] stranger is knocking — mycelium_allow or mycelium_deny
```

The line is a doorbell, not the message: `mycelium_inbox` is still what hands the text over. Messages held at the trust gate ring without quoting what they said.

On startup it also rings once for anything already outstanding, counting the two separately — because they need different things from you:

```
[mycelium] 2 messages waiting — mycelium_inbox to read
[mycelium] 1 knock waiting at the gate from gamma — mycelium_allow or mycelium_deny
```

A denial is never rung out. Echoing the text a human just rejected onto the channel they watch would defeat the point of denying it.

Don't watch `/tmp/mycelium/<id>/inbox` directly. Those files are consumed within milliseconds of landing, so a poll almost always finds an empty directory. Watch the journal — it is append-only and nothing is ever removed from it.

## Cross-machine

Start the relay on one machine:

```
node mycelium.mjs --relay
```

Expose it (free, no account):

```
cloudflared tunnel --url http://localhost:4747
```

Point remote agents at the URL:

```json
"env": {
  "MYCELIUM_ID": "remote-agent",
  "MYCELIUM_RELAY": "https://verb-noun-thing.trycloudflare.com"
}
```

Any tunnel or VPN works. mycelium just speaks HTTP to a URL.

## The gate

Strangers knock; you decide. An unvouched peer is held, and a person allows or denies it.

The sender is told, rather than left guessing — `mycelium_send` reports what the receiver actually did with the message:

```
Sent to beta.
Held at beta's trust gate — beta must allow "alpha" before this is delivered.
Queued for beta — beta's mycelium is not running. The message waits in the mailbox until beta starts.
Queued for beta — no confirmation from beta's mycelium; it stays in the mailbox until taken.
```

`mycelium_agents` tells you before you send whether each peer is running. It also tells you after sending what became of your messages:

```
beta (running) — has not read 1 of your 3 messages
gamma (not running, last seen 2026-09-05 14:02Z) — has read your message
delta (running) — holds your message at the gate
```

No receipt travels back for this. The receiver's journal and cursor already record what arrived and what was read, and on one machine the sender can see them. Over a relay there is no read state, for the same reason there is no gate verdict.

An agent waiting on a reply that can never come is worse than one told to go ask a human. Over a relay only the first is possible: the gate runs in the receiver's process on the far side, and its verdict has no route back, so cross-machine senders learn the message left but not whether it was let in.

Knocks queue rather than replace each other, so a stranger's follow-up doesn't destroy the message it's asking about — `mycelium_allow` delivers all of them, oldest first.

Nobody waiting at the gate goes unnamed. `mycelium_inbox` lists them after any messages, and a server that starts with knocks already held says who they are from:

```
No new messages.
Held at the gate: gamma (2 messages). Ask the user before calling mycelium_allow or mycelium_deny.
```

Pre-approve agents you trust:

```json
"env": {
  "MYCELIUM_ID": "my-agent",
  "MYCELIUM_ALLOW": "trusted-agent-1,trusted-agent-2"
}
```

For a night when every peer on the machine is your own, `MYCELIUM_ALLOW=*` lets anyone in without a knock. An agent can open its own gate the same way with `mycelium_allow *`, which also delivers everything waiting at the gate. It should only do that when its person says so. The gate stays closed unless one of the two is set.

A peer you let in with `mycelium_allow` stays allowed. mycelium writes its id to `/tmp/mycelium/<id>/allow`, one id per line, and reads that file on every arrival. A restarted server still trusts the peer, and an id you add to the file by hand works at once. To take trust back, remove the line.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MYCELIUM_ID` | no | Agent name. Default: the directory the server starts in |
| `MYCELIUM_RELAY` | no | Relay URL for cross-machine |
| `MYCELIUM_ALLOW` | no | Comma-separated trusted agent IDs, or `*` for anyone |
| `MYCELIUM_DIR` | no | Mailbox root (default `/tmp/mycelium`) |
| `MYCELIUM_PORT` | no | Relay port (default `4747`) |

## How it works

~860 lines of JavaScript. Raw MCP protocol over stdio (no SDK). Three modes:

- `node mycelium.mjs` — MCP server that Claude Code (or any MCP host) spawns as a subprocess
- `node mycelium.mjs --relay` — HTTP relay with SSE streams for real-time delivery
- `node mycelium.mjs --watch ID` — tails an agent's journal, one line per new message

Local transport uses the filesystem. Remote transport uses HTTP + SSE. The agent doesn't know or care which one it's using.

Every arrival is appended to `/tmp/mycelium/<id>/journal.jsonl` before the mailbox file is removed, and `/tmp/mycelium/<id>/cursor` records how far the agent has read. That journal is the inbox: a message that arrived but was never read is still there after the MCP server restarts, and on startup the agent is told how many are waiting. Both transports write it, so a relayed message is as durable as a local one.

## Notes

- `mycelium_inbox` lets any agent check for received messages. Each line says who sent it, when it arrived and its place in the journal: `[beta 2026-09-09T21:14:03Z #7]: …`. Claude Code agents also get automatic push via [channels](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/notifications#channels) (research preview), but `mycelium_inbox` works everywhere.
- The journal is append-only and never rotated. It lives under `/tmp`, which the OS clears on reboot. The allow file lives beside it and is cleared with it, so after a reboot only `MYCELIUM_ALLOW` is trusted.
- A message held at the trust gate survives a restart — the gate is read from the journal, so a knock you were rung about is still there to allow or deny.
- One server per id. Two servers on one id would take each other's messages, so a second one stands aside: every tool tells the agent why, and it takes over once the first is gone. The running server keeps its pid in `/tmp/mycelium/<id>/server.json` and touches the file every few seconds; the file's age is the "last seen" in `mycelium_agents`.
- A server exits when its host closes its stdin, so a session that ends does not leave a server behind.
- Tests: `node --test`. They drive real MCP servers over stdio against a real mailbox — nothing is mocked.
- Requires Node.js 18+. Nothing else.

## Support

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/jahala)

---

Part of the plotplot garden · built with [petals](https://github.com/jahala/petals)
