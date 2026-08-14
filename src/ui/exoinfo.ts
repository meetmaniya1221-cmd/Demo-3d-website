/**
 * Information-panel content for another star's system and its planets.
 *
 * The rule this file exists to enforce: never print a number we do not have,
 * and never print a number we do have without saying what kind of number it is.
 * A radius from a transit and a radius from a mass-radius relation are both
 * "radius"; only one of them was measured. A mass from radial velocity is a
 * lower bound unless the orbit's tilt is known. Being inside a habitable zone
 * is a statement about starlight, not about habitability. Each of those gets
 * said, every time, rather than in a footnote somewhere.
 */
import {
  EARTH_MASSES_PER_JUPITER,
  EARTH_RADII_PER_JUPITER,
  PLANET_CLASS_LABEL,
  planetClass,
  primaryStar,
  type Exoplanet,
  type HostStar,
  type StarSystem,
} from '../data/catalog/starsystems';
import { HZ_METHOD_NOTE, habitableZone, hzPlacement } from '../sim/habitable';
import { AU_PER_LY, LY_PER_PC, fmtLightTravel } from '../sim/interstellar';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cell(k: string, v: string): string {
  return `<div class="data-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

const STATUS_BADGE: Record<Exoplanet['status'], { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed planet', cls: 'ok' },
  disputed: { label: 'Disputed - archive controversy flag', cls: 'warn' },
  candidate: { label: 'Candidate - not archive-confirmed', cls: 'warn' },
};

const PLACEMENT_TEXT: Record<string, string> = {
  inside: 'Inside the conservative habitable zone',
  'too-hot': 'Closer in than the habitable zone',
  'too-cold': 'Further out than the habitable zone',
};

/** Right ascension in degrees → hours, minutes, seconds. */
function fmtRa(deg: number): string {
  const h = deg / 15;
  const hh = Math.floor(h);
  const m = (h - hh) * 60;
  const mm = Math.floor(m);
  const ss = (m - mm) * 60;
  return `${hh}h ${String(mm).padStart(2, '0')}m ${ss.toFixed(1)}s`;
}

function fmtDec(deg: number): string {
  const sign = deg < 0 ? '−' : '+';
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  const mm = Math.floor(m);
  const ss = (m - mm) * 60;
  return `${sign}${d}° ${String(mm).padStart(2, '0')}′ ${ss.toFixed(0)}″`;
}

function fmtPeriod(days: number): string {
  if (days < 2) return `${(days * 24).toFixed(1)} hours`;
  if (days < 700) return `${days.toFixed(days < 20 ? 3 : 2)} days`;
  return `${(days / 365.25).toFixed(2)} years <small>(${Math.round(days).toLocaleString('en-US')} d)</small>`;
}

// ------------------------------------------------------------ star systems --

export interface PanelContent {
  title: string;
  kind: string;
  sections: string[];
}

export function renderHostStar(sys: StarSystem, star: HostStar): PanelContent {
  const isAnchor = star.id === primaryStar(sys).id;
  const hz = habitableZone(star.luminositySun, star.tempK);
  const confirmed = sys.planets.filter((p) => p.status === 'confirmed').length;
  const other = sys.planets.length - confirmed;
  const distLy = star.distanceLy ?? sys.distanceLy;

  const cells: string[] = [
    cell('Spectral type', esc(star.spectral)),
    cell(
      'Distance from the Sun',
      `${distLy.toFixed(3)} ly<small> · ${(distLy / LY_PER_PC).toFixed(3)} pc · ${Math.round(distLy * AU_PER_LY).toLocaleString('en-US')} AU</small>`,
    ),
    cell('Light travel time', fmtLightTravel(distLy)),
  ];
  if (star.massSun !== undefined) cells.push(cell('Mass', `${star.massSun.toFixed(4)} M☉`));
  if (star.radiusSun !== undefined) cells.push(cell('Radius', `${star.radiusSun.toFixed(4)} R☉`));
  if (star.tempK !== undefined) {
    cells.push(cell('Surface temperature', `${Math.round(star.tempK).toLocaleString('en-US')} K`));
  }
  if (star.luminositySun !== undefined) {
    const l = star.luminositySun;
    cells.push(
      cell(
        'Luminosity',
        l >= 0.01
          ? `${l.toFixed(3)} L☉`
          : `${l.toExponential(2)} L☉<small> (${(1 / l).toFixed(0)}× fainter than the Sun)</small>`,
      ),
    );
  }
  if (star.magV !== undefined) {
    cells.push(
      cell(
        'Apparent magnitude',
        `${star.magV.toFixed(2)}<small> ${star.magV < 6 ? 'visible to the unaided eye' : 'needs a telescope'}</small>`,
      ),
    );
  }
  if (star.rotationDays !== undefined) {
    cells.push(cell('Rotation period', `${star.rotationDays.toFixed(1)} days`));
  }
  if (star.ageGyr !== undefined) {
    cells.push(cell('Age', `≈ ${star.ageGyr.toFixed(star.ageGyr < 1 ? 2 : 1)} billion years`));
  }
  if (star.companionAU !== undefined && star.companionPeriodYears !== undefined) {
    cells.push(
      cell(
        'Companion separation',
        `${star.companionAU >= 1000 ? Math.round(star.companionAU).toLocaleString('en-US') : star.companionAU.toFixed(1)} AU<small> · ${star.companionPeriodYears >= 1000 ? `${Math.round(star.companionPeriodYears).toLocaleString('en-US')}-year` : `${star.companionPeriodYears.toFixed(2)}-year`} orbit</small>`,
      ),
    );
  }

  const sections: string[] = [];

  if (isAnchor) {
    sections.push(`<p class="infopanel-overview">${sys.overview}</p>`);
    sections.push(`
      <div class="system-summary">
        <div class="u-label">Star system</div>
        <div class="data-grid">
          ${cell('Distance from Sun', `${sys.distanceLy.toFixed(2)} ly<small> · ${(sys.distanceLy / LY_PER_PC).toFixed(2)} pc</small>`)}
          ${cell('Star type', esc(sys.stars.map((s) => s.spectral).join(' + ')))}
          ${cell('Known planets', confirmed === 0 && other === 0 ? 'None found' : `${confirmed} confirmed${other > 0 ? ` · ${other} unconfirmed` : ''}`)}
          ${cell('Constellation', esc(sys.constellation))}
        </div>
        <div class="concept-card" style="margin-top:12px">
          <div class="k">Worth knowing</div>
          <p>${sys.interestingFact}</p>
        </div>
      </div>
    `);
  } else {
    sections.push(`<p class="infopanel-overview">${star.note}</p>`);
  }

  sections.push(`<div class="data-grid">${cells.join('')}</div>`);

  if (isAnchor) {
    sections.push(`
      <div class="composition-block">
        <div class="data-line"><span class="k">Position (ICRS J2000)</span><p>RA ${fmtRa(sys.raDeg)} · Dec ${fmtDec(sys.decDeg)}</p></div>
        <div class="data-line"><span class="k">Parallax</span><p>${sys.parallaxMas.toFixed(3)} mas <small>(${esc(sys.parallaxSource)})</small></p></div>
        ${
          sys.properMotion
            ? `<div class="data-line"><span class="k">Proper motion</span><p>${sys.properMotion[0].toFixed(1)} , ${sys.properMotion[1].toFixed(1)} mas/yr</p></div>`
            : ''
        }
        ${
          sys.radialVelocityKms !== undefined
            ? `<div class="data-line"><span class="k">Radial velocity</span><p>${sys.radialVelocityKms.toFixed(1)} km/s <small>(${sys.radialVelocityKms < 0 ? 'approaching' : 'receding'})</small></p></div>`
            : ''
        }
      </div>
    `);
  }

  if (hz) {
    sections.push(`
      <div class="hz-card">
        <div class="k">Habitable zone</div>
        <p><b>${hz.innerAU.toFixed(hz.innerAU < 0.1 ? 4 : 3)} - ${hz.outerAU.toFixed(hz.outerAU < 0.1 ? 4 : 3)} AU</b> (conservative)<br>
        <small>Optimistic bounds ${hz.optimisticInnerAU.toFixed(hz.optimisticInnerAU < 0.1 ? 4 : 3)} - ${hz.optimisticOuterAU.toFixed(hz.optimisticOuterAU < 0.1 ? 4 : 3)} AU</small></p>
        <p class="fine-print">${HZ_METHOD_NOTE}${hz.extrapolated ? ' This star sits outside the temperature range the fit was calibrated on, so its edges are extrapolated.' : ''}</p>
      </div>
    `);
  } else if (isAnchor) {
    sections.push(
      `<p class="fine-print">No habitable zone is drawn for this star: its temperature falls outside the range the Kopparapu et al. (2014) fit covers, and extrapolating it that far would be a guess dressed as a calculation.</p>`,
    );
  }

  if (isAnchor && sys.planets.length) {
    sections.push(`
      <div>
        <div class="u-label" style="margin-bottom:8px">Planets</div>
        <div class="chip-row">${sys.planets
          .map(
            (p) =>
              `<button class="chip planet-chip${p.status === 'confirmed' ? '' : ' unconfirmed'}" data-body="${esc(p.id)}">${esc(p.name)}<small>${PLANET_CLASS_LABEL[planetClass(p)]}</small></button>`,
          )
          .join('')}</div>
      </div>
    `);
  }

  if (isAnchor && sys.stars.length > 1) {
    sections.push(`
      <div>
        <div class="u-label" style="margin-bottom:8px">Other stars here</div>
        <div class="chip-row">${sys.stars
          .filter((s) => s.id !== star.id)
          .map((s) => `<button class="chip related-chip" data-body="${esc(s.id)}">${esc(s.name)}<small>${esc(s.spectral)}</small></button>`)
          .join('')}</div>
      </div>
    `);
  }

  if (isAnchor && sys.extras?.length) {
    sections.push(`
      <div>
        <div class="u-label" style="margin-bottom:8px">Also here</div>
        <ul class="fact-list">${sys.extras.map((e) => `<li>${e}</li>`).join('')}</ul>
      </div>
    `);
  }

  sections.push(`
    <div class="sources-block">
      <div class="texture-badge artistic">Artistic rendering</div>
      <p class="fine-print">No telescope has resolved this star's disc. Its colour is computed from the measured effective temperature; the granulation and starspots are procedural.</p>
      ${
        isAnchor
          ? `<p class="fine-print">The sky behind this system is the same sky: at ${sys.distanceLy.toFixed(0)} light-years the Milky Way and the distant star field are indistinguishable from how they look at home. The constellation figures are not - they are lines humans drew between stars as seen from Earth, and several of the stars in them are nearer than this system - so they are switched off while you are here.</p>
             <p class="fine-print">Orbit shapes and sizes are the measured ones. Where a planet sits along its orbit, and the orientation of the orbital plane in space, are almost never known for these systems and are not claimed here.</p>`
          : ''
      }
      <p class="fine-print">Data: ${sys.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(' · ')}</p>
    </div>
  `);

  return {
    title: star.name,
    kind: isAnchor ? `${sys.name} · ${sys.distanceLy.toFixed(2)} light-years` : `${sys.name} · companion star`,
    sections,
  };
}

// --------------------------------------------------------------- exoplanets --

export function renderExoplanet(sys: StarSystem, p: Exoplanet): PanelContent {
  const host = primaryStar(sys);
  const hz = habitableZone(host.luminositySun, host.tempK);
  const placement = hzPlacement(p.semiMajorAU, hz);
  const badge = STATUS_BADGE[p.status];
  const cls = planetClass(p);

  const cells: string[] = [];
  if (p.radiusEarth !== undefined) {
    const jup = p.radiusEarth / EARTH_RADII_PER_JUPITER;
    cells.push(
      cell(
        'Radius',
        `${p.radiusEarth.toFixed(3)} R⊕${p.radiusEarth > 5 ? `<small> (${jup.toFixed(2)} R♃)</small>` : ''}${
          p.radiusEstimated
            ? '<small class="est"> estimated from mass, not measured</small>'
            : '<small> measured from its transit</small>'
        }`,
      ),
    );
  }
  if (p.massEarth !== undefined) {
    const jup = p.massEarth / EARTH_MASSES_PER_JUPITER;
    const kindNote =
      p.massKind === 'Msini'
        ? '<small class="est"> minimum mass - the orbit’s tilt is unknown</small>'
        : '<small> true mass</small>';
    cells.push(
      cell(
        'Mass',
        `${p.massEarth >= 100 ? `${p.massEarth.toFixed(0)} M⊕ <small>(${jup.toFixed(2)} M♃)</small>` : `${p.massEarth.toFixed(3)} M⊕`}${kindNote}`,
      ),
    );
  }
  if (p.densityGcm3 !== undefined) {
    cells.push(
      cell(
        'Density',
        `${p.densityGcm3.toFixed(2)} g/cm³<small> (Earth: 5.51)</small>`,
      ),
    );
  }
  cells.push(cell('Orbital period', fmtPeriod(p.periodDays)));
  cells.push(
    cell(
      'Distance from its star',
      `${p.semiMajorAU.toFixed(p.semiMajorAU < 0.1 ? 5 : 3)} AU<small> · ${(p.semiMajorAU / 0.387).toFixed(2)}× Mercury’s</small>`,
    ),
  );
  if (p.eccentricity !== undefined) {
    cells.push(
      cell(
        'Eccentricity',
        `${p.eccentricity.toFixed(3)}<small> ${p.eccentricity < 0.05 ? 'near-circular' : p.eccentricity < 0.2 ? 'mildly elliptical' : 'markedly elliptical'}</small>`,
      ),
    );
  }
  if (p.inclinationDeg !== undefined) {
    cells.push(cell('Inclination', `${p.inclinationDeg.toFixed(3)}°<small> measured (it transits)</small>`));
  }
  if (p.eqTempK !== undefined) {
    cells.push(
      cell(
        'Equilibrium temperature',
        `${Math.round(p.eqTempK)} K<small> (${Math.round(p.eqTempK - 273.15)} °C, before any greenhouse effect)</small>`,
      ),
    );
  }
  if (p.insolationEarth !== undefined) {
    cells.push(
      cell(
        'Starlight received',
        `${p.insolationEarth >= 0.01 ? p.insolationEarth.toFixed(3) : p.insolationEarth.toExponential(1)}× Earth’s`,
      ),
    );
  }

  const sections: string[] = [
    `<div class="status-badge ${badge.cls}">${badge.label}</div>`,
    `<p class="infopanel-overview">${p.note}</p>`,
    `<div class="data-grid">${cells.join('')}</div>`,
  ];

  if (placement) {
    sections.push(`
      <div class="hz-card ${placement}">
        <div class="k">Habitable zone</div>
        <p><b>${PLACEMENT_TEXT[placement]}</b><br><small>${host.name}'s conservative zone runs ${hz!.innerAU.toFixed(hz!.innerAU < 0.1 ? 4 : 3)} - ${hz!.outerAU.toFixed(hz!.outerAU < 0.1 ? 4 : 3)} AU; this planet orbits at ${p.semiMajorAU.toFixed(p.semiMajorAU < 0.1 ? 4 : 3)} AU.</small></p>
        ${
          placement === 'inside'
            ? '<p class="fine-print">That means it receives roughly the right amount of starlight for liquid water to be possible on a rocky surface with a suitable atmosphere. It is not a statement that this planet has water, an atmosphere, or life. None of those has been measured here.</p>'
            : ''
        }
      </div>
    `);
  }

  sections.push(`
    <div class="composition-block">
      <div class="data-line"><span class="k">Discovered</span><p>${p.discoveryYear} · ${esc(p.discoveryMethod)}${p.discoveryFacility ? `<br><small>${esc(p.discoveryFacility)}</small>` : ''}</p></div>
      <div class="data-line"><span class="k">Host star</span><p>${esc(host.name)} · ${esc(host.spectral)}, ${sys.distanceLy.toFixed(2)} light-years away</p></div>
    </div>
  `);

  if (p.uncertainty) {
    sections.push(`<p class="fine-print">⚠ ${esc(p.uncertainty)}</p>`);
  }

  sections.push(`
    <div class="sources-block">
      <div class="texture-badge artistic">Artistic rendering</div>
      <p class="fine-print">
        There is no photograph of this world. What you are looking at is generated from its ${p.radiusEarth !== undefined ? 'size, ' : ''}mass, temperature and the light it receives, using the ordinary expectations for a ${PLANET_CLASS_LABEL[cls].toLowerCase()} at ${p.eqTempK ? `${Math.round(p.eqTempK)} K` : 'this temperature'}. Colours, cloud patterns and surface markings are illustrative, not observed.
      </p>
      <p class="fine-print">Data: ${sys.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(' · ')}</p>
    </div>
  `);

  return {
    title: p.name,
    kind: `${PLANET_CLASS_LABEL[cls]} · ${sys.name}`,
    sections,
  };
}
