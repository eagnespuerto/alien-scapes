/**
 * Export: compose a full data sheet and write it out as PNG, JPG or PDF.
 *
 * The sheet is not just a picture of the landscape. It carries the numbers
 * behind it - the spectrum at the surface, the pigment absorption curves, the
 * leaf reflectance, every derived colour with its hex value, and the biome
 * classification - so an exported file stands on its own as a record of the
 * world rather than as decoration.
 *
 * The PDF is written by hand rather than with a library. A one-page PDF holding
 * a single JPEG is about a hundred lines of byte assembly, and doing it here
 * keeps the whole site dependency-free and offline-capable.
 */

import { renderLandscape, growthFormLabel } from './landscape.js';
import { drawSpectrumChart, drawAbsorptionChart, drawReflectanceChart } from './charts.js';
import { toCss, toHex } from './cie.js';
import { trapNm } from './pigments.js';

const INK = '#12110f';
const DIM = '#57534d';
const FAINT = '#8a857d';
const RULE = 'rgba(0,0,0,0.14)';
const PAPER = '#faf8f4';

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

function text(ctx, str, x, y, { size = 14, weight = 400, color = INK, align = 'left', font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', letter = 0 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (letter && ctx.letterSpacing !== undefined) ctx.letterSpacing = `${letter}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Word-wrapped paragraph. Returns the y position after the last line. */
function paragraph(ctx, str, x, y, maxW, { size = 13, lh = 19, color = DIM, weight = 400 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  const words = String(str).split(/\s+/);
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  ctx.restore();
  return y;
}

function rule(ctx, x0, y, x1, color = RULE) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 0.5);
  ctx.lineTo(x1, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** A label / value row, dot-leadered so the columns read cleanly. */
function row(ctx, label, value, x, y, w) {
  text(ctx, label, x, y, { size: 12.5, color: DIM });
  text(ctx, value, x + w, y, {
    size: 12.5, color: INK, align: 'right', weight: 500,
    font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  });
  return y + 20;
}

function swatch(ctx, x, y, size, rgb, label, hex) {
  ctx.save();
  ctx.fillStyle = toCss(rgb);
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.restore();
  text(ctx, label, x, y + size + 16, { size: 11.5, color: DIM });
  text(ctx, hex.toUpperCase(), x, y + size + 31, {
    size: 11.5, color: INK, weight: 500,
    font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  });
}

/* ------------------------------------------------------------------ *
 * Sheet composition
 * ------------------------------------------------------------------ */

const SHEET_W = 1240;

/**
 * Draw the complete data sheet onto a canvas and return it.
 * `scale` multiplies every dimension, so 2 gives a print-resolution sheet.
 */
export function composeSheet(scene, state, scale = 2) {
  const W = SHEET_W;
  const M = 56;                 // margin
  const CW = W - M * 2;         // content width
  const H = 2010;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  let y = M + 26;

  /* ---- header ---- */
  text(ctx, 'ALIEN-SCAPES', M, y, { size: 13, weight: 600, color: FAINT, letter: 2.4 });
  text(ctx, new Date().toISOString().slice(0, 10), M + CW, y,
    { size: 12, color: FAINT, align: 'right', font: 'ui-monospace, Menlo, Consolas, monospace' });
  y += 34;

  const title = scene.planet.name;
  text(ctx, title, M, y, { size: 40, weight: 650, color: INK });
  y += 26;
  text(ctx, `${scene.star.name}  ·  ${scene.star.cls}${scene.star.lum} · ${scene.star.teff.toLocaleString()} K`
    + `  ·  ${scene.distanceAu} AU  ·  ${scene.atm.name}`, M, y, { size: 15, color: DIM });
  y += 16;
  rule(ctx, M, y, M + CW);
  y += 22;

  /* ---- landscape ---- */
  const imgH = Math.round(CW * 0.5);
  const land = document.createElement('canvas');
  land.width = CW * scale;
  land.height = imgH * scale;
  const lctx = land.getContext('2d');
  lctx.scale(scale, scale);
  renderLandscape(lctx, scene, CW, imgH);
  ctx.drawImage(land, M, y, CW, imgH);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.strokeRect(M + 0.5, y + 0.5, CW - 1, imgH - 1);
  y += imgH + 14;

  text(ctx, `seed ${scene.seed}  ·  star ${scene.elevation.toFixed(0)}° above the horizon`
    + `  ·  air mass ${scene.airmass.toFixed(2)}`
    + `  ·  angular diameter ${scene.angDiam.toFixed(2)}°`,
    M, y + 8, { size: 11.5, color: FAINT, font: 'ui-monospace, Menlo, Consolas, monospace' });
  y += 34;

  /* ---- swatches ---- */
  const sw = 84;
  const gap = (CW - sw * 5) / 4;
  const sws = [
    [scene.colors.skyZenith, 'Sky (zenith)', scene.hex.sky],
    [scene.colors.disk, 'Stellar disk', scene.hex.disk],
    [scene.colors.rock, `Regolith · ${scene.mineral.name}`, scene.hex.rock],
    [scene.colors.water, 'Surface water', scene.hex.water],
    [scene.colors.leaf, 'Vegetation', scene.hex.leaf],
  ];
  sws.forEach(([rgb, label, hex], i) => {
    swatch(ctx, M + i * (sw + gap), y, sw, rgb, label, hex);
  });
  y += sw + 52;
  rule(ctx, M, y, M + CW);
  y += 26;

  /* ---- two data columns ---- */
  const colW = (CW - 40) / 2;
  const cx2 = M + colW + 40;
  let ya = y, yb = y;

  text(ctx, 'STAR & ORBIT', M, ya, { size: 11, weight: 600, color: FAINT, letter: 1.6 });
  ya += 22;
  ya = row(ctx, 'Host star', scene.star.name, M, ya, colW);
  ya = row(ctx, 'Spectral type', `${scene.star.cls} ${scene.star.lum}`.trim(), M, ya, colW);
  ya = row(ctx, 'Effective temperature', `${scene.star.teff.toLocaleString()} K`, M, ya, colW);
  ya = row(ctx, 'Luminosity', `${fmt(scene.star.L)} L☉`, M, ya, colW);
  ya = row(ctx, 'Radius', `${fmt(scene.star.R)} R☉`, M, ya, colW);
  ya = row(ctx, 'Orbital distance', `${scene.distanceAu} AU`, M, ya, colW);
  ya = row(ctx, 'Insolation', `${fmt(scene.insolation)} S⊕`, M, ya, colW);
  ya = row(ctx, 'Habitable zone',
    `${scene.hz.inner.toFixed(3)} – ${scene.hz.outer.toFixed(3)} AU${scene.hz.extrapolated ? ' *' : ''}`,
    M, ya, colW);
  ya = row(ctx, 'Wien peak (energy)', `${Math.round(scene.wienNm)} nm`, M, ya, colW);
  ya = row(ctx, 'CIE 1931 chromaticity',
    `x ${scene.chromaticity[0].toFixed(4)}  y ${scene.chromaticity[1].toFixed(4)}`, M, ya, colW);

  text(ctx, 'SURFACE & BIOME', cx2, yb, { size: 11, weight: 600, color: FAINT, letter: 1.6 });
  yb += 22;
  yb = row(ctx, 'Atmosphere', scene.atm.short, cx2, yb, colW);
  yb = row(ctx, 'Equilibrium temperature', `${Math.round(scene.tempK)} K  (${(scene.tempK - 273.15).toFixed(0)} °C)`, cx2, yb, colW);
  yb = row(ctx, 'Greenhouse offset', `+${scene.atm.greenhouseK} K`, cx2, yb, colW);
  yb = row(ctx, 'Bond albedo', scene.atm.albedo.toFixed(2), cx2, yb, colW);
  yb = row(ctx, 'Surface water', `${Math.round(scene.water * 100)} %`, cx2, yb, colW);
  yb = row(ctx, 'Surface gravity', `${scene.planet.gravity.toFixed(2)} g`, cx2, yb, colW);
  yb = row(ctx, 'Tidally locked', scene.planet.locked ? 'yes' : 'no', cx2, yb, colW);
  yb = row(ctx, 'Biome', scene.biome.zone, cx2, yb, colW);
  yb = row(ctx, 'Vegetation cover',
    scene.biome.vegetated ? `${Math.round(scene.biome.density * 100)} %` : 'none', cx2, yb, colW);
  yb = row(ctx, 'Growth form',
    scene.biome.vegetated ? growthFormLabel(scene) : '—', cx2, yb, colW);

  y = Math.max(ya, yb) + 8;
  y = paragraph(ctx, scene.biome.blurb
    + (scene.biome.vegetated ? '' : `  No vegetation is modelled here: ${scene.biome.veto}.`),
    M, y, CW, { size: 12.5, lh: 18, color: DIM });
  y += 12;
  rule(ctx, M, y, M + CW);
  y += 26;

  /* ---- photobiology ---- */
  text(ctx, 'PHOTOBIOLOGY', M, y, { size: 11, weight: 600, color: FAINT, letter: 1.6 });
  y += 22;
  let yc = y, yd = y;
  yc = row(ctx, 'Usable photon flux (400–1100 nm)', `${(scene.parRel * 100).toFixed(1)} % of Earth`, M, yc, colW);
  yc = row(ctx, 'Photon flux peak', `${Math.round(scene.peakNm)} nm`, M, yc, colW);
  yc = row(ctx, 'Ultraviolet fraction', `${(scene.uv * 100).toFixed(1)} %`, M, yc, colW);
  yc = row(ctx, 'Photons captured by suite', `${(scene.leaf.captureFraction * 100).toFixed(1)} %`, M, yc, colW);
  yc = row(ctx, 'Pigment loading (optical depth)', scene.leaf.depth.toFixed(2), M, yc, colW);

  yd = row(ctx, 'Strategy', labelStrategy(scene.strategy) + (scene.suite.forced ? ' (pinned)' : ''), cx2, yd, colW);
  yd = row(ctx, 'Reaction centre', scene.suite.primary.name, cx2, yd, colW);
  yd = row(ctx, 'Trap wavelength', `${trapNm(scene.suite.primary)} nm`, cx2, yd, colW);
  yd = row(ctx, 'Antenna pigments',
    scene.suite.antennae.length ? scene.suite.antennae.map((p) => p.name).join(', ') : 'none', cx2, yd, colW);
  yd = row(ctx, 'UV screen', scene.suite.screen ? scene.suite.screen.name : 'not required', cx2, yd, colW);
  yd = row(ctx, 'Red edge', scene.leaf.redEdgeLabel || '—', cx2, yd, colW);

  y = Math.max(yc, yd) + 8;
  y = paragraph(ctx, scene.explanation, M, y, CW, { size: 12.5, lh: 18, color: DIM });
  y += 16;

  /* ---- charts ---- */
  const chW = CW;
  const chH = 250;
  const charts = [
    ['SURFACE SPECTRUM', drawSpectrumChart,
      'Blackbody emission at the star’s effective temperature, attenuated by the atmosphere along the current slant path.'],
    ['PIGMENT ABSORPTION', drawAbsorptionChart,
      'Retinal, chlorophyll a and the nitroplast’s photosystem I antenna are always shown; the selected suite is drawn solid.'],
    ['LEAF REFLECTANCE', drawReflectanceChart,
      'What the modelled vegetation sends back — the curve an orbiting spectrograph would record.'],
  ];

  for (const [heading, fn, caption] of charts) {
    text(ctx, heading, M, y, { size: 11, weight: 600, color: FAINT, letter: 1.6 });
    y += 10;
    const c = document.createElement('canvas');
    c.width = chW * scale;
    c.height = chH * scale;
    const cc = c.getContext('2d');
    cc.scale(scale, scale);
    cc.fillStyle = '#ffffff';
    cc.fillRect(0, 0, chW, chH);
    fn(cc, scene, chW, chH, false,
      [scene.suite.primary.key, ...scene.suite.antennae.map((p) => p.key)]);
    ctx.drawImage(c, M, y, chW, chH);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.strokeRect(M + 0.5, y + 0.5, chW - 1, chH - 1);
    y += chH + 6;
    y = paragraph(ctx, caption, M, y + 10, CW, { size: 11.5, lh: 16, color: FAINT });
    y += 12;
  }

  /* ---- footer ---- */
  rule(ctx, M, y, M + CW);
  y += 20;
  paragraph(ctx,
    'Colours are computed, not chosen: Planck emission is multiplied by an atmospheric transmission profile and by a '
    + 'surface reflectance, then integrated against the CIE 1931 2° standard observer and converted to sRGB. Pigment '
    + 'absorption curves are Gaussian sums placed at literature peak positions — the peaks are real, the band shapes are '
    + 'modelled. Stellar luminosities and radii are rounded literature values. This is a teaching and worldbuilding tool, '
    + 'not a radiative-transfer code.',
    M, y, CW, { size: 11, lh: 15.5, color: FAINT });

  return canvas;
}

function fmt(v) {
  if (v === undefined || v === null) return '—';
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 10) return v.toFixed(1);
  if (v >= 0.01) return v.toFixed(3);
  return v.toExponential(2);
}

function labelStrategy(s) {
  return { auto: 'Best fit', chlorophyll: 'Chlorophyll-type', retinal: 'Retinal-type', nitroplast: 'Nitroplast-type' }[s] || s;
}

/* ------------------------------------------------------------------ *
 * File writers
 * ------------------------------------------------------------------ */

function slug(scene) {
  return ('alien-scapes-' + scene.planet.name + '-' + scene.star.name + '-' + scene.seed)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function exportPng(scene, state) {
  const c = composeSheet(scene, state, 2);
  download(await toBlob(c, 'image/png'), slug(scene) + '.png');
}

export async function exportJpg(scene, state) {
  const c = composeSheet(scene, state, 2);
  download(await toBlob(c, 'image/jpeg', 0.92), slug(scene) + '.jpg');
}

/** Just the landscape, no data sheet - for when you only want the picture. */
export async function exportLandscapeOnly(scene, width = 2560) {
  const h = Math.round(width * 0.5625);
  const c = document.createElement('canvas');
  c.width = width; c.height = h;
  renderLandscape(c.getContext('2d'), scene, width, h);
  download(await toBlob(c, 'image/png'), slug(scene) + '-landscape.png');
}

/* ---- minimal PDF writer ---- */

function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Build a one-page PDF wrapping a single JPEG.
 *
 * The image is embedded with /DCTDecode, which means the JPEG bytes are stored
 * verbatim - no re-encoding, and no compression library needed. Offsets are
 * tracked as the byte array is assembled so the cross-reference table lands in
 * the right place.
 */
function buildPdf(jpegBytes, pxW, pxH) {
  // A4 portrait in points, with a 20 pt margin; the image is fitted inside.
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 20;
  const availW = PAGE_W - MARGIN * 2;
  const availH = PAGE_H - MARGIN * 2;
  const k = Math.min(availW / pxW, availH / pxH);
  const drawW = pxW * k, drawH = pxH * k;
  const offX = (PAGE_W - drawW) / 2;
  const offY = (PAGE_H - drawH) / 2;

  const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${offX.toFixed(2)} ${offY.toFixed(2)} cm\n/Im0 Do\nQ\n`;

  const chunks = [];
  const offsets = [0];
  let pos = 0;
  const push = (bytes) => { chunks.push(bytes); pos += bytes.length; };
  const pushStr = (s) => push(latin1(s));
  const startObj = () => { offsets.push(pos); };

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  startObj();
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObj();
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObj();
  pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
    + `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

  startObj();
  pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} `
    + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode `
    + `/Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  startObj();
  pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefPos = pos;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function exportPdf(scene, state) {
  // 1.5x rather than 2x: the sheet is already 1240 pt wide, and a 2x JPEG
  // pushes the file past what a PDF viewer will happily scroll.
  const c = composeSheet(scene, state, 1.5);
  const blob = await toBlob(c, 'image/jpeg', 0.90);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pdf = buildPdf(bytes, c.width, c.height);
  download(new Blob([pdf], { type: 'application/pdf' }), slug(scene) + '.pdf');
}
