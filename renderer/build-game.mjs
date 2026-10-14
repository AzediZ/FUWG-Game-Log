#!/usr/bin/env node
// Builds one game for the archive from a parser export and the prepared map.
//
//   node renderer/build-game.mjs --export "gamelog export.zip" --id 15-06-2026 --title "15-06-2026"
//
// Reads snapshots (one per autosave) from the export, cleans one-off speckles, works out the
// order provinces flip in between saves so fronts sweep instead of popping, and writes
//   games/<id>/game.json   compact timeline the viewer animates
//   games/<id>/index.html  the game page
// then adds or updates the game in games/games.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib/zip.mjs';
import { normaliseDate, dayNumber } from './lib/hoi4.mjs';
import { parseArgs } from './lib/args.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2), {
  export: { required: true, help: 'parser export zip, or a folder containing its files' },
  id: { required: true, help: 'game folder name, e.g. 15-06-2026' },
  title: { help: 'title shown in the archive (defaults to the id)' },
  description: { default: '', help: 'one-line description for the archive card' },
  map: { default: 'maps/fuwg', help: 'map folder made by build-map.mjs' },
  factions: { default: 'faction_map.json', help: 'tag -> faction mapping' },
  overrides: { help: 'per-game JSON with faction changes over time (see renderer/README.md)' },
  source: { default: 'provinces', help: '"provinces" (front lines inside states) or "states" (whole states only)' },
  despeckle: { flag: true, default: true, help: 'drop one-off isolated province flips (use --no-despeckle to keep them)' },
  'speckle-window': { default: '3', help: 'a lone flip that reverts within this many saves counts as a speckle' },
  site: { default: SITE, help: 'archive repo root' }
});

const site = path.resolve(args.site);
const mapDir = path.resolve(site, args.map);
const mapJson = JSON.parse(fs.readFileSync(path.join(mapDir, 'map.json'), 'utf8'));
const adjacency = JSON.parse(fs.readFileSync(path.join(mapDir, 'adjacency.json'), 'utf8'));
const maxId = mapJson.maxId;
const isLand = id => id > 0 && id <= maxId && mapJson.types[id] === 'L' && mapJson.areas[id] > 0;
const neighbours = id => adjacency.neighbours.slice(adjacency.offsets[id], adjacency.offsets[id + 1]);

// ---------- load the export ----------
function loadExport(p) {
  const files = new Map();
  const abs = path.resolve(p);
  if (fs.statSync(abs).isDirectory()) {
    for (const name of fs.readdirSync(abs)) files.set(name, () => fs.readFileSync(path.join(abs, name)));
  } else {
    for (const [name, read] of readZip(fs.readFileSync(abs))) files.set(path.basename(name), read);
  }
  const json = name => (files.has(name) ? JSON.parse(files.get(name)().toString('utf8')) : null);
  let snaps = json('snapshots_compact.json') || json('snapshots.json');
  if (!snaps) throw new Error('Export has no snapshots_compact.json or snapshots.json');
  if (!Array.isArray(snaps)) snaps = snaps.snapshots;
  return { snapshots: snaps, provinceStateMap: json('province_state_map.json') };
}

const { snapshots: rawSnapshots, provinceStateMap } = loadExport(args.export);
const validTag = t => typeof t === 'string' && /^[A-Z0-9_]{3}$/.test(t) && t !== 'NUL';

const byDate = new Map();
let undated = 0;
for (const s of rawSnapshots) {
  const date = normaliseDate(s.date);
  if (!date) { undated++; continue; }
  byDate.set(date, s); // later saves for the same day win
}
const dates = [...byDate.keys()].sort();
if (dates.length < 2) throw new Error(`Need at least 2 dated snapshots, found ${dates.length}`);
if (undated) console.warn(`[warn] skipped ${undated} snapshot(s) without a date`);

// state -> provinces, for --source states
let stateProvinces = null;
if (args.source === 'states') {
  if (!provinceStateMap) throw new Error('--source states needs province_state_map.json in the export');
  stateProvinces = new Map();
  for (const [pid, sid] of Object.entries(provinceStateMap)) {
    if (!stateProvinces.has(String(sid))) stateProvinces.set(String(sid), []);
    stateProvinces.get(String(sid)).push(Number(pid));
  }
}

