# Tools

This repo contains pre-rendered sample videos for GitHub Pages.

Future game folders should be generated from parser exports using the same renderer rules:
- `snapshots[n].provinces` is source of truth.
- Use `map/provinces.bmp` and `map/definition.csv` to map pixels to province IDs.
- Use predictive reveal for changed province regions between snapshots.

The full renderer script used to build this sample can be recreated from `PARSER_FORMAT.md` and the project notes; it was not embedded with the large map assets to keep the Pages repo compact.
