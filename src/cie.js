/**
 * Colorimetry core - ported from the `starlight-filter` project's spectrum.py.
 *
 * Path: Planck's Law x atmospheric transmission x CIE 1931 2-degree standard
 * observer -> CIE XYZ -> sRGB (D65 primaries) -> sRGB transfer function.
 * Every star therefore sits on the true Planckian locus rather than on a
 * piecewise approximation.
 *
 * Where alien-scapes goes further than starlight-filter: we keep the full
 * per-wavelength spectrum around (not just the integrated colour), because the
 * pigment model needs to know how many PHOTONS land at each wavelength.
 */

export const MIN_KELVIN = 1000;
export const MAX_KELVIN = 50000;

/** Planck's second radiation constant hc/k in nm*K, so lambda can be in nm. */
const C2_NM_K = 1.43877735e7;

/**
 * CIE 1931 2-degree standard observer colour matching functions, 5 nm
 * sampling from 380-780 nm (Wyszecki & Stiles). starlight-filter used 10 nm;
 * we double the resolution because narrow pigment absorption bands (retinal,
 * chlorophyll Qy) alias badly at 10 nm.
 * Rows: [wavelength_nm, xbar, ybar, zbar].
 */
export const CMF = [
  [380, 0.001368, 0.000039, 0.006450], [385, 0.002236, 0.000064, 0.010550],
  [390, 0.004243, 0.000120, 0.020050], [395, 0.007650, 0.000217, 0.036210],
  [400, 0.014310, 0.000396, 0.067850], [405, 0.023190, 0.000640, 0.110200],
  [410, 0.043510, 0.001210, 0.207400], [415, 0.077630, 0.002180, 0.371300],
  [420, 0.134380, 0.004000, 0.645600], [425, 0.214770, 0.007300, 1.039050],
  [430, 0.283900, 0.011600, 1.385600], [435, 0.328500, 0.016840, 1.622960],
  [440, 0.348280, 0.023000, 1.747060], [445, 0.348060, 0.029800, 1.782600],
  [450, 0.336200, 0.038000, 1.772110], [455, 0.318700, 0.048000, 1.744100],
  [460, 0.290800, 0.060000, 1.669200], [465, 0.251100, 0.073900, 1.528100],
  [470, 0.195360, 0.090980, 1.287640], [475, 0.142100, 0.112600, 1.041900],
  [480, 0.095640, 0.139020, 0.812950], [485, 0.057950, 0.169300, 0.616200],
  [490, 0.032010, 0.208020, 0.465180], [495, 0.014700, 0.258600, 0.353300],
  [500, 0.004900, 0.323000, 0.272000], [505, 0.002400, 0.407300, 0.212300],
  [510, 0.009300, 0.503000, 0.158200], [515, 0.029100, 0.608200, 0.111700],
  [520, 0.063270, 0.710000, 0.078250], [525, 0.109600, 0.793200, 0.057250],
  [530, 0.165500, 0.862000, 0.042160], [535, 0.225750, 0.914850, 0.029840],
  [540, 0.290400, 0.954000, 0.020300], [545, 0.359700, 0.980300, 0.013400],
  [550, 0.433450, 0.994950, 0.008750], [555, 0.512050, 1.000000, 0.005750],
  [560, 0.594500, 0.995000, 0.003900], [565, 0.678400, 0.978600, 0.002750],
  [570, 0.762100, 0.952000, 0.002100], [575, 0.842500, 0.915400, 0.001800],
  [580, 0.916300, 0.870000, 0.001650], [585, 0.978600, 0.816300, 0.001400],
  [590, 1.026300, 0.757000, 0.001100], [595, 1.056700, 0.694900, 0.001000],
  [600, 1.062200, 0.631000, 0.000800], [605, 1.045600, 0.566800, 0.000600],
  [610, 1.002600, 0.503000, 0.000340], [615, 0.938400, 0.441200, 0.000240],
  [620, 0.854450, 0.381000, 0.000190], [625, 0.751400, 0.321000, 0.000100],
  [630, 0.642400, 0.265000, 0.000050], [635, 0.541900, 0.217000, 0.000030],
  [640, 0.447900, 0.175000, 0.000020], [645, 0.360800, 0.138200, 0.000010],
  [650, 0.283500, 0.107000, 0.000000], [655, 0.218700, 0.081600, 0.000000],
  [660, 0.164900, 0.061000, 0.000000], [665, 0.121200, 0.044580, 0.000000],
  [670, 0.087400, 0.032000, 0.000000], [675, 0.063600, 0.023200, 0.000000],
  [680, 0.046770, 0.017000, 0.000000], [685, 0.032900, 0.011920, 0.000000],
  [690, 0.022700, 0.008210, 0.000000], [695, 0.015840, 0.005723, 0.000000],
  [700, 0.011359, 0.004102, 0.000000], [705, 0.008111, 0.002929, 0.000000],
  [710, 0.005790, 0.002091, 0.000000], [715, 0.004109, 0.001484, 0.000000],
  [720, 0.002899, 0.001047, 0.000000], [725, 0.002049, 0.000740, 0.000000],
  [730, 0.001440, 0.000520, 0.000000], [735, 0.001000, 0.000361, 0.000000],
  [740, 0.000690, 0.000249, 0.000000], [745, 0.000476, 0.000172, 0.000000],
  [750, 0.000332, 0.000120, 0.000000], [755, 0.000235, 0.000085, 0.000000],
  [760, 0.000166, 0.000060, 0.000000], [765, 0.000117, 0.000042, 0.000000],
  [770, 0.000083, 0.000030, 0.000000], [775, 0.000059, 0.000021, 0.000000],
  [780, 0.000042, 0.000015, 0.000000],
];

