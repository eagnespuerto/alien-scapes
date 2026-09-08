/**
 * Photosynthetic pigments and the leaf-colour solver.
 *
 * HOW HONEST IS THIS?
 * Every absorption curve here is a sum of Gaussians placed at literature peak
 * positions (Soret and Qy bands for the chlorophylls, the retinal Schiff-base
 * band for the rhodopsins, and so on). The PEAK POSITIONS are real; the band
 * SHAPES are modelled, not digitised from measured spectra. That is enough to
 * drive a defensible colour calculation and to show why one pigment suits a
 * given star better than another - but these are not laboratory spectra, and
 * the UI says so.
 *
 * The colour logic follows the reasoning in Kiang et al. (2007), "Spectral
 * signatures of photosynthesis": photosynthesis is a quantum process, so what
 * matters is the PHOTON flux reaching the surface, not the energy flux. A
 * biosphere is expected to absorb where photons are most abundant, and a leaf
 * therefore reflects what is left over. Green plants on Earth are the awkward
 * case that motivated the whole question - our Sun peaks in the green, yet
 * chlorophyll reflects it.
 */

import {
  LAMBDA, LAMBDA_MIN, LAMBDA_STEP, lambdaIndex,
  spdToXyz, spdToSrgbAbsolute, planck,
} from './cie.js';
import { transmission } from './planets.js';

/**
 * @typedef {Object} Pigment
 * @property {string} key
 * @property {string} name
 * @property {string} family  'chlorophyll' | 'retinal' | 'nitroplast' | 'accessory'
 * @property {string} chart   Line colour in the absorption chart
 * @property {Array.<[number, number, number]>} bands  [centre nm, sigma nm, amplitude]
 * @property {string} notes
 */

