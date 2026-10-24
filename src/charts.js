/**
 * Canvas chart rendering: the surface spectrum and the pigment absorption
 * curves.
 *
 * These are drawn on canvas rather than as SVG for one reason - the export
 * sheet needs to composite them next to the landscape at print resolution, and
 * a canvas redraws at any size without a rasterisation step.
 */

import {
  LAMBDA, LAMBDA_MIN, LAMBDA_MAX, wavelengthToRgb, toCss, mixRgb,
} from './cie.js';
import { PIGMENTS, PIGMENT_BY_KEY, pigmentCurve, trapNm } from './pigments.js';

const PAD = { l: 54, r: 16, t: 30, b: 40 };

/** Map a wavelength to an x pixel. */
function xOf(nm, w) {
  const t = (nm - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN);
  return PAD.l + t * (w - PAD.l - PAD.r);
}

/** Map a 0-1 value to a y pixel. */
function yOf(v, h) {
  return h - PAD.b - v * (h - PAD.t - PAD.b);
}

function theme(dark) {
  return dark
    ? { fg: '#e8e6e3', dim: '#9a968f', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.25)', bg: 'transparent' }
    : { fg: '#1d1c1a', dim: '#5f5b55', grid: 'rgba(0,0,0,0.08)', axis: 'rgba(0,0,0,0.25)', bg: 'transparent' };
}

