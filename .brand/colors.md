# Brand Colors — plotplot

The palette is a living garden on warm, sunlit paper: deep-brown ink, vibrant
growth green, deep forest, and sunlight gold — with a smattering of blooms.
Vibrant, but always legible. Every text pair below is measured; sunlight, leaf,
petal, and muted are display/decorative colors — never body text on paper.

## Primary Palette

| Role | Hex | RGB | Usage |
|------|-----|-----|-------|
| Primary — growth green | #357E2C | rgb(53,126,44) | Primary actions, links, buttons, selected states. Vibrant growth green, legible as text on paper (4.6:1). |
| Primary (deep) | #2C6B2A | rgb(44,107,42) | Hover / pressed — one step deeper into the leaf. |
| Forest green | #214A2C | rgb(33,74,44) | Depth: dark sections, secondary buttons, footer. Cream reads on it (9.3:1). |
| Sunlight | #E89227 | rgb(232,146,39) | The warm accent — CTA fills (ink text), highlights, underlines. Display/fill only; never body text on paper (2.3:1). |
| Marigold | #F4B63A | rgb(244,182,58) | The plotplot mark's bloom, and nothing else, so the mark stays apart from umbel's sunlight. Decorative; never text. |
| Leaf (vibrant) | #4A9E3F | rgb(74,158,63) | Decorative only — marks and illustration fills. Never text (3.1:1). |

## Paper & Ink

| Role | Hex | RGB | Usage |
|------|-----|-----|-------|
| Ink — deep brown | #3A2718 | rgb(58,39,24) | Headings and body — warm deep brown (13:1 on paper). |
| Text (soft) | #786148 | rgb(120,97,72) | Secondary prose, captions, annotations (5.4:1). |
| Amber-ink | #A86518 | rgb(168,101,24) | Sunlight as a word — amber kickers and labels where text must read (4.3:1, labels). |
| Paper | #FAF5E9 | rgb(250,245,233) | Page background — warm sunlit cream. |
| Band | #F2EAD6 | rgb(242,234,214) | Alternating section band for vertical rhythm. |
| Surface | #F5EEDD | rgb(245,238,221) | Cards, panels, grouped content. |
| Artifact paper | #FCFAF2 | rgb(252,250,242) | Lighter long-read paper for document / polyglot surfaces (e.g. tend) — higher luminance for extended reading. |
| Border | #E2D8C0 | rgb(226,216,192) | Dividers, card and input borders, hairline rules. |

## Semantic Roles

| Role | Hex | Usage |
|------|-----|-------|
| Healthy / verified | #46913C | Confirmed actions, healthy status, successful checks. |
| Caution / in progress | #B0741C | Caution, incomplete setup, review-needed signals. |
| Error / failed | #BC4126 | Destructive actions, validation errors, failed checks. |
| Info / neutral | #3F7186 | Informational notices, source notes, system guidance. |
| Muted / disabled | #9A8C72 | Placeholder, disabled, not-yet-defined. Decorative on paper (3.0:1) — readable secondary copy uses Text (soft). |

## Product Accents

Each tool in the garden has one bloom. The blooms follow the garden: each row takes the colour of
what that stage of a plant needs or becomes, and inside every row the colour runs from light to deep in
the order a product meets each tool, stepping its hue a little the same way in every row, so the
colours cascade. Tools every row uses sit in three groups of tinted greys. Planned tools hold their
colour already. `/petals check` warns when one product's accent appears in another's UI.

