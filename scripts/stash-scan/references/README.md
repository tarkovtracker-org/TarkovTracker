# Scanner reference supplements

The upstream grid template remains indexed. These pinned supplements describe known game
renderings while upstream images catch up; they never change item metadata or confidence rules.

## Pile of meds

- Item ID: `5d1b3a5d86f774252167ba22`.
- `pile-of-meds-cache.png`: unchanged 64×64 RGBA icon recovered from the user's EFT icon cache
  on 2026-11-16, matching the screenshot from build `1.3.0.2.48779`. SHA-256:
  `253769910c9943081d4a1c875c7df2d97797e3ef9e2502b5327001eb1fbdd193`.
- This is the same artwork as the upstream image, with different framing. Bounds at alpha > 128
  are `(4,11)..(56,59)` here versus `(1,3)..(61,59)` in the upstream base image. The upstream
  base/grid image reported `Last-Modified: Wed, 08 Jan 2025 03:56:37 GMT` during inspection.
- `pile-of-meds-grid.png`: the cache PNG flattened onto RGB `(25,43,52)`, with `Meds` rendered
  separately in Bender Bold 12, color `#a4aeb4`, at top 2, right margin 1. Re-rendering the label
  avoids carrying bright item-art strokes from the old grid image into the label features.
- Font source: [tarkov.dev image generator, immutable revision](https://github.com/the-hideout/tarkov-dev-image-generator/blob/9ad285c4e46a66e3da131b2a1b63849c20ff62dc/fonts/Bender-Bold.otf).
  Font SHA-256: `36de62cf8b651e3a05d2e93352992fcb684b02ee72109fd7e2a3c134d57af4f2`.
  No font is downloaded or installed by the scanner or catalog builder.
- `pile-of-meds-legacy-grid.webp`: the old upstream grid image, retained only as a frozen
  regression input so the skip-bug reproduction survives later upstream image updates.

To reproduce the grid image with the repository's pinned Sharp version and that font file,
run this JavaScript in a Node REPL from the repository root (replace `FONT_FILE` with its local path):

```js
const sharp = require('sharp');
const directory = 'scripts/stash-scan/references/';
const label = await sharp({
  text: {
    text: '<span foreground="#a4aeb4">Meds</span>',
    font: 'Bender Bold 12',
    fontfile: FONT_FILE,
    rgba: true,
  },
})
  .png()
  .toBuffer({ resolveWithObject: true });
await sharp(directory + 'pile-of-meds-cache.png')
  .flatten({ background: { r: 25, g: 43, b: 52 } })
  .composite([{ input: label.data, left: 63 - label.info.width, top: 2 }])
  .png()
  .toFile(directory + 'pile-of-meds-grid.png');
```

Review the resulting pixels and update the pinned grid hash in `references.ts` deliberately if
the rendering changes. Then run `pnpm stash-scan:build-index` and the real-screenshot tests.
The screenshot is a calibration/regression fixture, not an independent accuracy benchmark.
The unchanged cache PNG can be sent to tarkov.dev maintainers with its item ID and game build;
their [official generator](https://github.com/the-hideout/tarkov-dev-image-generator) handles
publishing. No upstream submission is made by this repository's build.

All game artwork is owned by Battlestate Games; the screenshot and cache icon were supplied
or recovered locally with the user's authorization.
