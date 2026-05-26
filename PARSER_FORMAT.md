# Parser format

Expected province parser input:

- `snapshots.json` as a list of snapshots
- each snapshot has `date` and `provinces`
- `provinces` is an object mapping province ID to controller tag

Example:

```json
{
  "date": "1936-01-04",
  "provinces": { "1": "FRA", "2": "GER" }
}
```

The province controller is the source of truth.