/** @type {Pigment[]} */
export const PIGMENTS = [
  {
    key: 'chl_a', rc: true, name: 'Chlorophyll a', family: 'chlorophyll', chart: '#2f9e44',
    bands: [[418, 16, 0.62], [435, 22, 1.00], [530, 30, 0.08], [620, 30, 0.28], [676, 13, 0.86]],
    notes: 'The universal reaction-centre pigment on Earth. Soret band in the blue, Qy band in the red, and a transmission window in the green - which is exactly why plants look green.',
  },
  {
    key: 'chl_b', rc: false, costMul: 1.0, name: 'Chlorophyll b', family: 'chlorophyll', chart: '#66a80f',
    bands: [[460, 22, 1.00], [480, 24, 0.78], [650, 16, 0.62]],
    notes: 'An accessory pigment that widens the blue harvest and fills part of the chlorophyll a gap. Common in plants and green algae.',
  },
  {
    key: 'chl_d', rc: true, name: 'Chlorophyll d', family: 'chlorophyll', chart: '#c2255c',
    bands: [[401, 18, 0.72], [456, 20, 0.42], [696, 16, 0.55], [712, 15, 1.00]],
    notes: 'Found in Acaryochloris marina, living under light already filtered by other organisms. Its Qy band sits in the far red - a natural template for M-dwarf biospheres.',
  },
  {
    key: 'chl_f', rc: true, name: 'Chlorophyll f', family: 'chlorophyll', chart: '#a61e4d',
    bands: [[406, 18, 0.68], [706, 18, 0.85], [722, 17, 1.00]],
    notes: 'The most red-shifted chlorophyll known, discovered in stromatolites in 2010. It extends oxygenic photosynthesis past 720 nm.',
  },
  {
    key: 'bchl_a', rc: true, name: 'Bacteriochlorophyll a', family: 'chlorophyll', chart: '#5f3dc4',
    bands: [[358, 22, 0.75], [577, 24, 0.30], [805, 22, 0.72], [860, 32, 1.00]],
    notes: 'Anoxygenic purple bacteria. Absorbs almost entirely in the near-infrared, leaving the visible band untouched - a strong candidate under very cool stars.',
  },
  {
    key: 'bchl_b', rc: true, name: 'Bacteriochlorophyll b', family: 'chlorophyll', chart: '#7048e8',
    bands: [[368, 22, 0.70], [582, 24, 0.28], [835, 26, 0.60], [1020, 45, 1.00]],
    notes: 'The deepest-reaching pigment on this list, harvesting past 1000 nm. Beyond about 1100 nm, water’s own absorption makes further red-shifting pointless.',
  },
  {
    key: 'retinal_br', rc: true, name: 'Retinal (bacteriorhodopsin)', family: 'retinal', chart: '#ae3ec9',
    bands: [[380, 20, 0.22], [568, 55, 1.00]],
    notes: 'A retinal Schiff base in a seven-helix membrane protein - a light-driven proton pump, far simpler than a photosystem. It absorbs the green-yellow peak and reflects the ends of the spectrum, so a retinal biosphere looks purple. This is the "Purple Earth" hypothesis.',
  },
  {
    key: 'retinal_pr', rc: true, name: 'Retinal (proteorhodopsin, green)', family: 'retinal', chart: '#d6336c',
    bands: [[380, 20, 0.20], [525, 52, 1.00]],
    notes: 'The green-absorbing spectral tuning variant, abundant in surface ocean bacteria. Blue-absorbing variants near 490 nm dominate in deeper water.',
  },
  {
    key: 'retinal_xr', rc: true, name: 'Retinal (xanthorhodopsin + antenna)', family: 'retinal', chart: '#f76707',
    bands: [[460, 20, 0.55], [488, 20, 0.68], [521, 22, 0.60], [568, 52, 1.00]],
    notes: 'Retinal with a salinixanthin carotenoid antenna bolted on - the rhodopsin answer to accessory pigments, broadening the harvest into the blue.',
  },
  {
    key: 'nitroplast', rc: true, name: 'Nitroplast PSI antenna (UCYN-A)', family: 'nitroplast', chart: '#1098ad',
    bands: [[437, 22, 0.80], [485, 24, 0.45], [676, 14, 0.78], [702, 20, 0.55], [720, 22, 0.30]],
    notes: 'The nitroplast is a nitrogen-fixing ORGANELLE, derived from the cyanobacterium UCYN-A inside the alga Braarudosphaera bigelowii. It has lost photosystem II and RuBisCO, so it does not fix carbon - but it retains photosystem I, whose chlorophyll a antenna includes the long-wavelength "red chlorophylls" past 700 nm. Modelled here as that retained PSI antenna: this curve is what the organelle still absorbs, not a carbon-fixing pigment.',
  },
  {
    key: 'carotene', rc: false, costMul: 0.8, photoprotect: true, name: 'Beta-carotene', family: 'accessory', chart: '#f59f00',
    bands: [[425, 16, 0.72], [451, 17, 1.00], [478, 18, 0.90]],
    notes: 'Harvests blue-green light and, more importantly, quenches excess energy before it does damage. Expect heavy carotenoid loading under hot blue stars.',
  },
  {
    key: 'phycoerythrin', rc: false, costMul: 3.0, name: 'Phycoerythrin', family: 'accessory', chart: '#e64980',
    bands: [[498, 20, 0.72], [540, 20, 0.86], [565, 20, 1.00]],
    notes: 'A phycobiliprotein that fills chlorophyll’s green gap. Red algae use it to live at depths where only green light survives.',
  },
  {
    key: 'phycocyanin', rc: false, costMul: 2.6, name: 'Phycocyanin', family: 'accessory', chart: '#4c6ef5',
    bands: [[620, 30, 1.00]],
    notes: 'The orange-absorbing phycobiliprotein of cyanobacteria, feeding energy downhill into chlorophyll a.',
  },
  {
    key: 'flavonoid', rc: false, costMul: 1.0, name: 'Flavonoid UV screen', family: 'accessory', chart: '#868e96',
    bands: [[290, 26, 1.00], [340, 30, 0.85], [380, 24, 0.35]],
    notes: 'Not a harvester at all - a sunscreen. Under an A or B star the UV load is brutal, and a thick screening layer is the price of living in the open.',
  },
];

export const PIGMENT_BY_KEY = Object.fromEntries(PIGMENTS.map((p) => [p.key, p]));

/** The three curves the app always charts, in the order the UI lists them. */
export const FEATURED_KEYS = ['retinal_br', 'chl_a', 'nitroplast'];

/** Absorbance of a pigment at one wavelength, normalised to a 1.0 peak. */
export function pigmentAbsorbance(pigment, lambdaNm) {
  let a = 0;
  for (const [c, s, amp] of pigment.bands) {
    a += amp * Math.exp(-0.5 * Math.pow((lambdaNm - c) / s, 2));
  }
  return Math.min(1, a);
}

