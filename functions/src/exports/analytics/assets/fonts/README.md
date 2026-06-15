# Inter fonts — self-hosted, embedded at render time

`inter-fonts.js` reads the `.woff2` files in this directory and inlines them as
`@font-face` data: URIs so headless Chrome renders the approved design with the
real Inter typeface and **zero network access** (ADR-001 / §10).

## Required files

| File | Weight | Role in the design |
|---|---|---|
| `inter-latin-100-normal.woff2` | 100 | 92–100px hero / health-score numerals |
| `inter-latin-300-normal.woff2` | 300 | KPI values, hero units |
| `inter-latin-400-normal.woff2` | 400 | body / captions |
| `inter-latin-500-normal.woff2` | 500 | statements, eyebrows |
| `inter-latin-600-normal.woff2` | 600 | entity names, org title |
| `inter-latin-400-italic.woff2` | 400 *(optional)* | style notes (`.cdtxt`, `.lnote`) |

The first five are committed (fetched from `@fontsource/inter@5`). Filenames match
the `@fontsource/inter` package so they can be copied verbatim from
`node_modules/@fontsource/inter/files/`.

**Italic:** `@fontsource/inter@5` ships no static italic `.woff2` (italics live in
the variable font). The italic file above is therefore optional; when absent,
Chromium synthesizes an oblique from the 400 normal face — visually fine for the
few italic style-notes in the report.

## To refresh / add the italic
```
npm i @fontsource/inter@5
cp node_modules/@fontsource/inter/files/inter-latin-{100,300,400,500,600}-normal.woff2 .
```
