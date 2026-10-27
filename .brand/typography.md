# Typography — plotplot

## Font Families

| Role | Font Family | Weight | Style |
|------|------------|--------|-------|
| Headings | Fraunces | 500, 560, 600, 620 | normal + italic |
| Body | Hanken Grotesk | 400, 500, 600, 700 | normal |
| Interface | Hanken Grotesk | 400, 500, 600 | normal |
| Code | JetBrains Mono | 400, 500, 700 | normal |

## Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body, interface |
| Medium | 500 | Labels, small headings, h3/h4 |
| Display | 560 | h2 |
| Semibold | 600 | Subheadings, emphasis, buttons |
| Display Bold | 620 | h1 |
| Bold | 700 | Strong body emphasis, stat numerals |

Fraunces is a variable font with optical sizing (`opsz`) and soft/wonk axes. Headings set `font-optical-sizing: auto`; display headings lean on a touch of `SOFT` and lively italics for character. Italics are a feature, not an afterthought — reach for them on the one word that should feel alive.

## Type Scale

Base: `html { font-size: 18px }`. Sizes are in `rem` for fluid scaling; the clamp on h1 keeps the hero balanced across viewports.

| Level | Size | Line Height | Weight | Usage |
|-------|------|------------|--------|-------|
| h1 | clamp(3.4rem, 6vw, 4.6rem) | 1.04 | 620 | Page / hero titles |
| h2 | 2.4rem | 1.12 | 560 | Section headings |
| h3 | 1.6rem | 1.2 | 560 | Subsection headings |
| h4 | 1.25rem | 1.3 | 560 | Card titles |
| lead | 1.3rem | 1.5 | 400 | Hero deck, section ledes |
| body | 1.0625rem | 1.65 | 400 | Body text |
| small | 0.9375rem | 1.5 | 400 | Captions, labels |
| stat | 3.75rem | 1.0 | 700 | Display numerals |
| code | 0.95rem | 1.6 | 400 | Code / terminal text |

### Display pairings

- **Hero title.** The roman line at 80% of the h1 scale (`clamp(2.72rem, 5.12vw, 4.4rem)`, weight 620), and the one live word in italic, growth green, on its own line at 1.75em of that, `line-height: .72`, `SOFT` 100 and `WONK` 1. The italic word is lowercase, so it needs this margin to read as larger: its x-height must clear the roman line's cap height. At the same size it reads only as heavier. No full stop after a title set this way.
- **Allotment-plan pages.** The reference pages set the section title (h2) at `clamp(2.2rem, 3.6vw, 3rem)`, line-height 1.05; the lede at 1.2rem (1.3rem in the umbrella hero, 1.15rem on a bed page); a bed page's hero title at `clamp(3.4rem, 7.2vw, 6.4rem)`, weight 640, line-height .95, its one live word in italic in the bed's word colour. These lead the scale above where they differ.
- **Full stop.** A title set as a split pairing (roman line, italic word on its own line) takes no full stop. A title that is one sentence on the line keeps its stop, as weeder's does.
- **Plot numerals.** JetBrains Mono 700, two digits (`01`), set in the bed's sign plate. On the plan they are 16px.
- **The motto rule.** One italic Fraunces line (`clamp(1.7rem, 3vw, 2.5rem)`, weight 500, `SOFT` 100, `WONK` 1) led by the sprout mark, with the supporting line in body type beneath it.

## Spacing

The spacing scale lives in `layout.md`, with the containers, breakpoints, and density rules it belongs to. Typography owns type only.

## Font Sources

- Fraunces: Google Fonts — a warm, characterful serif with optical sizing and soft/wonk axes. Playful and elegant and botanical at once: the reason plotplot reads as a garden, not a dashboard.
- Hanken Grotesk: Google Fonts — a warm, friendly, rounded-humanist sans. Legible and precise at body sizes, with a little more personality than a neutral grotesk.
- JetBrains Mono: Google Fonts — compact, legible, familiar in developer workflows. The builder/terminal voice — used for kickers, labels, commands, and code.

## Google Fonts Import

The URL loads Fraunces with its `SOFT` and `WONK` axes, which the display pairings use.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  --font-heading: 'Fraunces', Georgia, serif;
  --font-body: 'Hanken Grotesk', system-ui, sans-serif;
  --font-interface: 'Hanken Grotesk', system-ui, sans-serif;
  --font-code: 'JetBrains Mono', monospace;
}
```
