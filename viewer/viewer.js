// FUWG game viewer: animates a game.json built by renderer/build-game.mjs on a WebGL map.
// Each game page is a stub with <div id="app" data-game="game.json"> that loads this module.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D uProv;
uniform usampler2D uState;
uniform sampler2D uColors;
uniform vec2 uMapSize;
uniform vec2 uCanvas;
uniform vec2 uOrigin;
uniform float uScale;
uniform float uProgress;
uniform float uSoft;
uniform float uBorders;
uniform vec3 uSea;
uniform vec3 uLake;
uniform vec3 uWaste;
uniform vec3 uBg;
out vec4 outColor;

ivec2 texel(vec2 m) {
  float x = mod(m.x, uMapSize.x);
  return ivec2(int(x), int(clamp(m.y, 0.0, uMapSize.y - 1.0)));
}
int provAt(vec2 m, out int type) {
  vec4 p = texelFetch(uProv, texel(m), 0);
  ivec3 v = ivec3(p.rgb * 255.0 + 0.5);
  type = v.b;
  return v.r + v.g * 256;
}
uvec4 stateOf(int id) { return texelFetch(uState, ivec2(id & 255, id >> 8), 0); }
vec4 colourOf(uint c) { int i = int(c); return texelFetch(uColors, ivec2(i & 255, i >> 8), 0); }
float blendOf(uvec4 s) { float t = float(s.b) / 255.0; return smoothstep(t - uSoft, t + uSoft, uProgress); }
uint ctrlOf(uvec4 s) { return blendOf(s) >= 0.5 ? s.g : s.r; }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 m = uOrigin + frag * uScale;
  if (m.y < 0.0 || m.y >= uMapSize.y) { outColor = vec4(uBg, 1.0); return; }
  int type;
  int id = provAt(m, type);
  bool land = type == 0 && id != 0;
  vec3 col;
  uint ctrl = 0u;
  if (!land) {
    col = type == 2 ? uLake : uSea;
  } else {
    uvec4 s = stateOf(id);
    float a = blendOf(s);
    vec3 from = s.r == 0u ? uWaste : colourOf(s.r).rgb;
    vec3 to = s.g == 0u ? uWaste : colourOf(s.g).rgb;
    col = mix(from, to, a);
    ctrl = a >= 0.5 ? s.g : s.r;
  }
  if (uBorders > 0.5 && land) {
    float w = uScale;
    float front = 0.0, country = 0.0, coast = 0.0, prov = 0.0;
    float myFaction = colourOf(ctrl).a;
    vec2 dirs[4] = vec2[4](vec2(w, 0.0), vec2(-w, 0.0), vec2(0.0, w), vec2(0.0, -w));
    for (int i = 0; i < 4; i++) {
      int nt;
      int nid = provAt(m + dirs[i], nt);
      if (nid == id) continue;
      if (nt != 0 || nid == 0) { coast = 1.0; continue; }
      uint nc = ctrlOf(stateOf(nid));
      if (nc != ctrl) {
        if (abs(colourOf(nc).a - myFaction) > 0.001) front = 1.0; else country = 1.0;
      } else {
        prov = 1.0;
      }
    }
    float zoomedIn = clamp((0.6 - uScale) / 0.4, 0.0, 1.0);
    col = mix(col, col * 0.86, prov * zoomedIn);
    col = mix(col, col * 0.62, country);
    col = mix(col, col * 0.62, coast * 0.8);
    col = mix(col, vec3(0.04, 0.04, 0.06), front * 0.7);
  }
  outColor = vec4(col, 1.0);
}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPEEDS = [
  { key: 'slow', label: 'Slow', daysPerSecond: 21 },
  { key: 'normal', label: 'Normal', daysPerSecond: 60 },
  { key: 'fast', label: 'Fast', daysPerSecond: 150 }
];

const hexToRgb = hex => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const dayToDate = day => new Date(day * 86400000);
const formatDay = day => {
  const d = dayToDate(Math.floor(day));
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) e.append(c);
  return e;
};

