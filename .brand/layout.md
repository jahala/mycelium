# Layout — plotplot

How elements relate: the spacing scale, containers, breakpoints, and density.
Surface (`components.md`) governs the finish of one element; layout governs the
space between elements. Type-only concerns stay in `typography.md`.

## Spacing Scale

All spacing — padding, margin, gap — comes from multiples of 4px:

| Token | Value | Usage |
|-------|-------|-------|
| 4xs | 4px | Tight icon padding |
| 3xs | 8px | Inline spacing |
| 2xs | 12px | Component inner |
| xs | 16px | Compact section |
| sm | 24px | Standard section |
| md | 32px | Major section |
| lg | 48px | Page sections |
| xl | 64px | Hero spacing |
| 2xl | 96px | Layout breaks |
| 3xl | 128px | Marketing breathing room |

Off-scale values are flagged with the closest valid step.

## Containers & Measure

| Token | Value | Usage |
|-------|-------|-------|
| container | 1200px max-width, centered | The one content container |
| gutter | 32px (md) | Container horizontal padding |
| measure-lede | 60–68ch | Section heads, ledes |
| measure-body | 44–54ch | Body prose columns |

## Breakpoints

| Breakpoint | What changes |
|------------|--------------|
| 880px | Multi-column grids stack to one column; base font 17px |
| 520px | Dense strips stack; base font 16px |

New breakpoints are off-brand — adapt within these two.

## Density & Rhythm

- Marketing sections breathe at the 96–128px end of the scale.
- Within-section gaps stay smaller than section-to-section spacing — a head
  belongs to its content (head → body ≤ 64px when sections sit 96px apart).
- Hierarchy lives in the spacing itself: tight kicker → title (one thought),
  medium title → lede, generous lede → actions.
- Avoid crowded dashboards, dense panels, and arbitrary one-off gaps.

## Page structure

The umbrella page, in order: header (with the inchworm on its bottom line) · hero (copy beside the site plan) · motto rule · the index of beds by row · the garden film · why a garden · garden footer. A bed page, in order: header · direction sign · hero (title, lede, actions beside a real terminal, the key plan) · the bed's own sections · garden footer with the plotplot band. `reference/landing.html` and `reference/product.html` are these structures built.

## Guide lines

The hero carries faint vertical guide lines: one even 96px rhythm across the full width of the viewport, centred on the page, 1px in `--pp-border`, drawn as the hero's background. They fade from full at the top of the hero to nothing at its bottom. They are not fitted to the content grid; the content sits over them.

## Seams

A section hands over to the next without a hard edge where one of them is illustration. The garden film's soil fades from the soil line to nothing at the band's bottom edge, the band's background shades into the next section's colour over its lower part, and the next section drops its top border. Two plain sections keep the hairline between them.
