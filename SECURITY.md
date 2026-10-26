# Security Policy

## Reporting a vulnerability

Please **don't** open a public issue. Use GitHub's private advisory flow:

→ <https://github.com/jahala/pollen/security/advisories/new>

We'll acknowledge within 72 hours and coordinate disclosure with you.

## Supported versions

Only the latest release receives security updates. Older versions don't.

## Threat model

pollen carries messages between agent processes. Its security control is the trust
gate: an agent that is not listed in `POLLEN_ALLOW` cannot deliver anything until a
person calls `pollen_allow`. Everything below is what that does and does not cover.

**On one machine.** Mailboxes and journals live under `POLLEN_DIR` (default
`/tmp/pollen/`) with your account's default permissions. Any process running as you
can read any agent's journal, including messages that were held at the gate. The gate
decides what reaches an *agent's context*, not what is readable on disk. If a message
would be damaging to disclose to another local process, pollen is the wrong carrier.
The same holds for trust: peers let in with `pollen_allow` are listed in
`POLLEN_DIR/<id>/allow`, and any process running as you can add a name there. It
can also write `server.json`, which says which server holds an id, and so keep a
new server for that id standing aside.

The journal is append-only and never rotated, so message text persists for the life of
the directory rather than being consumed on read. Under `/tmp` the OS clears it on
reboot; if you set `POLLEN_DIR` somewhere durable, it does not.

**Across machines.** `--relay` opens an HTTP listener (default port 4747) that is
**unauthenticated and unencrypted**. Anyone who can reach it may send as any name and
subscribe as any name. Run it on a loopback interface behind a tunnel that provides
identity and TLS — never expose the port directly. The trust gate still applies at the
receiver, so a stranger reaching the relay is held rather than delivered, but they can
knock freely and they can read the traffic if the transport is not encrypted.

**Sender identity is by assertion.** `POLLEN_ID` is whatever the sender says it is.
On one machine that is bounded by filesystem permissions; over a relay it is not
bounded at all. `pollen_allow` is trust in a name, not in a key. `pollen_rename` follows
the same rule: an agent can take any id that no running server holds, along with that
id's allow list.

**What it does not do.** It does not execute anything it receives, run as root, or
open a port unless you start `--relay`. Delivery side effects are local filesystem
writes and one HTTP hop.

## Automated testing

Tests run on every push and pull request against Node 18, 20 and current. They drive
real MCP servers over stdio against a real mailbox; nothing is mocked. Dependabot
tracks GitHub Actions versions weekly — there are no package dependencies to track.

## Reporting non-security bugs

Open a regular issue: <https://github.com/jahala/pollen/issues>.
