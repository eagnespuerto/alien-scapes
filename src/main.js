/**
 * UI wiring.
 *
 * State lives in one plain object. Every change rebuilds the scene from
 * scratch and repaints - the whole model runs in a couple of milliseconds, so
 * there is nothing to be gained from incremental updates and a great deal of
 * clarity to be lost.
 */

import { buildScene, defaultState, stateFromPlanet, MINERALS, PLANET_MINERAL } from './scene.js';
import { GRID_STARS, NAMED_STARS, ALL_STARS, findStar, CLASS_ACCENT } from './stars.js';
import { PLANETS, ATMOSPHERES, HOST_STARS, getPlanet } from './planets.js';
import { PIGMENTS, trapNm } from './pigments.js';
import { renderLandscape, growthFormLabel } from './landscape.js';
import { drawSpectrumChart, drawAbsorptionChart, drawReflectanceChart } from './charts.js';
import { exportPng, exportJpg, exportPdf, exportLandscapeOnly } from './exporter.js';
import { toCss, toHex } from './cie.js';
import { hashString } from './noise.js';

const $ = (id) => document.getElementById(id);

let state = defaultState();
let scene = null;
let activeChart = 'spectrum';

/* ------------------------------------------------------------------ *
 * Populate the static controls
 * ------------------------------------------------------------------ */

function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

function fillSelect(el, items, valueOf, labelOf) {
  el.innerHTML = '';
  for (const it of items) el.appendChild(option(valueOf(it), labelOf(it)));
}

