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

## Galaxy mode: Milky Way & Sagittarius A* (`src/galaxy/`)

The galaxy is procedural, but every structural parameter is anchored to a
published measurement. Where the simulation must approximate (warp speeds,
accelerated flare cadence, statistical star clouds standing in for hundreds
of billions of stars), the in-app text says so explicitly.

| Quantity in the app | Value used | Source |
| --- | --- | --- |
| Sun–galactic-centre distance R₀ | 8.277 kpc = 26,996 ly | [GRAVITY Collaboration 2022, A&A](https://www.aanda.org/articles/aa/full_html/2023/09/aa47416-23/aa47416-23.html) |
| Sun's height above the midplane | 20.8 pc ≈ 68 ly | [Bennett & Bovy 2019 (Gaia DR2)](https://arxiv.org/abs/1810.03325) |
| Sgr A* mass | 4.297 × 10⁶ M☉ | GRAVITY Collaboration 2022/2023 (Keck's independent 3.98 × 10⁶ noted as the cross-check) |
| Schwarzschild radius | 1.27 × 10⁷ km = 0.085 AU | derived, R_s = 2GM/c² |
| Shadow / photon-capture radius | √27⁄2 · R_s ≈ 2.6 R_s | [EHT Collaboration 2022, ApJL 930, L12](https://ui.adsabs.harvard.edu/abs/2022ApJ...930L..12E/abstract) (ring 51.8 ± 2.3 μas) |
| Accretion behaviour | faint RIAF, ~10⁻⁸ M☉/yr, no bright thin disk | [EHT 2022 Paper V](https://eventhorizontelescope.org/publications/first-sagittarius-2022); Yuan, Quataert & Narayan 2003 |
| Flare statistics (accelerated in-game) | ~1 X-ray flare/day up to ~400×; continuous IR flicker, 5–6 IR flares/day | [Chandra 3 Ms campaign / Yuan & Wang 2016](https://academic.oup.com/mnras/article/456/2/1438/1069513); JWST NIRCam, Yusef-Zadeh et al. 2025 ApJL |
| S2 orbit (and 10 more S stars) | P = 16.05 yr, e = 0.88, pericenter ~120 AU at 7,650 km/s | [GRAVITY 2018, A&A 615, L15](https://www.aanda.org/articles/aa/full_html/2018/07/aa33718-18/aa33718-18.html); Gillessen et al. 2017 elements; S62/S4714 flagged contested (Peissker et al. 2020) |
| Gravitational time dilation | √(1 − R_s/r), static observer | Schwarzschild metric (the HUD quotes it as such) |
| Disk diameter / scale height | ~100,000 ly; thin disk ~300 pc | [NASA Imagine the Universe](https://imagine.gsfc.nasa.gov/science/objects/milkyway1.html); Bland-Hawthorn & Gerhard 2016, ARA&A |
| Bar half-length and angle | ~5 kpc at ~28° to the Sun-centre line | [Wegg et al. 2015, MNRAS](https://academic.oup.com/mnras/article/450/4/4050/989881) |
| Spiral arms | 2 major (Scutum–Centaurus, Perseus, rooted at the bar ends) + 2 minor gas arms + Orion/Local Spur containing the Sun | [NASA/JPL Spitzer/GLIMPSE annotated map](https://science.nasa.gov/resource/the-milky-way-galaxy/); Churchwell et al. 2009; Reid et al. 2019 maser parallaxes |
| Stellar densities | 0.1 stars/pc³ locally → 10⁵–10⁶ stars/pc³ in the central parsec | [Mamajek stellar census](https://www.pas.rochester.edu/~emamajek/memo_star_dens.html); Schödel et al. 2014 (nuclear cluster, r_h = 4.2 pc) |
| Star class mix and colours | M 75.5%, K 12.5%, G 7%, F 3%, A 1.2%, B 0.5% (+O/B young population confined to arms) | Mamajek census; O-star rarity (~1 in 3 × 10⁶) is why they only appear via the arm population |
| Star-forming landmarks | Orion, Carina, Lagoon, Eagle, Heart & Soul, Cygnus X, W49, W51 at published (l, b, d) | NASA/ESA region pages, Reid et al. parallaxes |
| Globular clusters / satellites | 8 real clusters + LMC (163 kly), SMC (~200 kly), Sagittarius dwarf | Harris catalog 2010; Pietrzyński et al. 2019 (LMC to 1%) |
| G2 gas-cloud encounter (event flavour text) | 2014 pericenter ~260 AU, survived | [ESO eso1512](https://www.eso.org/public/news/eso1512/) |

Stated approximations: superluminal "warp" speeds are a labelled gameplay
device; flare cadence is accelerated (a real observing day is compressed to
minutes); the S-star cluster's absolute orientation drops the ~31° position
angle between equatorial and galactic north; the lensing pass integrates the
standard weak-field photon-bending approximation, not a full Kerr geodesic;
procedural "survey" stars are statistical stand-ins, not Gaia sources.

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

## Sky catalog

| Data | Source | Notes |
| --- | --- | --- |
| Naked-eye stars | Yale Bright Star Catalogue / HYG database, via [d3-celestial](https://github.com/ofrohn/d3-celestial) | 5,044 stars to visual magnitude 6.0 with B-V colour indices; J2000 positions quantised to 0.01° |
| Constellation figures | IAU constellations, figure lines via [d3-celestial](https://github.com/ofrohn/d3-celestial) | All 88 constellations (Serpens drawn in its two traditional parts), with label anchors |
| Milky Way band | Galactic-band brightness contours via [d3-celestial](https://github.com/ofrohn/d3-celestial) | Five nested brightness levels, rasterised and sampled into 3,361 points; the *positions* are the real contours, the soft glow used to draw them is stylised |

Star colours are not decorative: each star's B-V index is converted to an
effective temperature (Ballesteros 2012) and then to an sRGB colour along the
Planckian locus, washed toward white because the dark-adapted eye sees little
colour in faint points. Star size and opacity follow the catalogued visual
magnitude, and the faint end drops out first as twilight brightens.

The generated modules are `src/data/catalog/skydata.ts` and
`src/data/catalog/worldmap.ts` - do not hand-edit them.

### d3-celestial licence

The star, constellation and Milky Way data are redistributed under the
BSD-3-Clause licence:

> Copyright (c) 2015, Olaf Frohn. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice,
>    this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice,
>    this list of conditions and the following disclaimer in the documentation
>    and/or other materials provided with the distribution.
> 3. Neither the name of the copyright holder nor the names of its
>    contributors may be used to endorse or promote products derived from this
>    software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
> ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
> LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
> CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
> INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
> CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
> ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
> POSSIBILITY OF SUCH DAMAGE.

## Observing-location picker

| Data | Source | Notes |
| --- | --- | --- |
| Coastlines | [Natural Earth](https://www.naturalearthdata.com/) 1:110m land, via the [world-atlas](https://github.com/topojson/world-atlas) TopoJSON build | Public domain. Decoded, cut at the antimeridian, simplified to ~0.3° and quantised to 0.05° - map detail for a picker, not for navigation |
| City coordinates | [GeoNames](https://www.geonames.org/) (CC BY 4.0) | 89 curated observing sites; every coordinate was matched by name + country code against the GeoNames dump rather than typed by hand |

"Find my location" uses the browser's own geolocation API, only on request,
and the coordinate never leaves the page.

## Sky rendering notes

The night sky computes altitude/azimuth from the catalog above plus the app's
own Kepler elements (planets), the leading terms of the lunar theory (Meeus -
Moon position good to ~0.3°, phase from solar elongation) and the standard
GMST expression - positions are good to about a degree, not ephemeris-grade,
and the panel says so. Deep-sky markers in the 3D scene sit at their real
J2000 directions on the sky sphere; the objects themselves are of course far
beyond it. In the 3D orrery the faint background starfield, the Milky Way
backdrop texture on the sky sphere and the ecliptic reference grid remain
procedural art - only the night-sky view's band comes from the real contours
described above. The in-app location picker credits Natural Earth and
GeoNames directly, and the d3-celestial BSD-3 notice above is also carried
into the built bundle as a preserved legal comment.

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
