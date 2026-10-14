// Parsers for the HOI4 / FUWG mod files the renderer needs.

// map/definition.csv: id;r;g;b;type;coastal;terrain;continent
export function parseDefinitionCsv(text) {
  const provinces = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(';');
    if (parts.length < 5) continue;
    const id = Number(parts[0]);
    const r = Number(parts[1]), g = Number(parts[2]), b = Number(parts[3]);
    if (!Number.isInteger(id) || [r, g, b].some(v => !Number.isInteger(v))) continue;
    provinces.push({
      id, r, g, b,
      type: (parts[4] || '').trim().toLowerCase(),
      coastal: (parts[5] || '').trim().toLowerCase() === 'true',
      terrain: (parts[6] || '').trim()
    });
  }
  return provinces;
}

// common/countries/colors.txt: TAG = { color = rgb { r g b } ... } (rgb 0-255 or hsv 0-1)
export function parseCountryColors(text) {
  const out = {};
  const clean = text.replace(/#[^\n]*/g, '');
  const re = /\b([A-Z][A-Z0-9]{2})\s*=\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const body = m[2];
    const c = body.match(/(?:^|\s)color\s*=\s*(rgb|hsv|hsv360)?\s*\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\}/i);
    if (!c) continue;
    const kind = (c[1] || 'rgb').toLowerCase();
    let [a, b, d] = [Number(c[2]), Number(c[3]), Number(c[4])];
    let rgb;
    if (kind === 'rgb') rgb = [a, b, d];
    else if (kind === 'hsv360') rgb = hsvToRgb(a / 360, b / 100, d / 100);
    else rgb = hsvToRgb(a, b, d);
    out[m[1]] = '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  return out;
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return [r * 255, g * 255, b * 255];
}

// Parser exports use either 1936-01-25 or 1936.1.25(.13); normalise to YYYY-MM-DD.
export function normaliseDate(value) {
  if (!value) return null;
  const m = String(value).match(/(\d{3,4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (!m) return null;
  return `${m[1].padStart(4, '0')}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function dayNumber(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
