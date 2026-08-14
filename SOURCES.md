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

### Earth and the Moon, close range (`public/textures/earth/`, `public/textures/moon/`)

These two are the only bodies a viewer can approach to within a few hundred
kilometres, so they are not one map each but a layer stack at four
resolutions, streamed by distance. Every layer is derived from a published
NASA product by `scripts/buildearthmoon.mjs`, which records the source URL of
each one and applies the elevation encodings **exactly as NASA documents
them** - nothing here is upscaled from a smaller image, hand-painted, or
invented. Earth's previous map was AI-generated; it has been removed.

| File | Product | Resolution shipped | Credit |
| --- | --- | --- | --- |
| `earth/day_{1k,2k,4k,8k}.webp` | Blue Marble Next Generation, December 2004, topography + bathymetry ([73909](https://visibleearth.nasa.gov/images/73909/)) | from the 21600×10800 master (2 km/px) | NASA Earth Observatory (Reto Stockli, NASA GSFC) |
| `earth/night_{1k,2k}.webp` | Black Marble 2016 night lights ([144898](https://visibleearth.nasa.gov/images/144898/)) | from the 3600×1800 master | NASA Earth Observatory (Joshua Stevens); Suomi NPP VIIRS day/night band |
| `earth/clouds_{1k,2k,4k}.webp` | Blue Marble clouds, MODIS composite 2001-07-29 ([57747](https://visibleearth.nasa.gov/images/57747/)) | stitched from the two 21600×21600 hemispheres | NASA Earth Observatory / MODIS |
| `earth/normal_{2k,4k}.webp` | Derived from BMNG land topography, SRTM30 + GEBCO_08 ([73934](https://visibleearth.nasa.gov/images/73934/)) | from the 21600×10800 master | NASA Earth Observatory |
| `earth/orm_2k.webp` | Ocean/land roughness split, derived from the Blue Marble radiometry | 2048×1024 | derived, see below |
| `moon/color_{1k,2k,4k,8k}.webp` | CGI Moon Kit colour map, Hapke-normalised LROC WAC mosaic ([SVS 4720](https://svs.gsfc.nasa.gov/4720)) | from the 8192×4096 master | NASA SVS (Ernie Wright); LRO/LROC |
| `moon/normal_{2k,4k,8k}.webp` | Derived from LOLA LDEM at 64 px/deg ([SVS 4720](https://svs.gsfc.nasa.gov/4720)) | from the 23040×11520 master | NASA SVS / LRO LOLA |
| `moon/height_2k.webp` | The same LDEM, quantised for displacement | 2048×1024 | NASA SVS / LRO LOLA |

**Elevation encodings, quoted from the products' own pages.** The BMNG
topography is 8-bit "scaled 0-6400 meters"; the LOLA LDEM `_uint` TIFFs are
"unsigned 16-bit ... in half-meters, relative to a radius of 1727400 meters",
against a 1737.4 km reference sphere. Both are applied verbatim when the
normal maps are computed, with the east-west slope divided by cos(latitude)
so relief is not smeared toward the poles. The Moon's shipped relief spans
-8875 m to +10666 m, which is the real range of the data (the South
Pole-Aitken floor and the Selenean summit).

**Two derived layers, and what they assume.** The ocean roughness map is a
blue-dominance test on the Blue Marble radiometry - water is the only large
surface markedly bluer than it is red - so that the Sun glints off sea and
not off land; it is not a published coastline product. The cloud composite's
source hemispheres are a late-July mosaic, so the Antarctic is in polar night
and MODIS has no visible-band retrieval there; those rows fade into NASA's
own pre-assembled version of the same composite rather than being cut off at
a hard line of latitude. The hemisphere ordering is not assumed either - the
build correlates both possible orderings against that pre-assembled composite
and fails if neither matches (it scores r=0.999 against r=-0.03).

**What the clouds are and are not.** They are a real MODIS composite from
29 July 2001 - genuine weather, but a fixed snapshot, not the weather on the
simulated date. The app says so in Earth's info panel. Everything else about
Earth and the Moon - where they are, how they are lit, the lunar phase - comes
from the simulation, not from these images.

Bodies without published global maps (the Uranian moons, Eris, Haumea,
Makemake, Sedna, Quaoar, Gonggong, Orcus, Pallas, Hygiea, Psyche, Eros and
all comet nuclei) use seeded procedural surfaces generated in-browser,
labelled **Artistic rendering** in the info panel.

The USGS maps were retrieved from the USGS Astrogeology Science Center
public archive (`planetarymaps.usgs.gov` / `asc-pds-services` mirror);
the Pluto color map from NASA's science.nasa.gov asset library.

## The all-sky background

| Data | Source | Notes |
| --- | --- | --- |
| Milky Way all-sky map | [NASA SVS "Deep Star Maps 2020"](https://svs.gsfc.nasa.gov/4851/) (Ernie Wright) | Plotted from 1.7 billion stars: **Gaia DR2**, **Hipparcos-2** and **Tycho-2**, with Yale Bright Star, UCAC3 and XHIP for completeness. Public domain (US Gov) |

`public/textures/sky/milkyway_{1k,2k,4k}.webp` is built by
`scripts/buildsky.mjs` from two of that entry's products - `milkyway_2020_8k_gal.exr`
(the diffuse Milky Way) and `starmap_2020_8k_gal.exr` (the resolved stars) -
composited, tone-mapped from linear half-float to 8-bit sRGB, and downsampled.
Both sources are **galactic** plate carrée, which is why the renderer can
sample them with the same J2000 scene→galactic matrix it uses for orientation.
SVS corrected the galactic images in January 2021 to use the Hipparcos/Gaia
transformation rather than a B1950 one; these are the corrected versions.

**Nothing in the band is invented.** The Great Rift, the Scutum and Sagittarius
star clouds, the bulge, the dark nebulae and both Magellanic Clouds are where
the survey measured them, at the brightness it measured. The only judgement
applied is exposure: a tone curve anchored to the data's own percentiles, and a
0.62 intensity so the sky does not outshine the solar system in front of it.
An earlier version of this file generated the band procedurally from noise;
that is gone.

**The map's axis convention was measured, not assumed.** The Large and Small
Magellanic Clouds were located in the image by searching for the brightest
compact sources away from the plane, and their pixel positions tested against
all four possible conventions. Galactic longitude increasing to the left with
latitude increasing downward matched to within 4 pixels at 2048×1024; the other
three were wrong by 640 to 820 pixels. `scripts/buildsky.mjs` re-checks the
orientation on every run and fails if the galactic centre is not the brightest
region.

At runtime the equirectangular map is resampled once into a cubemap and sampled
by direction, which is what makes it a true all-sky environment: no seam at
l = 180°, no pinch at the galactic poles, and working mipmaps. Three quality
tiers (1k→512, 2k→768, 4k→1024 per face) differ only in how finely the same
measured sky is resolved.

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

## Nearby star systems

Thirteen systems out to 40.7 light-years, with every planet the sources
below will vouch for. Nothing is filled in by analogy: a field no source
gives is left blank and the panel omits the row.

| What | Source |
| --- | --- |
| Planet parameters (period, semi-major axis, eccentricity, radius, mass, equilibrium temperature, insolation, discovery) | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) `pscomppars`, queried via its TAP service |
| Controversy flags (the Tau Ceti signals) | NASA Exoplanet Archive `pl_controv_flag` |
| Astrometry: position, parallax, proper motion, radial velocity | [SIMBAD](https://simbad.cds.unistra.fr/simbad/) (serving [Gaia DR3](https://www.cosmos.esa.int/web/gaia/dr3)) |
| Alpha Centauri A/B parallax, radii, temperatures | [Kervella et al. 2016/2017](https://www.aanda.org/articles/aa/full_html/2017/01/aa29505-16/aa29505-16.html) - Gaia saturates on stars this bright |
| Sirius A/B masses and the 50.09-year orbit | [Bond et al. 2017 (ApJ)](https://iopscience.iop.org/article/10.3847/1538-4357/aa6af8); Hipparcos parallax |
| Barnard's Star: four sub-Earths | [Basant et al. 2025 (ApJL)](https://iopscience.iop.org/article/10.3847/2041-8213/adb8d5); [ESO](https://www.eso.org/public/news/eso2417/) |
| Proxima b | [Anglada-Escudé et al. 2016](https://www.eso.org/public/news/eso1629/); [NASA](https://science.nasa.gov/exoplanet-catalog/proxima-centauri-b/) |
| TRAPPIST-1 radii and transit-timing masses | [Agol et al. 2021 (PSJ)](https://iopscience.iop.org/article/10.3847/PSJ/abd022); [Gillon et al. 2017 (Nature)](https://www.nature.com/articles/nature21360); [NASA](https://science.nasa.gov/mission/webb/trappist-1/) |
| Epsilon Indi Ab direct image | [Matthews et al. 2024 (Nature)](https://www.nature.com/articles/s41586-024-07837-8); [ESA/Webb](https://esawebb.org/news/weic2419/) |
| GJ 876 Laplace resonance | [Rivera et al. 2010 (ApJ)](https://iopscience.iop.org/article/10.1088/0004-637X/719/1/890) |
| Habitable-zone limits (every star, the Sun included) | [Kopparapu et al. 2014 (ApJL 787, L29)](https://iopscience.iop.org/article/10.1088/2041-8205/787/2/L29) |

**Two kinds of number are marked rather than mixed in with measurements.**
For a radial-velocity planet the archive publishes a radius derived from
mass through a mass-radius relation; it is a model output, not an
observation, and the panel says *estimated from mass, not measured*. A
radial-velocity mass is a lower bound unless the orbit's tilt is known, and
the panel says *minimum mass*. Only the transiting TRAPPIST-1 planets here
have radii and true masses that were actually measured.

**Every world in these systems is drawn, not photographed.** There is no
image of any of these surfaces. Each planet is generated from its size,
mass, temperature and the starlight it receives, using the ordinary
physical expectations for a body of that class at that temperature, and
every panel carries an *Artistic rendering* badge saying so. Star colours
are computed from measured effective temperatures; granulation and
starspots are procedural.

**Orbits.** The shape and size of every ellipse are the measured ones.
Where a planet sits along its orbit, and how its orbital plane is oriented
in space, are almost never known for these systems - so the phase is an
arbitrary but stable choice, the planes are drawn coplanar except where an
inclination was actually measured, and the panel says so.

## Audio

- UI sounds: [Kenney](https://kenney.nl) "Interface Sounds" / "Sci-Fi Sounds" (CC0)
- Click tone: [Mixkit](https://mixkit.co) (Mixkit Free License)
- Music: "Floating Cities" - Kevin MacLeod ([incompetech.com](https://incompetech.com)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Fonts

Orbitron and Rajdhani, both [SIL Open Font License](https://scripts.sil.org/OFL), self-hosted.