async function main() {
  const root = document.getElementById('app');
  const gameUrl = new URL(root.dataset.game || 'game.json', location.href);
  const ui = buildUi(root);
  try {
    const game = await (await fetch(gameUrl, { cache: 'no-cache' })).json();
    const mapBase = new URL(game.map, gameUrl);
    const map = await (await fetch(new URL('map.json', mapBase))).json();
    document.title = game.title;
    ui.title.textContent = game.title;
    ui.desc.textContent = game.description || '';
    await start(ui, game, map, mapBase);
  } catch (err) {
    console.error(err);
    ui.status.textContent = `Could not load this game: ${err.message}`;
    ui.status.hidden = false;
  }
}

function buildUi(root) {
  const ui = {};
  ui.title = el('h1', { text: 'Loading…' });
  ui.desc = el('p', { class: 'fv-desc' });
  ui.canvas = el('canvas', { class: 'fv-canvas' });
  ui.date = el('strong', { text: '' });
  ui.legend = el('div', { class: 'fv-legend' });
  ui.tip = el('div', { class: 'fv-tip', hidden: '' });
  ui.status = el('div', { class: 'fv-status', text: 'Loading map…' });
  ui.play = el('button', { class: 'fv-play', 'aria-label': 'Play', text: '▶' });
  ui.slider = el('input', { type: 'range', class: 'fv-slider', min: '0', max: '1', step: '1', value: '0', 'aria-label': 'Timeline' });
  ui.speeds = SPEEDS.map(s => el('button', { class: 'fv-chip', 'data-speed': s.key, text: s.label }));
  ui.mode = el('button', { class: 'fv-chip', text: 'Countries' });
  ui.borders = el('button', { class: 'fv-chip', text: 'Borders: on' });
  ui.record = el('button', { class: 'fv-chip', text: 'Record video' });
  ui.full = el('button', { class: 'fv-chip', text: 'Fullscreen' });
  ui.stage = el('div', { class: 'fv-stage' }, [
    ui.canvas,
    el('div', { class: 'fv-date' }, [el('small', { text: 'Current date' }), ui.date]),
    ui.legend,
    ui.tip,
    ui.status
  ]);
  const back = root.dataset.back ? el('a', { class: 'fv-back', href: root.dataset.back, text: '← Back to archive' }) : null;
  root.append(el('div', { class: 'fv' }, [
    el('header', { class: 'fv-head' }, [back, ui.title, ui.desc]),
    ui.stage,
    el('div', { class: 'fv-bar' }, [
      ui.play,
      ui.slider,
      el('div', { class: 'fv-group' }, ui.speeds),
      el('div', { class: 'fv-group' }, [ui.mode, ui.borders, ui.record, ui.full])
    ]),
    el('p', { class: 'fv-hint', text: 'Scroll or pinch to zoom, drag to pan. Space plays and pauses; arrow keys step between saves.' })
  ]));
  return ui;
}

