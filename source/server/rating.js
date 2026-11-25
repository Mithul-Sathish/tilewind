/* Online rating. Everyone starts at 1000; a game moves it by how you placed against the other three, and by how strong
   they were (the way chess ratings work, for four players). Computer seats count as 1000. */
export const TIERS = [
  { name: 'Plum', min: 0 }, { name: 'Orchid', min: 1050 }, { name: 'Chrysanthemum', min: 1150 },
  { name: 'Bamboo', min: 1250 }, { name: 'Jade', min: 1350 }, { name: 'Dragon', min: 1450 }
];
export const PLACEMENT = 3; // the first games settle you in faster
export function tierOf(r){ let t = TIERS[0]; for (const x of TIERS) if (r >= x.min) t = x; const i = TIERS.indexOf(t); return { name: t.name, i, next: TIERS[i + 1] ? TIERS[i + 1].min : null, min: t.min }; }
export function rate(players){
  // players: [{ r, score, games, human }] in seat order; returns the change for each
  return players.map((p, i) => {
    if (!p.human) return 0;
    let sum = 0;
    players.forEach((q, j) => { if (j === i) return; const e = 1 / (1 + Math.pow(10, (q.r - p.r) / 400)), s = p.score > q.score ? 1 : p.score === q.score ? .5 : 0; sum += s - e; });
    const k = p.games < PLACEMENT ? 60 : 32;
    return Math.round(k * sum / 3 * 1.5);
  });
}
