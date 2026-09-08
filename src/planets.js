/**
 * Atmospheres and exoplanet presets.
 *
 * The transmission profiles are ported from `starlight-filter`'s spectrum.py.
 * They are deliberately simple - enough to reproduce each world's
 * characteristic tint without pretending to be a radiative-transfer code.
 *
 * alien-scapes adds, per atmosphere: how the sky is lit (scattering vs.
 * absorption), a greenhouse offset, a Bond albedo, and a haze density, because
 * the landscape renderer and the biome classifier both need them.
 */

/**
 * How an atmosphere paints the sky.
 *  - 'rayleigh': the sky glows with the light REMOVED from the direct beam,
 *    i.e. star x (1 - T). Blue on Earth, for the same reason sunsets are red.
 *  - 'absorb':   dust or haze absorbs rather than scatters, so the whole sky
 *    takes on the transmitted tint, star x T. This is why Mars has a
 *    butterscotch sky instead of a blue one.
 *  - 'none':     no appreciable atmosphere - a black, star-filled sky.
 */

export const ATMOSPHERES = [
  {
    key: 'off', name: 'None (airless)', short: 'None',
    description: 'No atmosphere. Raw starlight, black daytime sky, hard shadows.',
    sky: 'none', skyBrightness: 0.02, greenhouseK: 0, albedo: 0.12, haze: 0.0,
  },
  {
    key: 'earth', name: 'Earth-like (clear zenith)', short: 'Earth',
    description: 'N2/O2 Rayleigh scattering. The direct beam is mildly yellowed as blue scatters into the sky.',
    sky: 'rayleigh', skyBrightness: 1.0, greenhouseK: 33, albedo: 0.30, haze: 0.10,
  },
  {
    key: 'earth_sunset', name: 'Earth-like (horizon / sunset)', short: 'Sunset',
    description: 'The same Rayleigh model at a large air mass - the long path strips out blue and green, leaving a deep orange-red disk.',
    sky: 'rayleigh', skyBrightness: 0.55, greenhouseK: 33, albedo: 0.30, haze: 0.28,
  },
  {
    key: 'mars', name: 'Mars-like (dusty CO2)', short: 'Mars',
    description: 'Suspended iron-oxide dust absorbs blue and green and forward-scatters the red. Butterscotch sun, pinkish sky.',
    sky: 'absorb', skyBrightness: 0.75, greenhouseK: 6, albedo: 0.25, haze: 0.45,
  },
  {
    key: 'venus', name: 'Venus-like (thick CO2 + H2SO4)', short: 'Venus',
    description: 'A sulfuric-acid cloud deck over dense CO2 - nearly opaque in UV and blue, leaving a dim orange-yellow disk at the surface.',
    sky: 'absorb', skyBrightness: 0.9, greenhouseK: 500, albedo: 0.77, haze: 0.85,
  },
  {
    key: 'titan', name: 'Titan-like (methane + tholin haze)', short: 'Titan',
    description: 'Photochemical tholin haze absorbs almost all blue; the sun through it is a small dim orange smear.',
    sky: 'absorb', skyBrightness: 0.6, greenhouseK: 21, albedo: 0.22, haze: 0.75,
  },
  {
    key: 'neptune', name: 'Methane-rich (Neptune-like)', short: 'CH4',
    description: 'Methane absorbs strongly in the red and transmits blue-green - everything takes on a cool cyan cast.',
    sky: 'absorb', skyBrightness: 0.8, greenhouseK: 12, albedo: 0.29, haze: 0.40,
  },
  {
    key: 'thin', name: 'Thin Rayleigh (~1/4 Earth)', short: 'Thin',
    description: 'An idealised clear atmosphere at about a quarter of Earth’s optical depth. Deep indigo sky, near-raw starlight.',
    sky: 'rayleigh', skyBrightness: 0.45, greenhouseK: 8, albedo: 0.18, haze: 0.04,
  },
  {
    key: 'thick', name: 'Thick Rayleigh (~8x Earth)', short: 'Thick',
    description: 'A deep Rayleigh atmosphere. Strong blue loss, a warm-tinted disk even at zenith, and a luminous washed-out sky.',
    sky: 'rayleigh', skyBrightness: 1.25, greenhouseK: 55, albedo: 0.42, haze: 0.35,
  },
  {
    key: 'hycean', name: 'Hycean (H2 over a global ocean)', short: 'Hycean',
    description: 'A hydrogen envelope over deep water. Weak Rayleigh scattering at short wavelengths plus broad H2O and CH4 bands in the near-IR.',
    sky: 'rayleigh', skyBrightness: 1.1, greenhouseK: 60, albedo: 0.35, haze: 0.30,
  },
];

