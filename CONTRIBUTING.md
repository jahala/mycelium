# Contributing to mycelium

Thanks for looking. mycelium is deliberately small: one file, no dependencies, no build
step. Most good contributions make it smaller or more honest, not larger.

## Getting set up

```bash
git clone https://github.com/jahala/mycelium
cd mycelium
node --test
```

That is the whole toolchain. Node 18 or newer, nothing else to install.

## The bar for a change

**Write the failing test first.** The suite drives real MCP servers over stdio against
a real mailbox on disk. Nothing is mocked, and nothing should become mocked — a test
that passes without exercising the real path is worse than no test, because it tells
you the opposite of the truth.

**Explain why in the commit message.** The problem, the root cause, and what you
decided against. The log is the reasoning trail; a list of changed files is not.

**Keep the failure modes honest.** mycelium's design rule is that a caller is never left
waiting on something that cannot arrive. If a change can make a send silently
un-deliverable, it needs to say so in its return value.

## Things that will be turned down

- Dependencies. The install is `curl` one file; that is a feature.
- A second protocol where the journal already carries the information.
- Renaming the operational nouns. Message, inbox, relay, gate, allow, deny stay plain
  even though the product is called mycelium.
- Anything that makes the trust gate implicit, automatic, or skippable by default.

## Voice

User-facing strings — tool descriptions, errors, watch lines — are part of the product.
Errors say what happened, why it matters, and the next action, in that order. Calm and
precise, no jokes in failure paths. `.brand/` carries the full guidance; it is fetched
from the plotplot umbrella and should be edited there, not here.

## Code of conduct

Be kind, be patient, assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