| Row | Material | Tool | Bloom | Soil-night | Plate text | Role |
|---|---|---|---|---|---|---|
| find | sky | mull | #76D4FF | same | ink | reading the world |
| find | sky | glean | #0096B3 | same | ink | finding what to grow |
| find | sky | cultivate | #09636B | #1E6F77 | paper | people, jobs and outcomes |
| shape | soil | graft | #FEAA68 | same | ink | features, screens and flows |
| shape | soil | petals | #CC6A37 | same | ink | brand and design |
| shape | soil | trellis | #A33C26 | #AA422C | paper | architecture, planned |
| build | leaf | tend | #98D98D | same | ink | plan and verify |
| build | leaf | pleach | #779C46 | same | ink | the conductor |
| build | leaf | umbel | #545E05 | #5F6A18 | paper | fan out agent CLIs |
| ship | bloom | transplant | #FD81ED | same | ink | ship, planned |
| ship | bloom | pollen | #BD59D2 | same | ink | marketing, planned |
| ship | bloom | harvest | #7D2EB0 | #8A3EBF | paper | release and learn, planned |
| the shed | wood and iron | tilth | #F7D4B7 | same | ink | code intelligence |
| the shed | wood and iron | mycelium | #C9A18D | same | ink | messages between agents |
| the shed | wood and iron | weeder | #A37A6E | same | ink | the judge of the diff |
| the shed | wood and iron | stake | #774F4C | #835A57 | paper | docs that stay true, planned |
| the boundary | stone | hedge | #C9C7E7 | same | ink | hard limits, being built |
| the boundary | stone | gate | #8F94B2 | same | ink | the owner's queue, being built |
| the boundary | stone | well | #4D5972 | #58647E | paper | the one door for paid calls |
| the seasons | weather | gardener | #C7C784 | same | ink | what runs next, planned |
| the seasons | weather | almanac | #A19251 | same | ink | what is due, planned |
| the seasons | weather | upkeep | #6E520D | #7D6021 | paper | keeping products alive, planned |

copeca left the garden on 2026-10-26 and keeps juniper `#1F8A7B` on its public page.

Every pair of blooms is at least 12.9 apart in ΔE00 in both themes, and 12 or more from growth green,
marigold, ink and paper. No bloom moves more than 5.1 between paper and soil-night, so each tool keeps
one colour. On soil-night a bloom lifts only as far as it must to read as a label (3:1). A bloom is a
plate, a fill, a dot or an underline, never text: the light blooms are decorative on paper. Where a bloom
must read as a word, use its ink: pollen-ink `#A844BC` and weeder-word `#8F675B` on paper
(4.5:1), `#BD59D2` and `#A37A6E` on soil-night.

## Contrast Pairings

Color is only on-brand when it is legible. Classes: **reading** ≥ 4.5:1 (body, captions) · **labels & display** ≥ 3.0:1 (kickers, tags, type ≥ 24px) · **decorative** exempt (marks, washes, fills — never words). Measured WCAG 2.x; regenerate with `scripts/palette_contrast.py`.

