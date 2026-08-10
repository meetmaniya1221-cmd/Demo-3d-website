# Orrery - Interactive 3D Solar System

An educational, cinematic 3D Solar System that runs entirely in the browser.
Fly between the planets, bend time, and see how big - and how empty - the
Solar System really is.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20TypeScript%20%2B%20Three.js-blue)

## Running it

```bash
npm install
npm run dev      # develop at http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

No API keys, no downloads: every planet surface, ring, starfield and the
Milky Way are procedurally painted onto canvases at load time.

## What's inside

- **Real orbital mechanics** - planet positions come from J2000 Keplerian
  elements (JPL "Approximate Positions of the Planets") solved with
  Newton–Raphson each frame, so the planets stand where they really are today.
  Eccentric, inclined orbits - Mercury's stretched path is visible.
- **Two honest scales** - *Explorer view* compresses distances so the system
  stays browsable, and *True scale* morphs the whole scene to physical
  proportions (1 AU = 100 units), which is the lesson itself.
- **Click-to-fly camera** - click any world (or its label, or the nav rail)
  and the camera flies over to its day side, then rides along with it.
- **Time controls** - real time up to a year per second, with a live
  simulation date and a "Today" reset.
- **Guided tour** - 13 scripted stops from the Sun to the Kuiper belt, each
  pairing camera choreography with one concept (greenhouse effect, tidal
  locking, the habitable zone, why the belt never became a planet…).
- **Compare overlay** - all diameters on one scale (the Sun barely fits) and
  a scrollable to-scale distance strip with light-travel times.
- **Gravity lab** - set your Earth weight, read a bathroom scale on ten
  worlds, and see how high the same jump carries you.
- **The details** - Earth–Moon system with true tidal locking, Saturn's rings
  with the Cassini division, Uranus rolling on its side, 4,000-particle
  asteroid belt and Kuiper belt orbiting on the GPU, habitable-zone overlay,
  animated plasma Sun with corona.

## Architecture

```
src/
  main.ts          boot: WebGL check → texture generation → app
  app.ts           renderer, post-processing, input, UI wiring
  data/bodies.ts   NASA fact-sheet data, J2000 elements, Kepler solver
  sim/scale.ts     explorer ↔ true-scale mapping (single source of truth)
  sim/state.ts     app state + event emitter
  scene/           sun, planets, belts, sky, orbit lines, camera rig
  ui/              HUD, info panel, labels, overlays, guided tour
```

Notable implementation choices:

- **Procedural everything** - seeded value-noise/fBm painters generate each
  surface (`scene/textures.ts`), so the app has zero network assets and
  loads in a couple of seconds.
- **GPU-orbiting belts** - asteroid positions are computed in the vertex
  shader from per-particle orbital elements and a time uniform: zero
  per-frame CPU cost for ~7,000 bodies.
- **One mapping function** - every heliocentric position (planets, orbit
  lines, belts, habitable zone) passes through the same radial compression,
  so both scale modes stay geometrically consistent while animating.
- **Adaptive quality** - pixel ratio backs off automatically when frame
  times stay high; the camera's near plane tracks zoom depth to keep
  depth precision at every scale.

## Data sources & credits

NASA Planetary Fact Sheet (nssdc.gsfc.nasa.gov) and JPL's approximate
planetary elements. Orbits are Keplerian two-body approximations; moon
counts are IAU-confirmed totals as of 2025. Explorer view exaggerates sizes
and compresses distances for usability - the app says so on screen, and
True scale shows the honest picture.

Planet, Sun, Moon and Saturn-ring surface maps are from
[Solar System Scope](https://www.solarsystemscope.com/textures/)
(CC BY 4.0), based on NASA mission imagery (MESSENGER, Cassini, Voyager,
LRO, MGS). Earth's map was generated with Higgsfield AI. Procedural
fallback surfaces are generated in-browser if the maps fail to load.

Sound effects are from [Kenney](https://kenney.nl)'s "Interface Sounds"
and "Sci-Fi Sounds" packs (CC0 / public domain), with the UI click tone
from [Mixkit](https://mixkit.co) (Mixkit Free License). Background music:
"Floating Cities" by Kevin MacLeod ([incompetech.com](https://incompetech.com)),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Audio starts after the first interaction and can be muted from the top bar.
