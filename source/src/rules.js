/* =========================================================
   THE RULES PAGES, in Collection, Rules. Plain words, one name per thing, each word explained the first time.
   ========================================================= */
const T = (...ts) => rowHTML(ts);
const LESSONS = [
  { eyebrow:'Page 1: The big idea', title:'Like rummy or poker, with tiles', body:() => `
    <p>Four people play. You hold <b>13 tiles</b>. On each turn you <b>take one tile from the wall</b> and <b>throw one away</b>. The tile you throw is called a <b>discard</b>.</p>
    <p>The first player to turn their tiles into a finished <b>14-tile hand</b> wins.</p>
    <div class="tbl-wrap"><table class="cmp"><tr><th>Name</th><th>What it is</th><th>Looks like</th></tr>
      <tr><td><b>Chow</b></td><td>Three in a row, one suit</td><td>${T(10,11,12)}</td></tr>
      <tr><td><b>Pung</b></td><td>Three of the same tile</td><td>${T(31,31,31)}</td></tr>
      <tr><td><b>Kong</b></td><td>Four of the same tile</td><td>${T(5,5,5,5)}</td></tr>
      <tr><td><b>Pair</b></td><td>Two of the same tile</td><td>${T(27,27)}</td></tr></table></div>
    <p>There is no betting. The skill is in which tiles you keep, which you throw, and which you take from other players.</p>` },
  { eyebrow:'Page 2: The tiles', title:'Three suits, Winds and Dragons', body:() => `
    <p>Like cards, the tiles come in three suits, each numbered <b>1 to 9</b>. There are four of every tile, plus eight bonus tiles: 144 in all.</p>
    <p><b>Dots</b>: count the circles.</p>${rowHTML([9,10,11,12,13,14,15,16,17])}
    <p><b>Bamboo</b>: count the sticks. The 1 shows a bird.</p>${rowHTML([18,19,20,21,22,23,24,25,26])}
    <p><b>Characters</b>: the top sign is a Chinese number (一 is 1, 二 is 2, 三 is 3). The red sign under it is the same on every tile in this suit. With Tile helpers on, a small number shows on your rack.</p>${rowHTML([0,1,2,3,4,5,6,7,8])}
    <p><b>Winds and Dragons</b> have no number, so they can be in a Pung, a Kong or a pair, but never a Chow. There are four Winds (East, South, West, North) and three Dragons (Red, Green, White).</p>${rowHTML([27,28,29,30,null,31,32,33])}
    <p><b>Bonus tiles</b> (Flowers and Seasons) never stay in your hand. They go to the side and you draw another tile. One with your seat number (East 1, South 2, West 3, North 4) scores extra.</p>${rowHTML([34,35,36,37,null,38,39,40,41])}` },
  { eyebrow:'Page 3: Sets', title:'The building blocks', body:() => `
    <div class="grp-list">
      <div class="grp"><b>Chow</b>${T(19,20,21)}<span>Three numbers in a row in one suit. Winds and Dragons cannot make a Chow.</span></div>
      <div class="grp"><b>Pung</b>${T(14,14,14)}<span>Three of the same tile. Any tile works, Winds and Dragons too.</span></div>
      <div class="grp"><b>Kong</b>${T(32,32,32,32)}<span>Four of the same tile. It counts as one set, and you draw an extra tile.</span></div>
      <div class="grp"><b>Pair</b>${T(6,6)}<span>Two of the same tile. A winning hand needs exactly one.</span></div>
    </div>`,
    quiz:{ q:'Which one is a Chow?', opts:[[[3,4,5],'Yes. 4, 5 and 6 of Characters: one suit, in a row.',true],[[12,21,3],'Not quite. These are three different suits, and a Chow has to be one suit.',false],[[27,28,29],'Not quite. Winds have no numbers, so they can never make a Chow.',false]] } },
  { eyebrow:'Page 4: How to win', title:'Four sets and a pair', body:() => `
    <p>A winning hand is <b>4 sets and 1 pair, 14 tiles</b>. Here is one: two Chows, two Pungs, and a pair of East Winds.</p>
    ${rowHTML([0,1,2,null,13,14,15,null,24,24,24,null,31,31,31,null,27,27])}
    <p>One other shape also wins: <b>Seven Pairs</b>, seven different pairs. It scores a lot.</p>
    ${rowHTML([1,1,null,9,9,null,16,16,null,20,20,null,25,25,null,28,28,null,33,33])}`,
    quiz:{ q:'Which hand wins?', opts:[[[9,10,11,18,18,18,4,5,6,30,30,30,32,32],'Yes. Chow, Pung, Chow, Pung, and a pair of Green Dragons.',true],[[9,10,11,18,18,18,4,5,7,30,30,30,32,32],'Look at the 5 and 7 of Characters. That is not a run, so this hand is not finished yet.',false]] } },
  { eyebrow:'Page 5: Your turn', title:'Take one, throw one', body:() => `
    <p>Turns go around the table to the right. Each turn goes like this:</p>
    <ol><li><b>Take</b> a tile from the wall. It lands at the right end of your rack.</li>
    <li><b>Look</b>. If it finishes your hand, tap <b>Win the hand</b>.</li>
    <li><b>Throw</b> one tile away. Drag it up onto the table, or tap it once to lift it and again to throw it. With a keyboard, use the arrow keys and Enter.</li></ol>
    <p>Everyone sees what you throw. If a player keeps throwing Dots, they are probably not collecting Dots.</p>
    <p>A good first rule: throw <b>lonely tiles</b> first. A single Wind that matches nothing is no use to you. A 4 next to a 5 can still become a run.</p>
    ${rowHTML([29,null,12,13])}` },
  { eyebrow:'Page 6: Taking tiles', title:'Take what others throw', body:() => `
    <p>When someone throws a tile you need, you can take it:</p>
    <div class="grp-list">
      <div class="grp"><b>Pung or Kong</b><span>From <b>anyone</b>, if you have two (or three) of that tile.</span></div>
      <div class="grp"><b>Chow</b><span>Only from the player <b>on your left</b>, the one who plays just before you.</span></div>
      <div class="grp"><b>Win</b><span>From <b>anyone</b>, if the tile finishes your hand.</span></div>
    </div>
    <p>A set you take goes face up in front of you, and then you throw a tile. Buttons only appear when taking is allowed. If two players want the same tile, <b>a win comes first, then a Pung or Kong, then a Chow</b>.</p>
    <p>The catch: taking a tile shows others what you are building, and you lose the <b>Hidden hand</b> bonus. Take a tile when it really helps.</p>` },
  { eyebrow:'Page 7: Scoring', title:'Faan: extra points', body:() => `
    <p>A winning hand scores <b>faan</b>, extra points for special hands. More faan, bigger payment.</p>
    <div class="tbl-wrap"><table class="cmp"><tr><th>Hand</th><th>Faan</th></tr>
      <tr><td>Winning hand (any)</td><td>1</td></tr>
      <tr><td>Own draw: you drew the winning tile</td><td>+1</td></tr>
      <tr><td>Hidden hand: you took no tiles from others</td><td>+1</td></tr>
      <tr><td>All Chows</td><td>+1</td></tr>
      <tr><td>Pung of Dragons, or of your seat wind or the round wind</td><td>+1 each</td></tr>
      <tr><td>All Pungs</td><td>+3</td></tr>
      <tr><td>Half Flush: one suit plus Winds or Dragons</td><td>+3</td></tr>
      <tr><td>Seven Pairs</td><td>+4</td></tr>
      <tr><td>Full Flush: one suit only</td><td>+6</td></tr>
      <tr><td>Only Winds and Dragons</td><td>+10</td></tr><tr><td>Bonus tile with your seat number</td><td>+1 each</td></tr></table></div>
    <p>A hand is worth <b>10 points, doubled for each faan after the first</b> (1 faan is 10, 3 faan is 40, 6 faan is 320). Win on your own draw and everyone pays you. Win on someone's discard and that player pays double.</p>` },
  { eyebrow:'Page 8: Tips', title:'Five habits that help', body:() => `
    <ol>
      <li><b>Throw Winds and Dragons early</b>, unless you have a pair of them. Later in the hand they are riskier to throw.</li>
      <li><b>Keep tiles that connect.</b> A 4 and 5 can become a run with a 3 or a 6. A 4 and 6 only with a 5.</li>
      <li><b>Go for a flush</b> if most of your hand is one suit. It scores big.</li>
      <li><b>Watch the table.</b> When someone has three sets face up, they are close. Throw tiles they have already thrown.</li>
      <li><b>Use the coach.</b> It marks a tile to throw with a small brass dot, and when you are one tile from winning it shows the tiles that would win. Tap Hint (or press H) any time.</li>
    </ol>
    <p>That is all of it. The rest comes from playing.</p>` }
];
