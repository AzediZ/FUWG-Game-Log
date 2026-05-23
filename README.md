# HOI4 Province-Based Animator

GitHub Pages-ready province animator repo.

## Current renderer

- Province-based rendering using `snapshots[n].provinces` as the source of truth.
- Smooth predictive border movement between snapshots.
- Multi-speed video output: slow, normal, fast.
- Static GitHub Pages archive structure.

## Importing future games

Add a folder under `games/DD-MM-YYYY/` with an `index.html` and `assets/frontline_transition_*.mp4`, then add the entry to `games/games.json`.

Parser exports should include:
- `game.json`
- `snapshots.json`
- `province_controller_timeline.json`
- `province_state_map.json`
- `parse_diagnostics.json`

Province source of truth: `snapshots[n].provinces[province_id] = controller_tag`.
