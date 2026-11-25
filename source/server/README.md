# Tilewind online service

The small always-on program behind **Play online**. It runs the match itself (the same rules code as the game,
built into `game.js` by `../build_server.py`), so no browser ever receives another player's tiles.

Two ways to run it, same code:

- **Any server with Node 18+** (no packages needed): `node server/node-server.js 8787`. Put it behind HTTPS so the
  game can use `wss://`. Ratings are saved in `server/ratings.json`.
- **Cloudflare Workers** (free plan works): `npx wrangler deploy` from this folder.

Then build the game with the service address: `TW_ONLINE=wss://your-host python3 build.py`. Until an address is
set, the Play online button stays hidden. For testing, `?online=ws://localhost:8787` on the game's URL also works.
