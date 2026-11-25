// N scripted players over real WebSockets: join the queue, play every turn they are asked, one leaves mid-hand and returns
const URL0 = process.argv[2] || 'ws://localhost:8799', N = +process.argv[3] || 2;
const log = (...a) => console.log(new Date().toISOString().slice(14, 23), ...a);
function player(i){
  const token = 'tok' + i + 'x'.repeat(14) + Math.random().toString(36).slice(2, 8);
  let ws, table = null, seat = -1, views = 0, asks = 0, hands = 0;
  const q = new WebSocket(URL0 + '/queue');
  q.onopen = () => q.send(JSON.stringify({ t: 'join', v: 9, token }));
  q.onmessage = e => { const m = JSON.parse(e.data);
    if (m.t === 'you') log('P' + i, 'is', m.name, m.rating);
    if (m.t === 'q') log('P' + i, 'waiting', m.n + '/4', Math.round(m.left / 1000) + 's');
    if (m.t === 'go'){ table = m.code; q.close(); sit(); }
    if (m.t === 'deny') log('P' + i, 'deny', m.why); };
  function sit(){
    ws = new WebSocket(URL0 + '/table/' + table);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.t === 'welcome'){ seat = m.seat; log('P' + i, 'seat', seat, m.table.seats.map(s => s.name + (s.kind === 'bot' ? '*' : '')).join(', ')); }
      else if (m.t === 'view'){ views++; const others = m.players.slice(1).flatMap(p => p.hand).filter(x => x.t !== -1).length; if (others && m.turn !== -1) log('P' + i, 'LEAK: sees', others, 'hidden tiles'); P.last = m; }
      else if (m.t === 'ask'){ asks++;
        let v = null;
        if (m.kind === 'turn'){ if (m.so.win) v = { type: 'win' }; else { const h = P.last.players[0].hand; v = { type: 'discard', id: (h.find(x => x.id === P.last.players[0].drawnId) || h[h.length - 1]).id }; } }
        else if (m.kind === 'claim'){ v = m.o.ron ? { type: 'ron' } : m.o.pung ? { type: 'pung' } : null; }
        const slow = i === 1 && asks === 3; // player 1 lets one turn run out
        setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'act', id: m.id, v })), slow ? 30000 : 150);
      }
      else if (m.t === 'note') log('P' + i, 'note:', m.text);
      else if (m.t === 'result'){ hands++; log('P' + i, 'result hand', hands, 'winner', m.w.pi, 'pay', m.w.pay.join(' ')); setTimeout(() => ws.send(JSON.stringify({ t: 'next' })), 500); }
      else if (m.t === 'over') log('P' + i, 'OVER', m.order.map(o => o.name + ' ' + o.score).join(', '));
      else if (m.t === 'rated'){ log('P' + i, 'rated', JSON.stringify(m.r)); P.done = true; }
      else if (m.t === 'away') log('P' + i, 'marked away');
      else if (m.t === 'deny') log('P' + i, 'deny', m.why);
    };
    ws.onclose = () => log('P' + i, 'socket closed');
  }
  const P = { i, quit(){ log('P' + i, 'QUITS'); ws.close(); }, back(){ log('P' + i, 'RETURNS'); sit(); }, get views(){ return views; } };
  return P;
}
const ps = [];
for (let i = 0; i < N; i++) setTimeout(() => ps.push(player(i)), i * 1500);
setTimeout(() => ps[0] && ps[0].quit(), 40000);
setTimeout(() => ps[0] && ps[0].back(), 55000);
const iv = setInterval(() => { if (ps.length === N && ps.every(p => p.done)){ log('ALL DONE'); process.exit(0); } }, 1000);
setTimeout(() => { log('TIMEOUT'); process.exit(1); }, +process.env.LIMIT || 600000);
