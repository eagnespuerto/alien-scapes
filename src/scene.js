/**
 * The scene model: turn UI state into every derived physical quantity and
 * colour the renderer, the charts and the export sheet need.
 *
 * Nothing downstream of here does physics. If a colour appears on screen, it
 * was computed in this file from a spectrum.
 */

import {
  LAMBDA, spdToSrgb, spdToSrgbToneMapped, spdToXyz, chromaticity,
  wienPeakNm, mixRgb, luma, toHex,
} from './cie.js';
import {
  ALL_STARS, findStar, habitableZone, angularDiameterDeg,
  insolation, equilibriumTempK,
} from './stars.js';
import {
  ATMOSPHERES, getAtmosphere, transmission, HOST_STARS, getPlanet, classifyBiome,
} from './planets.js';
import {
  surfaceLight, choosePigments, solveLeaf, usablePhotonFlux,
  photonPeakNm, uvFraction, explainSuite,
} from './pigments.js';

/* ------------------------------------------------------------------ *
 * Surface mineralogy
 * ------------------------------------------------------------------ */

/**
 * Spectral reflectance models for regolith. Each is a simple function of
 * wavelength that stands in for a mineral's diffuse reflectance, so ground
 * colour comes out of the same illuminant x reflectance integral as the
 * leaves do - rather than being an art-directed hex code.
 */
export const MINERALS = {
  basalt: {
    name: 'Basalt', r: () => 0.09,
    notes: 'Fresh volcanic rock: dark and spectrally flat.',
  },
  ironoxide: {
    name: 'Iron oxide', r: (l) => 0.03 + 0.34 / (1 + Math.exp(-(l - 590) / 55)),
    notes: 'Oxidised dust. Steeply rising from blue to red - the Mars palette.',
  },
  granite: {
    name: 'Feldspathic', r: (l) => 0.30 + 0.10 / (1 + Math.exp(-(l - 600) / 90)),
    notes: 'Bright, pale, slightly warm continental crust.',
  },
  ice: {
    name: 'Water ice', r: (l) => 0.82 - 0.30 / (1 + Math.exp(-(l - 900) / 70)),
    notes: 'Very bright and neutral, darkening in the near-infrared.',
  },
  sulfur: {
    name: 'Sulfur / sulfate', r: (l) => 0.04 + 0.62 / (1 + Math.exp(-(l - 500) / 30)),
    notes: 'Absorbs hard below 480 nm and reflects everything above it - vivid yellow under a white sun.',
  },
  carbon: {
    name: 'Carbonaceous', r: () => 0.045,
    notes: 'Tholin-rich and organic-dark; almost no light comes back at all.',
  },
  salt: {
    name: 'Evaporite salt', r: () => 0.68,
    notes: 'Dry lake beds - bright and near-neutral, a mirror for whatever the sky is doing.',
  },
};

/** Default mineral per planet preset. */
const PLANET_MINERAL = {
  earth: 'granite', mars: 'ironoxide', venus: 'basalt', titan: 'carbon',
  trappist1e: 'basalt', proximab: 'basalt', kepler186f: 'granite',
  lhs1140b: 'basalt', toi700d: 'granite', k218b: 'basalt',
  kepler452b: 'granite', gj667cc: 'ironoxide', kepler16b: 'ice',
  gj1214b: 'carbon', gliese581g: 'ironoxide',
};

/* ------------------------------------------------------------------ *
 * Scene construction
 * ------------------------------------------------------------------ */

function resolveStar(name) {
  return findStar(name) || HOST_STARS[name] || findStar('Sun');
}

