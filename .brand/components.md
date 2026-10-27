# Surface & Motion — plotplot

Machine-readable tokens for how surfaces are finished and how things move.
`DESIGN.md` §6–§9 carries the prose principles; this file carries the values
an agent (or `/petals check`) can verify against. Color values live in
`colors.md`; type and spacing live in `typography.md` and `layout.md`.

## Radius Scale

Corners come from a fixed scale. Anything else is off-brand.

| Token | Value | Usage |
|-------|-------|-------|
| radius-tail | 2px | The sharp "tail" corner on comment bubbles and pinned artifacts |
| radius-xs | 3px | Focus rings, tiny chips, inline code |
| radius-sm | 6px | Buttons, inputs, nav actions |
| radius-md | 8px | Terminal panes, ledgers, icon tiles, swatches |
| radius-lg | 10px | Cards, panels |
| radius-xl | 12px | Floating artifacts — specimen cards, comment bubbles |
| radius-full | 999px / 50% | Pills, badges, dots, pins |

## Border Strokes

| Token | Value | Usage |
|-------|-------|-------|
| stroke-hairline | 1px solid | Structural borders — cards, dividers, terminal frames |
| stroke-emphasis | 1.5px | Outline buttons, link underlines |
| stroke-rule | 2px | Accent rules — stat markers, point markers, dotted leaders |

Border color defaults to `#E2D8C0` on paper surfaces and `#403628` inside terminal panes (both from `colors.md`).

## Shadow Recipes

Shadows are always ink-tinted — `rgba(58, 39, 24, …)`, never pure black and never blue-gray. On soil-night they are soil-tinted, `rgba(8, 6, 4, …)`, the dark values in `tokens.css`, because an ink-brown shadow vanishes on soil. Two layers: a close contact shadow plus a soft ambient one.

| Token | Value | Usage |
|-------|-------|-------|
| shadow-rest | `0 1px 0 #E2D8C0, 0 12px 40px -16px rgba(58, 39, 24, 0.35)` | Hero terminal, large resting panes |
| shadow-lift | `0 2px 4px rgba(58, 39, 24, 0.05), 0 14px 32px rgba(58, 39, 24, 0.08)` | Cards on hover — the −3px lift |
| shadow-float | `0 2px 6px rgba(58, 39, 24, 0.07), 0 18px 44px rgba(58, 39, 24, 0.12)` | Floating artifacts — specimens, comment bubbles |

## Motion Tokens

One idea, used everywhere: **things unfold**. Elements rise and settle like leaves opening — never bounce, never pulse.

| Token | Value | Usage |
|-------|-------|-------|
| ease-petal | `cubic-bezier(0.22, 1, 0.36, 1)` | The only entrance/settle ease |
| dur-unfold | 0.8s | Section and card entrances (rise 30px + fade) |
| dur-micro | 0.15–0.3s | Hovers, color shifts, link underlines |
| stagger-step | 0.1s | Sibling delay inside a group — leaves along a stem |
| bloom | scale(0.6) rotate(−14°) → 1 / 0° over 0.55–0.7s | Marks, glyphs, pins — used once per element, on arrival |

Rules:

- Entrances use `ease-petal` + `dur-unfold`; micro-interactions use ease-out at `dur-micro`. No other easings.
- Groups stagger by `stagger-step`; nothing arrives as a slab.
- `prefers-reduced-motion: reduce` MUST disable all entrances, blooms, and staggers. Non-negotiable.
- Forbidden: bounce easings, pulsing/looping attention effects, parallax, confetti, spinners where progress is knowable.
- Playful character comes from the `bloom` arrival and the illustration — never from breaking the no-bounce rule.
- Two looping motions are allowed, and only these two, because they are illustration rather than attention: the **inchworm** on the header line and the **garden film**. Both keep a calm pace (an inchworm stride takes about 1.2 s; the film is a 24 s loop), pause when off screen or when the tab is hidden, and yield to `prefers-reduced-motion`: the inchworm is hidden, and the film shows one still frame. Anything else that loops is still forbidden.

## Component Conventions

