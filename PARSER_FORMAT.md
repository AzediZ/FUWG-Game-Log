# Province Parser Format Notes

Confirmed from `gamelog export(18).zip`:

- Parser version: `v23-full-province-snapshots-fuwg-states`
- Snapshot count: 15
- State count: 1,046
- Province count: 10,240
- Province controller data exists and should be the renderer source of truth.

The animator should primarily read province controller data from the parser export.

Expected fields/concepts:

- `province_controller_timeline.json`
- `province_state_map.json`
- snapshots array
- each snapshot contains game date and province controller mapping
- `provinceOverrides` may be present

Recommended normalized in-memory shape:

```js
{
  gameDate: '1936.1.4.13',
  provinceControllers: Map<provinceId, controllerTag>
}
```

Renderer should not rely on state owner/controller except as a debug fallback.
