# Renderer

Turns a parser export (`gamelog export.zip`) into an animated map page for the archive.
Instead of pre-rendered MP4s, each game ships one small `game.json` and the page animates it live
in the browser (WebGL): play/pause, scrubbing, Slow/Normal/Fast, zoom and pan, faction or country
colours, borders, a faction-share legend, and a **Record video** button for an MP4/WebM to upload.

Everything runs on plain Node 18+ with no npm packages.

## One-time: build the map

FUWG uses the base game's province map, so point `--mod` at the HOI4 install's `map` folder and
`--colors` at FUWG's country colours:

```sh
node renderer/build-map.mjs \
  --mod "C:/Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV/map" \
  --colors "C:/Program Files (x86)/Steam/steamapps/workshop/content/394360/3000971521/common/countries/colors.txt" \
  --out maps/fuwg
```

This writes `maps/fuwg/` (province texture, areas, neighbours, colours). Rebuild it only if the map changes.

## Each game

```sh
node renderer/build-game.mjs --export "gamelog export.zip" --id 15-06-2026 \
  --title "15-06-2026" --description "Weekly autosaves, 1936-1943" \
  --overrides games/15-06-2026/overrides.json
```

This writes `games/<id>/game.json` and `games/<id>/index.html`, and adds the game to `games/games.json`.
Commit those and push; GitHub Pages serves the result.

Options worth knowing:

| Option | What it does |
| --- | --- |
| `--source states` | Colour whole states from state control only (no fronts inside states). Use if a parser export's province data is noisy. |
| `--no-despeckle` | Keep one-off isolated province flips. By default a lone province that flips and reverts within 3 saves is dropped. |
| `--speckle-window N` | How many saves a lone flip may last before it counts as real. |
| `--factions file.json` | Base tag → faction map (default `faction_map.json`). |

## Faction overrides

Countries change sides. Per game, put the exceptions in an overrides file:

```json
{
  "factions": {
    "FIN": [["1936-01-01", "axis"], ["1942-04-12", "comintern"]],
    "ARG": "axis",
    "PER": "comintern"
  },
  "palette": { "allies": "#5a86cd" }
}
```

A dated list switches the country's faction from the first save on or after each date. Tags with no
faction anywhere are drawn as Neutral and listed in a warning when you build.

## How the animation works

- `snapshots[n].provinces` from the export is the source of truth: one controller per land province per save.
- Between two saves, each province that changes hands flips at a time based on how many provinces
  away it is from land its new owner already held, so an advance spreads out from the old front
  instead of popping in all at once. Unconnected gains (landings, paradrops) appear part way through.
- Dates play back on a real calendar, so a missed autosave shows as a longer interval rather than a jump.

## Testing without real data

```sh
node renderer/test/make-test-data.mjs --out /tmp/fuwg-test
node renderer/build-map.mjs --mod /tmp/fuwg-test/mod --out /tmp/fuwg-site/maps/test
node renderer/build-game.mjs --site /tmp/fuwg-site --map maps/test --export /tmp/fuwg-test/export.zip \
  --overrides /tmp/fuwg-test/overrides.json --id demo
```

`--site` must contain a `viewer/` folder (copy or symlink this repo's) to open the page.