const ATM_BY_KEY = Object.fromEntries(ATMOSPHERES.map((a) => [a.key, a]));

export function getAtmosphere(key) {
  return ATM_BY_KEY[key] || ATM_BY_KEY.off;
}

/** Beer's law transmission for a Rayleigh atmosphere anchored at 550 nm. */
function rayleigh(lambdaNm, tau550) {
  const tau = tau550 * Math.pow(550 / lambdaNm, 4);
  if (tau > 700) return 0;
  return Math.exp(-tau);
}

/** Piecewise-constant transmission - the first (lambdaMax, value) that fits wins. */
function piecewise(lambdaNm, breakpoints) {
  for (const [lmax, v] of breakpoints) if (lambdaNm < lmax) return v;
  return breakpoints[breakpoints.length - 1][1];
}

/**
 * Fraction of direct-beam light at `lambdaNm` that survives to the ground.
 * Returned value is in [0, 1].
 */
export function transmission(key, lambdaNm) {
  switch (key || 'off') {
    case 'off':
      return 1;
    case 'earth':
      return rayleigh(lambdaNm, 0.12);
    case 'earth_sunset':
      // ~38 air masses of Rayleigh plus a mild broadband aerosol floor, so the
      // disk does not go completely black in the blue.
      return rayleigh(lambdaNm, 1.4) * 0.65;
    case 'mars':
      return piecewise(lambdaNm, [
        [450, 0.18], [500, 0.32], [550, 0.48], [600, 0.68],
        [650, 0.82], [700, 0.90], [1e4, 0.92],
      ]);
    case 'venus':
      return piecewise(lambdaNm, [
        [420, 0.01], [460, 0.05], [500, 0.15], [550, 0.40],
        [600, 0.65], [650, 0.80], [1e4, 0.85],
      ]);
    case 'titan':
      return piecewise(lambdaNm, [
        [450, 0.01], [500, 0.05], [550, 0.20], [600, 0.45],
        [650, 0.70], [1e4, 0.80],
      ]);
    case 'neptune':
      // Methane absorption bands near 620, 720 and 790 nm are strong; blue-cyan
      // passes freely.
      return piecewise(lambdaNm, [
        [450, 0.85], [500, 0.85], [550, 0.75], [600, 0.55],
        [650, 0.20], [700, 0.08], [1e4, 0.05],
      ]);
    case 'thin':
      return rayleigh(lambdaNm, 0.03);
    case 'thick':
      return rayleigh(lambdaNm, 1.0);
    case 'hycean': {
      // H2 Rayleigh (weaker per-molecule than N2 but a deep column) with broad
      // water and methane windows carved out of the near-IR.
      const base = rayleigh(lambdaNm, 0.55);
      const band = (c, w, d) => 1 - d * Math.exp(-Math.pow((lambdaNm - c) / w, 2));
      return base * band(940, 45, 0.55) * band(820, 30, 0.35) * band(725, 25, 0.30);
    }
    default:
      return 1;
  }
}

/* ------------------------------------------------------------------ *
 * Exoplanet presets
 * ------------------------------------------------------------------ */

/**
 * Host stars for preset systems that are not already in the starlight-filter
 * star lists. Same field shape as stars.js.
 */
