# Orrery - Interactive 3D Solar System Explorer

An educational, cinematic 3D Solar System that runs entirely in the browser.
Fly between planets, moons, comets and dwarf worlds - real NASA maps, real
orbits, and the true, humbling scale of it all.

Then leave it all behind: **Galaxy mode** turns the backdrop into territory.
A procedural but scientifically anchored Milky Way - central bulge, 5-kpc
bar, the two major and two minor spiral arms, the Orion Spur with the Sun in
its real place 26,996 ly from the centre - navigable at one light-year per
scene unit with double-precision, camera-relative rendering. Fly to the
galactic centre and meet **Sagittarius A\***: an S-star cluster on published
orbital elements, GR-correct gravitational lensing with a marched photon
shadow, Chandra/JWST-inspired flares, real √(1−R_s/r) time dilation on the
ship's clocks, a survey scanner with a persistent discovery log, and an
interactive galaxy map. Every number's provenance is in SOURCES.md; every
approximation is labelled in-app.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20TypeScript%20%2B%20Three.js-blue)

## Running it

```bash
npm install
npm run dev      # develop at http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build

npm run test:orbit      # two-body maths checks (no browser needed)
npm run test:flight     # headless flight check of spacecraft mode
npm run test:orbitflight # headless orbital-manoeuvring check
npm run test:galaxy     # headless Milky Way / Sagittarius A* journey check
                        # the last two need `npm run preview` running on :4173
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

**Thirteen nearby star systems.** Alpha Centauri (all three stars),
Barnard's Star, Lalande 21185, Sirius, Epsilon Eridani, Ross 128, Epsilon
Indi, Tau Ceti, GJ 1061, Teegarden's Star, Wolf 1061, GJ 876 and
TRAPPIST-1 - out to 40.7 light-years, with 33 planets between them, every
one from the NASA Exoplanet Archive. Each system sits at its real 3D
position, computed from its right ascension, declination and Gaia DR3
parallax, so the neighbourhood is a map rather than a menu: pull back past
the Oort cloud and the stars separate at their true relative distances.
Selecting one flies you there through the same universe, hands the
scene's origin to the new star at the midpoint, and arrives at a system
you can orbit, click and read. Habitable zones are computed per star from
its own luminosity and temperature (Kopparapu et al. 2014), including the
Sun's.

**A cinematic jump for long distances.** Travel is classified by the distance
it actually covers, and nothing else. Under a third of an AU is an ordinary
fly-to; out to three AU the autopilot cruises as it always has; beyond that -
Earth to Saturn, or anything interstellar - a wormhole sequence plays over the
flight. The background bent around its throat is the real baked Milky Way,
deflected by the 1/b falloff of gravitational lensing, which is where the ring,
the curved light and the dark centre all come from. It is a picture, not a
claim, and it says so on screen for as long as it is up: the flight computer
underneath covers every real kilometre at the real velocity, and the distance,
the velocity and the elapsed simulation time stay on the HUD as three separate
numbers throughout. Quality is Cinematic / Reduced / Off in the View panel, and
starts at Off if the system asks for reduced motion.

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

**A real sky to fly through.** The Milky Way is not a picture on a sphere and
it is not tilted by eye: it is evaluated in galactic coordinates and the sky
carries the true J2000 rotation from the scene's ecliptic axes into that
frame, so the band crosses Sagittarius and Cygnus where it should and agrees
with the constellation figures drawn over it. The structure is the physics -
an exponential disc that thins toward the centre, a warm bulge, arm tangents
where a sight line runs down a spiral arm, and dust lanes that *subtract*, so
the Great Rift is an absence of light rather than a grey smear. Reddening
follows the dust column, which is why the obscured stretches run amber. The
26,000 background stars are scattered by the same density law, so the
crowding toward the plane is the same phenomenon that lights the band. Sampled
on the 3D direction and baked once into a cubemap, it has no seam to line up,
no pinch at the poles, and costs a texture fetch rather than a full-screen
noise evaluation every frame.

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

**Earth and the Moon, close up.** These are the only two bodies you can
approach to within a few hundred kilometres, so they are built as layer
stacks rather than textured spheres. Earth is a lit ground surface carrying
SRTM30/GEBCO relief, a MODIS cloud deck turning on its own period above it
and casting shadows down onto the ground, and an atmosphere that is actually
integrated rather than painted - a single-scattering march that produces the
blue day limb, the planet's shadow on its own air, and a terminator that goes
red because the blue is scattered out of sunlight crossing thirty air masses,
not because something orange was drawn there. The night side dims as you
close in and Black Marble's city lights come up through gaps in the weather.
The Moon gets LRO's colour mosaic, crater relief from LOLA altimetry at its
published half-metre encoding, real displaced terrain on the limb, and the
backscattering photometric function that makes a full Moon read as a flat
disc instead of a shaded ball. Its unlit side falls to earthshine. Every map
is a NASA product, listed with its source in `SOURCES.md`; all of it streams
by distance, so none of it is downloaded by a viewer who stays in the
overview.

**The sky is a survey, not a texture.** The Milky Way behind everything is
NASA's Deep Star Maps 2020 - 1.7 billion stars from Gaia DR2, Hipparcos-2 and
Tycho-2 - as an all-sky map in galactic coordinates. The Great Rift, the
Sagittarius star clouds, the bulge and both Magellanic Clouds are where the
survey measured them, and the sphere carries the real J2000 rotation from the
scene's ecliptic axes into the galactic frame, so the band agrees with the
constellation figures drawn over it. The map is resampled into a cubemap and
sampled by direction: there is no seam at l = 180°, no pinch at the galactic
poles, and nothing that behaves like a cylinder when you look straight up. It
sits at infinity - fly to Saturn and the sky does not move, because it is 26,000
light years away and Saturn is 9 AU. Sharpness comes from the real star
catalogue drawn as points on top; nothing about the band is procedural.

**On a phone.** The mobile layout is not the desktop one scaled down. A
viewport-and-pointer probe (`src/ui/device.ts`) publishes what kind of device
is looking, and below a 500px short edge the app swaps shell: the twelve-chip
top row - which on a phone became a horizontal scroller with no affordance,
hiding seven features entirely - is replaced by a slim search bar, a
thumb-reach tab bar, and a sheet that shows every feature as a labelled tile.
The info panel becomes a real bottom sheet that rests at 42% so the world it
describes stays visible, and is dragged, snapped and flicked away rather than
closed with a hunt for an X. Every overlay inherits the same behaviour from
one place. Taps get a threshold a finger can actually meet and a raycast that
sweeps out to 26px, because a fingertip is not a mouse cursor. In the cockpit
the permanent control deck collapses to a four-tab dock and panels stop
stacking on each other in landscape, so the 360° view has a window to be seen
through. Pinching the glass changes the field of view. Render budgets are chosen by device class:
a phone starts well inside its pixel ratio rather than at 3x, runs bloom at
half resolution, thins the decorative particle fields, never reaches for the
8k Earth and Moon maps, and stops drawing the solar system entirely behind a
full-screen sheet.

**First-person spacecraft mode.** Board a research vessel with glass on every side. The cabin is a 360° observation deck: the pilot's head turns continuously through every bearing, so front, port, starboard, astern, overhead and the floor port are simply directions you happen to be facing, not a set of preset cameras. Turn right round and you watch where the ship has been - the real scene behind the hull, never a substitute backdrop.
Solar System from inside its cockpit. This is not a free camera with a
frame drawn over it: the world is pinned to true scale, so a scene unit is
a fixed 1,495,978.707 km and a body's apparent size is nothing but its
real radius over its real distance. Earth swells to 16° across at a
50,000 km standoff and shrinks to a point when you leave; the Sun is a
13° furnace from 6 million km out and a magnitude −19 star from Neptune;
Saturn's rings fill the windows on approach and reveal their fine ringlet
structure only when you are close enough to resolve it. Nothing is
enlarged to look good.

Orbit is a real trajectory, not a scripted path. The ship carries a
body-centred state vector, propagated in closed form with universal-variable
Kepler propagation - exact at any step size, which matters when one frame can
cover more than a whole revolution. Every control modifies that state: burn
prograde and the far side of the orbit rises, retrograde and it falls, radial
changes the shape, normal tilts the plane, and enough delta-v gives you a
hyperbolic escape the HUD names as such. Attitude holds for all six manoeuvre
axes, a live 3D trajectory preview that deforms as you burn, and a release that
hands your exact position and velocity to free flight without a teleport.

Physical velocity (km/s) and time compression (simulated seconds per real
second) are shown as separate quantities everywhere, because they are
separate things - the hull moves at a plausible probe velocity while the
whole simulation, planets included, runs fast enough to make an
interplanetary cruise watchable. Navigate to any catalogued object with
smart arrival distances, then orbit it with real circular-orbit mechanics
(v = √(GM/r)), run a cinematic fly-by, or hold station and close in by
hand. A compact HUD carries velocity, bearing, apparent size, brightness,
altitude, ETA, region and a schematic ecliptic map; drag to look around
the cabin, and the side, overhead and forward glazing are all real
openings you can see through.

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
  data/catalog/
    starsystems.ts      the 13 nearby systems: stars, planets, provenance
  sim/scale.ts          explorer ↔ true-scale mapping (single source of truth)
  sim/interstellar.ts   RA/Dec/parallax → 3D position; the interstellar scale
  sim/habitable.ts      Kopparapu et al. (2014) habitable-zone limits
  sim/travel.ts         short / medium / long, and what each one looks like
  sim/state.ts          app state + event emitter
  scene/galaxy.ts       the Milky Way in galactic coordinates, baked to a cubemap
  scene/                sun, planets, satellites, small bodies, comet tails,
                        belts, sky, orbit lines, lazy procedural surfaces
  scene/neighbourhood.ts the stellar neighbourhood as a real 3D point map
  scene/starsystem.ts   one foreign system, built on arrival and disposed
  scene/hoststar.ts     a star coloured by its measured temperature
  scene/exoplanet.ts    procedural worlds driven by size, mass, temperature
  scene/wormhole.ts     the long-distance transition: lensed sky, throat, streaks
  spacecraft/           first-person mode: true-scale ephemeris, flight
                        computer, two-body orbital mechanics, trajectory
                        preview, cockpit geometry, mode orchestration
  ui/                   HUD, info panel, labels, search, atlas, missions,
                        meteor lab, journey, overlays, guided tour
  ui/systems.ts         the NEARBY SYSTEMS rail
  ui/voyage.ts          the interstellar crossing and its odometer
  ui/exoinfo.ts         information-panel content for other stars' worlds
scripts/
  flighttest.mjs        headless Chromium flight check (npm run test:flight)
  startest.mjs          headless star-system check (npm run test:stars)
  warptest.mjs          headless travel-transition check (npm run test:warp)
  orbitflight.mjs       headless orbital-manoeuvring check (npm run test:orbitflight)
  orbittest.mts         numerical two-body checks, no browser (npm run test:orbit)
```