/**
 * Wavelength grid used for every spectrum in the app. It extends well past the
 * CIE range (300-1100 nm) because far-red / near-IR pigments (chlorophyll d and
 * f, bacteriochlorophyll) and UV stress both live outside human vision, and the
 * charts are meant to show that.
 */
export const LAMBDA_MIN = 300;
export const LAMBDA_MAX = 1100;
export const LAMBDA_STEP = 5;
export const LAMBDA = (() => {
  const out = [];
  for (let l = LAMBDA_MIN; l <= LAMBDA_MAX; l += LAMBDA_STEP) out.push(l);
  return out;
})();

/** Index into a LAMBDA-aligned array for a given wavelength. */
export function lambdaIndex(nm) {
  return Math.round((nm - LAMBDA_MIN) / LAMBDA_STEP);
}

/** Blackbody spectral radiance shape (absolute scale dropped). */
export function planck(lambdaNm, kelvin) {
  const exponent = C2_NM_K / (lambdaNm * kelvin);
  if (exponent > 700) return 0; // exp overflow guard for cool stars in the UV
  return 1 / (Math.pow(lambdaNm, 5) * (Math.exp(exponent) - 1));
}

/** Wien peak wavelength in nm - where a blackbody's ENERGY spectrum peaks. */
export function wienPeakNm(kelvin) {
  return 2.897771955e6 / kelvin;
}

/* ------------------------------------------------------------------ *
 * XYZ / sRGB
 * ------------------------------------------------------------------ */

function xyzToLinearSrgb(x, y, z) {
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.2040 * y + 1.0570 * z,
  ];
}

/** sRGB opto-electronic transfer function (linear light -> display code). */
export function srgbEncode(v) {
  if (v <= 0) return 0;
  if (v <= 0.0031308) return 12.92 * v;
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * Integrate an arbitrary spectral power distribution against the CMF.
 * `spd` is either a function of wavelength (nm) or an array aligned to LAMBDA.
 */
export function spdToXyz(spd) {
  const sample = typeof spd === 'function'
    ? spd
    : (l) => spd[lambdaIndex(l)] || 0;
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < CMF.length; i++) {
    const row = CMF[i];
    const b = sample(row[0]);
    X += b * row[1]; Y += b * row[2]; Z += b * row[3];
  }
  return [X, Y, Z];
}

/** CIE 1931 (x, y) chromaticity of a spectrum. */
export function chromaticity(spd) {
  const [X, Y, Z] = spdToXyz(spd);
  const s = X + Y + Z;
  if (s <= 0) return [0, 0];
  return [X / s, Y / s];
}

/**
 * Normalise XYZ to unit luminance then convert to display sRGB, scaling so the
 * brightest channel hits `peak`. This is the "what colour is it" path - it
 * deliberately discards absolute brightness, exactly as starlight-filter did
 * when computing gamma-ramp scale factors.
 */