| Foreground on background | Ratio | Class |
|---|---|---|
| Ink #3A2718 on Paper #FAF5E9 | 13.0 | reading |
| Ink #3A2718 on Surface #F5EEDD | 12.2 | reading |
| Ink #3A2718 on Band #F2EAD6 | 11.8 | reading |
| Text-soft #786148 on Paper #FAF5E9 | 5.4 | reading |
| Growth #357E2C on Paper #FAF5E9 | 4.6 | reading |
| Paper #FAF5E9 on Growth #357E2C | 4.6 | reading |
| Growth-deep #2C6B2A on Paper #FAF5E9 | 6.0 | reading |
| Forest #214A2C on Paper #FAF5E9 | 9.3 | reading |
| Paper #FAF5E9 on Forest #214A2C | 9.3 | reading |
| Ink #3A2718 on Sunlight #E89227 | 5.8 | reading |
| Sunlight #E89227 on Paper #FAF5E9 | 2.3 | decorative |
| Amber-ink #A86518 on Paper #FAF5E9 | 4.3 | labels |
| Leaf #4A9E3F on Paper #FAF5E9 | 3.1 | decorative |
| Healthy #46913C on Surface #F5EEDD | 3.4 | labels |
| Caution #B0741C on Paper #FAF5E9 | 3.6 | labels |
| Error #BC4126 on Paper #FAF5E9 | 4.9 | reading |
| Info #3F7186 on Paper #FAF5E9 | 4.9 | labels |
| Muted #9A8C72 on Paper #FAF5E9 | 3.0 | decorative |
| Mull #76D4FF on Paper #FAF5E9 | 1.5 | decorative |
| Mull #76D4FF on Night #1C1610 | 10.8 | labels |
| Night #1C1610 on Mull #76D4FF | 10.8 | reading |
| Night #1C1610 on Mull #76D4FF | 10.8 | reading |
| Glean #0096B3 on Paper #FAF5E9 | 3.2 | labels |
| Glean #0096B3 on Night #1C1610 | 5.1 | labels |
| Night #1C1610 on Glean #0096B3 | 5.1 | reading |
| Night #1C1610 on Glean #0096B3 | 5.1 | reading |
| Cultivate #09636B on Paper #FAF5E9 | 6.4 | labels |
| Cultivate-night #1E6F77 on Night #1C1610 | 3.1 | labels |
| Night-text #F3ECD9 on Cultivate #09636B | 5.9 | reading |
| Night-text #F3ECD9 on Cultivate-night #1E6F77 | 5.0 | reading |
| Graft #FEAA68 on Paper #FAF5E9 | 1.7 | decorative |
| Graft #FEAA68 on Night #1C1610 | 9.5 | labels |
| Night #1C1610 on Graft #FEAA68 | 9.5 | reading |
| Night #1C1610 on Graft #FEAA68 | 9.5 | reading |
| Petals #CC6A37 on Paper #FAF5E9 | 3.4 | labels |
| Petals #CC6A37 on Night #1C1610 | 4.9 | labels |
| Night #1C1610 on Petals #CC6A37 | 4.9 | reading |
| Night #1C1610 on Petals #CC6A37 | 4.9 | reading |
| Trellis #A33C26 on Paper #FAF5E9 | 6.0 | labels |
| Trellis-night #AA422C on Night #1C1610 | 3.0 | labels |
| Night-text #F3ECD9 on Trellis #A33C26 | 5.5 | reading |
| Night-text #F3ECD9 on Trellis-night #AA422C | 5.1 | reading |
| Tend #98D98D on Paper #FAF5E9 | 1.5 | decorative |
| Tend #98D98D on Night #1C1610 | 10.8 | labels |
| Night #1C1610 on Tend #98D98D | 10.8 | reading |
| Night #1C1610 on Tend #98D98D | 10.8 | reading |
| Pleach #779C46 on Paper #FAF5E9 | 2.9 | decorative |
| Pleach #779C46 on Night #1C1610 | 5.7 | labels |
| Night #1C1610 on Pleach #779C46 | 5.7 | reading |
| Night #1C1610 on Pleach #779C46 | 5.7 | reading |
| Umbel #545E05 on Paper #FAF5E9 | 6.5 | labels |
| Umbel-night #5F6A18 on Night #1C1610 | 3.0 | labels |
| Night-text #F3ECD9 on Umbel #545E05 | 6.0 | reading |
| Night-text #F3ECD9 on Umbel-night #5F6A18 | 5.0 | reading |
| Transplant #FD81ED on Paper #FAF5E9 | 2.0 | decorative |
| Transplant #FD81ED on Night #1C1610 | 8.1 | labels |
| Night #1C1610 on Transplant #FD81ED | 8.1 | reading |
| Night #1C1610 on Transplant #FD81ED | 8.1 | reading |
| Pollen #BD59D2 on Paper #FAF5E9 | 3.5 | labels |
| Pollen #BD59D2 on Night #1C1610 | 4.7 | labels |
| Night #1C1610 on Pollen #BD59D2 | 4.7 | reading |
| Night #1C1610 on Pollen #BD59D2 | 4.7 | reading |
| Harvest #7D2EB0 on Paper #FAF5E9 | 6.7 | labels |
| Harvest-night #8A3EBF on Night #1C1610 | 3.0 | labels |
| Night-text #F3ECD9 on Harvest #7D2EB0 | 6.2 | reading |
| Night-text #F3ECD9 on Harvest-night #8A3EBF | 5.1 | reading |
| Tilth #F7D4B7 on Paper #FAF5E9 | 1.3 | decorative |
| Tilth #F7D4B7 on Night #1C1610 | 12.9 | labels |
| Night #1C1610 on Tilth #F7D4B7 | 12.9 | reading |
| Night #1C1610 on Tilth #F7D4B7 | 12.9 | reading |
| Mycelium #C9A18D on Paper #FAF5E9 | 2.2 | decorative |
| Mycelium #C9A18D on Night #1C1610 | 7.7 | labels |
| Night #1C1610 on Mycelium #C9A18D | 7.7 | reading |
| Night #1C1610 on Mycelium #C9A18D | 7.7 | reading |
| Weeder #A37A6E on Paper #FAF5E9 | 3.5 | labels |
| Weeder #A37A6E on Night #1C1610 | 4.8 | labels |
| Night #1C1610 on Weeder #A37A6E | 4.8 | reading |
| Night #1C1610 on Weeder #A37A6E | 4.8 | reading |
| Stake #774F4C on Paper #FAF5E9 | 6.4 | labels |
| Stake-night #835A57 on Night #1C1610 | 3.0 | labels |
| Night-text #F3ECD9 on Stake #774F4C | 5.9 | reading |
| Night-text #F3ECD9 on Stake-night #835A57 | 5.0 | reading |
| Hedge #C9C7E7 on Paper #FAF5E9 | 1.5 | decorative |
| Hedge #C9C7E7 on Night #1C1610 | 10.9 | labels |
| Night #1C1610 on Hedge #C9C7E7 | 10.9 | reading |
| Night #1C1610 on Hedge #C9C7E7 | 10.9 | reading |
| Gate #8F94B2 on Paper #FAF5E9 | 2.7 | decorative |
| Gate #8F94B2 on Night #1C1610 | 6.0 | labels |
| Night #1C1610 on Gate #8F94B2 | 6.0 | reading |
| Night #1C1610 on Gate #8F94B2 | 6.0 | reading |
| Well #4D5972 on Paper #FAF5E9 | 6.5 | labels |
| Well-night #58647E on Night #1C1610 | 3.0 | labels |
| Night-text #F3ECD9 on Well #4D5972 | 6.0 | reading |
| Night-text #F3ECD9 on Well-night #58647E | 5.0 | reading |
| Gardener #C7C784 on Paper #FAF5E9 | 1.6 | decorative |
| Gardener #C7C784 on Night #1C1610 | 10.2 | labels |
| Night #1C1610 on Gardener #C7C784 | 10.2 | reading |
| Night #1C1610 on Gardener #C7C784 | 10.2 | reading |
| Almanac #A19251 on Paper #FAF5E9 | 2.9 | decorative |
| Almanac #A19251 on Night #1C1610 | 5.8 | labels |
| Night #1C1610 on Almanac #A19251 | 5.8 | reading |
| Night #1C1610 on Almanac #A19251 | 5.8 | reading |
| Upkeep #6E520D on Paper #FAF5E9 | 6.7 | labels |
| Upkeep-night #7D6021 on Night #1C1610 | 3.0 | labels |
| Night-text #F3ECD9 on Upkeep #6E520D | 6.2 | reading |
| Night-text #F3ECD9 on Upkeep-night #7D6021 | 5.0 | reading |
| Juniper #1F8A7B on Paper #FAF5E9 | 3.9 | labels |
| Pollen-ink #A844BC on Paper #FAF5E9 | 4.6 | reading |
| Pollen-ink-night #BD59D2 on Night #1C1610 | 4.7 | reading |
| Weeder-word #8F675B on Paper #FAF5E9 | 4.5 | reading |
| Weeder-word-night #A37A6E on Night #1C1610 | 4.8 | reading |
| Night-text #F3ECD9 on Night #1C1610 | 15.2 | reading |
| Night-soft #C9BBA0 on Night #1C1610 | 9.5 | reading |
| Night-green #84C56A on Night #1C1610 | 8.7 | reading |
| Night-sun #F2A93B on Night #1C1610 | 9.0 | reading |
| Night-leaf #9FD08A on Night #1C1610 | 10.1 | reading |
| Night-pollen #D9C44A on Night #1C1610 | 10.2 | reading |

