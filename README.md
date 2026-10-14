# FUWG Game Log

GitHub Pages archive of FUWG Hearts of Iron IV multiplayer games, animated from the host's autosaves.

1. During a game the host runs the [FUWG Parser](https://github.com/AzediZ/FUWG-Parser) page, which reads each autosave and exports `gamelog export.zip`.
2. `renderer/build-game.mjs` turns that export into `games/<id>/game.json` and a game page (see [renderer/README.md](renderer/README.md)).
3. The game page animates the map live in the browser: play, scrub, zoom, faction or country colours, and a button to record a video.

`maps/fuwg/` holds the province map the viewer draws from (built once from the base game's map with `renderer/build-map.mjs`).
Older games in `games/` are pre-rendered MP4s from the previous renderer and still play as before.
