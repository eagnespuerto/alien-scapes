# Alien-scapes

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![made with](https://img.shields.io/badge/made%20with-JavaScript-F7DF1E?logo=javascript&logoColor=white)](https://github.com/eagnespuerto/alien-scapes)
[![website](https://img.shields.io/badge/website-live-brightgreen)](https://eagnespuerto.github.io/alien-scapes/)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support%20me-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/eagnespuerto)
[![Linktree](https://img.shields.io/badge/Linktree-soitsagnes-43E55E?logo=linktree&logoColor=white)](https://linktr.ee/soitsagnes)

Procedurally generated landscapes under other suns, where **every colour on
screen is computed from a spectrum** rather than chosen by hand.

Pick a star, an exoplanet and an atmosphere, and the page works out what the sky,
the ground, the water and — if anything can live there — the vegetation would
actually look like. Then it shows you the spectra behind that answer and lets you
export the whole thing as a data sheet.

**→ [Open Alien-scapes](https://eagnespuerto.github.io/alien-scapes/)**

No build step, no dependencies, no network calls. It is a handful of ES modules
and a canvas.

---

## What it does

- **14 stellar presets** on a spectral-class grid (O–M, dwarfs and giants) plus
  **28 more named stars** including Wolf-Rayet, white dwarf and brown dwarf
  classes — and a free temperature slider from 1,000 K to 50,000 K.
- **15 exoplanet presets** — Earth, Mars, Venus and Titan as controls, then
  TRAPPIST-1 e, Proxima b, Kepler-186 f, LHS 1140 b, TOI-700 d, K2-18 b,
  Kepler-452 b, GJ 667 C c, GJ 1214 b, Gliese 581 g, and the circumbinary
  Kepler-16 (AB) b, which really does have two suns in the sky.
- **10 atmospheres**, from airless through Earth Rayleigh, Mars dust, Venus acid
  cloud, Titan tholin haze, methane-rich and hycean.
- **Leaf colours per spectral type**, derived from a pigment model rather than a
  lookup table — including the purple result for a retinal biosphere.
- **Three charts**: the surface spectrum, the pigment absorption curves
  (retinal, chlorophyll and the nitroplast antenna, plus whatever the model
  selected), and the resulting leaf reflectance with its red edge marked.
- **Export** to PNG, JPG or PDF as a full data sheet — the landscape plus every
  number behind it — or the landscape on its own.

---

## How the colours are computed

Nothing here is art-directed. Each colour is the result of an integral.

### Starlight

The star is treated as a blackbody at its effective temperature. Planck's law
gives the emitted spectrum, an atmospheric transmission profile attenuates it,
and the result is integrated against the **CIE 1931 2° standard observer** to get
tristimulus XYZ, then converted to sRGB through the D65 primaries and the sRGB
transfer function. This path is ported from
[starlight-filter](https://github.com/eagnespuerto/starlight-filter), which uses
the same integral to drive a display's gamma ramp.

Because Beer's law is exponential in path length, a lower star simply means the
zenith transmission raised to the air mass. That one relationship is why the same
model produces a blue noon and a red sunset without being told about either.

### Sky, ground and water

A Rayleigh atmosphere scatters short wavelengths out of the beam, so the sky
glows with **exactly what the beam lost**. Dust and haze absorb rather than
scatter, so those skies take the transmitted tint instead of its complement —
which is why Mars is butterscotch rather than blue.

Ground colour is the total downwelling light (direct beam *plus* skylight) times
a mineral reflectance curve, integrated the same way. Out-of-gamut results are
tone-mapped on luminance with the chromaticity preserved, so a deep Rayleigh sky
comes out pale blue instead of clipping to flat white.

### Vegetation

Photosynthesis is a quantum process, so the model counts **photons**, not energy.
A reaction-centre pigment is chosen by weighing three things against each other:

1. **Capture** — how many arriving photons the absorption curve takes.
2. **Thermalisation** — every captured photon is worth `1/λ_trap`, because
   energy above the trap is dumped as heat. This is what stops far-red pigments
   winning under every star.
3. **Cost** — a pigment absorbing everywhere is metabolically expensive.

Antenna pigments are then layered on, constrained by what can physically attach
to what: a chlorophyll photosystem accepts chlorophyll b, carotenoids and
phycobiliproteins, while a rhodopsin accepts only a carotenoid and
bacteriorhodopsin runs bare. Phycobiliproteins carry a heavy cost penalty because
a phycobilisome can run to half a cell's protein — which is why land plants never
took that option, and without it the model paints Earth's forests red.

The leaf's reflectance is what survives that absorption, scaled by a structural
reflectance term that reproduces the **red edge**. Its colour is the illuminant
times that reflectance. Calibration check: Earth under the Sun comes out green,
reflectance peaking near 550 nm with a red edge at ~705 nm, which is what real
vegetation does.

---

## Honesty about the model

This is a worldbuilding and teaching tool, not a radiative-transfer code.

- **Pigment absorption curves are sums of Gaussians** placed at literature peak
  positions. The peak positions are real; the band shapes are modelled, not
  digitised from measured spectra.
- **Stellar luminosities and radii are rounded literature values**, good enough
  to place a planet in or out of a habitable zone and no more.
- **Habitable-zone bounds** use the Kopparapu et al. (2013) runaway-greenhouse
  and maximum-greenhouse coefficients, which are fitted for 2600–7200 K. Outside
  that range the UI says the bounds are extrapolated.
- **Atmospheric transmission profiles are deliberately simple** — enough to
  reproduce each world's characteristic tint, not to model its chemistry.
- **The nitroplast needs its own caveat.** The nitroplast is a nitrogen-fixing
  *organelle*, derived from the cyanobacterium UCYN-A inside the alga
  *Braarudosphaera bigelowii*. It has lost photosystem II and RuBisCO, so it does
  not fix carbon. The curve here models the photosystem I antenna it still
  carries — what the organelle still absorbs, not a carbon-fixing pigment.
- **Equilibrium temperatures** use a greenhouse offset per atmosphere rather than
  a climate model. As a sanity check the Earth preset lands on 288 K and Venus on
  727 K, against real values of 288 K and 737 K.

The reasoning behind the leaf-colour model follows Kiang et al. (2007),
*Spectral signatures of photosynthesis*.

---

## Running it locally

There is nothing to install, but the page uses ES modules, so it needs to be
served over HTTP rather than opened from the filesystem:

```bash
python -m http.server 8123
```

Then open `http://localhost:8123`.

---

## Layout

| File | What lives there |
| --- | --- |
| `src/cie.js` | CIE 1931 CMF table, Planck's law, XYZ → sRGB, tone mapping |
| `src/stars.js` | Stellar presets, habitable zone, angular diameter, insolation |
| `src/planets.js` | Atmospheric transmission, exoplanet presets, biome classifier |
| `src/pigments.js` | Pigment spectra, suite selection, leaf reflectance solver |
| `src/scene.js` | Ties it together — every derived quantity and colour |
| `src/landscape.js` | The procedural renderer; shape only, no physics |
| `src/charts.js` | Spectrum, absorption and reflectance charts |
| `src/exporter.js` | Data sheet composition, PNG/JPG, and a hand-rolled PDF writer |
| `src/noise.js` | Seeded PRNG and fBm |
| `src/main.js` | UI wiring |
| `fonts/` | Atkinson Hyperlegible Next, self-hosted (SIL OFL 1.1, see `fonts/OFL.txt`) |

Seeds are deterministic: the same seed always redraws the same terrain at any
resolution, so an exported sheet can be reproduced exactly.

## Licence

MIT.
