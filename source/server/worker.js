/* Tilewind online service on Cloudflare Workers (Durable Objects). Not deployed yet: hosting is on hold.
   Same Lobby and Table code as node-server.js; only the plumbing differs. Deploy with `npx wrangler deploy`. */
import { Lobby } from './lobby.js';
import { Table } from './table.js';

function socketPair(room){
  const pair = new WebSocketPair(), [client, server] = Object.values(pair);
  server.accept();
  let open = true;
  const sock = { send(o){ if (open) try { server.send(JSON.stringify(o)); } catch(e){} }, close(){ if (open){ open = false; try { server.close(1000); } catch(e){} } } };
  server.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch(x){ return; } Promise.resolve(room.message(sock, m)).catch(() => {}); });
  const bye = () => { if (sock._gone) return; sock._gone = true; open = false; room.closed(sock); };
  server.addEventListener('close', bye); server.addEventListener('error', bye);
  return new Response(null, { status: 101, webSocket: client });
}

export class LobbyDO {
  constructor(state, env){
    this.env = env;
    this.lobby = new Lobby({
      store: { get: k => state.storage.get(k), put: (k, v) => state.storage.put(k, v) },
      launch: async (code, spec) => { const r = await env.TABLE.get(env.TABLE.idFromName(code)).fetch('https://t/init', { method: 'POST', body: JSON.stringify(spec) }); if (!r.ok) throw new Error('table'); }
    });
  }
  async fetch(req){
    const u = new URL(req.url);
    if (u.pathname === '/result'){ const { seats, scores } = await req.json(); return Response.json(await this.lobby.result(seats, scores)); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Tilewind', { status: 426 });
    return socketPair(this.lobby);
  }
}
export class TableDO {
  constructor(state, env){
    const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('main'));
    this.table = new Table({
      report: async (seats, scores) => (await lobby().fetch('https://l/result', { method: 'POST', body: JSON.stringify({ seats, scores }) })).json(),
      done: () => {}
    });
  }
  async fetch(req){
    const u = new URL(req.url);
    if (u.pathname === '/init'){ this.table.open(await req.json()); return new Response('ok'); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Tilewind', { status: 426 });
    return socketPair(this.table.g ? this.table : { message: (s, m) => m && m.t === 'hello' && s.send({ t: 'deny', why: 'That table has closed.' }), closed(){} });
  }
}
export default {
  async fetch(req, env){
    const u = new URL(req.url);
    if (u.pathname === '/queue') return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
    const m = /^\/table\/([A-Z0-9]{6})$/.exec(u.pathname);
    if (m) return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(req);
    return new Response('Tilewind online service');
  }
};
