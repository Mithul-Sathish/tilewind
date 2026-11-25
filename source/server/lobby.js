/* The waiting room. People who press Play online wait together; a table starts the moment four are found, or
   20 seconds after the first of them arrived, with computer players in the empty seats. Nobody waits longer. */
import { nameFor, BOT_NAMES } from './names.js';
import { tierOf, rate } from './rating.js';
export const PROTO = 9, WAIT_MS = 20000;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rid = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => ALPHA[b % ALPHA.length]).join(''); };
export async function hashTok(t){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tw' + t)); return btoa(String.fromCharCode(...new Uint8Array(h))).slice(0, 16); }

export class Lobby {
  // io: { launch(code, spec) -> Promise, store: { get(k), put(k, v) } }
  constructor(io){ this.io = io; this.socks = new Map(); this.group = null; this.timer = 0; }
  async message(sock, m){
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join'){
      if (m.v !== PROTO) return sock.send({ t: 'deny', why: 'Your copy of Tilewind is out of date. Reload the page.' });
      const token = String(m.token || ''); if (token.length < 12) return sock.send({ t: 'deny', why: 'Reload the page and try again.' });
      const th = await hashTok(token), rec = (await this.io.store.get('r:' + th)) || { r: 1000, games: 0, best: 1000 };
      for (const [s, p] of this.socks) if (p.th === th && s !== sock){ this.leave(s); try { s.send({ t: 'deny', why: 'You joined from another tab.' }); s.close(); } catch(e){} }
      const me = { th, name: nameFor(th), r: rec.r, games: rec.games, at: Date.now() };
      this.socks.set(sock, me);
      sock.send({ t: 'you', name: me.name, rating: rec.r, games: rec.games, tier: tierOf(rec.r) });
      this.seat(sock, me);
      return;
    }
    if (m.t === 'cancel'){ this.leave(sock); try { sock.send({ t: 'left' }); } catch(e){} return; }
    if (m.t === 'me'){ // the rating card on the title screen, without joining the queue
      const th = await hashTok(String(m.token || '')), rec = (await this.io.store.get('r:' + th)) || { r: 1000, games: 0, best: 1000 };
      sock.send({ t: 'me', name: nameFor(th), rating: rec.r, games: rec.games, best: rec.best, tier: tierOf(rec.r) });
    }
  }
  seat(sock, me){
    if (!this.group){ this.group = { members: [], deadline: Date.now() + WAIT_MS }; clearTimeout(this.timer); this.timer = setTimeout(() => this.launch(), WAIT_MS); }
    this.group.members.push(sock);
    if (this.group.members.length >= 4) return this.launch();
    this.tell();
  }
  tell(){
    if (!this.group) return;
    const g = this.group, left = Math.max(0, g.deadline - Date.now());
    for (const s of g.members) try { s.send({ t: 'q', n: g.members.length, left }); } catch(e){}
  }
  leave(sock){
    this.socks.delete(sock);
    if (this.group){ const i = this.group.members.indexOf(sock); if (i >= 0){ this.group.members.splice(i, 1); if (!this.group.members.length){ clearTimeout(this.timer); this.group = null; } else this.tell(); } }
  }
  closed(sock){ this.leave(sock); }
  async launch(){
    const g = this.group; if (!g) return; this.group = null; clearTimeout(this.timer);
    const people = g.members.filter(s => this.socks.has(s)).slice(0, 4);
    if (!people.length) return;
    const code = rid(6), seats = [];
    const order = people.map(s => this.socks.get(s));
    // seats in random order, so nobody always sits East
    const pos = [0, 1, 2, 3]; for (let i = 3; i > 0; i--){ const j = crypto.getRandomValues(new Uint8Array(1))[0] % (i + 1); [pos[i], pos[j]] = [pos[j], pos[i]]; }
    const styles = ['quick', 'careful', 'flush']; let nb = 0;
    for (let a = 0; a < 4; a++) seats[a] = null;
    order.forEach((p, k) => { seats[pos[k]] = { kind: 'human', name: p.name, th: p.th, rating: p.r, games: p.games }; });
    for (let a = 0; a < 4; a++) if (!seats[a]){ const k = nb++ % 3; seats[a] = { kind: 'bot', name: BOT_NAMES[k], style: styles[k], rating: 1000 }; }
    try { await this.io.launch(code, { code, seats, pace: 'normal', calls: 'standard', length: 4 }); }
    catch(e){ for (const s of people) try { s.send({ t: 'deny', why: 'Could not open a table. Try again.' }); } catch(e2){} return; }
    for (const s of people){ try { s.send({ t: 'go', code, n: people.length }); } catch(e){} this.socks.delete(s); }
  }
  // a finished table reports the final scores; ratings are kept here, on the server, so they mean something
  async result(seats, scores){
    const recs = await Promise.all(seats.map(async s => s.kind === 'human' ? ((await this.io.store.get('r:' + s.th)) || { r: 1000, games: 0, best: 1000 }) : { r: 1000, games: 99 }));
    const d = rate(seats.map((s, a) => ({ r: recs[a].r, score: scores[a], games: recs[a].games, human: s.kind === 'human' })));
    const out = [];
    for (let a = 0; a < 4; a++){
      if (seats[a].kind !== 'human'){ out.push(null); continue; }
      const r = Math.max(100, recs[a].r + d[a]), rec = { r, games: recs[a].games + 1, best: Math.max(recs[a].best || 1000, r) };
      await this.io.store.put('r:' + seats[a].th, rec);
      out.push({ from: recs[a].r, to: r, games: rec.games, tier: tierOf(r), was: tierOf(recs[a].r) });
    }
    return out;
  }
}
