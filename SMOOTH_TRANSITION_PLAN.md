# Smooth Predictive Province Transition Plan

Goal: replace fade-only province changes with visually natural front movement.

Algorithm outline:

1. Build province ID raster:
   - Read `provinces.bmp`.
   - Read `definition.csv`.
   - Map every land pixel to a province ID.

2. For each snapshot:
   - Create a province -> faction map from province controller tags.
   - Render exact endpoint frame.

3. Between snapshot A and B:
   - Detect changed provinces where faction(A) != faction(B).
   - Group changed provinces into connected components, preferably by province adjacency or pixel adjacency.
   - Each component has one target faction.

4. For each changed component:
   - Find seed cells/provinces adjacent to target faction in snapshot A.
   - If none, find component edge closest to nearest target-faction region.
   - Run BFS/distance transform through the component.
   - Reveal target colour by increasing distance threshold over transition frames.

5. Ensure endpoint accuracy:
   - Transition frames may interpolate.
   - Actual snapshot frames must exactly match parsed province controller data.

Performance recommendation:

- Precompute province masks or province pixel index arrays.
- Avoid looping over every province and scanning the whole bitmap each frame.
- Use lookup tables: provinceId -> factionIndex, then map the provinceId raster to colour arrays.