The neighbouring systems are the same trick applied one level up. There is
one scene, and its origin is whichever star you are standing on; travelling
to another does not load a second universe, it re-expresses the one universe
around a new zero point. Because the camera's position is tracked in
absolute light-years and converted to scene units every frame, the handover
happens mid-crossing with nothing moving on screen. The Sun then appears
where the Sun would appear from there, at the magnitude it would actually
have, because both come out of the same subtraction.

Interstellar scale is the one place the app cannot draw everything at once,
and it says so. At true scale it does not compress at all - a light-year is
63,241 AU and an AU is 100 units, so a light-year is 6,324,108 units and the
compression readout says 1.00×. Explorer view compresses, but only as far as
it can without contradicting itself: the Sun's own Oort cloud is modelled out
to 60,000 AU, so the nearest star has to be drawn outside it, and the layout
stays linear in light-years so relative distances remain exact.

The travel transition is an overlay on that one scene rather than a place of
its own. It draws over the finished frame and is transparent inside its throat,
so what shows through the opening is the destination system itself, already
built and already rendering - there is nothing to swap at the end, the aperture
just opens until the overlay is gone. The throat also waits: while the flight
underneath is still running, or a system is still being assembled, the sequence
holds shut rather than opening onto something half-finished, which is what
turns it into the loading screen this app otherwise does not have.