export const HOST_STARS = {
  'Kepler-186': { cls: 'M', lum: 'V', name: 'Kepler-186', short: '', teff: 3788, L: 0.0412, R: 0.523, notes: 'M1 V, 580 ly away in Cygnus.' },
  'Kepler-452': { cls: 'G', lum: 'V', name: 'Kepler-452', short: '', teff: 5757, L: 1.21, R: 1.11, notes: 'G2 V, an older and slightly brighter Sun analogue.' },
  'K2-18': { cls: 'M', lum: 'V', name: 'K2-18', short: '', teff: 3457, L: 0.0233, R: 0.41, notes: 'M2.5 V, 124 ly away in Leo.' },
  'GJ 667 C': { cls: 'M', lum: 'V', name: 'GJ 667 C', short: '', teff: 3700, L: 0.0137, R: 0.42, notes: 'M1.5 V in a triple system 23 ly away.' },
  'GJ 1214': { cls: 'M', lum: 'V', name: 'GJ 1214', short: '', teff: 3250, L: 0.00351, R: 0.215, notes: 'M4.5 V, host of the archetypal hazy mini-Neptune.' },
  '55 Cancri A': { cls: 'K', lum: 'V', name: '55 Cancri A', short: '', teff: 5172, L: 0.582, R: 0.943, notes: 'K0 IV-V, 41 ly away; five known planets.' },
  'Kepler-16 A': { cls: 'K', lum: 'V', name: 'Kepler-16 A', short: '', teff: 4450, L: 0.155, R: 0.649, notes: 'K-dwarf primary of the first confirmed circumbinary system.' },
  'Kepler-16 B': { cls: 'M', lum: 'V', name: 'Kepler-16 B', short: '', teff: 3311, L: 0.0055, R: 0.226, notes: 'M-dwarf secondary - the second sun in the sky.' },
  'Gliese 581': { cls: 'M', lum: 'V', name: 'Gliese 581', short: '', teff: 3480, L: 0.013, R: 0.299, notes: 'M3 V, 20 ly away in Libra.' },
};

/**
 * @typedef {Object} PlanetPreset
 * @property {string} key
 * @property {string} name
 * @property {string} host        Star name (from stars.js or HOST_STARS)
 * @property {string} [companion] Second sun in the sky, for circumbinary worlds
 * @property {number} a           Semi-major axis, AU
 * @property {number} radius      Planet radius, R_earth
 * @property {number} gravity     Surface gravity, g (Earth = 1)
 * @property {string} atmosphere  Atmosphere key
 * @property {number} water       Surface water fraction, 0-1
 * @property {number} roughness   Terrain relief, 0-1 (drives ridge amplitude)
 * @property {boolean} locked     Tidally locked to its star
 * @property {number} moons       Number of moons drawn in the sky
 * @property {string} notes
 */

