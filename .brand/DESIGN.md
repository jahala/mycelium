# plotplot Design System

## 1. Brand Foundation

| Field | Value |
|-------|-------|
| Name | plotplot |
| Tagline | Grow what matters. |
| Mission | Give the people building with AI a garden of small, sharp, well-made tools — and the good soil they grow in. |
| Vision | Building with AI that feels less like a gold rush and more like tending a garden: calm, crafted, and cumulative. |
| Category | Tools for building with AI — a garden of agent-era tools |
| Positioning | plotplot is a garden of small, sharp, composable tools for building with AI — code intelligence, orchestration, brand, and planning — that agents and humans share. |

plotplot is built around one belief: good work is grown, not rushed. The brand should feel like a well-kept garden — alive, warm, and legible — not a gold-rush dashboard.

## 2. Visual Principles

| Principle | Description |
|-----------|-------------|
| Alive, not sterile | The garden is in colour — vital greens, warm sunlight, a smattering of blooms. Vibrant, but always legible. |
| Playful, not childish | Character through Fraunces, botanical marks, and a little wit. Never cartoon, never hype, never meme. |
| A garden of beds | Show the family as a cultivated plot — each tool a bed with its own bloom. Composition and relationship over flat lists. |
| Honest about craft | The tools are files, skills, and terminals. Show real commands and real output; never a fake dashboard. |
| A site plan you can read | The garden is drawn as an allotment site plan, read like good public signage. One stem runs through four lettered rows (A plan, B read, C run, D judge); every bed is a numbered plot with a sign in its bloom; empty plots are drawn fallow, which says there is room to grow. A Swiss grid and wayfinding carry the structure; Fraunces, the sprout and the blooms keep it a garden, not a transit map. |
| Calm motion | Things unfold and settle like leaves. Alive, not restless. |
| Make AI accountable | AI-generated output exposes its sources, confidence, and reasoning, with clear points for human review. |

## 3. Color System

