# Data & imagery sources

Every external asset and dataset used by Orrery, with its origin and licence.
The in-app info panel repeats the relevant credit next to each object.

## Scientific data

| Data | Source | Notes |
| --- | --- | --- |
| Planetary physical data | [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | Public domain (US Gov); includes density and geometric albedo |
| Planet orbital elements | [JPL "Approximate Positions of the Planets"](https://ssd.jpl.nasa.gov/planets/approx_pos.html) | J2000 mean elements, Kepler two-body propagation |
| Planet spin epochs (W₀) | [IAU WGCCRE 2015 report](https://astrogeology.usgs.gov/groups/IAU-WGCCRE) | Prime-meridian angles at J2000; Earth's W tracks GMST so day/night follows UTC. Applied about the tilted axis in the ecliptic frame - accurate to a degree or two |
| Moon physical/orbital data | NASA fact sheets + [NASA Solar System Exploration](https://science.nasa.gov/solar-system/) | Moons drawn on circular orbits at mean distance; simplifications are disclosed per object. Earth's Moon carries its real J2000 mean longitude (218.32° + 13.176°/day), so the simulated phase tracks the actual lunar cycle to a few degrees |
| Dwarf planets, TNOs, asteroids, comets | [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html), NASA science pages | Orbit shape/orientation from published elements; TNO perihelion epochs (tp) from SBDB solutions retrieved Aug 2026; position along orbit approximate (disclosed in-app) |
| Interior structure models | NASA mission pages ([InSight](https://science.nasa.gov/mission/insight/), [Juno](https://science.nasa.gov/mission/juno/), [Cassini](https://science.nasa.gov/mission/cassini/), [Dawn](https://science.nasa.gov/mission/dawn/), GRAIL, MESSENGER...) | Every layer is tagged OBSERVED (seismology, helioseismology, libration) or MODELLED (inferred) in the UI |
| Near stars | [NASA - Stars](https://science.nasa.gov/universe/stars/), [RECONS census](http://www.recons.org/) | Hipparcos/Gaia parallax distances (shown in both ly and pc); Deneb's genuinely uncertain distance is disclosed. Effective temperatures are published catalog values rounded to ~3 significant figures (primary component for multiples); star discs are rendered from that temperature via the Planckian locus - a physical representation, never fake imagery |
| Deep-sky objects | [NASA/ESA Hubble Messier Catalog](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/) | 16 Messier highlights + Sagittarius A*; J2000 positions, published distances |
| Kuiper belt structure | [NASA Science - Kuiper Belt](https://science.nasa.gov/solar-system/kuiper-belt/), JPL SBDB | Particle swarm drawn from the published population structure: cold classicals (42-48 AU, low e/i, red), hot classicals, plutinos at the 3:2 resonance (39.4 AU), scattered disc with perihelia near Neptune; illustrative particles, not catalogued objects (disclosed in-app) |
| Oort cloud | [NASA Science - Oort Cloud](https://science.nasa.gov/solar-system/oort-cloud/) | Conceptual model visualization (~2,000-60,000 AU shown, sparse spherical, inner Hills region flattened); the cloud has never been observed directly and the app says so |
| Missions | Official NASA / ESA / JAXA mission pages | Linked from every mission card |
| Habitable zone bounds | Kasting 1993 / Kopparapu et al. 2013 | Conservative limits, 0.95–1.67 AU |

## Surface maps (`public/textures/`)

All USGS Astrogeology / NASA products are public domain. Downsampled to
≤1024×512 webp for the web; polar no-data gaps filled by nearest-pixel
interpolation (disclosed in-app). "Display-tinted" means a grayscale
mission mosaic was tinted to the body's published colour; the app labels
these and never presents artistic renderings as photographs.

| File | Product | Credit |
| --- | --- | --- |
| `io.webp` | Io Galileo SSI / Voyager global color mosaic | NASA/JPL/USGS |
| `europa.webp` | Europa Galileo SSI / Voyager 500 m mosaic (tinted) | NASA/JPL/USGS |
| `ganymede.webp` | Ganymede Voyager/Galileo SSI global color mosaic 1.4 km | NASA/JPL/USGS |
| `callisto.webp` | Callisto Voyager/Galileo SSI 1 km mosaic (tinted) | NASA/JPL/USGS |
| `mimas.webp` `enceladus.webp` `tethys.webp` `dione.webp` `rhea.webp` | Cassini global mosaics | NASA/JPL/Space Science Institute/USGS |
| `titan.webp` | Cassini ISS 938 nm global mosaic (tinted; surface seen through haze) | NASA/JPL/Space Science Institute |
| `hyperion.webp` | Voyager 2 cylindrical map | NASA/JPL/USGS |
| `iapetus.webp` | Cassini + Voyager global mosaic 783 m | NASA/JPL/SSI/USGS |
| `phoebe.webp` | Cassini global mosaic | NASA/JPL/SSI/USGS |
| `triton.webp` | Voyager 2 global color mosaic 600 m (unimaged areas filled) | NASA/JPL/USGS |
| `pluto.webp` | New Horizons MVIC global color map ([PIA11707](https://science.nasa.gov/resource/pluto-global-color-map/)) | NASA/JHUAPL/SwRI |
| `charon.webp` | New Horizons LORRI/MVIC global mosaic 300 m | NASA/JHUAPL/SwRI/USGS |
| `ceres.webp` | Dawn FC global mosaic 20 ppd | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA |
| `vesta.webp` | Dawn FC global mosaic (DLR) | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA |
| `bennu.webp` | OSIRIS-REx OCAMS global basemap | NASA/Goddard/University of Arizona |
| `ryugu.webp` | Hayabusa2 global map | JAXA/U. Tokyo/Kochi U./Rikkyo U./Nagoya U./Chiba Inst. Tech./Meiji U./U. Aizu/AIST |
| `phobos.webp` | Mars Express SRC global mosaic 16 ppd | ESA/DLR/FU Berlin, NASA/USGS |
| `deimos.webp` | Viking Orbiter cylindrical map | NASA/JPL/USGS |
| `mercury.webp` `venus.webp` `mars.webp` `jupiter.webp` `saturn.webp` `uranus.webp` `neptune.webp` `sun.webp` `moon.webp` `saturn_ring.webp` | Solar System Scope texture pack (based on NASA mission imagery) | [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0 |
| `earth.webp` | AI-generated map (Higgsfield) - **not** a NASA product, labelled as artistic in-app | Higgsfield AI |

Bodies without published global maps (the Uranian moons, Eris, Haumea,
Makemake, Sedna, Quaoar, Gonggong, Orcus, Pallas, Hygiea, Psyche, Eros and
all comet nuclei) use seeded procedural surfaces generated in-browser,
labelled **Artistic rendering** in the info panel.

The USGS maps were retrieved from the USGS Astrogeology Science Center
public archive (`planetarymaps.usgs.gov` / `asc-pds-services` mirror);
the Pluto color map from NASA's science.nasa.gov asset library.

## Sky

The 15 constellation stick figures and ~70 named bright stars use real J2000
equatorial coordinates (rounded to roughly 0.1 h / 1°, i.e. accurate to about
a degree - fine for stick figures). The faint background starfield and the
Milky Way band are procedural art, not a star catalog. The ecliptic reference
grid marks true astronomical-unit distances in the current scale mode.

The Observatory's first-person night sky computes altitude/azimuth from the
same star catalog plus the app's own Kepler elements (planets), the leading
terms of the lunar theory (Meeus - Moon position good to ~0.3°, phase from
solar elongation) and the standard GMST expression - positions are good to
about a degree, not ephemeris-grade, and the panel says so. Its Milky Way
band lies along the real galactic plane (standard J2000 galactic→equatorial
rotation) but the glow texture is procedural; the faint backdrop stars are
procedural with fixed random RA/Dec so they rotate correctly with the sky.
Deep-sky markers in the 3D scene sit at their real J2000 directions on the
sky sphere; the objects themselves are of course far beyond it.

## Deep-sky imagery (`public/deepsky/`)

Real observational imagery, downsampled to web sizes (card ~460 px, viewer
~900-1100 px webp). Every card links to the original release; credits are
shown in the in-app viewer. ESA/Hubble, NOIRLab and ESO images are CC BY 4.0;
NASA imagery is public domain.

| Object | Image | Credit |
| --- | --- | --- |
| M31 Andromeda | KPNO ([noao-m31](https://noirlab.edu/public/images/noao-m31/)) | Local Group Galaxies Survey Team, NOIRLab/NSF/AURA |
| M33 Triangulum | Hubble ([heic1901a](https://esahubble.org/images/heic1901a/)) | NASA, ESA, M. Durbin, J. Dalcanton, B.F. Williams (UW) |
| M42 Orion Nebula | Hubble ([heic0601a](https://esahubble.org/images/heic0601a/)) | NASA, ESA, M. Robberto (STScI/ESA), HST Orion Treasury Team |
| M45 Pleiades | KPNO ([noao-m45](https://noirlab.edu/public/images/noao-m45/)) | NOIRLab/NSF/AURA |
| M44 Beehive | KPNO ([noao-m44](https://noirlab.edu/public/images/noao-m44/)) | NOIRLab/NSF/AURA |
| M13 Hercules Cluster | Hubble ([potw1011a](https://esahubble.org/images/potw1011a/)) | ESA/Hubble & NASA |
| M22 Sagittarius Cluster | KPNO ([noao-m22](https://noirlab.edu/public/images/noao-m22/)) | NOIRLab/NSF/AURA |
| M8 Lagoon Nebula | Hubble ([heic1808a](https://esahubble.org/images/heic1808a/)) | NASA, ESA, STScI |
| M16 Eagle Nebula | Hubble ([heic1501a](https://esahubble.org/images/heic1501a/)) | NASA, ESA, Hubble Heritage Team (STScI/AURA) |
| M1 Crab Nebula | Hubble ([heic0515a](https://esahubble.org/images/heic0515a/)) | NASA, ESA, J. Hester, A. Loll (ASU) |
| M27 Dumbbell Nebula | KPNO ([noao-m27](https://noirlab.edu/public/images/noao-m27/)) | NOIRLab/NSF/AURA |
| M57 Ring Nebula | Hubble ([heic1310a](https://esahubble.org/images/heic1310a/)) | NASA, ESA, C.R. O'Dell (Vanderbilt) |
| M51 Whirlpool | Hubble ([heic0506a](https://esahubble.org/images/heic0506a/)) | NASA, ESA, S. Beckwith (STScI), Hubble Heritage Team |
| M81 Bode's Galaxy | KPNO ([noao-m81](https://noirlab.edu/public/images/noao-m81/)) | N.A. Sharp, NOIRLab/NSF/AURA |
| M87 Virgo A | Hubble ([opo0020a](https://esahubble.org/images/opo0020a/)) | NASA, Hubble Heritage Team (STScI/AURA) |
| M104 Sombrero | Hubble ([opo0328a](https://esahubble.org/images/opo0328a/)) | NASA, Hubble Heritage Team (STScI/AURA) |
| Sagittarius A* | EHT ([eso2208-eht-mwa](https://www.eso.org/public/images/eso2208-eht-mwa/)) | EHT Collaboration |

## Audio

- UI sounds: [Kenney](https://kenney.nl) "Interface Sounds" / "Sci-Fi Sounds" (CC0)
- Click tone: [Mixkit](https://mixkit.co) (Mixkit Free License)
- Music: "Floating Cities" - Kevin MacLeod ([incompetech.com](https://incompetech.com)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Fonts

Orbitron and Rajdhani, both [SIL Open Font License](https://scripts.sil.org/OFL), self-hosted.