/** A pigment's absorbance sampled on the shared LAMBDA grid. */
export function pigmentCurve(pigment) {
  return LAMBDA.map((l) => pigmentAbsorbance(pigment, l));
}

/* ------------------------------------------------------------------ *
 * Surface light field
 * ------------------------------------------------------------------ */

/**
 * Everything about the light arriving at the ground.
 *
 * `energy` is the spectral power distribution (arbitrary units, shape only).
 * `photon` is proportional to energy x lambda - the photon flux, which is what
 * photosynthesis actually counts.
 * Both are sampled on the shared LAMBDA grid.
 */
export function surfaceLight(star, atmosphereKey, insolationRel, airmass = 1) {
  const top = LAMBDA.map((l) => planck(l, star.teff));
  // Beer's law is exponential in path length, so a longer slant path through
  // the same atmosphere is just the zenith transmission raised to the air mass.
  // This is what turns any atmosphere into its own sunset.
  const trans = LAMBDA.map((l) => Math.pow(transmission(atmosphereKey, l), airmass));

  // Normalise the top-of-atmosphere spectrum so its integral equals the
  // insolation relative to Earth. That keeps absolute brightness meaningful
  // across stars while leaving the spectral shape untouched.
  let topSum = 0;
  for (const v of top) topSum += v;
  const norm = topSum > 0 ? insolationRel / topSum : 0;

  const energy = top.map((v, i) => v * norm * trans[i]);
  const photon = energy.map((v, i) => v * LAMBDA[i] / 550);

  return { energy, photon, trans, top: top.map((v) => v * norm) };
}

/** Sum of an array over a wavelength window, in nm-weighted units. */
function integrate(arr, lo = LAMBDA_MIN, hi = 1e9) {
  let s = 0;
  for (let i = 0; i < LAMBDA.length; i++) {
    const l = LAMBDA[i];
    if (l >= lo && l <= hi) s += arr[i] * LAMBDA_STEP;
  }
  return s;
}

/**
 * Photosynthetically usable photon flux at the surface, relative to Earth's
 * (1.0 = full terrestrial daylight). Integrated over 400-1100 nm rather than
 * the usual 400-700 nm PAR window, because far-red pigments genuinely reach
 * past 700 nm and dismissing that band would prejudge the M-dwarf case.
 */
export function usablePhotonFlux(light) {
  return integrate(light.photon, 400, 1100) / EARTH_PAR;
}

/** Wavelength where the surface photon flux peaks, in nm. */
export function photonPeakNm(light) {
  let best = 0, bestI = 0;
  for (let i = 0; i < light.photon.length; i++) {
    if (LAMBDA[i] < 320) continue;
    if (light.photon[i] > best) { best = light.photon[i]; bestI = i; }
  }
  return LAMBDA[bestI];
}

/** Fraction of the surface photon flux that falls in the UV (<400 nm). */
export function uvFraction(light) {
  const tot = integrate(light.photon, 300, 1100);
  return tot > 0 ? integrate(light.photon, 300, 400) / tot : 0;
}

/**
 * Earth's own 400-1100 nm photon integral under this same model, used as the
 * normalising constant so "1.0" really does mean terrestrial daylight.
 */
const EARTH_PAR = (() => {
  const sun = { teff: 5778 };
  const top = LAMBDA.map((l) => planck(l, sun.teff));
  let topSum = 0;
  for (const v of top) topSum += v;
  const norm = 1 / topSum;
  const energy = top.map((v, i) => v * norm * transmission('earth', LAMBDA[i]));
  const photon = energy.map((v, i) => v * LAMBDA[i] / 550);
  let s = 0;
  for (let i = 0; i < LAMBDA.length; i++) {
    if (LAMBDA[i] >= 400 && LAMBDA[i] <= 1100) s += photon[i] * LAMBDA_STEP;
  }
  return s;
})();

/* ------------------------------------------------------------------ *
 * Pigment selection
 * ------------------------------------------------------------------ */

/**
 * The reaction-centre trap wavelength: the longest band the pigment absorbs
 * strongly. Every photon a pigment captures is funnelled down to this energy
 * and the surplus is lost as heat, so the trap - not the absorption peak - sets
 * how much useful energy a captured photon is worth.
 */
export function trapNm(pigment) {
  let t = 0;
  const peak = Math.max(...pigment.bands.map((b) => b[2]));
  for (const [c, , amp] of pigment.bands) {
    if (amp >= 0.5 * peak && c > t) t = c;
  }
  return t || pigment.bands[pigment.bands.length - 1][0];
}

