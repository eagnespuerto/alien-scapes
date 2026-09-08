/**
 * Procedural landscape renderer.
 *
 * Every colour used here comes from scene.js, which derived it from a spectrum.
 * This file only decides SHAPE: where the ridges go, how tall the vegetation
 * grows, how much haze sits between the viewer and the horizon. It is
 * deterministic in the scene seed, so a given seed always redraws the same
 * world at any resolution.
 */

import { toCss, mixRgb, luma, scaleRgb } from './cie.js';
import { makeRng, fbm } from './noise.js';

const HORIZON = 0.47; // fraction of canvas height where the horizon sits

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function clamp01(v) { return Math.min(1, Math.max(0, v)); }

/** Lift a very dark colour just enough to stay readable on screen. */
function floorColor(rgb, min) {
  const l = luma(rgb);
  if (l >= min) return rgb;
  const k = min / Math.max(l, 1e-4);
  return [
    Math.min(1, rgb[0] * k + min * 0.3),
    Math.min(1, rgb[1] * k + min * 0.3),
    Math.min(1, rgb[2] * k + min * 0.34),
  ];
}

/** Where the star sits on the canvas, from its elevation and a seeded azimuth. */
function starPosition(scene, w, h) {
  const rng = makeRng(scene.seed ^ 0x5eed);
  const azimuth = 0.18 + rng() * 0.64;
  const elev = clamp01(scene.elevation / 90);
  return {
    x: w * azimuth,
    y: h * HORIZON * (1 - Math.pow(elev, 0.85)) + h * 0.02,
  };
}

/* ------------------------------------------------------------------ *
 * Sky
 * ------------------------------------------------------------------ */