/** Fill a select from [groupLabel, items] pairs, sharing one pair of accessors. */
function fillGrouped(el, groups, valueOf, labelOf) {
  el.innerHTML = '';
  for (const [groupLabel, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = groupLabel;
    for (const it of list) og.appendChild(option(valueOf(it), labelOf(it)));
    el.appendChild(og);
  }
}

function buildControls() {
  fillSelect($('planetSelect'), PLANETS, (p) => p.key, (p) => p.name);
  fillSelect($('atmSelect'), ATMOSPHERES, (a) => a.key, (a) => a.name);
  fillSelect($('mineralSelect'), Object.keys(MINERALS), (k) => k, (k) => MINERALS[k].name);

  // Every star the app knows about, grouped but sharing one value space: the
  // star's name, which is what state.starName holds.
  fillGrouped($('namedSelect'), [
    ['Spectral class grid', GRID_STARS],
    ['Other named stars', NAMED_STARS],
    ['Preset system hosts', Object.values(HOST_STARS)],
  ], (s) => s.name, (s) => `${s.name} (${s.cls}${s.lum}, ${s.teff.toLocaleString()} K)`);

  // Photosystem: families first, then every individual reaction-centre pigment,
  // so a specific hypothesis can be pinned regardless of what wins on score.
  // The 'S:' / 'P:' prefixes keep both kinds in one control.
  fillGrouped($('strategySelect'), [
    ['Let the model choose', [
      { v: 'S:auto', l: 'Best fit (any pigment)' },
      { v: 'S:chlorophyll', l: 'Best chlorophyll-type' },
      { v: 'S:retinal', l: 'Best retinal-type' },
      { v: 'S:nitroplast', l: 'Nitroplast-type' },
    ]],
    ['Pin a reaction centre', PIGMENTS.filter((p) => p.rc).map((p) => ({
      v: 'P:' + p.key, l: `${p.name} (trap ${trapNm(p)} nm)`,
    }))],
  ], (o) => o.v, (o) => o.l);

  // Spectral-class matrix.
  const grid = $('starGrid');
  grid.innerHTML = '';
  for (const s of GRID_STARS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `${s.name}, ${s.cls} ${s.lum}, ${s.teff.toLocaleString()} K. ${s.notes}`;
    b.dataset.star = s.name;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = CLASS_ACCENT[s.cls] || '#fff';
    dot.style.color = CLASS_ACCENT[s.cls] || '#fff';
    const lab = document.createElement('span');
    lab.textContent = s.cls + (s.lum === 'III' ? ' III' : ' V');
    b.append(dot, lab);
    b.addEventListener('click', () => {
      state.starName = s.name;
      state.teffOverride = null;
      update();
    });
    grid.appendChild(b);
  }
}

/* ------------------------------------------------------------------ *
 * Sync controls -> state and state -> controls
 * ------------------------------------------------------------------ */

// The orbital-distance slider is logarithmic: habitable orbits run from a few
// thousandths of an AU around a brown dwarf to hundreds of AU around a
// supergiant, and no linear slider can serve both.
const auFromSlider = (v) => Math.pow(10, Number(v));
const sliderFromAu = (au) => Math.log10(Math.max(1e-3, au));

function readControls() {
  state.atmosphere = $('atmSelect').value;
  state.mineral = $('mineralSelect').value;
  state.distanceAu = round(auFromSlider($('au').value));
  state.water = Number($('water').value);
  state.roughness = Number($('rough').value);
  state.elevation = Number($('elev').value);
  const sv = $('strategySelect').value;
  if (sv.startsWith('S:')) {
    state.strategy = sv.slice(2);
    state.primaryPigment = null;
  } else {
    state.primaryPigment = sv.slice(2);
    state.strategy = 'auto';
  }
}

function round(au) {
  if (au >= 100) return Math.round(au);
  if (au >= 10) return Number(au.toFixed(1));
  if (au >= 1) return Number(au.toFixed(3));
  return Number(au.toPrecision(3));
}

function syncControls() {
  $('planetSelect').value = state.planetKey;
  $('atmSelect').value = state.atmosphere;
  $('mineralSelect').value = state.mineral;
  $('namedSelect').value = state.starName;
  $('au').value = sliderFromAu(state.distanceAu);
  $('water').value = state.water;
  $('rough').value = state.roughness;
  $('elev').value = state.elevation;
  $('seed').value = state.seed;
  $('teff').value = state.teffOverride || scene.star.teff;
  $('strategySelect').value = state.primaryPigment
    ? 'P:' + state.primaryPigment
    : 'S:' + state.strategy;

  for (const b of $('starGrid').children) {
    b.setAttribute('aria-pressed', String(b.dataset.star === state.starName));
  }
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function sizeCanvas(canvas, aspect) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssH = Math.round(cssW / aspect);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function paintScape() {
  const { ctx, w, h } = sizeCanvas($('scape'), 16 / 9);
  renderLandscape(ctx, scene, w, h);
}

function paintChart() {
  // Narrow screens get a taller chart so the legend clears the curves.
  // Keep this in step with the #chart aspect-ratio rule in styles.css.
  const narrow = window.matchMedia('(max-width: 640px)').matches;
  const { ctx, w, h } = sizeCanvas($('chart'), narrow ? 4 / 3 : 5 / 2);
  const extra = [scene.suite.primary.key, ...scene.suite.antennae.map((p) => p.key)];
  if (activeChart === 'spectrum') drawSpectrumChart(ctx, scene, w, h, true);
  else if (activeChart === 'absorption') drawAbsorptionChart(ctx, scene, w, h, true, extra);
  else drawReflectanceChart(ctx, scene, w, h, true);

  $('chartNote').textContent = {
    spectrum: 'Dashed: the spectrum arriving above the atmosphere. Solid warm: what reaches the '
      + 'ground. Solid blue: the same light counted as photons rather than energy. It always peaks '
      + 'redder, because a red photon carries less energy.',
    absorption: 'Retinal, chlorophyll a and the nitroplast antenna are always plotted. Curves in '
      + 'the active suite are solid; the rest are dashed. The white line is the finished leaf, '
      + 'which absorbs far more broadly than any single pigment because tissue scatters light back '
      + 'through itself several times.',
    reflectance: 'The step near the red end is the red edge, the sharpest spectral biosignature we '
      + 'know how to look for. It moves with the pigment suite, so an alien red edge need not sit '
      + 'where Earth’s does.',
  }[activeChart];
}

function chip(label, rgb, hex) {
  return `<div class="patch"><div class="fill" style="background:${toCss(rgb)}"></div>`
    + `<div class="lab">${label}</div><div class="hex">${hex}</div></div>`;
}

function dlRows(pairs) {
  return pairs.map(([k, v, cls]) =>
    `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd>`).join('');
}

function paintReadout() {
  $('swatches').innerHTML = [
    chip('Sky overhead', scene.colors.skyZenith, scene.hex.sky),
    chip('Star', scene.colors.disk, scene.hex.disk),
    chip(`Ground (${scene.mineral.name.toLowerCase()})`, scene.colors.rock, scene.hex.rock),
    chip('Water', scene.colors.water, scene.hex.water),
    chip('Leaves', scene.colors.leaf, scene.hex.leaf),
  ].join('');

  const c = (scene.tempK - 273.15);
  $('readSurface').innerHTML = dlRows([
    ['Equilibrium temp.', `${Math.round(scene.tempK)} K`],
    ['', `${c > -273 ? c.toFixed(0) : '—'} °C`],
    ['Insolation', `${fmt(scene.insolation)} S⊕`],
    ['Surface gravity', `${scene.planet.gravity.toFixed(2)} g`],
    ['Water cover', `${Math.round(scene.water * 100)} %`],
    ['Biome', scene.biome.zone],
  ]);

  $('readLight').innerHTML = dlRows([
    ['Photon flux', `${(scene.parRel * 100).toFixed(1)} % ⊕`],
    ['Photon peak', `${Math.round(scene.peakNm)} nm${scene.peakNm >= 1095 ? '+' : ''}`],
    ['Wien peak', `${Math.round(scene.wienNm)} nm`],
    ['UV fraction', `${(scene.uv * 100).toFixed(1)} %`, scene.uv > 0.12 ? 'warn' : ''],
    ['Air mass', scene.airmass.toFixed(2)],
    ['Angular diameter', `${scene.angDiam.toFixed(2)}°`],
  ]);

  $('readBio').innerHTML = dlRows([
    ['Reaction centre', scene.suite.primary.name.replace(/ \(.*\)/, '')],
    ['Trap', `${trapNm(scene.suite.primary)} nm`],
    ['Antennae', scene.suite.antennae.length
      ? scene.suite.antennae.map((p) => p.name.split(' ')[0]).join(', ') : 'none'],
    ['Photons captured', `${(scene.leaf.captureFraction * 100).toFixed(0)} %`],
    ['Red edge', scene.leaf.redEdgeLabel || '—'],
    ['Cover', scene.biome.vegetated ? `${Math.round(scene.biome.density * 100)} %` : 'none',
      scene.biome.vegetated ? '' : 'warn'],
  ]);

  $('biomeLine').textContent = scene.biome.vegetated
    ? `${scene.biome.zone}. ${scene.biome.blurb} Vegetation here takes the form of ${growthFormLabel(scene).toLowerCase()}.`
    : `${scene.biome.zone}. ${scene.biome.blurb} No vegetation is modelled: ${scene.biome.veto}.`;

  $('pigmentLine').textContent = scene.explanation;

  $('scapeCaption').textContent =
    `${scene.planet.name}, orbiting ${scene.star.name} (${scene.star.teff.toLocaleString()} K) at `
    + `${scene.distanceAu} AU. ${scene.atm.short} atmosphere, star ${Math.round(scene.elevation)}° up. Seed ${scene.seed}.`;

  // Notes under each control.
  $('planetNote').textContent = getPlanet(state.planetKey).notes;
  $('starNote').textContent = state.teffOverride
    ? `Custom temperature. Luminosity and radius are still ${scene.star.name}'s.`
    : scene.star.notes;
  $('atmNote').textContent = scene.atm.description;
  $('mineralNote').textContent = scene.mineral.notes;
  $('strategyNote').textContent = scene.suite.forced
    ? `Pinned. ${scene.suite.primary.notes}`
    : scene.suite.primary.notes;

  // Live outputs.
  $('teffOut').textContent = `${scene.star.teff.toLocaleString()} K`;
  $('elevOut').textContent = `${Math.round(scene.elevation)}°`;
  $('auOut').textContent = `${scene.distanceAu} AU`;
  $('waterOut').textContent = `${Math.round(scene.water * 100)} %`;
  $('roughOut').textContent = scene.roughness.toFixed(2);

  // Habitable-zone bar: a log axis from 0.001 to 1000 AU.
  const pct = (au) => Math.min(100, Math.max(0, ((Math.log10(Math.max(1e-3, au)) + 3) / 6) * 100));
  const bar = $('hzbar');
  bar.querySelector('.hzzone').style.left = pct(scene.hz.inner) + '%';
  bar.querySelector('.hzzone').style.width = Math.max(0.6, pct(scene.hz.outer) - pct(scene.hz.inner)) + '%';
  bar.querySelector('.hzmark').style.left = pct(scene.distanceAu) + '%';

  const inHz = scene.distanceAu >= scene.hz.inner && scene.distanceAu <= scene.hz.outer;
  $('hzNote').textContent =
    `Habitable zone ${scene.hz.inner.toFixed(3)}–${scene.hz.outer.toFixed(3)} AU. `
    + (inHz ? 'This orbit is inside it.' : 'This orbit is outside it.')
    + (scene.hz.extrapolated
      ? ' The Kopparapu fit is only valid for 2600–7200 K, so for this star the bounds are extrapolated.'
      : '');

  // The page accent follows the star.
  document.documentElement.style.setProperty('--accent', scene.hex.disk);
}

/* ------------------------------------------------------------------ *
 * Update cycle
 * ------------------------------------------------------------------ */

function update({ fromControls = false } = {}) {
  if (fromControls) readControls();
  scene = buildScene(state);
  syncControls();
  paintScape();
  paintChart();
  paintReadout();
}

function fmt(v) {
  if (!isFinite(v)) return '∞';
  if (v >= 1000) return v.toExponential(1);
  if (v >= 10) return v.toFixed(1);
  if (v >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

function wire() {
  $('planetSelect').addEventListener('change', (e) => {
    state = stateFromPlanet(e.target.value, state);
    update();
  });

  $('namedSelect').addEventListener('change', (e) => {
    state.starName = e.target.value;
    state.teffOverride = null;
    update();
  });

  for (const id of ['atmSelect', 'mineralSelect', 'strategySelect']) {
    $(id).addEventListener('change', () => update({ fromControls: true }));
  }

  for (const id of ['au', 'water', 'rough', 'elev']) {
    $(id).addEventListener('input', () => update({ fromControls: true }));
  }

  $('teff').addEventListener('input', (e) => {
    state.teffOverride = Number(e.target.value);
    update();
  });
  $('teffReset').addEventListener('click', () => {
    state.teffOverride = null;
    update();
  });

  $('seed').addEventListener('change', (e) => {
    const raw = e.target.value.trim();
    state.seed = /^\d+$/.test(raw) ? Number(raw) % 4294967296 : hashString(raw);
    update();
  });
  $('reseed').addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 4294967296);
    update();
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      activeChart = tab.dataset.chart;
      paintChart();
    });
  }

  const guard = (fn, label) => async () => {
    const s = $('exportStatus');
    s.textContent = `Composing ${label}…`;
    try {
      await fn(scene, state);
      s.textContent = `${label} saved.`;
    } catch (err) {
      s.textContent = `Could not write the ${label}: ${err.message}`;
      console.error(err);
    }
  };
  $('expPng').addEventListener('click', guard(exportPng, 'PNG data sheet'));
  $('expJpg').addEventListener('click', guard(exportJpg, 'JPG data sheet'));
  $('expPdf').addEventListener('click', guard(exportPdf, 'PDF data sheet'));
  $('expScape').addEventListener('click', guard((sc) => exportLandscapeOnly(sc), 'landscape PNG'));

  $('aboutBtn').addEventListener('click', () => $('aboutDlg').showModal());

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { paintScape(); paintChart(); }, 120);
  });
}

buildControls();
wire();
update();
// Canvas text uses the web font; redraw once it has loaded.
if (document.fonts) document.fonts.ready.then(() => { paintScape(); paintChart(); });
