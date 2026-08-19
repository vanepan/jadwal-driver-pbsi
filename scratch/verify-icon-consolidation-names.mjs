// Design System Program Phase 4 — icon-name resolution check.
// Imports the REAL js/analytics/analytics-shell.js and confirms every icon
// name used across the 5 migrated surfaces this phase touched resolves to a
// non-empty <path d> (catches a typo'd name silently rendering a blank SVG,
// which no visual screenshot glance would reliably catch at 14px).

import { anIcon } from '../js/analytics/analytics-shell.js';

const USAGES = {
  'domain-shell.js (rail)': ['today', 'operations', 'warehouse', 'finance', 'engineering', 'insights', 'control', 'sarprasIntelligence'],
  'modal.js (Assignment Detail drawer)': ['alert', 'chevR', 'check', 'comment', 'x', 'history', 'file', 'copy', 'trash', 'edit'],
  'notifications.js (bell content)': ['inbox', 'check', 'x', 'comment', 'maintenance', 'car', 'info', 'edit', 'bell'],
  'command-palette.js (trigger)': ['search'],
  'index.html (header bell, manual copy)': ['bell'],
};

let fail = 0;
for (const [file, names] of Object.entries(USAGES)) {
  for (const name of names) {
    const svg = anIcon(name, { size: 14 });
    const m = svg.match(/<path d="([^"]*)"/);
    const d = m ? m[1] : null;
    const ok = !!d && d.length > 0;
    console.log(`${ok ? '✓' : '✗'} ${file.padEnd(42)} anIcon('${name}') -> ${ok ? `${d.length} chars` : 'EMPTY/BROKEN'}`);
    if (!ok) fail++;
  }
}

// Cross-check the literal bell path hardcoded into index.html (since plain
// HTML can't call anIcon()) is still byte-identical to the live glyph.
const fs = await import('fs');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const bellPath = anIcon('bell', {}).match(/<path d="([^"]*)"/)[1];
const htmlHasBellPath = html.includes(bellPath);
console.log(`${htmlHasBellPath ? '✓' : '✗'} index.html bell <path> matches anIcon('bell') exactly`);
if (!htmlHasBellPath) fail++;

console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll icon names resolve. index.html bell copy is in sync.');
process.exit(fail ? 1 : 0);