/**
 * Relative energy-conversion efficiency by pigment family.
 *
 * A chlorophyll photosystem is a chain of protein complexes that converts a
 * trapped exciton into stable chemical energy at roughly 30% efficiency. A
 * retinal proton pump is a single protein doing a far cruder job, and is
 * markedly less efficient - which is the standard objection to a retinal
 * biosphere outcompeting a chlorophyll one where both are possible. The
 * nitroplast keeps photosystem I but has lost photosystem II and RuBisCO, so
 * it cannot fix carbon at all.
 */
const FAMILY_YIELD = { chlorophyll: 1.0, nitroplast: 0.80, retinal: 0.50, accessory: 0.9 };

/**
 * How well a pigment matches the available photons.
 *
 * Three terms, all of them doing real work:
 *  1. CAPTURE - how many arriving photons the absorption curve actually takes.
 *  2. THERMALISATION - photons are worth 1/lambda_trap each, because energy
 *     above the trap is dumped as heat. This is what stops the model from
 *     simply picking the most red-shifted pigment every time: a far-red
 *     pigment sees more photons under a cool star, but each one buys less.
 *  3. COST - a pigment that absorbs everywhere is metabolically expensive, so
 *     efficiency rather than raw capture drives the choice.
 */
function matchScore(pigment, curve, photon) {
  const trap = trapNm(pigment);
  const cutoff = trap + 60; // pigment tails past the trap cannot drive chemistry
  let capture = 0, cost = 0, total = 0;
  for (let i = 0; i < LAMBDA.length; i++) {
    if (LAMBDA[i] <= cutoff) capture += curve[i] * photon[i];
    cost += curve[i];
    total += photon[i];
  }
  if (total <= 0 || cost <= 0) return 0;
  // Anoxygenic pigments (trap past ~750 nm) cannot split water and need a
  // chemical electron donor such as H2S, which is a real ecological handicap.
  const oxygenic = trap <= 760 ? 1 : 0.82;
  const yieldK = FAMILY_YIELD[pigment.family] ?? 1;
  return (capture / total) * (550 / trap) * oxygenic * yieldK
    * Math.pow(cost / LAMBDA.length, -0.35);
}

/**
 * Marginal value of an antenna pigment given what the suite already absorbs.
 *
 * The `costMul` term matters more than it looks. Phycobiliproteins are the
 * obvious way to plug chlorophyll's green gap, and red algae do exactly that -
 * but a phycobilisome is an enormous water-soluble protein assembly that can
 * run to half the cell's total protein. That expense is why land plants never
 * took the option, and without it this model cheerfully paints Earth's forests
 * red.
 */
function marginalScore(pigment, curve, photon, coveredCurve, parRel) {
  const trap = trapNm(pigment);
  const cutoff = trap + 60;
  let gain = 0, cost = 0, total = 0;
  for (let i = 0; i < LAMBDA.length; i++) {
    if (LAMBDA[i] <= cutoff) gain += curve[i] * photon[i] * (1 - coveredCurve[i]);
    cost += curve[i];
    total += photon[i];
  }
  if (total <= 0 || cost <= 0) return 0;
  const costMul = pigment.costMul ?? 1;

  // Photoprotection. Photosynthesis saturates well below full daylight, so on
  // a bright world the binding constraint is not capturing more photons but
  // safely disposing of the ones already absorbed. A carotenoid earns its
  // place there by quenching excess excitation, which is why sun leaves are
  // carotenoid-rich and shade organisms are the ones that invest in big
  // harvesting antennae instead.
  const excess = Math.min(1, Math.max(0, parRel - 0.2));
  const protect = pigment.photoprotect ? 2.0 * excess : 0;

  return (gain / total) * (550 / trap) / costMul * (1 + protect)
    * Math.pow(cost / LAMBDA.length, -0.25);
}

/**
 * Choose a pigment suite for the given light field.
 *
 * `strategy` is one of 'auto' | 'chlorophyll' | 'retinal' | 'nitroplast'.
 * 'auto' lets any family win; the others constrain the primary pigment so the
 * user can ask "what would a retinal biosphere look like HERE?"
 */
