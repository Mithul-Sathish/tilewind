/* =========================================================
   THE RULES PAGES, in Collection, Rules. Plain words, one name per thing, each word explained the first time.
   ========================================================= */
const T = (...ts) => rowHTML(ts);
const LESSONS = [
  { title:'Make 4 sets and a pair', body:() => `
    <p class="big">Take a tile. Throw a tile. First to finish wins.</p>
    ${rowHTML([0,1,2,null,13,14,15,null,24,24,24,null,31,31,31,null,27,27])}
    <div class="tbl-wrap"><table class="cmp">
      <tr><td><b>Chow</b></td><td>Three in a row</td><td>${T(10,11,12)}</td></tr>
      <tr><td><b>Pung</b></td><td>Three the same</td><td>${T(31,31,31)}</td></tr>
      <tr><td><b>Kong</b></td><td>Four the same</td><td>${T(5,5,5,5)}</td></tr>
      <tr><td><b>Pair</b></td><td>Two the same</td><td>${T(27,27)}</td></tr></table></div>
    <p>Like rummy. No betting.</p>` },
  { title:'The tiles', body:() => `
    <p><b>Dots</b> 1 to 9</p>${rowHTML([9,10,11,12,13,14,15,16,17])}
    <p><b>Bamboo</b> 1 to 9. The 1 is a bird.</p>${rowHTML([18,19,20,21,22,23,24,25,26])}
    <p><b>Characters</b> 1 to 9. Read the top sign.</p>${rowHTML([0,1,2,3,4,5,6,7,8])}
    <p><b>Winds and Dragons</b>. No numbers, so no Chows.</p>${rowHTML([27,28,29,30,null,31,32,33])}
    <p><b>Flowers</b>. Set aside, draw again. Your seat number scores.</p>${rowHTML([34,35,36,37,null,38,39,40,41])}
    <p class="small">Four of each tile, plus 8 flowers. 144 in all.</p>` },
  { title:'Sets', body:() => `
    <div class="grp-list">
      <div class="grp"><b>Chow</b>${T(19,20,21)}<span>Same suit, in a row</span></div>
      <div class="grp"><b>Pung</b>${T(14,14,14)}<span>Any tile, three times</span></div>
      <div class="grp"><b>Kong</b>${T(32,32,32,32)}<span>Counts as one set. Draw an extra tile.</span></div>
      <div class="grp"><b>Pair</b>${T(6,6)}<span>Exactly one per hand</span></div>
    </div>`,
    quiz:{ q:'Which one is a Chow?', opts:[[[3,4,5],'Yes. One suit, in a row.',true],[[12,21,3],'No. Three different suits.',false],[[27,28,29],'No. Winds have no numbers.',false]] } },
  { title:'Winning hands', body:() => `
    <p class="big">4 sets + 1 pair = 14 tiles</p>
    ${rowHTML([0,1,2,null,13,14,15,null,24,24,24,null,31,31,31,null,27,27])}
    <p><b>Seven Pairs</b> also wins, and scores big.</p>
    ${rowHTML([1,1,null,9,9,null,16,16,null,20,20,null,25,25,null,28,28,null,33,33])}`,
    quiz:{ q:'Which hand wins?', opts:[[[9,10,11,18,18,18,4,5,6,30,30,30,32,32],'Yes. Four sets and a pair.',true],[[9,10,11,18,18,18,4,5,7,30,30,30,32,32],'No. Check the 5 and 7.',false]] } },
  { title:'Your turn', body:() => `
    <div class="grp-list">
      <div class="grp"><b>1 Take</b><span>A new tile lands on the right.</span></div>
      <div class="grp"><b>2 Look</b><span>Finished? Press <b>Win</b>.</span></div>
      <div class="grp"><b>3 Throw</b><span>Drag a tile up, or tap it twice.</span></div>
    </div>
    <p><b>Throw lonely tiles first.</b></p>
    ${rowHTML([29,null,12,13])}
    <p class="small">Keys: arrows to pick, Enter to throw.</p>` },
  { title:'Grab a throw', body:() => `
    <div class="grp-list">
      <div class="grp"><b>Pung, Kong</b><span>From anyone</span></div>
      <div class="grp"><b>Chow</b><span>Only from your left</span></div>
      <div class="grp"><b>Win</b><span>From anyone</span></div>
    </div>
    <p>Buttons show up when you can.</p>
    <p>Win beats Pung. Pung beats Chow.</p>
    <p class="small">Grabbed sets go face up. No Hidden bonus.</p>` },
  { title:'Scoring', body:() => `
    <div class="tbl-wrap"><table class="cmp"><tr><th>Hand</th><th>Faan</th></tr>
      <tr><td>Any win</td><td>1</td></tr>
      <tr><td>Own draw (you drew the winner)</td><td>+1</td></tr>
      <tr><td>Hidden hand (nothing grabbed)</td><td>+1</td></tr>
      <tr><td>All Chows</td><td>+1</td></tr>
      <tr><td>Pung of Dragons, your wind, or round wind</td><td>+1 each</td></tr>
      <tr><td>Flower with your seat number</td><td>+1 each</td></tr>
      <tr><td>All Pungs</td><td>+3</td></tr>
      <tr><td>Half Flush (one suit plus honors)</td><td>+3</td></tr>
      <tr><td>Seven Pairs</td><td>+4</td></tr>
      <tr><td>Full Flush (one suit only)</td><td>+6</td></tr>
      <tr><td>Only Winds and Dragons</td><td>+10</td></tr></table></div>
    <p><b>1 faan = 10 points.</b> Each extra faan doubles it.</p>
    <p class="small">Own draw: everyone pays. Off a throw: the thrower pays double.</p>` },
  { title:'Five tips', body:() => `
    <ol>
      <li><b>Throw Winds and Dragons early.</b> Keep pairs.</li>
      <li><b>Keep tiles that touch.</b> 4 and 5 beat 4 and 6.</li>
      <li><b>Mostly one suit?</b> Go for a flush.</li>
      <li><b>Three sets showing?</b> They're close. Play safe.</li>
      <li><b>Stuck?</b> Press the bulb, or H.</li>
    </ol>` }
];
