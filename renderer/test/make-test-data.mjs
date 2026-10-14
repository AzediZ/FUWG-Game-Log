#!/usr/bin/env node
// Generates a synthetic HOI4-style map and parser export so the renderer can be tested
// without the FUWG mod files or real saves.
//
//   node renderer/test/make-test-data.mjs --out /tmp/fuwg-test
//
// Writes <out>/mod/map/{provinces.bmp,definition.csv}, <out>/export.zip and <out>/overrides.json.
import fs from 'node:fs';
import path from 'node:path';
import { writeBmp24 } from '../lib/bmp.mjs';
import { writeZip } from '../lib/zip.mjs';
import { parseArgs } from '../lib/args.mjs';

const args = parseArgs(process.argv.slice(2), {
  out: { required: true, help: 'output folder' },
  width: { default: '1408' },
  height: { default: '512' },
  weeks: { default: '120' }
});
const W = Number(args.width), H = Number(args.height), WEEKS = Number(args.weeks);
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// Continents as soft blobs; land where the field is above a threshold.
const blobs = [
  [0.30, 0.32, 0.17, 0.20], [0.42, 0.30, 0.12, 0.14], [0.62, 0.30, 0.20, 0.17], // west, centre, east of a big continent
  [0.80, 0.55, 0.10, 0.18], [0.70, 0.62, 0.08, 0.10],                           // a southern-east continent
  [0.19, 0.22, 0.035, 0.07],                                                     // an island off the west coast
  [0.47, 0.70, 0.10, 0.15]                                                       // a southern continent
];
const landField = (x, y) => {
  let v = 0;
  for (const [cx, cy, rx, ry] of blobs) {
    const dx = (x / W - cx) / rx, dy = (y / H - cy) / ry;
    v = Math.max(v, Math.exp(-(dx * dx + dy * dy)));
  }
  return v + 0.08 * Math.sin(x * 0.05) * Math.cos(y * 0.07) + 0.05 * Math.sin(x * 0.13 + y * 0.11);
};

// Jittered-grid Voronoi provinces with wobbly borders.
const CELL = 16;
const gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL);
const seeds = [];
for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
  const x = (gx + 0.15 + rand() * 0.7) * CELL, y = (gy + 0.15 + rand() * 0.7) * CELL;
  seeds.push({ x, y, land: landField(x, y) > 0.5 });
}
// Sea provinces in HOI4 are large; merge sea cells into 3x3 blocks.
const cellId = new Int32Array(seeds.length);
const defs = [{ id: 0, rgb: [0, 0, 0], type: 'land' }];
const seaBlock = new Map();
const usedColours = new Set(['0,0,0']);
const newColour = () => { for (;;) { const c = [1 + Math.floor(rand() * 254), 1 + Math.floor(rand() * 254), 1 + Math.floor(rand() * 254)]; if (!usedColours.has(c.join())) { usedColours.add(c.join()); return c; } } };
seeds.forEach((s, i) => {
  if (s.land) { cellId[i] = defs.length; defs.push({ id: defs.length, rgb: newColour(), type: 'land' }); return; }
  const key = `${Math.floor((i % gw) / 3)},${Math.floor(Math.floor(i / gw) / 3)}`;
  if (!seaBlock.has(key)) { seaBlock.set(key, defs.length); defs.push({ id: defs.length, rgb: newColour(), type: 'sea' }); }
  cellId[i] = seaBlock.get(key);
});
// One lake.
const lakeIdx = seeds.findIndex(s => s.land && Math.abs(s.x / W - 0.6) < 0.01 && Math.abs(s.y / H - 0.3) < 0.03);
if (lakeIdx >= 0) defs[cellId[lakeIdx]].type = 'lake';

const ids = new Int32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const wx = x + 3 * Math.sin(y * 0.21) , wy = y + 3 * Math.cos(x * 0.19);
  const gx = Math.floor(wx / CELL), gy = Math.floor(wy / CELL);
  let best = -1, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ((gx + dx) % gw + gw) % gw, cy = gy + dy;
    if (cy < 0 || cy >= gh) continue;
    const s = seeds[cy * gw + cx];
    let ddx = Math.abs(s.x - wx); ddx = Math.min(ddx, W - ddx);
    const d = ddx * ddx + (s.y - wy) ** 2;
    if (d < bd) { bd = d; best = cy * gw + cx; }
  }
  ids[y * W + x] = cellId[best];
}
const rgb = new Uint8Array(W * H * 3);
for (let i = 0; i < ids.length; i++) rgb.set(defs[ids[i]].rgb, i * 3);