export function choosePigments(light, strategy = 'auto', parRel = 1, forcedKey = null) {
  const curves = new Map();
  for (const p of PIGMENTS) curves.set(p.key, pigmentCurve(p));

  // Only reaction-centre pigments can be primary. Chlorophyll b, the
  // phycobiliproteins and the carotenoids are antenna pigments: they harvest
  // light and pass the excitation on, but they never form the trap themselves.
  // Letting chlorophyll b compete for the primary slot is what made an earlier
  // version of this model paint Earth's plants olive-brown.
  const candidates = PIGMENTS.filter((p) => {
    if (!p.rc) return false;
    if (strategy === 'auto') return true;
    return p.family === strategy;
  });

  let primary = candidates[0];
  let bestScore = -Infinity;
  const ranked = [];
  for (const p of candidates) {
    const s = matchScore(p, curves.get(p.key), light.photon);
    ranked.push({ pigment: p, score: s });
    if (s > bestScore) { bestScore = s; primary = p; }
  }
  ranked.sort((a, b) => b.score - a.score);

  // An explicit pick overrides the contest entirely, so the user can ask what
  // a specific pigment would look like here even where it is not optimal.
  const forced = forcedKey ? PIGMENT_BY_KEY[forcedKey] : null;
  const forcedApplied = Boolean(forced && forced.rc);
  if (forcedApplied) primary = forced;

  // Load antenna pigments greedily: the best one, then the best remaining one
  // given what the first already covers. A single accessory is not enough to
  // reproduce a real light-harvesting complex - terrestrial plants run
  // chlorophyll a plus chlorophyll b plus carotenoids, and the shape of a leaf
  // spectrum comes from all three together.
  //
  // What can attach to what is not a free choice. Chlorophyll-based
  // photosystems accept chlorophyll b, carotenoids and phycobiliproteins.
  // Rhodopsins accept only a carotenoid - xanthorhodopsin's salinixanthin is
  // the one documented case, and bacteriorhodopsin runs bare, with no antenna
  // at all. Letting a chlorophyll antenna bolt onto a proton pump is what made
  // an earlier version of this model render retinal biospheres black instead
  // of purple.
  const pc = curves.get(primary.key);
  const covered = pc.slice();
  const antennae = [];
  const slots = primary.family === 'retinal' ? (primary.key === 'retinal_xr' ? 1 : 0) : 2;
  const allowed = primary.family === 'retinal'
    ? new Set(['carotene'])
    : new Set(['chl_b', 'carotene', 'phycoerythrin', 'phycocyanin']);

  for (let slot = 0; slot < slots; slot++) {
    let best = null, bestVal = 0;
    for (const p of PIGMENTS) {
      if (!allowed.has(p.key)) continue;
      if (antennae.some((a) => a.key === p.key)) continue;
      const s = marginalScore(p, curves.get(p.key), light.photon, covered, parRel);
      if (s > bestVal) { bestVal = s; best = p; }
    }
    if (!best) break;
    antennae.push(best);
    const bc = curves.get(best.key);
    for (let i = 0; i < covered.length; i++) {
      covered[i] = Math.min(1, covered[i] + bc[i] * (slot === 0 ? 0.55 : 0.3));
    }
  }
  const accessory = antennae[0] || null;

  // A UV screen is added only when the UV load actually warrants it.
  const uv = uvFraction(light);
  const screen = uv > 0.06 ? PIGMENT_BY_KEY.flavonoid : null;

  return { primary, accessory, antennae, screen, uv, curves, ranked,
           score: bestScore, forced: forcedApplied };
}

/* ------------------------------------------------------------------ *
 * Leaf reflectance and colour
 * ------------------------------------------------------------------ */

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Structural (pigment-free) reflectance of a leaf.
 *
 * Real leaves are not just pigment in a bag: cell walls and air spaces scatter
 * light strongly, and beyond the last pigment band that scattering is all
 * that is left. On Earth this produces the RED EDGE - reflectance jumping from
 * a few percent at 680 nm to nearly 50 percent at 750 nm, one of the strongest
 * remote-sensing biosignatures we know of. Water absorption bands near 970 and
 * 1200 nm pull it back down again.
 */
function structuralReflectance(lambdaNm) {
  if (lambdaNm < 400) return 0.04; // UV is screened hard by any surface tissue
  const vis = 0.50;
  const nir = 0.58;
  let r = vis + (nir - vis) * smoothstep(690, 760, lambdaNm);
  // Liquid-water absorption band around 970 nm.
  r *= 1 - 0.22 * Math.exp(-0.5 * Math.pow((lambdaNm - 970) / 45, 2));
  return r;
}

