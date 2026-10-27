/**
 * Stellar presets.
 *
 * The spectral-class grid and the named-star list are ported from
 * `starlight-filter`'s spectrum.py. Bolometric luminosities (L / L_sun) and
 * radii (R / R_sun) are added here because alien-scapes needs them to work out
 * how much light actually reaches a planet at a given orbital distance.
 *
 * Luminosity and radius figures are literature ballpark values, rounded. They
 * are good enough to place a planet in or out of a habitable zone; they are not
 * a substitute for a stellar-parameters catalogue.
 */

/**
 * @typedef {Object} Star
 * @property {string} cls       Spectral class letter ("O".."M", plus WR/D/L/T)
 * @property {string} lum       Luminosity class ("V" dwarf, "III" giant, ...)
 * @property {string} name      Display name
 * @property {string} short     <=4 char button face ("" for dropdown-only)
 * @property {number} teff      Effective temperature, K
 * @property {number} L         Bolometric luminosity, L_sun
 * @property {number} R         Radius, R_sun
 * @property {string} notes     One-line description
 */

/** The 2x7 spectral matrix: dwarfs (V) on top, giants (III) below. */
export const GRID_STARS = [
  { cls: 'O', lum: 'V', name: '10 Lacertae', short: '10L', teff: 36000, L: 100000, R: 8.3, notes: 'Canonical O9 V spectral standard.' },
  { cls: 'B', lum: 'V', name: 'Achernar', short: 'Ach', teff: 15000, L: 3150, R: 7.3, notes: 'B6 Vpe rapid rotator; photospheric Teff.' },
  { cls: 'A', lum: 'V', name: 'Vega', short: 'Veg', teff: 9600, L: 40.1, R: 2.36, notes: 'A0 V spectral standard.' },
  { cls: 'F', lum: 'V', name: 'Procyon', short: 'Pro', teff: 6530, L: 6.93, R: 2.05, notes: 'F5 IV-V.' },
  { cls: 'G', lum: 'V', name: 'Sun', short: 'Sun', teff: 5778, L: 1.0, R: 1.0, notes: 'G2 V - the reference case.' },
  { cls: 'K', lum: 'V', name: 'Epsilon Eridani', short: 'eEri', teff: 5080, L: 0.34, R: 0.735, notes: 'K2 V.' },
  { cls: 'M', lum: 'V', name: 'Proxima Centauri', short: 'Prox', teff: 2833, L: 0.0015, R: 0.162, notes: 'M5.5 Ve - nearest star. R and Teff from Anugu et al. 2026 (arXiv:2610.33373).' },
  { cls: 'O', lum: 'III', name: 'Meissa', short: 'Mei', teff: 35000, L: 165000, R: 10.0, notes: 'Lambda Orionis A, O8 III.' },
  { cls: 'B', lum: 'III', name: 'Bellatrix', short: 'Bel', teff: 22000, L: 9200, R: 5.75, notes: 'Gamma Orionis, B2 III.' },
  { cls: 'A', lum: 'III', name: 'Thuban', short: 'Thu', teff: 9750, L: 240, R: 3.4, notes: 'Alpha Draconis, A0 III.' },
  { cls: 'F', lum: 'III', name: 'Caph', short: 'Cph', teff: 7080, L: 27.3, R: 3.5, notes: 'Beta Cassiopeiae, F2 III-IV.' },
  { cls: 'G', lum: 'III', name: 'Capella Aa', short: 'Cap', teff: 4970, L: 78.7, R: 11.98, notes: 'Alpha Aurigae Aa, G8 III.' },
  { cls: 'K', lum: 'III', name: 'Arcturus', short: 'Arc', teff: 4290, L: 170, R: 25.4, notes: 'Alpha Bootis, K1.5 III.' },
  { cls: 'M', lum: 'III', name: 'Gacrux', short: 'Gac', teff: 3690, L: 820, R: 84, notes: 'Gamma Crucis, M3.5 III.' },
];

/**
 * Extra famous stars for the dropdown. Sorted hot -> cool so the list mirrors
 * the temperature slider. Includes exotic classes (WR, D, L, T) that fall
 * outside the O-M main-sequence grid.
 */
