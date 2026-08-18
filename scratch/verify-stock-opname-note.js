// Gap fix — Warehouse Stock Opname now requires a note when the physical
// count differs from the expected quantity (was: unguarded, per project
// memory / this session's own audit). Drives the real, unmodified
// renderStockOpname()/opnameHandlers exported from
// js/gudang/ui/gudang-stock-opname.js directly, seeding `o.expected`
// synthetically so the async engine (real Firebase) never needs to run —
// this is pure render/handler logic, not an I/O test.

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('http://localhost:8000/scratch/domain-shell-harness.html', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const mod = await import('/js/gudang/ui/gudang-stock-opname.js');
    const { renderStockOpname, opnameHandlers } = mod;

    const st = {
      data: {
        items: [{ itemId: 'i1', name: 'Tinta Epson 003', itemType: 'consumable', active: true, category: 'ink', defaultLocationId: null }],
        locations: [],
      },
    };
    const render = () => {}; // no-op — we just inspect state directly between calls
    const c = { actorId: 'test-actor' };

    // Open the row, then seed the expected quantity directly (skips the
    // real async engine call — openRow() would hit Firebase).
    opnameHandlers.onClick(st, 'gud-op-open', { dataset: { id: 'i1' } }, c, render, async () => {});
    st.opname.expected = { i1: 10 };

    const out = { htmlHasNoteFieldBeforeCount: renderStockOpname(st, c).includes('gud-op-note') };

    // Type a count EQUAL to expected (no variance) -> no note field, confirm enabled.
    opnameHandlers.onInput(st, 'gud-op-count', { dataset: { id: 'i1' }, value: '10' }, render);
    let html = renderStockOpname(st, c);
    out.matchingCount = {
      noteFieldShown: html.includes('gud-op-note'),
      confirmDisabled: /data-act="gud-op-confirm-count"[^>]*disabled/.test(html),
    };

    // Confirm the matching count — should succeed with no note.
    opnameHandlers.onClick(st, 'gud-op-confirm-count', { dataset: { id: 'i1' } }, c, render, async () => {});
    out.matchingConfirmed = !!st.opname.counted.i1;
    out.matchingCountedNote = st.opname.counted.i1 ? st.opname.counted.i1.note : 'MISSING';

    // Undo, then type a count that DIFFERS from expected -> note field required.
    opnameHandlers.onClick(st, 'gud-op-undo', { dataset: { id: 'i1' } }, c, render, async () => {});
    opnameHandlers.onClick(st, 'gud-op-open', { dataset: { id: 'i1' } }, c, render, async () => {});
    st.opname.expected = { i1: 10 };
    opnameHandlers.onInput(st, 'gud-op-count', { dataset: { id: 'i1' }, value: '7' }, render);
    html = renderStockOpname(st, c);
    out.varianceNoNote = {
      noteFieldShown: html.includes('gud-op-note'),
      confirmDisabled: /data-act="gud-op-confirm-count"[^>]*disabled/.test(html),
    };

    // Try to confirm WITHOUT a note — should be rejected (state unchanged).
    opnameHandlers.onClick(st, 'gud-op-confirm-count', { dataset: { id: 'i1' } }, c, render, async () => {});
    out.varianceConfirmBlockedWithoutNote = !st.opname.counted.i1 && !!st.opname.open.i1;

    // Now type a note, confirm should succeed and the note should be stored.
    opnameHandlers.onInput(st, 'gud-op-note', { dataset: { id: 'i1' }, value: 'Rusak, dibuang' }, render);
    html = renderStockOpname(st, c);
    out.varianceWithNoteConfirmEnabled = !/data-act="gud-op-confirm-count"[^>]*disabled/.test(html);
    opnameHandlers.onClick(st, 'gud-op-confirm-count', { dataset: { id: 'i1' } }, c, render, async () => {});
    out.varianceConfirmedWithNote = st.opname.counted.i1
      ? { countedQuantity: st.opname.counted.i1.countedQuantity, note: st.opname.counted.i1.note }
      : 'MISSING';

    // trySave()'s line-building (via opnameHandlers.trySave is async/hits
    // Firebase — instead just replicate its pure mapping here to confirm
    // `note` survives into the shape executeStockOpname() expects).
    const lines = Object.entries(st.opname.counted).map(([itemId, v]) => ({ itemId, countedQuantity: v.countedQuantity, note: v.note ?? null }));
    out.linesForEngine = lines;

    return out;
  });

  await browser.close();

  console.log(JSON.stringify(result, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (result.htmlHasNoteFieldBeforeCount) fail.push('note field should not render before any count is typed');
  if (result.matchingCount.noteFieldShown) fail.push('matching count should NOT show a note field');
  if (result.matchingCount.confirmDisabled) fail.push('matching count confirm button should be enabled with no note');
  if (!result.matchingConfirmed) fail.push('matching count should confirm successfully');
  if (result.matchingCountedNote !== null) fail.push(`matching count should store note:null, got ${JSON.stringify(result.matchingCountedNote)}`);
  if (!result.varianceNoNote.noteFieldShown) fail.push('variance without note should show the note field');
  if (!result.varianceNoNote.confirmDisabled) fail.push('variance without note should have confirm DISABLED');
  if (!result.varianceConfirmBlockedWithoutNote) fail.push('confirming a variance without a note should be rejected (handler-level guard)');
  if (!result.varianceWithNoteConfirmEnabled) fail.push('variance WITH a note should enable the confirm button');
  if (result.varianceConfirmedWithNote === 'MISSING' || result.varianceConfirmedWithNote.note !== 'Rusak, dibuang') {
    fail.push(`variance confirm should store the note, got ${JSON.stringify(result.varianceConfirmedWithNote)}`);
  }
  if (result.linesForEngine[0]?.note !== 'Rusak, dibuang') fail.push('note did not survive into the engine-bound lines mapping');
  if (pageErrors.length) fail.push(`page errors: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nStock Opname variance-note gap-fix verified.');
  }
})();
