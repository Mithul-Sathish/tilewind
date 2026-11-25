# Tilewind

A four-player Hong Kong Mahjong game for the browser. Play it at https://mithul-sathish.github.io/tilewind/

`index.html` is the whole game in one file. `source/` holds the parts it is built from; run `python3 build.py` inside `source/` to rebuild.

## Play online (v9)

`source/server/` is the online service: a waiting room that seats four people (computer players fill empty seats after 20 seconds) and tables where the server holds the tiles, so no browser can see another player's hand. It is not running anywhere yet. Run it locally with `node source/server/node-server.js 8799` and build the game with `TW_ONLINE=ws://localhost:8799 python3 build.py`; without `TW_ONLINE` the Online button stays hidden. See `source/server/README.md`.