const STRUCTURAL = LAMBDA.map(structuralReflectance);

/**
 * Solve for leaf reflectance, colour and the red-edge position.
 *
 * Pigment loading (`depth`) rises as light gets scarcer, which is exactly what
 * shade leaves do on Earth: less light means more chlorophyll per unit area and
 * a darker leaf. A leaf under a bright A star can afford to be pale.
 */
export function solveLeaf(light, suite, parRel) {
  const { primary, antennae = [], screen, curves } = suite;

  const depth = Math.min(6.0, Math.max(1.2, 2.4 * Math.pow(0.35 / Math.max(parRel, 0.004), 0.22)));
  const pc = curves.get(primary.key);
  const sc = screen ? curves.get(screen.key) : null;
  const antennaWeights = [0.55, 0.30];

  // Multiple scattering inside the spongy mesophyll means light crosses the
  // pigment layer several times before it escapes, so the effective path is
  // far longer than the leaf is thick. Without this factor a single-pass
  // Beer-Lambert calculation leaves the weakly-absorbed green band far too
  // bright and every leaf comes out pale.
  const SCATTER_PATH = 5.0;

  const absorptance = [];
  const reflectance = [];
  for (let i = 0; i < LAMBDA.length; i++) {
    let od = pc[i] * depth;
    antennae.forEach((p, k) => { od += curves.get(p.key)[i] * depth * antennaWeights[k]; });
    if (sc) od += sc[i] * depth * 0.9;
    const a = 1 - Math.exp(-od * SCATTER_PATH);
    absorptance.push(a);
    reflectance.push(STRUCTURAL[i] * (1 - a));
  }

  // Reflected spectrum = illuminant x leaf reflectance. Colour comes from the
  // energy spectrum (CIE integrates power), normalised against the illuminant
  // itself so a genuinely dark leaf renders dark.
  const reflected = light.energy.map((v, i) => v * reflectance[i]);
  const whiteY = spdToXyz(light.energy)[1];
  const rgb = spdToSrgbAbsolute(reflected, whiteY);

  // Red edge: the steepest rise in reflectance anywhere past 600 nm. On Earth
  // this lands near 720 nm; a far-red biosphere pushes it past 780.
  let redEdge = null, bestSlope = 0;
  for (let i = 1; i < LAMBDA.length - 1; i++) {
    if (LAMBDA[i] < 600) continue;
    const slope = (reflectance[i + 1] - reflectance[i - 1]) / (2 * LAMBDA_STEP);
    if (slope > bestSlope) { bestSlope = slope; redEdge = LAMBDA[i]; }
  }

  // Fraction of incident photons the suite actually captures.
  let cap = 0, tot = 0;
  for (let i = 0; i < LAMBDA.length; i++) {
    cap += absorptance[i] * light.photon[i];
    tot += light.photon[i];
  }

  return {
    absorptance,
    reflectance,
    rgb,
    depth,
    redEdgeNm: redEdge,
    redEdgeStrength: bestSlope,
    captureFraction: tot > 0 ? cap / tot : 0,
  };
}

/**
 * A short, human-readable justification for the chosen suite. Written from the
 * numbers rather than from a lookup table, so it stays true when the user drags
 * the temperature slider somewhere no preset covers.
 */
export function explainSuite(suite, light, leaf, peakNm) {
  const bits = [];
  bits.push(
    `Surface photon flux peaks at ${Math.round(peakNm)} nm. ` +
    `${suite.primary.name} is the best match available to this strategy, capturing ` +
    `${(leaf.captureFraction * 100).toFixed(0)}% of arriving photons.`
  );
  if (suite.accessory) {
    bits.push(`${suite.accessory.name} fills the gap the primary pigment leaves open.`);
  }
  if (suite.screen) {
    bits.push(
      `${(suite.uv * 100).toFixed(0)}% of the photon flux is ultraviolet, so a ` +
      `flavonoid-type screening layer is loaded into the epidermis.`
    );
  }
  if (leaf.redEdgeNm) {
    bits.push(
      `The resulting red edge sits at ${leaf.redEdgeNm} nm` +
      (leaf.redEdgeNm > 760 ? ' - well beyond the terrestrial 720 nm, and invisible to the naked eye.' : '.')
    );
  }
  return bits.join(' ');
}
