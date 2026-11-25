/* One online table: opens when the waiting room fills it, runs the match, reports the result, then closes. */
import { createGame } from './game.js';
import { hashTok } from './lobby.js';
export class Table {
  // io: { report(seats, scores) -> Promise<ratings[]>, done() }
  constructor(io){ this.io = io; this.g = null; this.spec = null; this.empty = 0; this.timer = 0; this.ended = false; }
  open(spec){
    if (this.g) return;
    this.spec = spec; this.g = createGame();
    const N = this.g.NET;
    N.open(JSON.parse(JSON.stringify(spec)));
    const humans = spec.seats.filter(s => s.kind === 'human').length;
    let started = false;
    const go = () => { if (started) return; started = true; clearTimeout(t0); N.start().catch(() => {}); };
    const t0 = setTimeout(go, 6000); // anyone not here by then gets their seat back when they arrive
    N.onArrive = () => { if (N.humansHere() >= humans) setTimeout(go, 400); };
    N.onOver = async order => {
      this.ended = true;
      const scores = [0,1,2,3].map(a => order.find(o => o.i === a).score);
      try { const rated = await this.io.report(spec.seats, scores); N.rated(rated); } catch(e){}
      setTimeout(() => this.shut(), 120000);
    };
    this.timer = setInterval(() => { // nobody left at the table for 90 s: it closes
      if (N.humansHere() === 0){ if ((this.empty += 5) >= 90) this.shut(); } else this.empty = 0;
    }, 5000);
  }
  async message(sock, m){
    if (!this.g){ if (m && m.t === 'hello') sock.send({ t: 'deny', why: 'That table has closed.' }); return; }
    if (m && m.t === 'hello'){ if (sock._seat == null){ sock._seat = this.g.NET.connect(sock, { th: await hashTok(String(m.token || '')) }); } return; }
    this.g.NET.message(sock, m);
  }
  closed(sock){ if (this.g) this.g.NET.closed(sock); }
  shut(){ if (!this.g) return; clearInterval(this.timer); this.g.NET.close(); this.g.stop(); this.g = null; this.io.done(); }
}