export function xyzToSrgb(X, Y, Z, peak = 1) {
  if (Y <= 0) return [0, 0, 0];
  const [rl, gl, bl] = xyzToLinearSrgb(X / Y, 1, Z / Y);
  const r = srgbEncode(Math.max(0, rl));
  const g = srgbEncode(Math.max(0, gl));
  const b = srgbEncode(Math.max(0, bl));
  const m = Math.max(r, g, b);
  if (m <= 0) return [0, 0, 0];
  const k = peak / m;
  return [r * k, g * k, b * k];
}

/** Chromaticity-only colour of a spectrum, normalised to a bright swatch. */
export function spdToSrgb(spd, peak = 1) {
  const [X, Y, Z] = spdToXyz(spd);
  return xyzToSrgb(X, Y, Z, peak);
}

/**
 * Convert a spectrum to sRGB while PRESERVING relative luminance, normalised
 * against a reference white integral. Used for leaf reflectance, where a very
 * dark leaf should actually render dark rather than being re-brightened.
 */
export function spdToSrgbAbsolute(spd, referenceY) {
  const [X, Y, Z] = spdToXyz(spd);
  if (referenceY <= 0) return [0, 0, 0];
  const s = 1 / referenceY;
  const [rl, gl, bl] = xyzToLinearSrgb(X * s, Y * s, Z * s);
  return [
    srgbEncode(Math.min(1, Math.max(0, rl))),
    srgbEncode(Math.min(1, Math.max(0, gl))),
    srgbEncode(Math.min(1, Math.max(0, bl))),
  ];
}

/**
 * Convert a spectrum to sRGB with a soft luminance roll-off instead of a hard
 * clip.
 *
 * A physically-integrated sky or a bright mineral under a hot star routinely
 * lands outside the sRGB cube. Clipping each channel independently there does
 * not just lose brightness, it destroys hue - which is how a deep Rayleigh sky
 * ends up rendering as flat white. Here the CHROMATICITY comes straight from
 * the spectrum and only the LUMINANCE passes through the tone curve
 * Y' = 1 - exp(-exposure * Y); out-of-gamut chroma is then desaturated toward
 * the neutral of the same luminance rather than clipped away channel by
 * channel.
 */
export function spdToSrgbToneMapped(spd, exposure = 1) {
  const [X, Y, Z] = spdToXyz(spd);
  if (Y <= 0) return [0, 0, 0];
  const Yd = 1 - Math.exp(-exposure * Y);
  const s = Yd / Y;
  let [r, g, b] = xyzToLinearSrgb(X * s, Yd, Z * s);

  const min = Math.min(r, g, b);
  if (min < 0) { r -= min; g -= min; b -= min; } // desaturate into gamut
  const max = Math.max(r, g, b);
  if (max > 1) { r /= max; g /= max; b /= max; }

  return [srgbEncode(r), srgbEncode(g), srgbEncode(b)];
}

export function toHex(rgb) {
  const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16).padStart(2, '0');
  return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
}

export function toCss(rgb, a = 1) {
  const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const s = c(rgb[0]) + ',' + c(rgb[1]) + ',' + c(rgb[2]);
  return a >= 1 ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + a + ')';
}

/** Multiply an sRGB triple by a scalar, staying in display space. */
export function scaleRgb(rgb, k) {
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}

/** Linear interpolation between two sRGB triples. */
export function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Relative luminance of an sRGB triple (Rec. 709 weights, display space). */
export function luma(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Approximate sRGB for a single monochromatic wavelength - used by charts. */
export function wavelengthToRgb(lambdaNm) {
  if (lambdaNm < 380 || lambdaNm > 780) {
    // Outside human vision: render UV as violet-grey and IR as a dark red-grey,
    // so the charts still read as "light" without pretending it is visible.
    if (lambdaNm < 380) {
      const t = Math.min(1, (380 - lambdaNm) / 80);
      return [0.30 - 0.16 * t, 0.16 - 0.10 * t, 0.46 - 0.22 * t];
    }
    const t = Math.min(1, (lambdaNm - 780) / 320);
    return [0.44 - 0.26 * t, 0.11 - 0.06 * t, 0.11 - 0.06 * t];
  }
  const i = Math.max(0, Math.min(CMF.length - 1, Math.round((lambdaNm - 380) / 5)));
  const row = CMF[i];
  return xyzToSrgb(row[1], row[2], row[3], 1);
}
