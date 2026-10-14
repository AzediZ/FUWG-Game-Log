#!/usr/bin/env node
// Turns a HOI4 mod's map files into the assets the viewer and build-game.mjs use.
//
//   node renderer/build-map.mjs --mod "<FUWG mod folder>" --out maps/fuwg
//
// --mod can be the mod root (containing map/ and common/) or the map/ folder itself.
// Writes:
//   provinces.png       province-ID texture (R = id low byte, G = id high byte, B = 0 land / 1 sea / 2 lake)
//   provinces_half.png  half-resolution copy for devices with small GPU texture limits
//   map.json            size, province count and per-province pixel areas (used for the legend shares)
//   adjacency.json      province neighbours and centroids (build-time only, used for smooth front movement)
//   colors.json         country colours from common/countries/colors.txt, when present
import fs from 'node:fs';
import path from 'node:path';
import { readBmp } from './lib/bmp.mjs';
import { writePngRgb } from './lib/png.mjs';
import { parseDefinitionCsv, parseCountryColors } from './lib/hoi4.mjs';
import { parseArgs } from './lib/args.mjs';

const args = parseArgs(process.argv.slice(2), {
  mod: { required: true, help: 'FUWG mod folder (or its map/ folder)' },
  out: { default: 'maps/fuwg', help: 'output folder' },
  name: { default: 'FUWG', help: 'map display name' },
  colors: { help: 'path to colors.txt (defaults to <mod>/common/countries/colors.txt)' }
});

const modDir = path.resolve(args.mod);
const mapDir = fs.existsSync(path.join(modDir, 'map', 'provinces.bmp')) ? path.join(modDir, 'map') : modDir;
const bmpPath = path.join(mapDir, 'provinces.bmp');
const defPath = path.join(mapDir, 'definition.csv');
for (const p of [bmpPath, defPath]) if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);

console.log(`Reading ${bmpPath}`);
const { width, height, rgb } = readBmp(fs.readFileSync(bmpPath));
const defs = parseDefinitionCsv(fs.readFileSync(defPath, 'latin1'));
console.log(`  ${width}x${height}, ${defs.length} province definitions`);

const TYPE = { land: 0, sea: 1, lake: 2 };
const byColour = new Map();
let maxId = 0;
for (const d of defs) {
  byColour.set((d.r << 16) | (d.g << 8) | d.b, d.id);
  if (d.id > maxId) maxId = d.id;
}
if (maxId > 65535) throw new Error('Province IDs above 65535 are not supported');
const typeOf = new Uint8Array(maxId + 1).fill(TYPE.land);
for (const d of defs) typeOf[d.id] = TYPE[d.type] ?? TYPE.land;

const ids = new Uint16Array(width * height);
const areas = new Uint32Array(maxId + 1);
const sumX = new Float64Array(maxId + 1);
const sumY = new Float64Array(maxId + 1);
let unknownPixels = 0;
const unknownColours = new Map();
for (let i = 0, p = 0; i < ids.length; i++, p += 3) {
  const key = (rgb[p] << 16) | (rgb[p + 1] << 8) | rgb[p + 2];
  const id = byColour.get(key);
  if (id === undefined) {
    unknownPixels++;
    unknownColours.set(key, (unknownColours.get(key) || 0) + 1);
    continue;
  }
  ids[i] = id;
  areas[id]++;
  sumX[id] += i % width;
  sumY[id] += Math.floor(i / width);
}
if (unknownPixels) console.warn(`  [warn] ${unknownPixels} pixels (${unknownColours.size} colours) are not in definition.csv; drawn as sea`);

// Neighbours: compare each pixel with the one to its right (wrapping east-west) and below.
const neighbourSets = Array.from({ length: maxId + 1 }, () => null);
const link = (a, b) => {
  if (a === b || a === 0 || b === 0) return;
  (neighbourSets[a] ||= new Set()).add(b);
  (neighbourSets[b] ||= new Set()).add(a);
};
for (let y = 0; y < height; y++) {
  const row = y * width;
  for (let x = 0; x < width; x++) {
    const a = ids[row + x];
    link(a, ids[row + ((x + 1) % width)]);
    if (y + 1 < height) link(a, ids[row + width + x]);
  }
}

// Encode the province texture.
const out = new Uint8Array(width * height * 3);
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  out[i * 3] = id & 255;
  out[i * 3 + 1] = id >> 8;
  out[i * 3 + 2] = id === 0 ? TYPE.sea : typeOf[id];
}
const hw = Math.floor(width / 2), hh = Math.floor(height / 2);
const half = new Uint8Array(hw * hh * 3);
for (let y = 0; y < hh; y++) {
  for (let x = 0; x < hw; x++) {
    // Prefer land when a 2x2 block mixes land and water, so small islands survive.
    let pick = (y * 2) * width + x * 2;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const j = (y * 2 + dy) * width + x * 2 + dx;
      if (out[j * 3 + 2] === TYPE.land && ids[j] !== 0) { pick = j; break; }
    }
    half.set(out.subarray(pick * 3, pick * 3 + 3), (y * hw + x) * 3);
  }
}

const outDir = path.resolve(args.out);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'provinces.png'), writePngRgb(width, height, out));
fs.writeFileSync(path.join(outDir, 'provinces_half.png'), writePngRgb(hw, hh, half));

const offsets = [0];
const list = [];
const centroids = [];
for (let id = 0; id <= maxId; id++) {
  const s = neighbourSets[id];
  if (s) list.push(...[...s].sort((a, b) => a - b));
  offsets.push(list.length);
  centroids.push(areas[id] ? [Math.round(sumX[id] / areas[id]), Math.round(sumY[id] / areas[id])] : null);
}
fs.writeFileSync(path.join(outDir, 'adjacency.json'), JSON.stringify({ maxId, offsets, neighbours: list, centroids }));

const typesString = Array.from(typeOf, t => 'LSW'[t]).join('');
const mapJson = {
  version: 1,
  name: args.name,
  width,
  height,
  maxId,
  provinceCount: defs.length,
  landProvinces: defs.filter(d => typeOf[d.id] === TYPE.land).length,
  texture: 'provinces.png',
  textureHalf: 'provinces_half.png',
  types: typesString,
  areas: Array.from(areas)
};
fs.writeFileSync(path.join(outDir, 'map.json'), JSON.stringify(mapJson));

const colorsPath = args.colors ? path.resolve(args.colors) : path.join(modDir, 'common', 'countries', 'colors.txt');
if (fs.existsSync(colorsPath)) {
  const colours = parseCountryColors(fs.readFileSync(colorsPath, 'latin1'));
  fs.writeFileSync(path.join(outDir, 'colors.json'), JSON.stringify(colours, null, 1));
  console.log(`  ${Object.keys(colours).length} country colours from ${colorsPath}`);
} else {
  console.log('  no colors.txt found; country-colour mode will use generated colours');
}
console.log(`Wrote map assets to ${outDir}`);