const countryIndex = new Map([['', 0]]);
const countryTags = [''];
const idx = tag => {
  if (!validTag(tag)) return 0;
  if (!countryIndex.has(tag)) { countryIndex.set(tag, countryTags.length); countryTags.push(tag); }
  return countryIndex.get(tag);
};

const frames = dates.map(date => {
  const s = byDate.get(date);
  const arr = new Uint16Array(maxId + 1);
  if (stateProvinces) {
    for (const [sid, tag] of Object.entries(s.states || {})) {
      const c = idx(tag);
      for (const pid of stateProvinces.get(String(sid)) || []) if (isLand(pid)) arr[pid] = c;
    }
  } else {
    for (const [pid, tag] of Object.entries(s.provinces || {})) {
      const id = Number(pid);
      if (isLand(id)) arr[id] = idx(tag);
    }
  }
  return arr;
});

// Carry the last known controller forward when a save is missing a province entirely.
for (let f = 1; f < frames.length; f++) {
  const prev = frames[f - 1], cur = frames[f];
  for (let p = 1; p <= maxId; p++) if (cur[p] === 0 && prev[p] !== 0) cur[p] = prev[p];
}

// ---------- despeckle ----------
let speckles = 0;
if (args.despeckle) {
  const window = Math.max(1, Number(args['speckle-window']) || 3);
  for (let f = 1; f < frames.length; f++) {
    const before = frames[f - 1], cur = frames[f];
    for (let p = 1; p <= maxId; p++) {
      const c = cur[p];
      if (c === before[p] || c === 0) continue;
      if (neighbours(p).some(q => cur[q] === c)) continue; // touches its new owner's territory: real
      let revertAt = -1;
      for (let k = f + 1; k < Math.min(frames.length, f + 1 + window); k++) {
        if (frames[k][p] === before[p]) { revertAt = k; break; }
        if (frames[k][p] !== c) break;
      }
      if (revertAt < 0) continue; // isolated but it sticks: naval invasion, paradrop, island
      for (let k = f; k < revertAt; k++) frames[k][p] = before[p];
      speckles++;
    }
  }
}

// ---------- flip order between saves ----------
// A province changing hands flips earlier the closer it is to land its new owner already held,
// measured in province hops, so an advance spreads outwards from the old front line.
let seed = 1234567;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const changes = [];
let totalChanges = 0;
for (let f = 0; f + 1 < frames.length; f++) {
  const a = frames[f], b = frames[f + 1];
  const changed = [];
  for (let p = 1; p <= maxId; p++) if (a[p] !== b[p]) changed.push(p);
  const level = new Map();
  const queue = [];
  for (const p of changed) {
    if (neighbours(p).some(q => a[q] === b[p] && a[q] !== 0)) { level.set(p, 0); queue.push(p); }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    for (const q of neighbours(p)) {
      if (!level.has(q) && a[q] !== b[q] && b[q] === b[p]) { level.set(q, level.get(p) + 1); queue.push(q); }
    }
  }
  let maxLevel = 0;
  for (const v of level.values()) maxLevel = Math.max(maxLevel, v);
  const flat = [];
  for (const p of changed) {
    // Landings and other unconnected gains appear part way through the interval.
    const l = level.has(p) ? level.get(p) + (rand() - 0.5) * 0.6 : maxLevel * 0.35;
    const t = Math.max(0.02, Math.min(0.98, (l + 1) / (maxLevel + 2)));
    flat.push(p, b[p], Math.round(t * 255));
  }
  totalChanges += changed.length;
  changes.push(flat);
}

// ---------- factions and colours ----------
const factionDefaults = [
  { key: 'allies', name: 'Allies', color: '#5a86cd' },
  { key: 'axis', name: 'Axis', color: '#2b2b2d' },
  { key: 'comintern', name: 'Comintern', color: '#bf3e3e' },
  { key: 'geacps', name: 'Co-Prosperity Sphere', color: '#846c3f' },
  { key: 'neutral', name: 'Neutral', color: '#7a8088' }
];
const readJson = p => JSON.parse(fs.readFileSync(path.resolve(site, p), 'utf8'));
const baseFactions = fs.existsSync(path.resolve(site, args.factions)) ? readJson(args.factions) : {};
const overrides = args.overrides ? JSON.parse(fs.readFileSync(path.resolve(args.overrides), 'utf8')) : {};
const factions = factionDefaults.map(f => ({ ...f, ...(overrides.palette?.[f.key] ? { color: overrides.palette[f.key] } : {}) }));
for (const [key, def] of Object.entries(overrides.extraFactions || {})) factions.push({ key, name: def.name || key, color: def.color || '#999999' });
const factionIdx = new Map(factions.map((f, i) => [f.key, i]));