The palette is a living garden on warm, sunlit paper: deep-brown ink (#3A2718) on warm paper (#FAF5E9), vibrant growth green (#357E2C) as primary, deep forest (#214A2C) for depth, and sunlight gold (#E89227) as the warm accent. Each tool has a bloom of its own, and the blooms follow the garden: each row takes the colour of what that stage of a plant needs or becomes (find is sky, shape is soil, build is leaf, ship is bloom), light to deep in order of use, and the tools every row uses are tinted greys. Sunlight, leaf, petal, and muted are display/decorative only — never body text on paper. Dark mode is "soil at night" (#1C1610), not a harsh developer theme. Full values and measured contrast live in `colors.md`.

## 4. Typography System

plotplot uses Google Fonts only. Headings and display use Fraunces — a warm, characterful serif with optical sizing and soft/wonk axes and lively italics; playful and elegant at once, the reason the brand reads as a garden rather than a dashboard. Body and interface use Hanken Grotesk for warm, friendly, legible precision. Code, kickers, and labels use JetBrains Mono — the builder/terminal voice.

The scale is editorial and confident: html base 18px; h1 is a fluid clamp(3.4rem, 6vw, 4.6rem); h2 2.4rem; h3 1.6rem; h4 1.25rem; body 1.0625rem at 1.65 line-height; display numerals 3.75rem. Full weights, line heights, and import URLs live in `typography.md`.

## 5. Spacing & Layout

All spacing uses a 4px grid: 4xs 4px, 3xs 8px, 2xs 12px, xs 16px, sm 24px, md 32px, lg 48px, xl 64px, 2xl 96px, 3xl 128px. Marketing sections breathe at the 96–128px end for vertical rhythm.

Layouts feel calm and readable: generous whitespace, quiet grids, clear section boundaries, one centered 1200px container. Avoid crowded dashboards, dense panels, decorative cards, and arbitrary spacing. Full values live in `layout.md`.

## 6. Component Foundations

Machine-readable surface tokens — radius scale, border strokes, shadow recipes, motion — live in `components.md`; this section carries the principles.

Buttons are restrained, direct, and legible. Primary buttons use growth green (#357E2C) with cream text. Sunlight (#E89227) with ink text is reserved for high-momentum actions such as install or launch. Forest (#214A2C) carries depth on paper and is the primary action inside dark sections. Destructive actions use error (#BC4126).

Inputs feel like warm archive fields: surface backgrounds, subtle borders, growth-green focus rings, plain labels. Cards group context rather than decorate it: surface backgrounds, hairline borders, a small product-accent marker, clear headings. Navigation uses product accents sparingly as section markers; labels stay lowercase: tilth, tend, petals, pleach, umbel, copeca.

Every page closes with the **garden footer**: a fixed forest band whose **garden row** links to every tool in the garden — one pill per product, each marked with its bloom, the current tool highlighted. Product pages add a **plotplot band** on top (mark + wordmark + a plotplot.ai link) so each one points back to the umbrella, not just its siblings. Structure and values live in `components.md`.

## 7. Iconography

Icons feel like botanical diagrams with character — sprouts, leaves, plots, nodes, roots, stems, coordinate marks — drawn in thin, lively linework. A plotplot sprout mark is welcome as the family motif. Avoid generic Material Design icons, sparkle/"AI" clichés, and heavy filled shapes. Icons clarify function first, then express the garden.

**Marks.** Every bed's mark is drawn to one set of rules so the garden reads as one family:

1. **One grid.** A 24-unit square with 2 units of clear margin. Lines are 2 units, round caps and joins; leaves and blooms are filled shapes. No detail smaller than 1.5 units, so every mark reads at 16px.
2. **One ink on the bed's bloom.** A bed's mark is its drawing in one ink on a rounded tile of its bloom (radius 5.5, the drawing scaled to 72 percent), the way the site's plates carry a bed's number. The ink is the plate text the bloom carries, ink or paper, held at 4.5:1 by `scripts/palette_contrast.py`. No third colour. The bloom is the bed's colour, so the tile is what tells beds apart, and no bed's mark competes with growth green.
3. **plotplot's own mark is the exception.** It is drawn in two inks with no tile: growth green is what grows, marigold is its bloom. copeca's mark, which left the garden, keeps the same two-ink form.
4. **Parts are separated by space,** never by colour alone, so the drawing survives as a stamp, a terminal glyph or a README badge.
5. **Night is derived.** The paper file is the only drawing. `scripts/marks.py` writes the night file through the tokens (the tile takes the bloom's soil-night value; the ink stays), prints a tile for plotplot's mark (`marks.py tile plotplot [--night]`), and `marks.py --check` holds the rules.

Files: `assets/plotplot-mark.svg` and `products/<bed>/assets/<bed>-mark.svg`, each with its `-night.svg`.

Bed signs carry a pictogram: one 24-unit grid, a 1.75 stroke in `currentColor`, no fills (map, node tree, swatch, fan, gate, envelope, ruler, balance). A pictogram is illustration of what the bed does, never the bed's logo; only a bed's own mark in `products/<bed>/assets/` is its logo.

## 8. Illustration

Illustration is a playful garden: characterful botanical line-art, plotted beds, blooms, small growth scenes, and field notes. The feel is warm, witty, and a little hand-drawn; a recurring sprout/mascot motif is allowed. Keep it useful and literate — it can be playful without becoming precious. Avoid glossy gradients, stock 3D, and generic futuristic AI visuals.

Two illustrations are the family's own and are shared, never redrawn:

- **The site plan** is the umbrella page's hero: the stem, the four rows, a sign per bed, fallow plots, the shed and the compost heap, the gate. A bed page shows the same plan small, as a "you are here" key plan with its own plot filled.
- **The garden film** is the one moving illustration: a printed (risograph) garden in section that grows from seed to bloom and returns to the soil, a 24-second seamless loop. It prints straight onto the page, with no paper of its own, and its soil fades into the section that follows. Its source is `assets/garden-film/`.

## 9. Agent Prompt Guide

When generating UI or design output, follow these constraints:

1. **Colors:** use only the palette in `colors.md`, referenced by semantic role, not raw hex. Sunlight, leaf, petal, and muted are display/decorative — never body text.
2. **Typography:** apply the hierarchy in `typography.md`. Never introduce fonts outside Fraunces / Hanken Grotesk / JetBrains Mono.
3. **Components:** follow `components.md`. Start from the reference pages in `reference/` (the umbrella page and a bed page): copy one, then change only the marked spots. Reuse patterns before inventing new ones.
4. **Spacing:** adhere to the 4px scale in `layout.md`. Never use arbitrary pixel values.
5. **Elevation:** use the ink-tinted shadow recipes by level. Never pure-black shadows.
6. **Motion:** entrances unfold with `ease-petal`; honour `prefers-reduced-motion`; never bounce or confetti.
7. **Assets:** source marks and images from `.brand/assets/`. Never invent placeholder logos.
8. **Voice:** consult `voice.md` — calm, precise, literate, with a little wit — and never the forbidden words.
