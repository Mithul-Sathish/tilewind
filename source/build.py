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
lessons=cut("const T = (...ts)","let lessonIdx = 0")
lessons=re.sub(r"(\w)!",r"\1.",lessons)
assert '!' not in lessons, lessons[lessons.index('!')-40:lessons.index('!')+20]
lessons=lessons.replace("drawn as a sparrow on a bamboo branch","drawn as a bird on a bamboo branch")
lessons=rep(lessons,"Tilewind can show a small number in the corner while you learn them (turn it off in Settings).","Tilewind shows a small number under each suit tile on your rack while you learn them.")
lessons=rep(lessons,"Tap a tile to lift it, tap again to discard it. On a keyboard, use the arrow keys and Enter.","Drag a tile up onto the table, or tap it to lift it and tap again to throw it. On a keyboard, use the arrow keys and Enter.")
lessons=rep(lessons,"<li><b>Leave the coach on.</b> It marks a suggested discard with a small brass dot, and when you're one tile away it shows exactly which tiles you're waiting for. Press Hint (or H) any time.</li>","<li><b>Leave the coach on.</b> It marks a suggested discard with a small brass dot. When you are one tile away, the tiles you wait for appear beside your rack with how many are left. Press Hint (or H) any time.</li>")
lessons=rep(lessons,"You'll learn the rest faster by playing, with the coach by your side.","The rest comes faster by playing.")
lessons=lessons.replace(" · "," · ")
src=lambda f: open('src/'+f).read()
js = "(() => {\n'use strict';\nif (!window.THREE){ document.getElementById('bootMsg').textContent = 'The 3D table could not load.'; return; }\n"
js += "const FONT_CSS = " + repr(open('build/fonts.css').read()) + ";\n"
js += names + src('meta.js') + src('faces.js') + src('sound.js') + core + src('view3d.js') + src('flow.js') + src('app.js') + src('more.js') + lessons
js += """
/* ---------------- boot ---------------- */
(async () => {
  const good = await V.init($('#stage'));
  if (!good){ $('#bootMsg').textContent = 'This device could not start the 3D table.'; return; }
  V.applyTheme(themeOf(profile.theme)); applyCos();
  const seasonLine = seasonTick();
  if (profile.tut){ renderHome(); showScreen('home'); setTimeout(ensureTiles, 250); }
  else { ensureTiles(); showScreen('home'); startGame('tut'); }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const bt = $('#boot'); bt.classList.add('gone'); setTimeout(() => bt.remove(), 700);
  window.TW_ready = true;
  if (seasonLine) setTimeout(() => toast('A new season', seasonLine), 900);
})();
window.TW_state = () => S;
window.TW_themes = THEMES;
window.TW_api = { setKind, weeklyNow, shareCard, rareReveal, COLLECTION, startGame, playOrResume, goHome, openBook, profile, settings, save, endWin, render, paintWin, callStroke, V };
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
out=shell+'<script>\n'+three+'\n</script>\n<script>\n'+js+'</script>\n'
open('index.html','w').write(out)
open('build/test.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+out+'</body></html>')
print(len(out))