| Component | Convention |
|-----------|------------|
| Button (primary) | Growth-green fill, cream text, radius-sm, weight 600; hover deepens to primary-deep, active translates down 1px |
| Button (sunlight) | Sunlight fill, ink text — high-momentum actions only (install, launch); radius-sm |
| Button (forest) | Forest fill, cream text — depth on paper, or the primary action inside a dark section |
| Button (outline) | Transparent fill, 1.5px primary border, primary text; hover fills with surface |
| Card | Surface background, stroke-hairline border, radius-lg; hover lifts −3px with shadow-lift |
| Terminal pane | Soil-night background + border from `colors.md`, radius-md, titlebar dots in error/caution/healthy order |
| Pill / badge | radius-full, surface background, mono text |
| Focus state | 2px solid primary outline, 3px offset, radius-xs — on every interactive element |
| Bed hover | Speaks in the bed's own bloom: a 2px underline under the bed's name, or a tint of the bloom (about 30% into the surface) on a plot. The name stays ink. Never set the name in its bloom, because petals, pollen and sunlight are display-only on paper. Keyboard focus shows the same as hover. |
| Footer | The garden footer — fixed forest band, cream text, a row of bloom-dot pills linking the whole garden (current product highlighted), and a "a plotplot garden tool" bottom bar. Full spec below. |

## The allotment plan

The family's pages are built from these pieces. `reference/landing.html` (the umbrella page) and `reference/product.html` (a bed page, weeder) are the pieces assembled; start from one, change only its marked `swap:` spots, and keep these values. Class names below are the reference pages' own.

**Sign ink.** A sign keeps its bloom in both themes, so the numeral on it uses a fixed ink: `--sign-dark` (soil, `--pp-term-bg`) on the light blooms (tend, tilth, petals, umbel, pollen, copeca) and `--sign-light` (cream, `--pp-term-text`) on the dark ones (pleach, weeder). Each sign sets `--bloom` and `--on`. A bed page sets its own three aliases once in `:root`: `--bed` (its bloom), `--bed-word` (its bloom as a word: the bloom where it reads, else its ink variant, e.g. `--pp-weeder-word`, `--pp-pollen-ink`, `--pp-amber-ink`) and `--bed-on` (its sign ink).

| Component | Convention |
|---|---|
| Site plan (`.plan-slot` › `.sheet`) | The umbrella hero's illustration, one SVG (viewBox 592 × 708) on a card: surface, hairline border, radius-lg, shadow-rest. The stem is a 5-unit growth-green line from the gate up to the sprout. Rows hang off it as circle nodes (r 18, ink 2-unit stroke on paper) lettered A–D in mono 700. Plots are 154 × 96, radius 8, filled with the bloom at 16% into the surface and stroked in the bloom at 1.5. A plot holds a 36-unit plate in the bloom with its two-digit numeral (mono 700, 16px, in `--on`), a pictogram at top right, the name in Fraunces 600 at 23px, and a status dot (healthy fill for live, a muted ring for soon). Fallow plots are dashed in muted (4 5). Below the rows: the shed ("your repo") and the compost heap ("what was tried feeds the next bed"), then the gate. Each plot links to its bed. |
| Bed sign plate (`.plate`) | 44px square, radius-sm, the bloom as fill, the numeral in mono 700 at .95rem in `--on`. A bed that is not yet live wears a 2px inset ring of its bloom with an ink numeral instead of the fill. |
| Index of beds (`.index` › `.rows` › `.row`) | The garden as an open index on the 12-column grid, with no cards and no frame. Each row starts with a hairline; its margin (columns 1–3) carries the row letter in light Fraunces, the row's name and its question; its content (columns 4–12) lists its beds. A bed (`.bed`) is one line: plate · name (Fraunces 540, 1.5rem) with its role as a mono label · one sentence of description · status. At 880 the status drops under the description; at 520 the bed stacks beside its plate. |
| Direction sign (`.waysign`) | The strip under a bed page's header, filled with `--bed`, text in `--bed-on`, in three parts: ← plotplot · the garden; the bed itself (row node and name, plate, name); the next bed along the plan →. Mono labels, uppercase, tracked .16em. |
| Key plan (`.here-map`) | A bed page's small site plan, "you are here" (SVG 200 × 196): the stem, four row nodes, every plot as an outline (fallow ones faint), this bed's plot filled with `--bed` and its numeral in `--bed-on`, and a pin. It links to the garden on plotplot.ai. |
| Motto rule (`.motto-rule`) | The motto as a single italic line centred between two hairlines, the sprout leading it, the supporting line in body type beneath (type in `typography.md`, Display pairings). On phones the hairlines give way and the sprout stands over the words. |
| Garden film band (`.pp-film`) | The shared film from `assets/garden-film/`, pasted verbatim. |
| Inchworm (`.inchworm`) | The shared looper from `assets/inchworm.html`, the last child of the sticky header. |

