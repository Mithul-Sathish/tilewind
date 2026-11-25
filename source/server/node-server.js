/* Tilewind online service as one plain Node program (Node 18 or newer, no packages to install).
   Run:  node server/node-server.js [port]    then point the game at it with ?online=ws://host:port  (or set ONLINE_URL in the build).
   Ratings are kept in ratings.json beside this file. For a public site put it behind HTTPS (wss://), e.g. with Caddy or nginx. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Lobby } from './lobby.js';
import { Table } from './table.js';
if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;
const here = path.dirname(fileURLToPath(import.meta.url));
const port = +process.argv[2] || +process.env.PORT || 8787;
const STATIC = process.env.STATIC || '';           // optional: a folder to serve the game from, for local tests
const DB = process.env.RATINGS || path.join(here, 'ratings.json');
const LAG = +process.env.LAG || 0;                 // test only: delay every message this many ms

let db = {}; try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch(e){}
let dirty = false; setInterval(() => { if (dirty){ dirty = false; fs.writeFile(DB, JSON.stringify(db), () => {}); } }, 5000).unref();
const store = { get: async k => db[k], put: async (k, v) => { db[k] = v; dirty = true; } };

const tables = new Map();
const lobby = new Lobby({
  store,
  launch: async (code, spec) => { const t = new Table({ report: (s, sc) => lobby.result(s, sc), done: () => tables.delete(code) }); tables.set(code, t); t.open(spec); }
});

function frame(str){ const d = Buffer.from(str); let h; if (d.length < 126){ h = Buffer.from([0x81, d.length]); } else if (d.length < 65536){ h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(d.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(d.length), 2); } return Buffer.concat([h, d]); }
const srv = http.createServer((q, r) => {
  r.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/health'){ r.end(JSON.stringify({ ok: true, tables: tables.size, waiting: lobby.group ? lobby.group.members.length : 0 })); return; }
  if (STATIC){
    const f = path.join(STATIC, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (f.startsWith(STATIC) && fs.existsSync(f) && fs.statSync(f).isFile()){ r.setHeader('Content-Type', /\.html$/.test(f) ? 'text/html; charset=utf-8' : 'application/octet-stream'); fs.createReadStream(f).pipe(r); return; }
  }
  r.statusCode = 404; r.end('Tilewind online service');
});
srv.on('upgrade', (q, raw) => {
  const u = new URL(q.url, 'http://x');
  let room = null;
  if (u.pathname === '/queue') room = lobby;
  else { const m = /^\/table\/([A-Z0-9]{6})$/.exec(u.pathname); if (m) room = tables.get(m[1]) || { message: (s, mm) => mm && mm.t === 'hello' && s.send({ t: 'deny', why: 'That table has closed.' }), closed(){} }; }
  if (!room){ raw.destroy(); return; }
  const acc = crypto.createHash('sha1').update(q.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  raw.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  raw.setNoDelay(true);
  let open = true;
  const sock = {
    send(o){ if (!open) return; const go = () => { try { raw.write(frame(JSON.stringify(o))); } catch(e){} }; LAG ? setTimeout(go, LAG) : go(); },
    close(){ if (!open) return; open = false; try { raw.write(Buffer.from([0x88, 0])); raw.end(); } catch(e){} }
  };
  let buf = Buffer.alloc(0);
  raw.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2){
      const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (len === 126){ if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127){ if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536){ raw.destroy(); return; }
      const mo = off; if (masked) off += 4; if (buf.length < off + len) return;
      let pl = buf.subarray(off, off + len); if (masked){ const k = buf.subarray(mo, mo + 4); pl = Buffer.from(pl.map((b, i) => b ^ k[i & 3])); }
      buf = buf.subarray(off + len);
      if (op === 8){ bye(); return; } if (op === 9){ try { raw.write(Buffer.from([0x8A, 0])); } catch(e){} continue; } if (op !== 1) continue;
      let m; try { m = JSON.parse(pl.toString()); } catch(e){ continue; }
      const go = () => Promise.resolve(room.message(sock, m)).catch(e => console.error(e));
      LAG ? setTimeout(go, LAG) : go();
    }
  });
  const bye = () => { if (sock._gone) return; sock._gone = true; open = false; try { raw.destroy(); } catch(e){} room.closed(sock); };
  raw.on('close', bye); raw.on('error', bye);
});
srv.listen(port, () => console.log('Tilewind online service on port', port));
