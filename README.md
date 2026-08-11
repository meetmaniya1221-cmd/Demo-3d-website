# Orrery - Interactive 3D Solar System Explorer

An educational, cinematic 3D Solar System that runs entirely in the browser.
Fly between planets, moons, comets and dwarf worlds - real NASA maps, real
orbits, and the true, humbling scale of it all.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20TypeScript%20%2B%20Three.js-blue)

## Running it

```bash
npm install
npm run dev      # develop at http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## What's inside

**A comprehensive catalog.** The Sun, all eight planets, 22 major moons
(the Galileans, nine Saturnian moons, the five round Uranian moons, Triton,
Charon, Phobos, Deimos and our Moon), the five IAU dwarf planets, four
dwarf-planet candidates beyond Neptune (Quaoar, Sedna, Gonggong, Orcus),
seven landmark asteroids (Vesta, Pallas, Hygiea, Psyche, Eros, Bennu,
Ryugu), six periodic comets with their real orbits, the asteroid belt,
Kuiper belt and Oort cloud - each with structured scientific data, mission
history, sources and honest uncertainty notes.

**Real NASA surfaces.** 22 mission-imagery global mosaics (USGS
Astrogeology / New Horizons / Cassini / Galileo / Dawn / Hayabusa2 -
see [SOURCES.md](SOURCES.md)). Where no map exists the app paints a
seeded procedural surface and labels it *Artistic rendering* - it never
passes art off as photography.

**Search everything** (`/` or `Ctrl+K`). Type "Europa", "Halley",
"Cassini" or "Kuiper" and the camera flies straight there - objects and
missions share one index, no menu digging.

**The Atlas.** An expandable hierarchy of the whole system - Sun →
planets → their moons → dwarf planets → TNOs → asteroids → comets →
regions - one click from any row.

**Comets that behave like comets.** Nuclei ride real Kepler ellipses; the
coma and two tails (blue ion tail straight anti-sunward, curved dust tail)
grow as sublimation ramps up near perihelion, and the info panel shows a
live activity meter. Halley sits frozen at 35 AU right now - the app shows
that too, honestly.

**Meteor lab.** The meteoroid → meteor → meteorite pipeline, animated
against real altitude bands: pick a size class (sand grain, pebble,
boulder, Chelyabinsk-class) and watch ablation, dark flight, airburst or a
surviving meteorite - with scientifically correct terminology throughout.

**Mission explorer.** Six decades of exploration - Apollo 11 to Europa
Clipper - as a timeline, each mission linked both ways to the worlds it
studied.

**Distance journey.** A continuous camera ride from the Sun's doorstep to
the Kuiper belt at true scale, with a live AU odometer, light-time
readout, and an uncomfortable speedometer ("you are moving at 40× the
speed of light and this is still taking ages").

**Two honest scales.** *Explorer view* compresses distances so the system
stays browsable; *True scale* morphs the scene to physical proportions
(1 AU = 100 units). The app always tells you which lie it is currently
telling, and the guided tour ends by taking the lie away.

**Plus** the guided tour (15 stops, now including Pluto and an active
comet), size/distance comparison charts, the gravity lab, per-system moon
orbits in the parent's equatorial plane (watch Uranus's moons roll with
it), tidal locking, retrograde Triton, the tumbling Hyperion, and a
GPU-orbiting asteroid belt.

## Architecture

```
src/
  main.ts               boot: WebGL check → texture generation → app
  app.ts                renderer, post-processing, input, UI wiring
  data/bodies.ts        planets: fact-sheet data, J2000 elements, Kepler solver
  data/types.ts         CatalogObject/Mission - the uniform data model
  data/catalog.ts       assembles the full catalog + mission cross-index
  data/catalog/*.ts     moons, dwarfs, asteroids, comets, missions, regions
  sim/scale.ts          explorer ↔ true-scale mapping (single source of truth)
  sim/state.ts          app state + event emitter
  scene/                sun, planets, satellites, small bodies, comet tails,
                        belts, sky, orbit lines, lazy procedural surfaces
  ui/                   HUD, info panel, labels, search, atlas, missions,
                        meteor lab, journey, overlays, guided tour
```

Performance strategy: shared geometries; textures stream lazily (flat
colour → real map only when you approach or select a body); moon systems
collapse entirely beyond visibility range; belts orbit in the vertex
shader (zero CPU cost for ~7,000 particles); comet tails are two small
GPU particle systems; adaptive pixel ratio backs off under load; the
camera near-plane tracks zoom depth. Initial payload is one JS bundle +
~4 MB of webp maps loaded on demand.

## Scientific honesty

- Planet positions use JPL J2000 mean elements - accurate to well under a
  degree over centuries. Small-body positions use published elements with
  approximate epochs; the info panel says "position along the orbit is
  approximate" on every such body.
- Moons ride circular orbits at their mean distance in the parent's
  equatorial plane (Earth's Moon near the ecliptic); per-object notes
  disclose simplifications (Triton's real 157° inclination, Phoebe's
  eccentric retrograde path, Hyperion's chaotic tumble).
- Pluto is a dwarf planet here, meteors are events not objects, grayscale
  mosaics are labelled as such, display tints are disclosed, and estimated
  values carry explicit uncertainty notes.

## Data sources & credits

See [SOURCES.md](SOURCES.md) for the complete asset-by-asset list.
Headlines: NASA Planetary Fact Sheets + JPL SSD/SBDB for data; USGS
Astrogeology public-domain mosaics, the New Horizons MVIC Pluto color map,
Dawn, Cassini, Galileo, Voyager, Mars Express, OSIRIS-REx and Hayabusa2
imagery for surfaces; Solar System Scope (CC BY 4.0) for the classic
planet maps; Kenney/Mixkit/Kevin MacLeod for audio.