## Footer — the garden footer

Every product page closes with the **garden footer**: a fixed forest band that points back to the whole garden (`DESIGN.md` §6). It is **the same surface on every page** — a *shared family* element, not a per-product one. The forest band, cream text, and link green are identical everywhere; the **only** per-product variation is the garden row's bloom dots (each tool's accent) and the highlighted current-product pill. That sameness is the point — it is what makes the separate tools read as one garden.

**Surface** — fixed **family** values, identical in both themes **and on every product** (like the terminal pane, it never flips with theme or re-tints to the product accent):

| Slot | Value |
|------|-------|
| Background | forest `#214A2C` (`--pp-forest`) |
| Text | cream `#F3ECD9` (`--pp-term-text`); soften secondary text with opacity, not a new color |
| Links | forest-safe green `#84C56A` (`--pp-term-green`) → cream on hover — never `--pp-leaf`, which is `#4A9E3F` on paper and dies on forest |
| Pills | faint cream fill `rgba(243, 236, 217, 0.07)`, `0.14` on hover |
| Divider | `rgba(243, 236, 217, 0.14)` hairline above the bottom bar |
| Padding | space-xl top, space-lg bottom |

**Structure** — a **plotplot band** on top, then **three columns** (`1.3fr 1fr 1fr`, collapsing to one at 880), closed by a bottom bar:

- **plotplot band** *(product pages only)* — the sprout mark + **plotplot** wordmark, a one-line org descriptor, and a **plotplot.ai →** link, over a hairline divider. It sits above the columns so every product page names and links the umbrella, not just its siblings. The umbrella page (plotplot.ai) **omits** this band — it *is* plotplot.
1. **Identity** — product name and one line of what it is, plus source / license links.
2. **The garden** *(required)* — the **garden row**: one pill per tool, each led by a **bloom dot** in that product's accent from the Product Accents table in `colors.md`; the **current** product's pill is tinted with its own bloom (`rgba(<accent>, ~0.18)`). Names stay lowercase (`voice.md`); each links to that tool's home. It MUST list the full garden.
3. **Nearby** — adjacent projects and a support link.

Closed by a **bottom bar** — hairline-topped, space-between: `© YEAR · a plotplot garden tool · LICENSE` on the left, a one-line positioning statement on the right.

Rules:

- Required on every **product** page: the **plotplot band** (links back to plotplot.ai), the forest surface, the garden row (full garden, bloom dots, current highlighted), and the "a plotplot garden tool" attribution. The umbrella page keeps the forest footer but omits the band.
- Default is **three columns** — identity · the garden · nearby — collapsing to one at 880; a page with nothing "nearby" may drop to two. The umbrella page (plotplot.ai) uses the same three columns (identity · the garden · the project).
- The band is a **shared family surface**: built from fixed family tokens (`--pp-forest`, `--pp-term-text`, `--pp-term-green`) so it renders identically in every theme **and on every product** — never wire it to theme-flipping vars, and never re-tint it to the product's accent. Per-product colour lives only in the garden-row dots and the current-pill highlight.
- Garden-row links go to each bed's page where it has one (`https://jahala.github.io/<bed>/`), as the reference pages do; the snippet below shows repository links, which stand in for a bed with no page yet.
- `/petals check` verifies the footer's colors and forest↔cream contrast, not its DOM; the garden row's completeness is a convention the building agent applies and review confirms.

