# HOI4 Game Log Map Archive

Static GitHub Pages site for hosting generated Hearts of Iron IV game-log animations.

## Structure

```text
/
  index.html              Homepage / game selector
  styles.css              Homepage styling
  games/
    games.json            List of available game logs
    2026-05-13/
      index.html          Animation page for that game
      assets/
      parsed_log_events.json
      location_lookup_highlights.json
      location_lookup_victory_points.json
```

## Uploading to GitHub Pages

1. Create a new GitHub repository.
2. Upload everything from this folder to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Set **Source** to **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save, then wait for GitHub Pages to publish.

## Adding a new game log

Each generated game should be placed in its own folder under `games/`, using the game date as the folder name:

```text
games/2026-05-14/
  index.html
  assets/
  parsed_log_events.json
  location_lookup_highlights.json
  location_lookup_victory_points.json
```

Then add an entry to `games/games.json`:

```json
{
  "date": "2026-05-14",
  "title": "FUWG Game Log - 14 May 2026",
  "description": "Short summary shown on the homepage.",
  "path": "games/2026-05-14/",
  "mod": "FUWG",
  "status": "Published"
}
```

The homepage automatically reads `games/games.json` and displays the game cards.

## Notes

This is a fully static site: no backend, database, or build step is required.
