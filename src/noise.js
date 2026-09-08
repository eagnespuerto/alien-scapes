/**
 * Seeded pseudo-random numbers and 1-D value noise.
 *
 * Everything the landscape renderer does is driven from a single integer seed,
 * so the same seed always produces the same world - which matters, because an
 * exported PNG is only useful as a record if you can get back to the scene.
 */

/** mulberry32 - small, fast, and good enough for terrain. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash one integer to [0, 1) - the lattice values for value noise. */
function hash01(i, seed) {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 1-D value noise with smooth (quintic) interpolation. */
export function valueNoise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i, seed);
  const b = hash01(i + 1, seed);
  return a + (b - a) * fade(f);
}

/**
 * Fractal Brownian motion: octaves of value noise at doubling frequency and
 * halving amplitude. `ridged` folds the noise about zero, which turns rolling
 * hills into sharp mountain crests.
 */
export function fbm(x, { seed = 1, octaves = 5, lacunarity = 2, gain = 0.5, ridged = false } = {}) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = valueNoise1(x * freq, seed + o * 1013);
    if (ridged) n = 1 - Math.abs(n * 2 - 1);
    sum += n * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Pick a random element from an array using the supplied rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Uniform value in [lo, hi). */
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Turn an arbitrary string into a 32-bit seed, for shareable named seeds. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