export const PLANETS = [
  {
    key: 'earth', name: 'Earth', host: 'Sun', a: 1.0, radius: 1.0, gravity: 1.0,
    atmosphere: 'earth', water: 0.71, roughness: 0.45, locked: false, moons: 1,
    notes: 'The control case. Everything else is measured against this sky.',
  },
  {
    key: 'mars', name: 'Mars', host: 'Sun', a: 1.524, radius: 0.532, gravity: 0.379,
    atmosphere: 'mars', water: 0.0, roughness: 0.62, locked: false, moons: 2,
    notes: 'Cold, dry and dusty. Low gravity lets relief grow far taller than on Earth.',
  },
  {
    key: 'venus', name: 'Venus', host: 'Sun', a: 0.723, radius: 0.949, gravity: 0.904,
    atmosphere: 'venus', water: 0.0, roughness: 0.35, locked: false, moons: 0,
    notes: 'A runaway greenhouse under a permanent acid cloud deck.',
  },
  {
    key: 'titan', name: 'Titan (Saturn orbit)', host: 'Sun', a: 9.58, radius: 0.404, gravity: 0.138,
    atmosphere: 'titan', water: 0.03, roughness: 0.22, locked: true, moons: 0,
    notes: 'Methane rivers under an orange smog. Liquid, but far too cold for water biochemistry.',
  },
  {
    key: 'trappist1e', name: 'TRAPPIST-1 e', host: 'TRAPPIST-1', a: 0.02925, radius: 0.92, gravity: 0.93,
    atmosphere: 'earth', water: 0.55, roughness: 0.40, locked: true, moons: 0,
    notes: 'The most Earth-like of the seven. A huge dim red sun hangs fixed in the sky.',
  },
  {
    key: 'proximab', name: 'Proxima Centauri b', host: 'Proxima Centauri', a: 0.0485, radius: 1.03, gravity: 1.05,
    atmosphere: 'thin', water: 0.30, roughness: 0.55, locked: true, moons: 0,
    notes: 'The nearest exoplanet. Tidally locked and heavily flare-irradiated.',
  },
  {
    key: 'kepler186f', name: 'Kepler-186 f', host: 'Kepler-186', a: 0.432, radius: 1.17, gravity: 1.1,
    atmosphere: 'thick', water: 0.60, roughness: 0.42, locked: false, moons: 1,
    notes: 'The first Earth-sized planet found in a habitable zone. Its noon is dimmer than an Earth sunset.',
  },
  {
    key: 'lhs1140b', name: 'LHS 1140 b', host: 'LHS 1140', a: 0.0946, radius: 1.73, gravity: 1.85,
    atmosphere: 'thick', water: 0.45, roughness: 0.30, locked: true, moons: 0,
    notes: 'Dense and rocky - high gravity flattens the terrain and keeps vegetation low and broad.',
  },
  {
    key: 'toi700d', name: 'TOI-700 d', host: 'TOI 700', a: 0.163, radius: 1.07, gravity: 1.04,
    atmosphere: 'earth', water: 0.62, roughness: 0.45, locked: true, moons: 0,
    notes: 'A habitable-zone world around a quiet M dwarf - no strong flaring detected.',
  },
  {
    key: 'k218b', name: 'K2-18 b', host: 'K2-18', a: 0.1591, radius: 2.61, gravity: 1.24,
    atmosphere: 'hycean', water: 0.98, roughness: 0.10, locked: true, moons: 0,
    notes: 'The archetypal hycean candidate: a hydrogen sky over a global ocean.',
  },
  {
    key: 'kepler452b', name: 'Kepler-452 b', host: 'Kepler-452', a: 1.046, radius: 1.63, gravity: 1.6,
    atmosphere: 'thick', water: 0.66, roughness: 0.38, locked: false, moons: 2,
    notes: 'Earth’s older, larger cousin - 1.5 billion years further along the same orbit.',
  },
  {
    key: 'gj667cc', name: 'GJ 667 C c', host: 'GJ 667 C', a: 0.125, radius: 1.5, gravity: 1.4,
    atmosphere: 'earth', water: 0.50, roughness: 0.48, locked: true, moons: 0,
    notes: 'A super-Earth in a triple system - two more suns sit as bright stars in the night sky.',
  },
  {
    key: 'kepler16b', name: 'Kepler-16 (AB) b', host: 'Kepler-16 A', companion: 'Kepler-16 B',
    a: 0.7048, radius: 8.45, gravity: 1.35,
    atmosphere: 'neptune', water: 0.20, roughness: 0.25, locked: false, moons: 3,
    notes: 'The real Tatooine: a Saturn-mass world orbiting two stars, so every shadow is doubled.',
  },
  {
    key: 'gj1214b', name: 'GJ 1214 b', host: 'GJ 1214', a: 0.01411, radius: 2.74, gravity: 0.91,
    atmosphere: 'titan', water: 0.80, roughness: 0.08, locked: true, moons: 0,
    notes: 'A steam world under an opaque high-altitude haze that flattens its spectrum.',
  },
  {
    key: 'gliese581g', name: 'Gliese 581 g (unconfirmed)', host: 'Gliese 581', a: 0.146, radius: 1.5, gravity: 1.3,
    atmosphere: 'earth', water: 0.58, roughness: 0.50, locked: true, moons: 1,
    notes: 'A disputed detection kept here as a thought experiment - the classic terminator world.',
  },
];