function drawSky(ctx, scene, w, h) {
  const zen = scene.colors.skyZenith;
  const hor = scene.colors.skyHorizon;
  const g = ctx.createLinearGradient(0, 0, 0, h * HORIZON);
  // A power curve rather than a straight ramp: real skies hold their zenith
  // colour most of the way down and then turn quickly near the horizon.
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const k = Math.pow(t, 2.1);
    g.addColorStop(t, toCss(mixRgb(zen, hor, k)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * HORIZON + 1);
}

/** Background stars, visible whenever the sky itself is dark enough. */
function drawStarfield(ctx, scene, w, h) {
  const skyL = luma(scene.colors.skyZenith);
  const vis = clamp01(1 - skyL / 0.10);
  if (vis <= 0.02) return;
  const rng = makeRng(scene.seed ^ 0xfeed);
  const n = Math.floor(260 * vis);
  for (let i = 0; i < n; i++) {
    const x = rng() * w;
    const y = rng() * h * HORIZON * 0.98;
    const depth = 1 - y / (h * HORIZON);
    const r = (0.35 + rng() * 1.15) * (w / 1200);
    const a = vis * (0.25 + rng() * 0.75) * (0.35 + depth * 0.65);
    ctx.fillStyle = `rgba(255,252,245,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, r), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The star's disk, its glow, and the scattered halo the atmosphere adds. */
function drawStar(ctx, scene, w, h, pos, star, rgb, angDiamDeg, intensity) {
  // Angular size on a nominally 60-degree-wide field of view.
  const fov = 60;
  const radius = Math.max(w * 0.004, (angDiamDeg / fov) * w * 0.5);

  const bright = floorColor(rgb, 0.12);
  const glowR = radius * (6 + 10 * scene.atm.haze) * intensity;

  if (scene.atm.sky !== 'none') {
    const g = ctx.createRadialGradient(pos.x, pos.y, radius * 0.8, pos.x, pos.y, glowR);
    g.addColorStop(0, toCss(bright, 0.55 * intensity));
    g.addColorStop(0.25, toCss(bright, 0.20 * intensity));
    g.addColorStop(1, toCss(bright, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thick haze softens the disk edge instead of leaving it razor sharp.
  const edge = 0.55 + 0.42 * (1 - scene.atm.haze);
  const d = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
  d.addColorStop(0, toCss(scaleRgb(bright, 1.15)));
  d.addColorStop(edge, toCss(bright));
  d.addColorStop(1, toCss(bright, scene.atm.haze > 0.5 ? 0.25 : 0.9));
  ctx.fillStyle = d;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  return radius;
}

/**
 * Moons, lit from the direction of the star.
 *
 * The lit fraction is bounded by a real terminator rather than an offset
 * circle. On a sphere the terminator is a great circle, and a great circle seen
 * from an angle projects to an ELLIPSE - so the lit region is a semicircle on
 * the star side closed by a half-ellipse whose x-radius is r*cos(phase). When
 * cos(phase) is positive that ellipse bulges away from the star and the moon is
 * gibbous; when it is negative the ellipse cuts back across the lit side and the
 * moon is a crescent. An offset circle cannot produce either shape, which is
 * why the earlier version rendered a permanently full disk.
 */
function drawMoons(ctx, scene, w, h, starPos) {
  const count = scene.planet.moons || 0;
  if (!count) return;
  const rng = makeRng(scene.seed ^ 0x2b1e);

  // Reflected light off a dark rock, not a light source: scene.colors.moon is
  // the star's spectrum times a lunar-type regolith reflectance, tone-mapped on
  // the same exposure as the ground. The floor only stops it vanishing outright
  // on a very dim world.
  const surface = floorColor(scene.colors.moon, 0.09);

  // The sky is a gradient, so the airlight behind a moon depends on how high it
  // sits. Sampling the zenith colour for a moon hanging near the horizon leaves
  // its dark limb visibly darker than the sky around it.
  const skyAtY = (yy) => mixRgb(
    scene.colors.skyZenith, scene.colors.skyHorizon,
    Math.pow(clamp01(yy / (h * HORIZON)), 2.1)
  );

  // Airlight ADDS, it does not blend. The moon sits outside the atmosphere, so
  // the whole scattering column lies in front of it - and that column is
  // exactly what makes the sky bright. Looking at the moon's dark side
  // therefore gives the same airlight as looking at empty sky beside it, which
  // is why an unlit limb is invisible in daylight rather than appearing as a
  // dark disk. The lit side is that same sky PLUS the moon's own light,
  // attenuated on the way down. Mixing toward the sky instead of adding is
  // what made an earlier version punch a black hole in the sky at new moon.
  // How much of the moon survives the haze. Note that scene.colors.moon is
  // already attenuated once - it is built from the direct beam, which has the
  // slant-path transmission baked in - so this is a visibility term, not a
  // second transmission. Under a tholin or sulfuric-acid deck it goes to zero,
  // which is the honest answer: you cannot pick a moon out of a Titan sky when
  // the sun itself is only a dim smear.
  const vis = clamp01(1 - scene.atm.haze / 0.55);
  if (vis < 0.04) return;

  const add = (base, extra) => [
    Math.min(1, base[0] + extra[0]),
    Math.min(1, base[1] + extra[1]),
    Math.min(1, base[2] + extra[2]),
  ];

  for (let i = 0; i < count; i++) {
    const r = ((0.4 + rng() * 1.4) / 60) * w * 0.5;
    const mottle = rng();

    // Place the moon well away from the star, then read its phase off that
    // placement rather than randomising the two independently. Phase angle and
    // elongation are the same quantity: a moon near the star is necessarily a
    // thin crescent, and only a moon opposite the star can be full. Getting
    // this wrong is what let the old code draw a new moon in the middle of an
    // empty sky, where no such thing can occur.
    let x = 0, y = 0, sep = 0;
    for (let tries = 0; tries < 16; tries++) {
      x = w * (0.06 + rng() * 0.88);
      y = h * HORIZON * (0.08 + rng() * 0.64);
      sep = Math.hypot(x - starPos.x, y - starPos.y);
      if (sep > w * 0.3 + r * 3) break;
    }
    // The canvas spans a 60-degree field of view, so pixels convert to degrees.
    const elongation = Math.min(Math.PI, (sep / w) * 60 * (Math.PI / 180));
    const phase = Math.PI - elongation;

    // Regolith backscatters hard: near full phase a real moon is roughly twice
    // as bright as a Lambertian sphere of the same albedo would be. That
    // opposition surge is why a full moon looks so much brighter than a half
    // moon rather than merely twice as bright as its lit area implies.
    const surge = 1 + 0.9 * Math.max(0, Math.cos(phase));
    const sky = skyAtY(y);
    const lit = add(sky, scaleRgb(surface, surge * vis));
    // Earthshine analogue: the night side catches light bounced off the planet.
    const dark = add(sky, scaleRgb(surface, 0.03 * vis));

    const toStar = Math.atan2(starPos.y - y, starPos.x - x);

    ctx.save();
    ctx.translate(x, y);

    // Whole disk in shadow first.
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = toCss(dark);
    ctx.fill();

    // Then the lit region, with +x rotated to point at the star.
    ctx.save();
    ctx.rotate(toStar);
    const rx = r * Math.cos(phase);
    ctx.beginPath();
    // Lit limb: the half of the circle facing the star, top to bottom.
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    // Terminator, closing the path back to the top. Canvas sweeps from pi/2 to
    // -pi/2 the LONG way round (through pi, the far side) when anticlockwise is
    // false, and the short way (through 0, the star side) when it is true. So a
    // gibbous moon - terminator bulging away from the star - needs false, and a
    // crescent - terminator cutting back across the lit face - needs true.
    // Passing `rx > 0` here inverts both, turning every crescent into a gibbous.
    ctx.ellipse(0, 0, Math.abs(rx), r, 0, Math.PI / 2, -Math.PI / 2, rx <= 0);
    ctx.closePath();
    ctx.fillStyle = toCss(lit);
    ctx.fill();

    // A few darker basins, so the disk is not a flat fill. Clipped to the lit
    // region, because maria on the night side would not be visible.
    ctx.clip();
    const mr = makeRng(Math.floor(mottle * 1e6) ^ 0x4a11);
    for (let k = 0; k < 4; k++) {
      const a = mr() * Math.PI * 2;
      const d = mr() * r * 0.62;
      ctx.fillStyle = toCss(mixRgb(lit, dark, 0.22 + mr() * 0.2), 0.55);
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d,
        r * (0.16 + mr() * 0.26), r * (0.12 + mr() * 0.22), a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * Terrain
 * ------------------------------------------------------------------ */

/**
 * One ridge line. `depth` is 0 (far) to 1 (near) and drives both the aerial
 * perspective blend and how much relief the ridge is allowed to have.
 */
function drawRidge(ctx, scene, w, h, opts) {
  const { depth, baseY, amp, seed, color, octaves = 6, ridged = true } = opts;
  const hazeMix = (1 - depth) * (0.35 + 0.55 * scene.atm.haze);
  const tinted = mixRgb(color, scene.colors.skyHorizon, clamp01(hazeMix));

  ctx.beginPath();
  ctx.moveTo(0, h);
  const step = Math.max(1, Math.round(w / 900));
  for (let x = 0; x <= w; x += step) {
    const n = fbm((x / w) * (2.2 + depth * 3.5), { seed, octaves, ridged, gain: 0.52 });
    const y = baseY - n * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = toCss(tinted);
  ctx.fill();
  return tinted;
}

/** Speckle the foreground so bare regolith does not read as flat vector fill. */
function drawGrain(ctx, scene, w, h, y0, color) {
  const rng = makeRng(scene.seed ^ 0x6a417);
  const n = Math.floor((w * h) / 2600);
  for (let i = 0; i < n; i++) {
    const x = rng() * w;
    const y = y0 + rng() * (h - y0);
    const t = (y - y0) / Math.max(1, h - y0);
    const r = (0.5 + rng() * 1.6) * (w / 1200) * (0.5 + t);
    const dark = rng() < 0.5;
    const c = mixRgb(color, dark ? [0, 0, 0] : [1, 1, 1], 0.10 + rng() * 0.18);
    ctx.fillStyle = toCss(c, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ *
 * Water
 * ------------------------------------------------------------------ */

function drawWater(ctx, scene, w, h, topY, bottomY, starPos) {
  const g = ctx.createLinearGradient(0, topY, 0, bottomY);
  g.addColorStop(0, toCss(mixRgb(scene.colors.water, scene.colors.skyHorizon, 0.55)));
  g.addColorStop(1, toCss(scene.colors.water));
  ctx.fillStyle = g;
  ctx.fillRect(0, topY, w, bottomY - topY);

  // Specular glitter path: a vertical column of highlights under the star,
  // widening with distance the way a real sun-glint track does.
  const rng = makeRng(scene.seed ^ 0x9117e2);
  const spec = floorColor(scene.colors.disk, 0.2);
  const rows = Math.floor((bottomY - topY) / Math.max(2, h / 260));
  for (let i = 0; i < rows; i++) {
    const t = i / Math.max(1, rows - 1);
    const y = topY + t * (bottomY - topY);
    const spread = w * (0.012 + t * 0.16);
    const count = 1 + Math.floor(t * 6);
    for (let k = 0; k < count; k++) {
      const x = starPos.x + (rng() * 2 - 1) * spread;
      const len = (w / 260) * (0.4 + rng() * (0.7 + t * 2.2));
      const a = (0.30 + rng() * 0.45) * (1 - t * 0.45);
      ctx.fillStyle = toCss(spec, a);
      ctx.fillRect(x - len / 2, y, len, Math.max(1, h / 420));
    }
  }
}

/* ------------------------------------------------------------------ *
 * Vegetation
 * ------------------------------------------------------------------ */

/**
 * Choose a growth form from the physics rather than from a preset.
 *
 * Low gravity permits tall, spindly structures that would buckle under their
 * own weight on a heavier world; cold and dim conditions favour low cushions
 * that trap heat near the ground; warm, wet and bright conditions produce the
 * layered canopies familiar from tropical Earth.
 */
export function growthForm(scene) {
  const g = scene.planet.gravity;
  const t = scene.tempK;
  const dim = scene.parRel < 0.15;
  if (t < 265) return 'cushion';
  if (g > 1.5) return 'mat';
  if (g < 0.5 && !dim) return 'spire';
  if (dim) return 'frond';
  if (t > 300 && scene.water > 0.4) return 'canopy';
  return 'canopy';
}

const FORM_LABEL = {
  cushion: 'Low cushion mats',
  mat: 'Broad ground-hugging mats',
  spire: 'Tall spindly spires',
  frond: 'Wide light-trapping fronds',
  canopy: 'Layered canopies',
};

export function growthFormLabel(scene) {
  return FORM_LABEL[growthForm(scene)];
}

function drawPlant(ctx, form, x, y, size, color, shade, rng) {
  const dark = mixRgb(color, [0, 0, 0], 0.42);
  const lit = mixRgb(color, [1, 1, 1], 0.12);

  switch (form) {
    case 'spire': {
      const hgt = size * (2.6 + rng() * 1.8);
      const wid = Math.max(1, size * 0.13);
      ctx.strokeStyle = toCss(mixRgb(color, shade, 0.35));
      ctx.lineWidth = wid;
      ctx.lineCap = 'round';
      const lean = (rng() * 2 - 1) * size * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.4, y - hgt * 0.6, x + lean, y - hgt);
      ctx.stroke();
      const blades = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < blades; i++) {
        const ty = y - hgt * (0.45 + (i / blades) * 0.55);
        const dir = i % 2 ? 1 : -1;
        ctx.strokeStyle = toCss(lit, 0.85);
        ctx.lineWidth = Math.max(0.8, wid * 0.6);
        ctx.beginPath();
        ctx.moveTo(x + lean * ((y - ty) / hgt), ty);
        ctx.quadraticCurveTo(
          x + dir * size * 0.5, ty - size * 0.25,
          x + dir * size * 0.85, ty - size * 0.55
        );
        ctx.stroke();
      }
      break;
    }
    case 'cushion': {
      const r = size * (0.7 + rng() * 0.5);
      ctx.fillStyle = toCss(mixRgb(color, shade, 0.2));
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.42 + rng() * 0.22), 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = toCss(lit, 0.5);
      ctx.beginPath();
      ctx.ellipse(x - r * 0.25, y - r * 0.12, r * 0.4, r * 0.2, 0, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'mat': {
      const r = size * (1.4 + rng() * 1.1);
      ctx.fillStyle = toCss(mixRgb(color, shade, 0.25), 0.92);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.18 + rng() * 0.12), 0, Math.PI, 0);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = toCss(lit, 0.35);
        const bx = x + (rng() * 2 - 1) * r * 0.7;
        ctx.beginPath();
        ctx.ellipse(bx, y - r * 0.03, r * 0.3, r * 0.09, 0, Math.PI, 0);
        ctx.fill();
      }
      break;
    }
    case 'frond': {
      const hgt = size * (1.1 + rng() * 0.7);
      const fronds = 5 + Math.floor(rng() * 5);
      ctx.strokeStyle = toCss(mixRgb(color, shade, 0.45));
      ctx.lineWidth = Math.max(1, size * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - hgt * 0.35);
      ctx.stroke();
      for (let i = 0; i < fronds; i++) {
        const a = Math.PI + (i / (fronds - 1)) * Math.PI;
        const len = hgt * (0.8 + rng() * 0.5);
        ctx.fillStyle = toCss(mixRgb(color, i % 2 ? lit : shade, 0.22), 0.9);
        ctx.beginPath();
        ctx.moveTo(x, y - hgt * 0.35);
        ctx.quadraticCurveTo(
          x + Math.cos(a) * len * 0.6, y - hgt * 0.35 + Math.sin(a) * len * 0.5,
          x + Math.cos(a) * len, y - hgt * 0.35 + Math.sin(a) * len * 0.35 + size * 0.2
        );
        ctx.quadraticCurveTo(
          x + Math.cos(a) * len * 0.5, y - hgt * 0.35 + Math.sin(a) * len * 0.35,
          x, y - hgt * 0.3
        );
        ctx.fill();
      }
      break;
    }
    default: { // canopy
      const hgt = size * (1.8 + rng() * 1.4);
      const trunkW = Math.max(1, size * 0.16);
      ctx.strokeStyle = toCss(mixRgb(shade, [0.15, 0.10, 0.08], 0.45));
      ctx.lineWidth = trunkW;
      ctx.lineCap = 'round';
      const lean = (rng() * 2 - 1) * size * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.5, y - hgt * 0.55, x + lean, y - hgt * 0.85);
      ctx.stroke();
      const lobes = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < lobes; i++) {
        const cx = x + lean + (rng() * 2 - 1) * size * 0.85;
        const cy = y - hgt * (0.82 + rng() * 0.22);
        const rx = size * (0.6 + rng() * 0.6);
        const ry = rx * (0.55 + rng() * 0.3);
        ctx.fillStyle = toCss(mixRgb(color, i === 0 ? lit : shade, 0.18 + rng() * 0.25), 0.95);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawVegetation(ctx, scene, w, h, groundY) {
  if (!scene.biome.vegetated) return;
  const form = growthForm(scene);
  const rng = makeRng(scene.seed ^ 0x1eaf);
  const color = floorColor(scene.colors.leaf, 0.055);
  const shade = mixRgb(color, scene.colors.skyHorizon, 0.12);
  const depth = h - groundY;
  if (depth <= 0) return;

  // Scatter first, then draw far-to-near. Painting in y order is what makes
  // the stand read as a receding field rather than a hedge: a plant lower in
  // the frame is nearer, so it is both larger and drawn over its neighbours.
  const count = 90 + Math.round(scene.biome.density * 320);
  const plants = [];
  for (let i = 0; i < count; i++) {
    // Bias placement toward the horizon, where perspective packs far more
    // ground into each row of pixels. An exponent above 1 pushes samples
    // toward t = 0, which is the far distance.
    const t = Math.pow(rng(), 1.6);
    plants.push({
      x: rng() * w * 1.12 - w * 0.06,
      y: groundY + t * depth,
      t,
      jitter: 0.65 + rng() * 0.8,
      r: rng(),
    });
  }
  plants.sort((a, b) => a.y - b.y);

  const base = (w / 54) * (0.6 + scene.biome.density * 0.5);
  for (const pl of plants) {
    // Near-cubic falloff with distance: the far rank is a fine stipple, the
    // front rank is a few plants at full size.
    const size = base * (0.055 + 0.95 * Math.pow(pl.t, 1.7)) * pl.jitter;
    if (size < 0.6) continue;
    const haze = (1 - pl.t) * (0.30 + 0.55 * scene.atm.haze);
    const c = mixRgb(color, scene.colors.skyHorizon, haze);
    drawPlant(ctx, form, pl.x, pl.y, size, c, shade, rng);
  }
}

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

/**
 * Render the whole scene into a 2-D context of size w x h.
 * Safe to call at any resolution - the export path uses the same function at
 * higher pixel dimensions.
 */
export function renderLandscape(ctx, scene, w, h) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  drawSky(ctx, scene, w, h);
  drawStarfield(ctx, scene, w, h);

  const pos = starPosition(scene, w, h);
  drawMoons(ctx, scene, w, h, pos);
  drawStar(ctx, scene, w, h, pos, scene.star, scene.colors.disk, scene.angDiam, 1);
  if (scene.companion && scene.companionRgb) {
    const cpos = { x: w - pos.x * 0.72, y: pos.y * 0.78 + h * 0.03 };
    drawStar(ctx, scene, w, h, cpos, scene.companion, scene.companionRgb,
      Math.max(0.25, scene.angDiam * 0.6), 0.65);
  }

  // Horizon haze - the atmosphere piling up along a long line of sight.
  const hazeH = h * (0.05 + 0.14 * scene.atm.haze);
  const hg = ctx.createLinearGradient(0, h * HORIZON - hazeH, 0, h * HORIZON + hazeH * 0.4);
  hg.addColorStop(0, toCss(scene.colors.skyHorizon, 0));
  // Scale the horizon wash with the atmosphere's own haze, so a clear sky keeps
  // its ridge line crisp instead of dissolving into the sky.
  hg.addColorStop(1, toCss(scene.colors.skyHorizon, 0.34 + 0.42 * scene.atm.haze));
  ctx.fillStyle = hg;
  ctx.fillRect(0, h * HORIZON - hazeH, w, hazeH * 1.4);

  const rock = floorColor(scene.colors.rock, 0.03);
  const horizonY = h * HORIZON;

  // Far range, then mid range, then the ground plane.
  drawRidge(ctx, scene, w, h, {
    depth: 0.05, baseY: horizonY + h * 0.005,
    amp: h * (0.05 + scene.roughness * 0.22) * (1 / Math.max(0.45, scene.planet.gravity)),
    seed: scene.seed ^ 0x11, color: mixRgb(rock, [0.5, 0.5, 0.6], 0.25),
  });
  drawRidge(ctx, scene, w, h, {
    depth: 0.35, baseY: horizonY + h * 0.045,
    amp: h * (0.035 + scene.roughness * 0.15) * (1 / Math.max(0.5, scene.planet.gravity)),
    seed: scene.seed ^ 0x22, color: mixRgb(rock, [0.4, 0.4, 0.45], 0.12),
  });

  const waterTop = horizonY + h * 0.055;
  const hasWater = scene.water > 0.12 && scene.tempK > 210 && scene.tempK < 420;
  const groundY = hasWater ? waterTop + h * (0.06 + scene.water * 0.16) : horizonY + h * 0.06;

  if (hasWater) drawWater(ctx, scene, w, h, waterTop, groundY, pos);

  drawRidge(ctx, scene, w, h, {
    depth: 0.8, baseY: groundY, amp: h * 0.035 * (1 + scene.roughness),
    seed: scene.seed ^ 0x33, color: rock, ridged: false, octaves: 4,
  });

  // The ground plane itself, darkening toward the viewer.
  const gg = ctx.createLinearGradient(0, groundY, 0, h);
  gg.addColorStop(0, toCss(mixRgb(rock, scene.colors.skyHorizon, 0.22)));
  gg.addColorStop(1, toCss(mixRgb(rock, [0, 0, 0], 0.35)));
  ctx.fillStyle = gg;
  ctx.fillRect(0, groundY, w, h - groundY);

  drawGrain(ctx, scene, w, h, groundY, rock);
  drawVegetation(ctx, scene, w, h, groundY);

  // Vignette.
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25,
    w / 2, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
