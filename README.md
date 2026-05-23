# HOI4 Province Animator

GitHub Pages-ready province-based HOI4 game-log animator.

## Included sample

- `games/22-05-2026/`
- Source parser export: `gamelog export(18).zip`
- Parser version: `v23-full-province-snapshots-fuwg-states`
- 15 snapshots
- 10,240 provinces
- Province controller data is the render source of truth.

## Rendering method

The sample uses exact province-controller endpoint frames and predictive transition distance maps.

Between snapshots, provinces that change faction are revealed by frontier expansion rather than fading. Parsed snapshot endpoints remain exact.

## Publish

Upload the repo contents to GitHub Pages. `.nojekyll` is included.