export function getPlanet(key) {
  return PLANETS.find((p) => p.key === key) || PLANETS[0];
}

/* ------------------------------------------------------------------ *
 * Biome classification
 * ------------------------------------------------------------------ */

/**
 * Classify a surface from equilibrium temperature, water fraction and the
 * photosynthetically usable photon flux.
 *
 * `parRel` is the 400-1100 nm photon flux at the surface relative to Earth's.
 * The vegetation cut-offs are deliberately generous: terrestrial photosynthesis
 * saturates well below full sunlight and shade plants manage on a few percent
 * of it, so the interesting question on a dim M-dwarf world is not "is there
 * enough light" but "which wavelengths".
 */
export function classifyBiome({ tempK, water, parRel, locked, atmosphere }) {
  const dry = water < 0.08;
  const ocean = water > 0.9;
  const t = tempK;

  let zone, blurb;
  if (t < 150) { zone = 'Cryogenic'; blurb = 'Volatiles are frozen solid; any liquid is a deep subsurface ocean.'; }
  else if (t < 200) { zone = 'Deep glacial'; blurb = 'A permanent ice sheet with sublimation frosts and no open water.'; }
  else if (t < 240) { zone = dry ? 'Polar desert' : 'Glacial'; blurb = 'Ice-dominated with brief meltwater margins near the warmest latitudes.'; }
  else if (t < 268) { zone = dry ? 'Cold desert' : 'Tundra'; blurb = 'A short growing season; low, dense, ground-hugging growth forms.'; }
  else if (t < 283) { zone = dry ? 'Steppe' : 'Boreal analogue'; blurb = 'Cool and stable - the classic tall-canopy, needle-analogue regime.'; }
  else if (t < 297) { zone = dry ? 'Semi-arid' : (ocean ? 'Oceanic temperate' : 'Temperate'); blurb = 'The broad, comfortable middle: liquid water year-round and a long season.'; }
  else if (t < 315) { zone = dry ? 'Hot desert' : (ocean ? 'Tropical ocean' : 'Tropical'); blurb = 'Warm and productive; layered canopies competing hard for light.'; }
  else if (t < 350) { zone = dry ? 'Extreme desert' : 'Superhumid hothouse'; blurb = 'Near the upper limit for complex biochemistry - heat-shock territory.'; }
  else if (t < 500) { zone = 'Hothouse'; blurb = 'Above the survivable range for any water-based surface biology.'; }
  else { zone = 'Molten'; blurb = 'Surface rock is at or near its melting point.'; }

  if (locked) zone += ' (terminator band)';

  // Vegetation viability: liquid water, a survivable temperature, and any
  // meaningful photon supply at all.
  const tempOk = t > 205 && t < 350;
  const waterOk = water > 0.02;
  const lightOk = parRel > 0.002;
  const vegetated = tempOk && waterOk && lightOk;

  let veto = null;
  if (!tempOk) veto = t <= 205 ? 'too cold for liquid water at the surface' : 'too hot for water-based biochemistry';
  else if (!waterOk) veto = 'no surface water';
  else if (!lightOk) veto = 'photon flux too low to drive photosynthesis';

  // Vegetation density, 0-1, from light, warmth and water together.
  let density = 0;
  if (vegetated) {
    const lightTerm = Math.min(1, Math.pow(parRel / 0.35, 0.45));
    const warmTerm = Math.max(0, 1 - Math.abs(t - 295) / 70);
    const waterTerm = Math.min(1, water / 0.45);
    density = Math.max(0.05, lightTerm * 0.5 + warmTerm * 0.3 + waterTerm * 0.2);
    density = Math.min(1, density * (0.55 + 0.45 * warmTerm));
    if (atmosphere === 'off') density = 0;
  }

  return { zone, blurb, vegetated: vegetated && density > 0, density, veto };
}