export const NAMED_STARS = [
  { cls: 'WR', lum: '', name: 'WR 22', short: '', teff: 44700, L: 1000000, R: 24, notes: 'WN7h Wolf-Rayet in Carina; hydrogen-rich.' },
  { cls: 'B', lum: 'III', name: 'Spica', short: '', teff: 25300, L: 20500, R: 7.4, notes: 'Alpha Virginis Aa, B1 III-IV.' },
  { cls: 'D', lum: 'A', name: 'Sirius B', short: '', teff: 25200, L: 0.056, R: 0.0084, notes: 'DA2 white dwarf - Earth-sized, Sun-massed.' },
  { cls: 'B', lum: 'V', name: 'Regulus', short: '', teff: 12460, L: 316, R: 3.09, notes: 'Alpha Leonis A, B8 IVn.' },
  { cls: 'B', lum: 'I', name: 'Rigel', short: '', teff: 12100, L: 120000, R: 78.9, notes: 'Beta Orionis Aa, B8 Ia supergiant.' },
  { cls: 'A', lum: 'V', name: 'Sirius A', short: '', teff: 9940, L: 25.4, R: 1.71, notes: 'Alpha Canis Majoris A, A1 V.' },
  { cls: 'A', lum: 'V', name: 'Fomalhaut', short: '', teff: 8590, L: 16.6, R: 1.84, notes: 'Alpha Piscis Austrini A, A3 V.' },
  { cls: 'A', lum: 'I', name: 'Deneb', short: '', teff: 8525, L: 196000, R: 203, notes: 'Alpha Cygni, A2 Ia supergiant.' },
  { cls: 'A', lum: 'V', name: 'Altair', short: '', teff: 7550, L: 10.6, R: 1.63, notes: 'Alpha Aquilae, A7 V.' },
  { cls: 'A', lum: 'II', name: 'Canopus', short: '', teff: 7350, L: 10700, R: 71, notes: 'Alpha Carinae, A9 II bright giant.' },
  { cls: 'F', lum: 'I', name: 'Polaris', short: '', teff: 6015, L: 1260, R: 37.5, notes: 'Alpha Ursae Minoris Aa, F7 Ib - the North Star.' },
  { cls: 'G', lum: 'V', name: 'Alpha Centauri A', short: '', teff: 5790, L: 1.52, R: 1.22, notes: 'G2 V - the Sun’s near-twin.' },
  { cls: 'G', lum: 'V', name: 'Tau Ceti', short: '', teff: 5344, L: 0.52, R: 0.79, notes: 'G8 V - nearby sun-like star.' },
  { cls: 'K', lum: 'V', name: '40 Eridani A', short: '', teff: 5300, L: 0.457, R: 0.81, notes: 'K0.5 V - triple system 16 ly away.' },
  { cls: 'K', lum: 'V', name: 'Toliman (Alpha Centauri B)', short: '', teff: 5260, L: 0.50, R: 0.86, notes: 'K1 V - the nearest K dwarf.' },
  { cls: 'K', lum: 'III', name: 'Pollux', short: '', teff: 4666, L: 43, R: 8.8, notes: 'Beta Geminorum, K0 III.' },
  { cls: 'K', lum: 'III', name: 'Aldebaran', short: '', teff: 3910, L: 439, R: 45.1, notes: 'Alpha Tauri, K5 III.' },
  { cls: 'M', lum: 'I', name: 'Antares', short: '', teff: 3660, L: 75900, R: 680, notes: 'Alpha Scorpii A, M1.5 Iab supergiant.' },
  { cls: 'M', lum: 'I', name: 'Betelgeuse', short: '', teff: 3600, L: 126000, R: 764, notes: 'Alpha Orionis, M1-2 Ia-Iab supergiant.' },
  { cls: 'M', lum: 'V', name: 'TOI 700', short: '', teff: 3480, L: 0.0233, R: 0.420, notes: 'M2 V - hosts habitable-zone planets d and e.' },
  { cls: 'M', lum: 'V', name: 'GJ 251', short: '', teff: 3448, L: 0.0139, R: 0.36, notes: 'M3 V - hosts a super-Earth candidate.' },
  { cls: 'M', lum: 'V', name: 'Barnard’s Star', short: '', teff: 3134, L: 0.0035, R: 0.187, notes: 'M4 V - highest known proper motion.' },
  { cls: 'M', lum: 'V', name: 'GJ 725 B', short: '', teff: 3104, L: 0.0041, R: 0.31, notes: 'M3.5 V - companion in a pair 12 ly away.' },
  { cls: 'M', lum: 'V', name: 'LHS 1140', short: '', teff: 3096, L: 0.0038, R: 0.216, notes: 'M4.5 V - hosts a rocky habitable-zone planet.' },
  { cls: 'M', lum: 'V', name: 'Teegarden’s Star', short: '', teff: 2904, L: 0.00073, R: 0.107, notes: 'M7.0 V ultracool dwarf 12.5 ly away.' },
  { cls: 'M', lum: 'V', name: 'TRAPPIST-1', short: '', teff: 2566, L: 0.000553, R: 0.1192, notes: 'M8 V ultracool dwarf; hosts 7 known planets.' },
  { cls: 'L', lum: 'V', name: 'Luhman 16 A', short: '', teff: 1310, L: 2.24e-5, R: 0.10, notes: 'L7.5 brown dwarf, third-closest system.' },
  { cls: 'T', lum: 'V', name: 'Luhman 16 B', short: '', teff: 1210, L: 1.86e-5, R: 0.10, notes: 'T0.5 brown dwarf; L/T transition companion.' },
];

