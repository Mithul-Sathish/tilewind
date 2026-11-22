import re,sys
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
core=rep(core,"diff = settings.difficulty","diff = S.diff",0)  # opponents are fixed for a match
assert 'settings.difficulty' not in core.replace('settings.difficulty >= 1','')
core=core.replace("settings.difficulty >= 1","S.diff >= 1")
src=lambda f: open('src/'+f).read()
js = "(() => {\n'use strict';\nif (!window.THREE){ document.getElementById('bootMsg').textContent = 'The game could not load. Try reloading the page.'; return; }\n"
js += "const FONT_CSS = " + repr(open('build/fonts.css').read()) + ";\n"
js += names + src('meta.js') + src('faces.js') + src('sound.js') + core + src('view3d.js') + src('flow.js') + src('app.js') + src('more.js') + src('lesson.js') + src('net.js') + src('netui.js') + src('rules.js')
js += """
/* ---------------- boot ---------------- */
(async () => {
  const good = await V.init($('#stage'));
  if (!good){ $('#bootMsg').textContent = 'This device cannot show the 3D table. Try another browser, or turn on hardware acceleration in its settings.'; return; }
  V.applyTheme(themeOf(profile.theme)); applyCos(); V.warmUp(); // the table comes up out of the dark as the lamp warms
  const seasonLine = seasonTick();
  V.setHelpers(settings.helpers);
  const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (profile.tut || profile.asked || room){ renderHome(false, 650); showScreen('home'); setTimeout(ensureTiles, 250); if (room) setTimeout(() => { if (NET.store.name && NET.store.room === room){ NET.join(room, NET.store.name).catch(e => { lobbyMsg = e.message; openFriends(room); }); } else openFriends(room); }, 700); }
  else { ensureTiles(); $('#screen-home').innerHTML = '<div class="mark"><span class="wm">Tilewind</span><span class="seal">風</span></div>'; showScreen('home'); firstQuestion(); }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const bt = $('#boot'); bt.classList.add('gone'); setTimeout(() => bt.remove(), 700);
  window.TW_ready = true;
  if (seasonLine) setTimeout(() => toast('A new season', seasonLine), 900);
})();
window.TW_state = () => S;
window.TW_themes = THEMES;
window.TW_test = { humanClaim, claimOptions, chowTap, handOrder, groupSort, callCost, unseenFor };
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
shell=src('shell.html').replace('/*@FONTS@*/',open('build/fonts.css').read()).replace('/*@FONTS2@*/',open('build/fonts2.css').read())
three=open('vendor/three.min.js').read()
assert '</script' not in three
peer=open('vendor/peerjs.min.js').read()
assert '</script' not in peer
out=shell+'<script>\n'+three+'\n</script>\n<script>\n/*! PeerJS 1.5.4, MIT License, https://github.com/peers/peerjs */\n'+peer+'\n</script>\n<script>\n'+js+'</script>\n'
open('index.html','w').write(out)
open(__import__('os').environ.get('TW_OUT','build/test.html'),'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+out+'</body></html>')
print(len(out))