### Reference implementation

Copy this verbatim and change only the three marked spots: the **identity** column, the **`.is-current`** pill, and the repo **links**. Everything else (forest surface, garden row, bottom bar) stays identical across the garden; all colour resolves from the `--pp-*` tokens already inlined on every plotplot page, so it adapts without being re-specified.

```html
<!-- garden footer · shared family surface. swap ONLY: (1) the identity column, (2) the .is-current pill, (3) the repo links -->
<footer class="gf">
  <div class="gf-wrap">

    <!-- 0 · plotplot band: same on every product page; links home (the umbrella page omits this) -->
    <div class="gf-plot">
      <a class="gf-plotbrand" href="https://plotplot.ai" aria-label="plotplot home">
        <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
          <path class="m-stem" d="M12 22 V8"/>
          <path class="m-leaf" d="M12 17.6 C7.8 16.8 5.2 13.6 5.6 9.8 C9.3 10.4 12 13.2 12 17.6 Z"/>
          <path class="m-leaf" d="M12 14.6 C16.2 13.8 18.8 10.6 18.4 6.8 C14.7 7.4 12 10.2 12 14.6 Z"/>
          <circle class="m-bloom" cx="12" cy="4.6" r="2.5"/>
        </svg>
        <span class="wordmark">plotplot</span>
      </a>
      <p class="gf-plotline">a garden of small, sharp tools for building with AI.</p>
      <a class="gf-plotlink" href="https://plotplot.ai">plotplot.ai →</a>
    </div>

    <div class="gf-grid">

      <!-- 1 · identity: per product -->
      <div class="gf-col">
        <h4>umbel</h4>
        <p class="gf-soft">fan many agent CLIs out from one stem. drive claude, codex and gemini together in tmux.</p>
        <p class="gf-soft"><a href="https://github.com/jahala/umbel">github →</a> &nbsp;·&nbsp; MIT</p>
      </div>

      <!-- 2 · the garden: identical on every page; add .is-current to THIS product -->
      <div class="gf-col">
        <h4>the plotplot garden</h4>
        <nav class="gf-garden" aria-label="the garden">
          <a href="https://github.com/jahala/tilth"  style="--bloom:var(--pp-tilth)"><span class="gf-dot"></span>tilth</a>
          <a href="https://github.com/jahala/tend"   style="--bloom:var(--pp-tend)"><span class="gf-dot"></span>tend</a>
          <a href="https://github.com/jahala/petals" style="--bloom:var(--pp-petals)"><span class="gf-dot"></span>petals</a>
          <a href="https://github.com/jahala/pleach" style="--bloom:var(--pp-pleach)"><span class="gf-dot"></span>pleach</a>
          <a href="https://github.com/jahala/umbel"  style="--bloom:var(--pp-umbel)" class="is-current"><span class="gf-dot"></span>umbel</a>
          <a href="https://github.com/jahala/copeca" style="--bloom:var(--pp-copeca)"><span class="gf-dot"></span>copeca</a>
          <a href="https://github.com/jahala/pollen" style="--bloom:var(--pp-pollen)"><span class="gf-dot"></span>pollen</a>
          <a href="https://github.com/jahala/weeder" style="--bloom:var(--pp-weeder)"><span class="gf-dot"></span>weeder</a>
        </nav>
        <p class="gf-soft">small, sharp tools for building with agents.</p>
      </div>

      <!-- 3 · nearby: optional; drop the whole column if there's nothing -->
      <div class="gf-col">
        <h4>nearby</h4>
        <p class="gf-soft"><a href="https://github.com/jahala/mrkd">mrkd</a>, a native markdown viewer for macOS.</p>
        <p class="gf-soft"><a href="https://buymeacoffee.com/jahala">buy me a coffee →</a></p>
      </div>

    </div>
    <div class="gf-bottom">
      <span>© 2026 · a plotplot garden tool · MIT</span>
      <span>one binary, the subscription you already pay for.</span>
    </div>
  </div>
</footer>
```

