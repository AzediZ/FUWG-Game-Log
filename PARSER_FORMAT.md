# Province Parser Format

Confirmed using `gamelog export(18).zip`.

- Parser version: `v23-full-province-snapshots-fuwg-states`
- Snapshots: `15`
- Province source of truth: `snapshots[n].provinces`
- States are fallback/debug only.

Expected snapshot object:

```json
{
  "date": "1936-01-04",
  "file": "autosave_2.hoi4",
  "states": { "1": "FRA" },
  "provinces": { "1234": "GER" },
  "provinceOverrides": {}
}
```

Renderer rules:

1. Use province controller per snapshot.
2. Convert controller tag to faction colour.
3. Colour province pixels using `provinces.bmp` + `definition.csv`.
4. Between snapshots, reveal changed province regions with predictive movement from neighbouring target territory rather than fading.
