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
eight landmark asteroids (Vesta, Pallas, Hygiea, Psyche, Eros, Bennu,
Ryugu, and DART’s binary target Didymos), six periodic comets with their
real orbits, the asteroid belt,
Kuiper belt and Oort cloud - each with structured scientific data, mission
history, sources and honest uncertainty notes.

**Real NASA surfaces.** 22 mission-imagery global mosaics (USGS
Astrogeology / New Horizons / Cassini / Galileo / Dawn / Hayabusa2 -
see [SOURCES.md](SOURCES.md)). Where no map exists the app paints a
seeded procedural surface and labels it *Artistic rendering* - it never
passes art off as photography.

**A real time machine.** Click the date to open the HUD-styled calendar
and jump anywhere between 1900 and 2100, run time backwards with the
rewind button, or play at seven speeds from real time to a year per second. Planet spin phases are tied
to the IAU J2000 prime-meridian angles - Earth's day/night tracks UTC -
and the Moon rides its real mean longitude, so the simulated phase
matches the actual lunar cycle (the Aug 2026 full moon lands within a
day). Set 9 Feb 1986 and watch Halley blaze through perihelion.

**Interior structure.** The classic quarter-cut cross-section for 16
worlds, every layer tagged OBSERVED (Apollo seismometers, InSight
marsquakes, helioseismology, Cassini's libration measurements) or
MODELLED (gravity-field inference) - with the evidence spelled out.

**3D cross-section.** From any structure view - or straight from the body
tabs inside it - *Explore in 3D* opens the same layer model as a real
sphere with a quarter sawn out of it. Each shell is staged open a little
wider than the one it encloses, so looking into the notch you see every
inner layer's dome standing proud of the last, down to a core left whole;
the section faces are flat annuli at each layer's true thickness, lit by
a fixed key light with a cavity-occlusion falloff and a dark contact
seam where each shell meets its own cut. The cut itself lives in the
fragment shader, so it opens and closes smoothly at full geometric
resolution and the silhouette stays round however far you zoom.

The camera orbits a model that never moves, which keeps the lighting
anchored to the world - turn the view and highlights sweep across the
shells the way they would on a real object. Callouts are pinned to the
layers they name and drop out when the body turns in front of them.

Every layer declares what it is physically made of, and that picks the
shading: fusing plasma, radiative plasma, convecting plasma and a
granulated photosphere for the Sun (with a limb-hugging corona,
prominence loops that only show off the limb, and convection sparks
riding the cut face); molten and solid metal, silicate rock, water ice,
liquid ocean, metallic and molecular hydrogen, ice-giant fluid, regolith
and volatile frost for everyone else. Solid worlds wear their real
mission mosaic on the outside and are lit, not emissive - a rocky mantle
never glows like a star. Switching bodies is a real model switch: the
previous body's geometry, materials and textures are released before the
next is built, so only the body you picked is ever in the scene.

**The Observatory.** Three sky instruments: a first-person planetarium -
stand anywhere on Earth (click the world map, pick from 89 cities, dial in
degrees and minutes, or use your device's location), drag to look around a
real horizon with all eight compass points, **5,044 catalogued stars, all 88
constellations**, the real Milky Way band, the Moon with its correct phase
and the planets, all driven by the simulation clock; the stellar neighbourhood mapped out to
Deneb with real Gaia/Hipparcos distances (ly and parsecs), published
temperatures and physically-derived star colours; and the Messier
highlights with real Hubble / NOIRLab / EHT imagery - which also render
as a toggleable deep-sky layer on the main 3D sky.

**Earth & Moon lab.** The lunar cycle as a live diagram: real sunlight
direction, tonight's phase, days to the next full moon, spring vs neap
tides, and why the 5.1° orbit tilt makes eclipses rare.

**Search everything** (`/` or `Ctrl+K`). Type "Europa", "Halley",
"136199", "Andromeda" or "Cassini" and the right thing happens - objects
fly the camera there, stars and Messier objects open the Observatory,
missions open the timeline. One index, no menu digging.

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

**Two honest scales.** *Explorer view* compresses distances and enhances
planet sizes so the system stays browsable - but moons always keep their
TRUE size relative to their planet (the Moon is 0.27 Earths here, Titan a
speck beside Saturn), with fixed-pixel markers and labels carrying
findability below the visibility floor. *True scale* morphs the scene to
physical proportions (1 AU = 100 units). The app always tells you which
lie it is currently telling, and the guided tour ends by taking the lie
away.

**An astronomical navigator, not a landing page.** Text-only instrument
labels, thin orbit paths, an ecliptic reference grid with AU rings, all 88
constellation figures over 5,044 catalogued stars coloured by their real
measured temperature, and a right-edge
distance readout that picks its own unit (km → million km → AU). A View
panel toggles every layer; the default view shows a clean eight-planet
system and the deep catalog (asteroids, comets, dwarfs) is one checkbox
away. Sub-pixel bodies never rasterise - a stable fixed-size marker takes
over below a few projected pixels, which is also why comets don't flicker
when you zoom out.

**Plus** the guided tour (15 stops, now including Pluto and an active
comet), size/distance comparison charts and a head-to-head mode that
puts any two worlds side by side at one scale, the gravity lab, manual
km/mi units, per-system moon orbits in the parent's equatorial plane
(watch Uranus's moons roll with it), tidal locking, retrograde Triton,
the tumbling Hyperion, and a GPU-orbiting asteroid belt.

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
