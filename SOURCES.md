# Data & imagery sources

Every external asset and dataset used by Orrery, with its origin and licence.
The in-app info panel repeats the relevant credit next to each object.

## Scientific data

| Data | Source | Notes |
| --- | --- | --- |
| Planetary physical data | [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | Public domain (US Gov) |
| Planet orbital elements | [JPL "Approximate Positions of the Planets"](https://ssd.jpl.nasa.gov/planets/approx_pos.html) | J2000 mean elements, Kepler two-body propagation |
| Moon physical/orbital data | NASA fact sheets + [NASA Solar System Exploration](https://science.nasa.gov/solar-system/) | Moons drawn on circular orbits at mean distance; simplifications are disclosed per object |
| Dwarf planets, TNOs, asteroids, comets | [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html), NASA science pages | Orbit shape/orientation from published elements; position along orbit approximate (disclosed in-app) |
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

## Audio

- UI sounds: [Kenney](https://kenney.nl) "Interface Sounds" / "Sci-Fi Sounds" (CC0)
- Click tone: [Mixkit](https://mixkit.co) (Mixkit Free License)
- Music: "Floating Cities" - Kevin MacLeod ([incompetech.com](https://incompetech.com)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Fonts

Orbitron and Rajdhani, both [SIL Open Font License](https://scripts.sil.org/OFL), self-hosted.
