Import the folder `16-05-2026` into your repo's `games/` directory and merge/update `games/games.json`.
Render logic: explicit controller wins each snapshot; missing/NUL uses last known non-NUL controller; never-seen states are seeded from default owner; Finnish Winter War fallback returns missing SOV-held Finnish states to FIN.