const modMap = path.join(args.out, 'mod', 'map');
fs.mkdirSync(modMap, { recursive: true });
fs.writeFileSync(path.join(modMap, 'provinces.bmp'), writeBmp24(W, H, rgb));
fs.writeFileSync(path.join(modMap, 'definition.csv'), defs.map(d => `${d.id};${d.rgb.join(';')};${d.type};false;plains;1`).join('\n') + '\n');

// Adjacency and centroids for the simulation.
const adj = defs.map(() => new Set());
const cx = new Float64Array(defs.length), cy = new Float64Array(defs.length), area = new Float64Array(defs.length);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = ids[y * W + x];
  cx[a] += x; cy[a] += y; area[a]++;
  const r = ids[y * W + (x + 1) % W];
  if (r !== a) { adj[a].add(r); adj[r].add(a); }
  if (y + 1 < H) { const d = ids[(y + 1) * W + x]; if (d !== a) { adj[a].add(d); adj[d].add(a); } }
}
const land = defs.filter(d => d.type === 'land' && d.id && area[d.id]).map(d => d.id);
const pos = id => [cx[id] / area[id] / W, cy[id] / area[id] / H];

// Starting owners by region.
const owner = new Map();
for (const id of land) {
  const [x, y] = pos(id);
  let tag;
  if (x < 0.23 && y < 0.35) tag = 'ENG';
  else if (x < 0.33 && y < 0.6) tag = 'FRA';
  else if (x < 0.36) tag = 'SPR';
  else if (x < 0.50 && y < 0.24) tag = 'SWE';
  else if (x < 0.52 && y < 0.55) tag = 'GER';
  else if (x < 0.60 && y > 0.55) tag = 'ITA';
  else if (x < 0.90 && y < 0.48) tag = 'SOV';
  else if (x > 0.76 && y < 0.62) tag = 'JAP';
  else if (x > 0.62 && y >= 0.48) tag = 'CHI';
  else tag = 'ETH';
  owner.set(id, tag);
}
// States: groups of nearby land provinces.
const stateOf = {};
for (const id of land) { const [x, y] = pos(id); stateOf[id] = String(1 + Math.floor(x * 40) + 40 * Math.floor(y * 16)); }

const advance = (from, to, count) => {
  const front = land.filter(id => owner.get(id) === from && [...adj[id]].some(n => owner.get(n) === to));
  for (let i = front.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [front[i], front[j]] = [front[j], front[i]]; }
  for (const id of front.slice(0, count)) owner.set(id, to);
};

const snapshots = [];
const start = Date.UTC(1939, 8, 2);
for (let w = 0; w < WEEKS; w++) {
  if (w >= 2 && w < 22) advance('FRA', 'GER', 9);
  if (w >= 30 && w < 70) advance('SOV', 'GER', 7);
  if (w >= 72 && w < 110) advance('GER', 'SOV', 8);
  if (w >= 5 && w < 90) advance('CHI', 'JAP', 3);
  if (w === 80) { // naval landing by ENG on the west coast
    const coast = land.filter(id => owner.get(id) === 'GER' && pos(id)[0] < 0.27 && [...adj[id]].some(n => defs[n].type === 'sea'));
    if (coast.length) owner.set(coast[0], 'ENG');
  }
  if (w > 80 && w < 115) advance('GER', 'ENG', 5);
  const provinces = Object.fromEntries(land.map(id => [String(id), owner.get(id)]));
  // Parser-style noise: a few one-off speckles.
  for (let k = 0; k < 6; k++) { const id = land[Math.floor(rand() * land.length)]; provinces[id] = ['SOV', 'ENG', 'ITA'][k % 3]; }
  const states = {};
  for (const id of land) states[stateOf[id]] ||= owner.get(id);
  snapshots.push({ date: new Date(start + w * 7 * 86400000).toISOString().slice(0, 10), states, provinces });
}

fs.writeFileSync(path.join(args.out, 'export.zip'), writeZip({
  'snapshots_compact.json': JSON.stringify(snapshots),
  'province_state_map.json': JSON.stringify(stateOf),
  'game.json': JSON.stringify({ title: 'Synthetic test' })
}));
fs.writeFileSync(path.join(args.out, 'overrides.json'), JSON.stringify({
  factions: { SWE: [['1939-01-01', 'neutral'], ['1940-06-01', 'axis']], SPR: 'neutral', ETH: 'allies' }
}, null, 2));
console.log(`Synthetic map ${W}x${H}: ${land.length} land provinces, ${defs.length - 1} total; ${WEEKS} weekly snapshots -> ${args.out}`);