## Data Visualization

Charts draw from the family — never library defaults.

- Categorical, in order: Growth #357E2C · Sunlight #E89227 · Sky #4E88A6 · Poppy #D6502F · Plum #97539B · Forest #214A2C
- Sequential ramp (leaf family): #214A2C → #357E2C → #84C56A
- Diverging: Growth #357E2C ↔ Poppy #D6502F through Border #E2D8C0
- Gridlines: Border #E2D8C0 · axis labels: Text (soft) #786148

## Light / Dark Mode Variants

| Role | Light | Dark |
|------|-------|------|
| Primary | #357E2C | #84C56A |
| Accent (sunlight) | #E89227 | #F2A93B |
| Background | #FAF5E9 | #1C1610 |
| Band | #F2EAD6 | #211A12 |
| Text | #3A2718 | #F3ECD9 |
| Text (soft) | #786148 | #C9BBA0 |
| Surface | #F5EEDD | #262019 |
| Border | #E2D8C0 | #403628 |
| Leaf | #4A9E3F | #9FD08A |
| Pollen (bloom) | #BD59D2 | #BD59D2 |
| Weeder (bloom) | #A37A6E | #A37A6E |

## The Garden Film's Inks

The film prints four inks from the palette onto the page, multiplied where they overlap. By day: sunlight #E89227, petal #E588A0, growth green #357E2C and ink #3A2718. On soil-night there is no paper to multiply against, so each ink takes its night value: sunlight #F2A93B, petal #E588A0, green #84C56A, and the ink becomes night text #F3ECD9 so keylines and soil still read. No other colours enter the film. Poppy, bramble, straw and coral come from overprints.

