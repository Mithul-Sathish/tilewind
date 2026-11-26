//NODE
window_ = null;
await p.evaluate(() => { window.TW_fast = true; TW_api.startGame('play'); });
let turns = 0; const N = 9;
for (let i = 0; i < 800 && turns < N; i++){
  const st = await p.evaluate(() => { const S = TW_state(); return S && S.ui && S.ui.mode || 'wait'; });
  if (st === 'discard'){ turns++; if (turns >= N) break; await p.evaluate(() => { const ui = TW_state().ui; const c = TW_test.analyzeDiscards(0, {})[0]; ui.resolve({ type: 'discard', id: TW_test.pickDiscardTile(0, c.t) }); }); }
  else if (st === 'claim') await p.evaluate(() => { const ui = TW_state().ui; const a = ui.actions.find(a => a.kind === 'pung'); ui.resolve(a ? a.value : null); });
  else if (st === 'read' || st === 'chowpick') await p.evaluate(() => { const ui = TW_state().ui; ui.mode === 'chowpick' ? ui.resolve(ui.starts[0]) : ui.resolve(); });
  else await p.waitForTimeout(100);
}
await p.evaluate(() => { window.TW_fast = false; }); await p.waitForTimeout(3000);