Spacecraft mode adds one observer to the existing world rather than a
second world: same Kepler solver, same catalog, same meshes, same LOD.
Three things are layered on for it - a cockpit rendered in its own pass
with a cleared depth buffer (no depth buffer spans a 30 m window frame and
a 200 AU far plane), naked-eye point rendering for bodies that are
genuinely sub-pixel from where the ship is, and a near plane that tracks
the nearest surface so you can sit 130 km off the cloud tops.

Performance strategy: shared geometries; textures stream lazily (flat
colour → real map only when you approach or select a body); Earth and the
Moon climb a four-rung resolution ladder by apparent size and release the
rungs they are no longer using; moon systems collapse entirely beyond
visibility range; belts orbit in the vertex shader (zero CPU cost for
~7,000 particles); comet tails are two small GPU particle systems;
adaptive pixel ratio backs off under load; the camera near-plane tracks
zoom depth. Initial payload is one JS bundle + ~4 MB of webp maps loaded
on demand; the 8k Earth and Moon maps are another ~20 MB that only a
viewer who actually flies to them ever downloads.

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
- In spacecraft mode, apparent size is never adjusted by hand - it always
  falls out of radius, distance and field of view, and the HUD shows the
  angular diameter so you can check it. Physical velocity and time
  compression are labelled separately and never multiplied into a single
  "speed"; throttle settings above 191 km/s are flagged as faster than any
  vehicle humans have built. Inside a body's neighbourhood the hull rides
  that body's motion the way a real spacecraft there would, and velocities
  are then quoted relative to it - the Location panel names the frame in
  use. The Sun's near-field corona and prominences are procedural, informed
  by coronagraph imagery rather than derived from it, and say so on screen.