async function start(ui, game, map, mapBase) {
  const gl = ui.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('this browser does not support WebGL 2');

  // ---------- data ----------
  const maxId = map.maxId;
  const frames = [Uint16Array.from(game.initial)];
  for (const flat of game.changes) {
    const next = frames[frames.length - 1].slice();
    for (let i = 0; i < flat.length; i += 3) next[flat[i]] = flat[i + 1];
    frames.push(next);
  }
  const flips = game.changes.map(flat => {
    const m = new Map();
    for (let i = 0; i < flat.length; i += 3) m.set(flat[i], flat[i + 2]);
    return m;
  });
  const days = game.days;
  const firstDay = days[0], lastDay = days[days.length - 1];
  const countryCount = game.countries.length;
  const factionAt = (c, snap) => {
    let f = game.countries[c].faction[0][1];
    for (const [at, idx] of game.countries[c].faction) if (at <= snap) f = idx;
    return f;
  };

  // ---------- textures ----------
  const big = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= map.width;
  const texName = big ? map.texture : map.textureHalf;
  const blob = await (await fetch(new URL(texName, mapBase))).blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const mapW = bitmap.width, mapH = bitmap.height;

  const makeTex = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const provTex = makeTex();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);

  const stateRows = Math.ceil((maxId + 1) / 256);
  const stateData = new Uint16Array(256 * stateRows * 4);
  const stateTex = makeTex();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, 256, stateRows, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, stateData);

  const colourRows = Math.ceil(countryCount / 256);
  const colourData = new Uint8Array(256 * colourRows * 4);
  const colourTex = makeTex();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, colourRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, colourData);

  // ---------- program ----------
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = name => gl.getUniformLocation(prog, name);
  const u = Object.fromEntries(['uProv', 'uState', 'uColors', 'uMapSize', 'uCanvas', 'uOrigin', 'uScale', 'uProgress', 'uSoft', 'uBorders', 'uSea', 'uLake', 'uWaste', 'uBg'].map(n => [n, U(n)]));
  gl.uniform1i(u.uProv, 0);
  gl.uniform1i(u.uState, 1);
  gl.uniform1i(u.uColors, 2);
  gl.uniform2f(u.uMapSize, mapW, mapH);
  const pal = game.palette;
  const rgbf = hex => hexToRgb(hex).map(v => v / 255);
  gl.uniform3fv(u.uSea, rgbf(pal.sea));
  gl.uniform3fv(u.uLake, rgbf(pal.lake));
  gl.uniform3fv(u.uWaste, rgbf(pal.waste));
  gl.uniform3fv(u.uBg, rgbf(pal.background));
  gl.uniform1f(u.uSoft, 0.05);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, provTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, colourTex);

  // ---------- state ----------
  const params = new URLSearchParams(location.search);
  const st = {
    day: firstDay,
    playing: false,
    speed: SPEEDS[1],
    mode: 'factions',
    borders: true,
    loadedSnap: -1,
    loadedColours: '',
    view: null,
    recording: null
  };
  const startParam = params.get('date');
  if (startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam)) {
    const [y, m, d] = startParam.split('-').map(Number);
    st.day = Math.max(firstDay, Math.min(lastDay, Math.round(Date.UTC(y, m - 1, d) / 86400000)));
  }

  const snapAt = day => {
    let lo = 0, hi = days.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (days[mid] <= day) lo = mid; else hi = mid - 1; }
    return lo;
  };

  const uploadTransition = snap => {
    const from = frames[snap];
    const to = frames[Math.min(snap + 1, frames.length - 1)];
    const flip = snap < flips.length ? flips[snap] : null;
    for (let p = 0; p <= maxId; p++) {
      const o = p * 4;
      stateData[o] = from[p];
      stateData[o + 1] = to[p];
      stateData[o + 2] = flip && from[p] !== to[p] ? (flip.get(p) ?? 128) : 0;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, stateRows, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, stateData);
  };

  const uploadColours = snap => {
    const key = `${st.mode}:${st.mode === 'factions' ? snap : ''}`;
    if (key === st.loadedColours) return;
    st.loadedColours = key;
    for (let c = 0; c < countryCount; c++) {
      const f = factionAt(c, snap);
      const hex = st.mode === 'factions' ? game.factions[f].color : game.countries[c].color;
      const [r, g, b] = hexToRgb(hex);
      colourData.set([r, g, b, f], c * 4);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, colourRows, gl.RGBA, gl.UNSIGNED_BYTE, colourData);
  };

  // Faction shares of land area, for the legend.
  const updateLegend = snap => {
    const area = new Float64Array(game.factions.length);
    let total = 0;
    const frame = frames[snap];
    const factionOf = game.countries.map((_, c) => factionAt(c, snap));
    for (let p = 1; p <= maxId; p++) {
      const c = frame[p];
      if (!c) continue;
      const a = map.areas[p] || 0;
      area[factionOf[c]] += a;
      total += a;
    }
    const items = game.factions
      .map((f, i) => ({ ...f, share: total ? area[i] / total : 0 }))
      .filter(f => f.share > 0.0005)
      .sort((a, b) => b.share - a.share);
    ui.legend.replaceChildren(...items.map(f => el('div', { class: 'fv-legend-row' }, [
      el('span', { class: 'fv-swatch', style: `background:${f.color}` }),
      el('span', { class: 'fv-legend-name', text: f.name }),
      el('span', { class: 'fv-legend-share', text: `${(f.share * 100).toFixed(1)}%` })
    ])));
  };

  // ---------- view (pan / zoom) ----------
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const fitScale = () => Math.max(mapW / ui.canvas.width, mapH / ui.canvas.height); // texels per canvas px
  const clampView = () => {
    const v = st.view;
    v.scale = Math.min(fitScale(), Math.max(0.08, v.scale));
    const visibleH = ui.canvas.height * v.scale;
    if (visibleH >= mapH) v.cy = mapH / 2;
    else v.cy = Math.min(mapH - visibleH / 2, Math.max(visibleH / 2, v.cy));
    v.cx = ((v.cx % mapW) + mapW) % mapW;
  };
  const resize = () => {
    const rect = ui.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr()));
    const h = Math.max(1, Math.round(rect.height * dpr()));
    if (w === ui.canvas.width && h === ui.canvas.height && st.view) return;
    const wasFit = !st.view || st.view.scale >= fitScale() * 0.999;
    ui.canvas.width = w;
    ui.canvas.height = h;
    if (!st.view || wasFit) st.view = { cx: mapW / 2, cy: mapH / 2, scale: fitScale() };
    clampView();
    requestDraw();
  };

  // ---------- draw ----------
  let drawQueued = false;
  let lastTime = null;
  const requestDraw = () => {
    if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); }
  };
  const frame = time => {
    drawQueued = false;
    if (st.playing) {
      if (lastTime !== null) st.day += ((time - lastTime) / 1000) * st.speed.daysPerSecond;
      lastTime = time;
      if (st.day >= lastDay) { st.day = lastDay; setPlaying(false); }
    } else {
      lastTime = null;
    }
    render();
    if (st.recording) st.recording.capture();
    if (st.playing) requestDraw();
  };

  const render = () => {
    const snap = snapAt(st.day);
    if (snap !== st.loadedSnap) {
      uploadTransition(snap);
      updateLegend(snap);
      st.loadedSnap = snap;
    }
    uploadColours(snap);
    const span = snap + 1 < days.length ? days[snap + 1] - days[snap] : 1;
    const progress = snap + 1 < days.length ? Math.min(1, (st.day - days[snap]) / span) : 1;
    const v = st.view;
    gl.viewport(0, 0, ui.canvas.width, ui.canvas.height);
    gl.uniform2f(u.uCanvas, ui.canvas.width, ui.canvas.height);
    gl.uniform2f(u.uOrigin, v.cx - (ui.canvas.width / 2) * v.scale, v.cy - (ui.canvas.height / 2) * v.scale);
    gl.uniform1f(u.uScale, v.scale);
    gl.uniform1f(u.uProgress, progress);
    gl.uniform1f(u.uBorders, st.borders ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ui.date.textContent = formatDay(st.day);
    if (document.activeElement !== ui.slider) ui.slider.value = String(Math.round(st.day));
  };

  // ---------- controls ----------
  const setPlaying = on => {
    st.playing = on;
    ui.play.textContent = on ? '❚❚' : '▶';
    ui.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) requestDraw();
  };
  const setSpeed = s => {
    st.speed = s;
    for (const b of ui.speeds) b.classList.toggle('on', b.dataset.speed === s.key);
  };
  const stepSave = dir => {
    const snap = snapAt(st.day);
    const target = dir > 0 ? Math.min(days.length - 1, snap + 1) : (st.day > days[snap] ? snap : Math.max(0, snap - 1));
    st.day = days[target];
    requestDraw();
  };
  ui.slider.min = String(firstDay);
  ui.slider.max = String(lastDay);
  ui.slider.addEventListener('input', () => { st.day = Number(ui.slider.value); requestDraw(); });
  ui.play.addEventListener('click', () => {
    if (!st.playing && st.day >= lastDay) st.day = firstDay;
    setPlaying(!st.playing);
  });
  ui.speeds.forEach((b, i) => b.addEventListener('click', () => setSpeed(SPEEDS[i])));
  setSpeed(SPEEDS[1]);
  ui.mode.addEventListener('click', () => {
    st.mode = st.mode === 'factions' ? 'countries' : 'factions';
    ui.mode.textContent = st.mode === 'factions' ? 'Countries' : 'Factions';
    requestDraw();
  });
  ui.borders.addEventListener('click', () => {
    st.borders = !st.borders;
    ui.borders.textContent = `Borders: ${st.borders ? 'on' : 'off'}`;
    requestDraw();
  });
  ui.full.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else ui.stage.requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => { ui.full.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
  document.addEventListener('keydown', e => {
    if (e.target.closest?.('input,textarea,select')) return;
    if (e.code === 'Space') { e.preventDefault(); ui.play.click(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); stepSave(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); stepSave(-1); }
  });

  // Pan and zoom with mouse, wheel and touch.
  const pointers = new Map();
  let pinch = null;
  const canvasPoint = e => {
    const r = ui.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr()];
  };
  const toMap = ([x, y]) => {
    const v = st.view;
    return [v.cx + (x - ui.canvas.width / 2) * v.scale, v.cy + (y - ui.canvas.height / 2) * v.scale];
  };
  const zoomAt = (pt, factor) => {
    const before = toMap(pt);
    st.view.scale *= factor;
    clampView();
    const after = toMap(pt);
    st.view.cx += before[0] - after[0];
    st.view.cy += before[1] - after[1];
    clampView();
    requestDraw();
  };
  ui.canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(canvasPoint(e), Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
  }, { passive: false });
  ui.canvas.addEventListener('dblclick', e => zoomAt(canvasPoint(e), e.shiftKey ? 2 : 0.5));
  ui.canvas.addEventListener('pointerdown', e => {
    ui.canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, canvasPoint(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    }
  });
  ui.canvas.addEventListener('pointermove', e => {
    const pt = canvasPoint(e);
    if (!pointers.has(e.pointerId)) { showTip(e, pt); return; }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, pt);
    if (pointers.size === 1) {
      st.view.cx -= (pt[0] - prev[0]) * st.view.scale;
      st.view.cy -= (pt[1] - prev[1]) * st.view.scale;
      clampView();
      requestDraw();
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], pinch.dist / dist);
      pinch.dist = dist;
    }
    ui.tip.hidden = true;
  });
  const endPointer = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  ui.canvas.addEventListener('pointerup', endPointer);
  ui.canvas.addEventListener('pointercancel', endPointer);
  ui.canvas.addEventListener('pointerleave', () => { ui.tip.hidden = true; });

  // Hover: who controls the province under the cursor. Uses a CPU copy of the half-size map.
  let pickIds = null;
  let pickLoading = false;
  const loadPick = async () => {
    pickLoading = true;
    const b = await (await fetch(new URL(map.textureHalf, mapBase))).blob();
    const bm = await createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(bm.width, bm.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bm, 0, 0);
    const px = ctx.getImageData(0, 0, bm.width, bm.height).data;
    const ids = new Uint16Array(bm.width * bm.height);
    for (let i = 0; i < ids.length; i++) ids[i] = px[i * 4 + 2] === 0 ? px[i * 4] | (px[i * 4 + 1] << 8) : 0;
    pickIds = { ids, w: bm.width, h: bm.height };
  };
  const showTip = (e, pt) => {
    if (e.pointerType !== 'mouse') return;
    if (!pickIds) { if (!pickLoading) loadPick().catch(() => {}); return; }
    const [mx, my] = toMap(pt);
    const sx = pickIds.w / mapW;
    const x = Math.floor((((mx % mapW) + mapW) % mapW) * sx), y = Math.floor(my * sx);
    if (y < 0 || y >= pickIds.h) { ui.tip.hidden = true; return; }
    const id = pickIds.ids[y * pickIds.w + x];
    const snap = snapAt(st.day);
    const c = id ? frames[snap][id] : 0;
    if (!c) { ui.tip.hidden = true; return; }
    const country = game.countries[c];
    const faction = game.factions[factionAt(c, snap)];
    ui.tip.textContent = `${country.name || country.tag} · ${faction.name}`;
    const r = ui.stage.getBoundingClientRect();
    ui.tip.style.left = `${e.clientX - r.left + 14}px`;
    ui.tip.style.top = `${e.clientY - r.top + 14}px`;
    ui.tip.hidden = false;
  };

  // Recording: replays the whole game into a video file with the date and legend drawn in.
  ui.record.addEventListener('click', () => {
    if (st.recording) { st.recording.stop(); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      alert('Recording needs a browser with MediaRecorder support, such as Chrome or Edge.');
      return;
    }
    st.recording = startRecording();
  });
  const startRecording = () => {
    const rec = document.createElement('canvas');
    rec.width = ui.canvas.width - (ui.canvas.width % 2);
    rec.height = ui.canvas.height - (ui.canvas.height % 2);
    const ctx = rec.getContext('2d');
    const stream = rec.captureStream(60);
    const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16_000_000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${game.id}-${st.speed.key}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    st.day = firstDay;
    ui.record.textContent = 'Stop recording';
    ui.record.classList.add('rec');
    recorder.start(1000);
    setPlaying(true);
    const s = rec.width / 1400;
    const handle = {
      capture() {
        ctx.drawImage(ui.canvas, 0, 0, rec.width, rec.height);
        drawOverlay(ctx, s);
        if (!st.playing) handle.stop();
      },
      stop() {
        if (handle.done) return;
        handle.done = true;
        st.recording = null;
        setPlaying(false);
        ui.record.textContent = 'Record video';
        ui.record.classList.remove('rec');
        setTimeout(() => recorder.stop(), 300);
      }
    };
    return handle;
  };
  const drawOverlay = (ctx, s) => {
    const pad = 18 * s;
    ctx.fillStyle = 'rgba(4,6,10,0.82)';
    roundRect(ctx, pad, pad, 210 * s, 62 * s, 14 * s);
    ctx.fillStyle = '#b7bcc8';
    ctx.font = `${11 * s}px Inter, Arial, sans-serif`;
    ctx.fillText('CURRENT DATE', pad + 14 * s, pad + 22 * s);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${22 * s}px Inter, Arial, sans-serif`;
    ctx.fillText(formatDay(st.day), pad + 14 * s, pad + 49 * s);
    const rows = [...ui.legend.children];
    if (!rows.length) return;
    const lh = 22 * s, w = 230 * s, h = rows.length * lh + 16 * s;
    const x = ctx.canvas.width - w - pad, y = ctx.canvas.height - h - pad;
    ctx.fillStyle = 'rgba(4,6,10,0.82)';
    roundRect(ctx, x, y, w, h, 12 * s);
    ctx.font = `${13 * s}px Inter, Arial, sans-serif`;
    rows.forEach((row, i) => {
      const [sw, name, share] = row.children;
      const ry = y + 8 * s + i * lh;
      ctx.fillStyle = sw.style.background;
      ctx.fillRect(x + 12 * s, ry + 5 * s, 12 * s, 12 * s);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(name.textContent, x + 32 * s, ry + 16 * s);
      ctx.textAlign = 'right';
      ctx.fillText(share.textContent, x + w - 12 * s, ry + 16 * s);
      ctx.textAlign = 'left';
    });
  };
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };

  new ResizeObserver(resize).observe(ui.canvas);
  resize();
  ui.status.hidden = true;
  requestDraw();
  window.fuwgViewer = { st, requestDraw, setPlaying, game };
}

main();