```css
/* garden footer · shared family surface: identical on every page; never re-tint to the product accent */
.gf          { background: var(--pp-forest); color: var(--pp-term-text); }
.gf-wrap     { max-width: var(--pp-container-max); margin: 0 auto;
               padding: var(--pp-space-xl) var(--pp-gutter) var(--pp-space-lg); }
.gf a        { color: var(--pp-term-green); }
.gf a:hover  { color: var(--pp-term-text); }
.gf h4       { color: var(--pp-term-text); font-size: 1.05rem; margin: 0 0 var(--pp-space-xs); }
/* plotplot band (product pages only) */
.gf .wordmark{ font-family: var(--pp-font-heading); font-weight: 600; color: var(--pp-term-text); }
.gf .mark    { width: 28px; height: 28px; flex: none; }
.gf .m-stem  { fill: none; stroke: var(--pp-term-green); stroke-width: 2; stroke-linecap: round; }
.gf .m-leaf  { fill: var(--pp-term-green); }
.gf .m-bloom { fill: var(--pp-marigold); }
.gf-plot     { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pp-space-2xs) var(--pp-space-md);
               padding-bottom: var(--pp-space-md); margin-bottom: var(--pp-space-lg);
               border-bottom: 1px solid rgba(243,236,217,.14); }
.gf-plotbrand{ display: inline-flex; align-items: center; gap: var(--pp-space-3xs); }
.gf-plotbrand .wordmark { font-size: 1.45rem; letter-spacing: -.01em; }
.gf-plotline { margin: 0; flex: 1; min-width: 18ch; color: var(--pp-term-text); opacity: .8; font-size: 1rem; }
.gf-plotlink { font-family: var(--pp-font-code); font-size: .82rem; white-space: nowrap; }
.gf-grid     { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: var(--pp-space-xl); }
.gf-soft     { margin: var(--pp-space-2xs) 0 0; color: var(--pp-term-text); opacity: .78;
               font-size: .95rem; max-width: 42ch; }
.gf-garden   { display: flex; flex-wrap: wrap; gap: var(--pp-space-3xs); }
.gf-garden a { display: inline-flex; align-items: center; gap: var(--pp-space-4xs);
               font-family: var(--pp-font-code); font-size: .82rem; color: var(--pp-term-text);
               padding: var(--pp-space-4xs) var(--pp-space-2xs);
               border-radius: var(--pp-radius-full); background: rgba(243,236,217,.07); }
.gf-garden a:hover      { background: rgba(243,236,217,.14); }
.gf-garden a.is-current { background: color-mix(in srgb, var(--bloom) 18%, transparent); } /* its own bloom; or rgba(<accent>,.18) */
.gf-dot      { width: 8px; height: 8px; border-radius: var(--pp-radius-full);
               background: var(--bloom); flex: none; }
.gf-bottom   { margin-top: var(--pp-space-xl); padding-top: var(--pp-space-sm);
               border-top: 1px solid rgba(243,236,217,.14); display: flex; flex-wrap: wrap;
               gap: var(--pp-space-3xs); justify-content: space-between;
               font-family: var(--pp-font-code); font-size: .74rem;
               color: var(--pp-term-text); opacity: .72; }
@media (max-width: 880px) { .gf-grid { grid-template-columns: 1fr; gap: var(--pp-space-lg); } }
```

## Applying in frameworks

The brand wins over framework defaults (SKILL.md rule 5). In practice:

- **CSS** — mirror the tokens as custom properties (`--radius-sm: 6px`, `--ease-petal: …`) and reference them; never hard-code finishes inline.
- **Tailwind** — extend the theme rather than using stock utilities: `borderRadius` from the radius scale, `boxShadow` from the shadow recipes, `transitionTimingFunction.petal` from ease-petal. Stock `shadow-md`, `rounded-2xl`, `ease-bounce` are off-brand.
- **Component libraries (shadcn etc.)** — override the library's radius and shadow CSS variables at the theme layer once, instead of patching individual components.
