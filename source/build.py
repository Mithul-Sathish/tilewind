import re,sys,json
old=open('v2.html').read()
def cut(a,b,src=old):
    i=src.index(a); j=src.index(b,i); return src[i:j]
def rep(s,a,b,n=1):
    assert s.count(a)>=1, a[:60]; return s.replace(a,b) if n==0 else s.replace(a,b,n)
SEC='/* =========================================================\n   '
names=cut("const HAN_NUM","const C = {")
# the rules engine, untouched: hand analysis, dealing helpers, opponents, claims, scoring
core=cut(SEC+"HAND ANALYSIS",SEC+"MAIN LOOP")
for f in ['speed','sleep','shuffle','newMatch','setupHand']:
    core=rep(core,"function "+f+"(","function "+f+"_v2(")
core=core.replace("Math.random()","rnd()")           # seeded, so a saved hand replays exactly
core=rep(core,"diff = settings.difficulty","diff = (p.diff != null ? p.diff : S.diff)",0)  # a seat can have its own level (mixed tables, and the level test)  # opponents are fixed for a match
assert 'settings.difficulty' not in core.replace('settings.difficulty >= 1','')
core=core.replace("settings.difficulty >= 1","S.diff >= 1")
ICONS={
 'menu':'<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
 'gear':'<path d="M4 8h9M18 8h2M4 16h2M11 16h9"/><circle cx="15.5" cy="8" r="2.4"/><circle cx="8.5" cy="16" r="2.4"/>',
 'help':'<path d="M9 9.2a3.1 3.1 0 1 1 4.4 2.8c-1 .5-1.4 1.2-1.4 2.3"/><circle class="f" cx="12" cy="17.8" r="1.4"/>',
 'friends':'<circle cx="9" cy="8.5" r="3.2"/><circle cx="16.8" cy="9.8" r="2.5"/><path d="M3.2 19.5c.9-3.3 3.1-5 5.8-5s4.9 1.7 5.8 5"/><path d="M15.3 14.6c2.7-.4 4.8 1 5.6 4.2"/>',
 'music':'<path d="M9.5 17.5V6.2l9.5-2v11"/><circle class="f" cx="7.3" cy="17.6" r="2.6"/><circle class="f" cx="16.8" cy="15.4" r="2.6"/>',
 'sound':'<path class="f" d="M3.5 9.3h3.8L12 5.5v13l-4.7-3.8H3.5z"/><path d="M15.4 9a4.3 4.3 0 0 1 0 6"/><path d="M18 6.4a8 8 0 0 1 0 11.2"/>',
 'slash':'<path d="M4 4l16 16" stroke-width="2.8"/>',
 'bulb':'<path d="M9.2 18h5.6M10.2 21h3.6"/><path d="M12 3.2a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.2 1 2V16h4.8v-.3c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.2z"/>',
 'sort':'<path d="M7.5 4.5v15M4.5 16.5l3 3 3-3M16.5 19.5v-15M13.5 7.5l3-3 3 3"/>',
 'play':'<path class="f" d="M7.5 4.8v14.4L19.4 12z"/>',
 'close':'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
 'back':'<path d="M10.5 6l-6 6 6 6M4.8 12h14.7"/>',
 'chat':'<path d="M4.5 5.5h15v10h-9l-4.5 3.8v-3.8H4.5z"/>',
 'wall':'<rect class="f" x="3" y="9" width="5" height="7" rx="1"/><rect class="f" x="9.5" y="9" width="5" height="7" rx="1"/><rect class="f" x="16" y="9" width="5" height="7" rx="1"/>',
 'globe':'<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.4 2.4 3.6 5.3 3.6 8.6s-1.2 6.2-3.6 8.6c-2.4-2.4-3.6-5.3-3.6-8.6s1.2-6.2 3.6-8.6z"/>',
 'eye':'<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.6"/>',
}
icon=lambda n: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg>'
src=lambda f: open('src/'+f).read()
js = "(() => {\n'use strict';\nif (!window.THREE){ document.getElementById('bootMsg').textContent = 'The game could not load. Try reloading the page.'; return; }\n"
js += "const FONT_CSS = " + repr(open('build/fonts.css').read()) + ";\n"
js += ""
js = js
js += "const ICON = " + json.dumps({k: icon(k) for k in ICONS}) + ";\n"
js += names + src('meta.js') + src('faces.js') + src('sound.js') + core + src('view3d.js') + src('flow.js') + src('app.js') + src('more.js') + src('goals.js') + src('lesson.js') + src('net.js') + src('netui.js') + src('online.js') + src('rules.js') + src('skin.js')
js += """
/* ---------------- boot ---------------- */
(async () => {
  performance.mark('tw-boot');
  const good = await V.init($('#stage'));
  performance.mark('tw-gl');
  if (!good){ $('#bootMsg').textContent = 'This device cannot show the 3D table. Try another browser, or turn on hardware acceleration in its settings.'; return; }
  V.applyTheme(themeOf(profile.theme)); applyCos(); V.warmUp(); // the table comes up out of the dark as the lamp warms
  const seasonLine = seasonTick();
  V.setHelpers(settings.helpers);
  const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  renderHome(false, 650); showScreen('home'); setTimeout(tilesInBackground, 600);
  if (!room && NET.onlineSaved()) setTimeout(() => rejoinOnline(NET.onlineSaved()), 700);
  if (room) setTimeout(() => { if (NET.store.name && NET.store.room === room){ NET.join(room, NET.store.name).catch(e => { lobbyMsg = e.message; openFriends(room); }); } else openFriends(room); }, 700);
  TWprog(100);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const bt = $('#boot'); setTimeout(() => { bt.classList.add('gone'); setTimeout(() => bt.remove(), 700); }, 180);
  window.TW_ready = true; performance.mark('tw-ready');
  if (seasonLine) setTimeout(() => toast('A new season', seasonLine), 900);
})();
window.TW_state = () => S;
window.TW_themes = THEMES;
window.TW_test = { analyzeDiscards, pickDiscardTile, humanClaim, claimOptions, chowTap, handOrder, groupSort, callCost, unseenFor };
window.TW_net = NET;
window.TW_api = { startLesson, firstQuestion, handOrder, onReorder, sortOnce, groupSort, callCost, setAutoSort, onTableView, onHold, PACE, setKind, weeklyNow, shareCard, rareReveal, COLLECTION, startGame, playOrResume, goHome, openBook, profile, settings, save, endWin, render, paintWin, callStroke, V };
window.TW_autotest = (matches = 3) => new Promise(async res => {
  autotest = true; let errors = 0;
  for (let m = 0; m < matches; m++){
    newMatch(); S.players[0].isHuman = false;
    try { await runMatch(); } catch(e){ errors++; console.error(e); }
  }
  autotest = false; goHome(); res({ errors });
});
})();
"""
js=js.replace('/*@ONLINE@*/', __import__('os').environ.get('TW_ONLINE',''))
shell=src('shell.html').replace('/*@FONTS@*/',open('build/fonts.css').read()).replace('/*@FONTS2@*/',open('build/fonts2.css').read()).replace('/*@FONTS3@*/',open('build/fonts3.css').read()).replace('/*@SKIN@*/',src('skin.css'))
shell=re.sub(r'\{\{ic:(\w+)\}\}',lambda m: icon(m.group(1)),shell)
three=open('vendor/three.min.js').read()
assert '</script' not in three
peer=open('vendor/peerjs.min.js').read()
assert '</script' not in peer
out=shell+'<script>\n'+three+'\n</script>\n<script>TWprog(45)</script>\n<script>\n/*! PeerJS 1.5.4, MIT License, https://github.com/peers/peerjs */\n'+peer+'\n</script>\n<script>TWprog(55)</script>\n<script>\n'+js+'</script>\n'
open('index.html','w').write(out)
open(__import__('os').environ.get('TW_OUT','build/test.html'),'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+out+'</body></html>')
print(len(out))