## Soil-Night Surfaces

Dark mode is "soil at night," not a harsh developer theme. Embedded terminal panes (the landing-page demos) run the deepest soil so the warm paper reads above them.

| Role | Hex | Usage |
|------|-----|-------|
| Terminal background | #1C1610 | Deep soil behind terminal text (15:1 for text). |
| Terminal surface | #262019 | Titlebar / chrome inside the pane. |
| Terminal border | #403628 | Pane and titlebar dividers. |
| Terminal green | #84C56A | Command / OK lines (8.7:1). |
| Terminal sunlight | #F2A93B | In-pane highlights (9.0:1). |
| Terminal text | #F3ECD9 | Default terminal text (15:1). |

## CSS Custom Properties

```css
:root {
  /* shared family palette */
  --pp-primary:      #357E2C;  /* vibrant growth green */
  --pp-primary-deep: #2C6B2A;  /* hover / pressed */
  --pp-leaf:         #4A9E3F;  /* decorative vibrant leaf — marks only */
  --pp-forest:       #214A2C;  /* deep green — depth, sections */
  --pp-accent:       #E89227;  /* sunlight — fills, highlights (ink text) */
  --pp-marigold:     #F4B63A;  /* the plotplot mark's bloom only */
  --pp-amber-ink:    #A86518;  /* amber as a word — labels */

  --pp-text:      #3A2718;     /* deep-brown ink — headings + body */
  --pp-text-soft: #786148;
  --pp-bg:        #FAF5E9;     /* warm sunlit paper */
  --pp-bg-band:   #F2EAD6;
  --pp-bg-artifact:#FCFAF2;
  --pp-surface:   #F5EEDD;
  --pp-border:    #E2D8C0;

  /* semantic */
  --pp-healthy: #46913C;
  --pp-caution: #B0741C;
  --pp-error:   #BC4126;
  --pp-info:    #3F7186;
  --pp-muted:   #9A8C72;

  /* blooms, one family per row of the garden, light to dark in order of use */
  /* find: sky */
  --pp-mull: #76D4FF;
  --pp-glean: #0096B3;
  --pp-cultivate: #09636B;
  /* shape: soil */
  --pp-graft: #FEAA68;
  --pp-petals: #CC6A37;
  --pp-trellis: #A33C26;
  /* build: leaf */
  --pp-tend: #98D98D;
  --pp-pleach: #779C46;
  --pp-umbel: #545E05;
  /* ship: bloom */
  --pp-transplant: #FD81ED;
  --pp-pollen: #BD59D2;
  --pp-harvest: #7D2EB0;
  /* the shed: wood and iron */
  --pp-tilth: #F7D4B7;
  --pp-mycelium: #C9A18D;
  --pp-weeder: #A37A6E;
  --pp-stake: #774F4C;
  /* the boundary: stone */
  --pp-hedge: #C9C7E7;
  --pp-gate: #8F94B2;
  --pp-well: #4D5972;
  /* the seasons: weather */
  --pp-gardener: #C7C784;
  --pp-almanac: #A19251;
  --pp-upkeep: #6E520D;
  /* copeca left the garden on 2026-10-26; its public page keeps juniper */
  --pp-copeca: #1F8A7B;

  /* the bloom as a word on paper (4.5:1) */
  --pp-pollen-ink: #A844BC;
  --pp-weeder-word: #8F675B;

  /* soil-night terminal */
  --pp-term-bg:      #1C1610;
  --pp-term-surface: #262019;
  --pp-term-border:  #403628;
  --pp-term-green:   #84C56A;
  --pp-term-sun:     #F2A93B;
  --pp-term-text:    #F3ECD9;
}

[data-theme="dark"] {
  --pp-primary:   #84C56A;
  --pp-accent:    #F2A93B;
  --pp-leaf:      #9FD08A;
  --pp-text:      #F3ECD9;
  --pp-text-soft: #C9BBA0;
  --pp-bg:        #1C1610;
  --pp-surface:   #262019;
  --pp-border:    #403628;
  --pp-cultivate: #1E6F77;
  --pp-trellis: #AA422C;
  --pp-umbel: #5F6A18;
  --pp-harvest: #8A3EBF;
  --pp-stake: #835A57;
  --pp-well: #58647E;
  --pp-upkeep: #7D6021;
  --pp-pollen-ink: #BD59D2;
  --pp-weeder-word: #A37A6E;
}
```