/** Shared frame: spectral colour strip along the bottom, grid, axes, labels. */
function drawFrame(ctx, w, h, t, opts) {
  const { yLabel, yTicks = [0, 0.25, 0.5, 0.75, 1], yFormat = (v) => v.toFixed(2) } = opts;

  // Wavelength colour strip - the x axis IS the spectrum, so label it that way.
  const stripH = 9;
  const stripY = h - PAD.b + 8;
  for (let nm = LAMBDA_MIN; nm <= LAMBDA_MAX; nm += 2) {
    const x0 = xOf(nm, w), x1 = xOf(nm + 2, w);
    ctx.fillStyle = toCss(wavelengthToRgb(nm));
    ctx.fillRect(x0, stripY, x1 - x0 + 1, stripH);
  }
  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD.l + 0.5, stripY + 0.5, w - PAD.l - PAD.r - 1, stripH);

  // Grid and y ticks.
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yTicks) {
    const y = yOf(v, h);
    ctx.strokeStyle = t.grid;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y + 0.5);
    ctx.lineTo(w - PAD.r, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = t.dim;
    ctx.fillText(yFormat(v), PAD.l - 8, y);
  }

  // Wavelength ticks.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let nm = 300; nm <= 1100; nm += 100) {
    const x = xOf(nm, w);
    ctx.strokeStyle = t.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, PAD.t);
    ctx.lineTo(x + 0.5, h - PAD.b);
    ctx.stroke();
    ctx.fillStyle = t.dim;
    ctx.fillText(String(nm), x, stripY + stripH + 4);
  }

  // Visible-band bracket, so the eye knows which part of this we can see.
  const vx0 = xOf(380, w), vx1 = xOf(780, w);
  ctx.strokeStyle = t.axis;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(vx0 + 0.5, PAD.t); ctx.lineTo(vx0 + 0.5, h - PAD.b);
  ctx.moveTo(vx1 + 0.5, PAD.t); ctx.lineTo(vx1 + 0.5, h - PAD.b);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = t.dim;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '11px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('UV', xOf(320, w) - 8, PAD.t - 8);
  ctx.fillText('visible', vx0 + 6, PAD.t - 8);
  ctx.fillText('near-IR', vx1 + 6, PAD.t - 8);

  if (yLabel) {
    ctx.save();
    ctx.translate(14, (h - PAD.b + PAD.t) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = t.dim;
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

function plotLine(ctx, w, h, values, scale, style, width = 2, dash = null) {
  ctx.save();
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < LAMBDA.length; i++) {
    const x = xOf(LAMBDA[i], w);
    const y = yOf(Math.min(1.02, values[i] * scale), h);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Spectrum chart
 * ------------------------------------------------------------------ */

/**
 * The light arriving at the surface.
 *
 * Two curves matter here and they are genuinely different: the ENERGY spectrum
 * (what a thermometer feels) and the PHOTON flux (what photosynthesis counts).
 * The photon curve always peaks at a longer wavelength than the energy curve,
 * because a red photon carries less energy - which is precisely why the two
 * are plotted together.
 */
export function drawSpectrumChart(ctx, scene, w, h, dark = true) {
  const t = theme(dark);
  ctx.clearRect(0, 0, w, h);

  const maxTop = Math.max(...scene.toa.energy);
  const maxAll = Math.max(maxTop, ...scene.light.energy) || 1;
  const scaleE = 1 / maxAll;
  const maxP = Math.max(...scene.light.photon) || 1;

  // Fill under the surface energy curve with the spectrum's own colours.
  for (let i = 0; i < LAMBDA.length - 1; i++) {
    const x0 = xOf(LAMBDA[i], w), x1 = xOf(LAMBDA[i + 1], w);
    const y = yOf(Math.min(1, scene.light.energy[i] * scaleE), h);
    ctx.fillStyle = toCss(wavelengthToRgb(LAMBDA[i]), 0.30);
    ctx.fillRect(x0, y, x1 - x0 + 1, h - PAD.b - y);
  }

  drawFrame(ctx, w, h, t, {
    yLabel: 'relative flux',
    yFormat: (v) => v.toFixed(1),
  });

  // Top of atmosphere, then what survives to the ground: the gap between them
  // is the atmosphere's bite.
  plotLine(ctx, w, h, scene.toa.energy, scaleE, dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)', 1.5, [5, 4]);
  plotLine(ctx, w, h, scene.light.energy, scaleE, dark ? '#ffd8a8' : '#b35c00', 2.2);
  plotLine(ctx, w, h, scene.light.photon, 1 / maxP, dark ? '#74c0fc' : '#1864ab', 2.2);

  // Mark where the photons actually peak.
  const px = xOf(scene.peakNm, w);
  ctx.strokeStyle = dark ? 'rgba(116,192,252,0.7)' : 'rgba(24,100,171,0.7)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(px + 0.5, PAD.t); ctx.lineTo(px + 0.5, h - PAD.b);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = t.fg;
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = px > w * 0.7 ? 'right' : 'left';
  ctx.fillText(
    `photon peak ${Math.round(scene.peakNm)} nm` + (scene.peakNm >= 1095 ? ' (beyond chart)' : ''),
    px + (px > w * 0.7 ? -6 : 6), PAD.t + 12
  );

  legend(ctx, w, h, dark, [
    ['above the atmosphere', dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)', true],
    ['at the surface (energy)', dark ? '#ffd8a8' : '#b35c00', false],
    ['at the surface (photons)', dark ? '#74c0fc' : '#1864ab', false],
  ]);
}

/* ------------------------------------------------------------------ *
 * Absorption chart
 * ------------------------------------------------------------------ */

/**
 * Pigment absorption. Always shows the three curves the app is built around -
 * retinal, chlorophyll a and the nitroplast's photosystem I antenna - plus
 * whatever the current suite actually selected, and the leaf's own combined
 * absorptance so the reader can see how far the finished tissue departs from
 * its individual pigments.
 */
export function drawAbsorptionChart(ctx, scene, w, h, dark = true, extraKeys = []) {
  const t = theme(dark);
  ctx.clearRect(0, 0, w, h);

  // Faint photon-flux backdrop: pigments should be read against the light that
  // is actually available, not in isolation.
  const maxP = Math.max(...scene.light.photon) || 1;
  ctx.beginPath();
  ctx.moveTo(xOf(LAMBDA[0], w), yOf(0, h));
  for (let i = 0; i < LAMBDA.length; i++) {
    ctx.lineTo(xOf(LAMBDA[i], w), yOf(scene.light.photon[i] / maxP, h));
  }
  ctx.lineTo(xOf(LAMBDA[LAMBDA.length - 1], w), yOf(0, h));
  ctx.closePath();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)';
  ctx.fill();

  drawFrame(ctx, w, h, t, {
    yLabel: 'relative absorbance',
    yFormat: (v) => v.toFixed(1),
  });

  const shown = [];
  const featured = ['retinal_br', 'chl_a', 'nitroplast'];
  const keys = [...new Set([...featured, ...extraKeys])];
  for (const key of keys) {
    const p = PIGMENT_BY_KEY[key];
    if (!p) continue;
    const inSuite = scene.suite.primary.key === key
      || scene.suite.antennae.some((a) => a.key === key)
      || (scene.suite.screen && scene.suite.screen.key === key);
    plotLine(ctx, w, h, pigmentCurve(p), 1, p.chart, inSuite ? 2.6 : 1.5,
      inSuite ? null : [4, 3]);
    shown.push([p.name + (inSuite ? ' *' : ''), p.chart, !inSuite]);
  }

  // The finished leaf: everything above, combined, at the modelled loading.
  plotLine(ctx, w, h, scene.leaf.absorptance, 1,
    dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)', 2.4);
  shown.push(['whole-leaf absorptance', dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)', false]);

  legend(ctx, w, h, dark, shown);

  ctx.fillStyle = t.dim;
  ctx.font = '10px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('* in the selected suite   |   shaded area = available photons',
    w - PAD.r, h - 4);
}

/* ------------------------------------------------------------------ *
 * Leaf reflectance chart
 * ------------------------------------------------------------------ */

/** What the leaf sends back - the curve a spectrograph in orbit would see. */
export function drawReflectanceChart(ctx, scene, w, h, dark = true) {
  const t = theme(dark);
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < LAMBDA.length - 1; i++) {
    const x0 = xOf(LAMBDA[i], w), x1 = xOf(LAMBDA[i + 1], w);
    const y = yOf(scene.leaf.reflectance[i], h);
    ctx.fillStyle = toCss(wavelengthToRgb(LAMBDA[i]), 0.22);
    ctx.fillRect(x0, y, x1 - x0 + 1, h - PAD.b - y);
  }

  drawFrame(ctx, w, h, t, { yLabel: 'reflectance', yFormat: (v) => v.toFixed(2) });
  plotLine(ctx, w, h, scene.leaf.reflectance, 1, toCss(scene.colors.leaf), 2.6);

  if (scene.leaf.redEdgeNm) {
    const x = xOf(scene.leaf.redEdgeNm, w);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, PAD.t); ctx.lineTo(x + 0.5, h - PAD.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = t.fg;
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = x > w * 0.65 ? 'right' : 'left';
    ctx.fillText(`red edge ${scene.leaf.redEdgeNm} nm`, x + (x > w * 0.65 ? -6 : 6), PAD.t + 12);
  } else if (scene.leaf.redEdgeBeyondGrid) {
    ctx.fillStyle = t.fg;
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`red edge ${scene.leaf.redEdgeLabel} →`, w - PAD.r - 6, PAD.t + 12);
  }
}

/* ------------------------------------------------------------------ *
 * Legend
 * ------------------------------------------------------------------ */

function legend(ctx, w, h, dark, entries) {
  ctx.save();
  ctx.font = '11px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let y = PAD.t + 8;
  const x = w - PAD.r - 8;
  for (const [label, color, dashed] of entries) {
    const tw = ctx.measureText(label).width;
    const lx = x - tw - 26;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, y); ctx.lineTo(lx + 18, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = dark ? '#e8e6e3' : '#1d1c1a';
    ctx.fillText(label, lx + 24, y);
    y += 16;
  }
  ctx.restore();
}
