# Expected parser format

This renderer uses province-level controller data.

Required files in parser export:
- `snapshots_compact.json` or `snapshots.json`
- each snapshot includes `date` and `provinces` object mapping `province_id` to controller tag

Example:
```json
{ "date": "1936-01-04", "provinces": { "1": "ENG", "2": "SOV" } }
```

Controller tag is the source of truth. `NUL` entries are treated as missing and carry forward the last valid controller.