- The wormhole is the one thing in the app that is frankly not real, and it is
  the one thing that is labelled every single time it appears. It changes no
  state: the same autopilot flies the same route at the same commanded
  velocity, the odometer counts the same kilometres, and the simulation clock
  advances by the real flight time. A long haul does command a higher cruise
  velocity, the way a pilot would, and the HUD shows that too - 36.9 days of
  flight at 400 km/s, compressed a million to one, is what the event line says
  while Earth-to-Saturn is playing.
- Orbits are genuine two-body trajectories: circular-orbit speed really is
  √(GM/r), the reported period really is 2π√(a³/μ), and a burn changes the orbit
  because it changed the state vector. Perturbations are not modelled - no third
  bodies, no oblateness, no drag - so an orbit here is a Keplerian idealisation,
  which is the same idealisation the rest of the app's orbits use.

## Data sources & credits

See [SOURCES.md](SOURCES.md) for the complete asset-by-asset list.
Headlines: NASA Planetary Fact Sheets + JPL SSD/SBDB for data; the NASA
Exoplanet Archive, Gaia DR3 and SIMBAD for the nearby star systems; USGS
Astrogeology public-domain mosaics, the New Horizons MVIC Pluto color map,
Dawn, Cassini, Galileo, Voyager, Mars Express, OSIRIS-REx and Hayabusa2
imagery for surfaces; Solar System Scope (CC BY 4.0) for the classic
planet maps; Kenney/Mixkit/Kevin MacLeod for audio.