// A dated faction change applies from the first save on or after that date.
const snapshotAt = date => {
  const d = normaliseDate(date);
  const i = dates.findIndex(x => x >= d);
  return i < 0 ? dates.length : i;
};

const unknownTags = [];
let mapColours = {};
if (fs.existsSync(path.join(mapDir, 'colors.json'))) mapColours = JSON.parse(fs.readFileSync(path.join(mapDir, 'colors.json'), 'utf8'));
const hashColour = tag => {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360, sat = 45 + (h >> 9) % 25, light = 42 + (h >> 17) % 18;
  const a = sat / 100 * Math.min(light / 100, 1 - light / 100);
  const fn = n => { const k = (n + hue / 30) % 12; return Math.round(255 * (light / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [fn(0), fn(8), fn(4)].map(v => v.toString(16).padStart(2, '0')).join('');
};

const countries = countryTags.map(tag => {
  if (!tag) return { tag: '', color: '#000000', faction: [[0, factionIdx.get('neutral')]] };
  const rule = overrides.factions?.[tag] ?? baseFactions[tag];
  let timeline;
  if (Array.isArray(rule)) {
    timeline = rule.map(([date, key]) => [snapshotAt(date), factionIdx.get(key)]).filter(([, i]) => i !== undefined).sort((x, y) => x[0] - y[0]);
    if (!timeline.length || timeline[0][0] !== 0) timeline.unshift([0, factionIdx.get('neutral')]);
  } else if (rule && factionIdx.has(rule)) {
    timeline = [[0, factionIdx.get(rule)]];
  } else {
    unknownTags.push(tag);
    timeline = [[0, factionIdx.get('neutral')]];
  }
  return { tag, color: mapColours[tag] || hashColour(tag), faction: timeline };
});
if (unknownTags.length) console.warn(`[warn] no faction for ${unknownTags.join(', ')}; shown as neutral. Add them to ${args.factions} or the overrides file.`);

// ---------- write ----------
const gameDir = path.join(site, 'games', args.id);
fs.mkdirSync(gameDir, { recursive: true });
const mapRel = path.relative(gameDir, mapDir).split(path.sep).join('/') + '/';
const title = args.title || args.id;
const game = {
  version: 1,
  id: args.id,
  title,
  description: args.description,
  map: mapRel,
  dates,
  days: dates.map(dayNumber),
  palette: { sea: '#1b4386', lake: '#24508f', waste: '#3a3d43', background: '#0b1020', ...(overrides.palette?.map || {}) },
  factions,
  countries,
  initial: Array.from(frames[0]),
  changes,
  stats: { snapshots: dates.length, provinceChanges: totalChanges, speckles, unknownTags, source: args.source }
};
fs.writeFileSync(path.join(gameDir, 'game.json'), JSON.stringify(game));

const viewerRel = path.relative(gameDir, path.join(site, 'viewer')).split(path.sep).join('/');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
fs.writeFileSync(path.join(gameDir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${viewerRel}/viewer.css">
</head>
<body>
<div id="app" data-game="game.json" data-back="../../index.html"></div>
<script type="module" src="${viewerRel}/viewer.js"></script>
</body>
</html>
`);

const listPath = path.join(site, 'games', 'games.json');
const list = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : [];
const entry = {
  date: args.id,
  title,
  description: args.description,
  path: `games/${args.id}/index.html`,
  mod: 'FUWG',
  status: 'Published',
  startDate: dates[0],
  endDate: dates[dates.length - 1],
  renderer: 'live'
};
const at = list.findIndex(g => g.path === entry.path);
if (at >= 0) list[at] = { ...list[at], ...entry }; else list.push(entry);
fs.writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');

const kb = Math.round(fs.statSync(path.join(gameDir, 'game.json')).size / 1024);
console.log(`Built games/${args.id}: ${dates.length} saves ${dates[0]} -> ${dates[dates.length - 1]}, ${totalChanges} province changes, ${speckles} speckles removed, ${countryTags.length - 1} countries, game.json ${kb} KB`);