export const ALL_STARS = GRID_STARS.concat(NAMED_STARS);

/** Rough per-class accent colours, used for chips and the class matrix. */
export const CLASS_ACCENT = {
  O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff',
  G: '#fff4ea', K: '#ffd2a1', M: '#ffb56c',
  WR: '#c9e4ff', D: '#e8f0ff', L: '#ff8f6b', T: '#d98a9e',
};

export function findStar(name) {
  return ALL_STARS.find((s) => s.name === name) || null;
}

/**
 * Habitable-zone bounds in AU, using the Kopparapu et al. (2013) "runaway
 * greenhouse" (inner) and "maximum greenhouse" (outer) coefficients evaluated
 * at the star's effective temperature. The polynomial is fitted for
 * 2600 K <= Teff <= 7200 K; outside that range we clamp Teff, which is why the
 * UI flags hot stars as extrapolated.
 */
export function habitableZone(star) {
  const tst = Math.max(2600, Math.min(7200, star.teff)) - 5780;
  // [S_eff_sun, a, b, c, d] for runaway greenhouse and maximum greenhouse.
  const inner = [1.0512, 1.3242e-4, 1.5418e-8, -7.9895e-12, -1.8328e-15];
  const outer = [0.3438, 5.8942e-5, 1.6558e-9, -3.0045e-12, -5.2983e-16];
  const seff = (c) => c[0] + c[1] * tst + c[2] * tst * tst
    + c[3] * Math.pow(tst, 3) + c[4] * Math.pow(tst, 4);
  return {
    inner: Math.sqrt(star.L / seff(inner)),
    outer: Math.sqrt(star.L / seff(outer)),
    extrapolated: star.teff < 2600 || star.teff > 7200,
  };
}

/**
 * Angular diameter of the star's disk as seen from the planet, in degrees.
 * The Sun from Earth is ~0.53 deg; this is what makes an M-dwarf sky look so
 * strange, since a close-in habitable-zone planet sees a huge dim disk.
 */
export function angularDiameterDeg(star, distanceAu) {
  const R_SUN_AU = 0.00465047;
  if (distanceAu <= 0) return 0;
  return 2 * Math.atan((star.R * R_SUN_AU) / distanceAu) * (180 / Math.PI);
}

/** Insolation at `distanceAu`, in Earth-equivalent flux (S / S_earth). */
export function insolation(star, distanceAu) {
  if (distanceAu <= 0) return Infinity;
  return star.L / (distanceAu * distanceAu);
}

/**
 * Equilibrium temperature in kelvin, plus a crude greenhouse offset supplied by
 * the atmosphere preset. T_eq = 278.5 * ((1-A) * S)^0.25 with S in Earth flux.
 */
export function equilibriumTempK(star, distanceAu, albedo, greenhouseK) {
  const S = insolation(star, distanceAu);
  if (!isFinite(S)) return Infinity;
  const teq = 278.5 * Math.pow(Math.max(0, (1 - albedo) * S), 0.25);
  return teq + (greenhouseK || 0);
}