/** Air mass for a given elevation above the horizon, Kasten-Young style. */
function airMass(elevationDeg) {
  const e = Math.max(-1, elevationDeg);
  const rad = (e * Math.PI) / 180;
  return 1 / (Math.sin(rad) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
}

/**
 * Build the complete scene from UI state.
 *
 * @param {Object} s
 * @param {string} s.starName
 * @param {number} [s.teffOverride]  Free temperature slider, K
 * @param {string} s.planetKey
 * @param {string} s.atmosphere
 * @param {number} s.distanceAu
 * @param {number} s.water      0-1
 * @param {number} s.roughness  0-1
 * @param {string} s.mineral
 * @param {string} s.strategy   'auto' | 'chlorophyll' | 'retinal' | 'nitroplast'
 * @param {number} s.elevation  Star elevation above the horizon, degrees
 * @param {number} s.seed
 * @param {boolean} s.companionOn
 */
export function buildScene(s) {
  const base = resolveStar(s.starName);
  const star = s.teffOverride
    ? { ...base, teff: s.teffOverride, name: base.name, custom: true }
    : base;

  const planet = getPlanet(s.planetKey);
  const atm = getAtmosphere(s.atmosphere);
  const mineral = MINERALS[s.mineral] || MINERALS.basalt;

  const m = Math.min(38, Math.max(1, airMass(s.elevation)));
  const geometry = Math.max(0.02, Math.sin((Math.max(0, s.elevation) * Math.PI) / 180));

  const sBase = insolation(star, s.distanceAu);
  const direct = surfaceLight(star, atm.key, sBase * geometry, m);
  // Top-of-atmosphere light at the same geometry, for the sky calculation.
  const toa = surfaceLight(star, 'off', sBase * geometry, 1);

  // Diffuse skylight. Whatever a Rayleigh atmosphere removes from the direct
  // beam has to go somewhere, and most of it comes back down as skylight - so
  // the diffuse component is (1 - T) of the incident spectrum. An absorbing
  // haze converts that energy to heat instead, and returns far less of it.
  const scatterReturn = atm.sky === 'rayleigh' ? 0.55 : (atm.sky === 'absorb' ? 0.30 : 0);
  const diffuse = toa.energy.map((v, i) => v * (1 - direct.trans[i]) * scatterReturn);

  // Total downwelling irradiance at the surface. Leaves and rocks are lit by
  // this, not by the direct beam alone - on an overcast or hazy world the sky
  // IS the light source, and using the beam alone would render the ground far
  // too dark and far too saturated.
  const light = {
    energy: direct.energy.map((v, i) => v + diffuse[i]),
    trans: direct.trans,
    top: direct.top,
    photon: [],
  };
  light.photon = light.energy.map((v, i) => v * LAMBDA[i] / 550);

  const parRel = usablePhotonFlux(light);
  const peakNm = photonPeakNm(light);
  const uv = uvFraction(light);

  const suite = choosePigments(light, s.strategy, parRel, s.primaryPigment || null);
  const leaf = solveLeaf(light, suite, parRel);

  const tempK = equilibriumTempK(star, s.distanceAu, atm.albedo, atm.greenhouseK);
  const biome = classifyBiome({
    tempK, water: s.water, parRel, locked: planet.locked, atmosphere: atm.key,
  });

  const hz = habitableZone(star);
  const angDiam = angularDiameterDeg(star, s.distanceAu);

  /* ---- colours, all from spectra ---- */

  // The star's disk as seen from the ground, through the slant path. This one
  // uses the DIRECT beam only - the disk is not lit by the sky around it.
  const diskRgb = spdToSrgb(direct.energy, 1);

  /**
   * Exposure. Everything visible is tone-mapped through a single exposure
   * derived from the total downwelling light, which is what an eye (or a
   * camera) adapting to the scene would do. Without it, a TRAPPIST-1 noon at
   * 0.7x Earth insolation would render nearly black, when in reality it would
   * look like a bright overcast afternoon - dim in absolute terms, but well
   * inside the range human vision adapts to.
   */
  const totalY = spdToXyz(light.energy)[1];
  const exposure = 1.35 / Math.max(totalY, 1e-6);

  // Sky. For a Rayleigh atmosphere the sky glows with the light REMOVED from
  // the beam; for an absorbing dust or haze layer the whole sky takes on the
  // transmitted tint instead. The horizon gets a longer path than the zenith.
  const skyAt = (pathMul) => {
    if (atm.sky === 'none') return [0.014, 0.016, 0.032];
    const t = LAMBDA.map((l) => Math.pow(transmission(atm.key, l), Math.min(38, m * pathMul)));
    const spd = atm.sky === 'rayleigh'
      ? toa.energy.map((v, i) => v * (1 - t[i]))
      : toa.energy.map((v, i) => v * t[i]);
    return spdToSrgbToneMapped(spd, exposure * atm.skyBrightness * 0.75);
  };
  const skyZenith = skyAt(1.0);
  const skyHorizon = skyAt(2.6);

  // Regolith: total downwelling light x mineral reflectance, integrated the
  // same way as everything else.
  const rockSpd = light.energy.map((v, i) => v * mineral.r(LAMBDA[i]));
  const rockRgb = spdToSrgbToneMapped(rockSpd, exposure);

  // Water: a broad blue-green volume-scattering peak with strong absorption
  // past 600 nm, plus a specular component that simply mirrors the sky.
  const waterSpd = light.energy.map((v, i) => {
    const l = LAMBDA[i];
    return v * 0.07 * Math.exp(-0.5 * Math.pow((l - 475) / 130, 2));
  });
  const waterBody = spdToSrgbToneMapped(waterSpd, exposure);
  const waterRgb = mixRgb(waterBody, skyHorizon, 0.45);

  // Leaf colour goes through the same exposure, so vegetation sits in the same
  // adapted range as the ground it grows on.
  const leafSpd = light.energy.map((v, i) => v * leaf.reflectance[i]);
  const leafRgb = spdToSrgbToneMapped(leafSpd, exposure);

  // A moon is a rock lit by the same star as the ground, so it goes through the
  // same integral and the same exposure. Lunar-type regolith: about 12% albedo
  // with a mild red slope. Getting this from a spectrum rather than tinting the
  // star's own disk colour is what stops a moon rendering as a second sun -
  // reflected light off a dark rock is nowhere near as bright as the source.
  const moonSpd = direct.energy.map((v, i) =>
    v * (0.10 + 0.055 / (1 + Math.exp(-(LAMBDA[i] - 620) / 140))));
  const moonRgb = spdToSrgbToneMapped(moonSpd, exposure);

  const companion = s.companionOn && planet.companion ? resolveStar(planet.companion) : null;
  let companionRgb = null;
  if (companion) {
    const cl = surfaceLight(companion, atm.key, insolation(companion, s.distanceAu) * geometry, m);
    companionRgb = spdToSrgb(cl.energy, 1);
  }

  const [cx, cy] = chromaticity(direct.energy);

  return {
    star, planet, atm, mineral, mineralKey: s.mineral,
    direct, diffuse, exposure,
    companion, companionRgb,
    distanceAu: s.distanceAu,
    elevation: s.elevation,
    airmass: m,
    seed: s.seed,
    water: s.water,
    roughness: s.roughness,
    strategy: s.strategy,

    light, toa,
    parRel, peakNm, uv,
    wienNm: wienPeakNm(star.teff),
    chromaticity: [cx, cy],

    suite, leaf,
    explanation: explainSuite(suite, light, leaf, peakNm),

    insolation: sBase,
    tempK, hz, angDiam, biome,

    colors: {
      disk: diskRgb,
      skyZenith, skyHorizon,
      rock: rockRgb,
      water: waterRgb,
      leaf: leafRgb,
      moon: moonRgb,
    },
    hex: {
      disk: toHex(diskRgb),
      sky: toHex(skyZenith),
      rock: toHex(rockRgb),
      water: toHex(waterRgb),
      leaf: toHex(leafRgb),
      moon: toHex(moonRgb),
    },
    dayLuma: luma(skyZenith),
  };
}

/** Sensible starting state for the app. */
export function defaultState() {
  const p = getPlanet('earth');
  return {
    starName: 'Sun',
    teffOverride: null,
    planetKey: 'earth',
    atmosphere: p.atmosphere,
    distanceAu: p.a,
    water: p.water,
    roughness: p.roughness,
    mineral: PLANET_MINERAL.earth,
    strategy: 'auto',
    primaryPigment: null,
    elevation: 32,
    seed: 20260908,
    companionOn: true,
  };
}

/** State derived from selecting an exoplanet preset. */
export function stateFromPlanet(key, prev) {
  const p = getPlanet(key);
  return {
    ...prev,
    planetKey: key,
    starName: p.host,
    teffOverride: null,
    atmosphere: p.atmosphere,
    distanceAu: p.a,
    water: p.water,
    roughness: p.roughness,
    mineral: PLANET_MINERAL[key] || 'basalt',
    companionOn: true,
  };
}

export { PLANET_MINERAL };
