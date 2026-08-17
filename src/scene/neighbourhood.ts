/**
 * The stellar neighbourhood as a real 3D map.
 *
 * Every system is a point at its actual position - right ascension,
 * declination and parallax turned into Cartesian coordinates, with the origin
 * on whichever system you are currently in. The layout is linear in
 * light-years, so relative distances are exact: TRAPPIST-1 is 9.3 times
 * further from the Sun than Alpha Centauri, and it is drawn 9.3 times further
 * away. Nothing is placed for composition.
 *
 * Two things follow from that automatically rather than being authored:
 *
 *  - Brightness. Each system's apparent magnitude is its catalogued visual
 *    magnitude rescaled by the inverse-square law from wherever you are now.
 *    Stand at Alpha Centauri and the Sun becomes a magnitude 0.5 star, which
 *    is what it actually is from there.
 *  - Direction. Travel to Barnard's Star and the whole map re-expresses itself
 *    around the new origin, so the Sun appears where the Sun would appear.
 *
 * Where a point is drawn
 * ----------------------
 * A star further away than the sky shell is at optical infinity for all
 * practical purposes, so it is drawn on the shell in its true direction, the
 * same treatment scene/nakedeye gives a distant planet. Closer than that - which
 * happens once you pull back far enough for the neighbourhood to open out - it
 * is drawn at its true position and the map becomes genuinely three-dimensional.
 * The switch is a `min()`, so it is continuous: stars slide off the shell into
 * real space as you zoom out rather than popping.
 */
import * as THREE from 'three';
import { STAR_SYSTEMS, type StarSystem } from '../data/catalog/starsystems';
import { AU_PER_LY, NEIGHBOURHOOD_IDS, SOL_ID, positionLyOf, unitsPerLy } from '../sim/interstellar';
import { blackbodyColor } from './hoststar';
import { StarLinks, type LinkNode } from './starlinks';

/** Just inside scene/sky.ts's 6000-unit shell, matching scene/nakedeye. */
const SKY_R = 5700;

/** The Sun's apparent visual magnitude at 1 AU, and 1 AU expressed in ly. */
const SUN_MAG_V = -26.74;
const AU_IN_LY = 1 / AU_PER_LY;

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPr;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_PointSize = aSize * uPr;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    if (aAlpha < 0.004) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float core = smoothstep(0.44, 0.0, d);
    float halo = smoothstep(1.0, 0.16, d) * 0.34;
    float spike = max(0.0, 0.22 - min(abs(p.x), abs(p.y)) * 3.0) * smoothstep(1.0, 0.1, d);
    float a = (core + halo + spike) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Flux-summed visual magnitude of every star in a system. */
function combinedMagV(sys: StarSystem): number {
  let flux = 0;
  for (const s of sys.stars) {
    if (s.magV === undefined) continue;
    flux += Math.pow(10, -0.4 * s.magV);
  }
  return flux > 0 ? -2.5 * Math.log10(flux) : 12;
}

interface Entry {
  id: string;
  name: string;
  /** Visual magnitude as seen from Earth, at `refLy`. */
  magV: number;
  /** Distance from the Sun in light-years at which `magV` applies. */
  refLy: number;
  color: THREE.Color;
  /** Distance from the current origin in light-years - refreshed per update. */
  distLy: number;
  /** Apparent magnitude from the current origin - refreshed per update. */
  mag: number;
  /** Position in scene units relative to the current origin. */
  scenePos: THREE.Vector3;
  /** Where the point was actually drawn (may be on the shell). */
  drawPos: THREE.Vector3;
}

export class Neighbourhood {
  /**
   * The points ride a group pinned to the camera, exactly as the sky shell
   * does, and their vertex positions are stored RELATIVE to it.
   *
   * That is not tidiness, it is arithmetic. At true scale a light-year is
   * 6.3 million units and TRAPPIST-1 is a quarter of a billion units out; a
   * 32-bit float has about 15 units of resolution there, and a star drawn at
   * an absolute position would jitter by a fifth of a degree every frame.
   * Stored relative to the camera, every coordinate stays under 5,700 and the
   * precision problem disappears.
   */
  readonly group = new THREE.Group();
  readonly points: THREE.Points;
  /**
   * The stepped routes between systems. It lives in this group and takes its
   * endpoints from the very vertices written below, which is what makes "the
   * route ends on the star" a property of the code rather than something to
   * be re-checked whenever the projection changes.
   */
  readonly links = new StarLinks();
  readonly entries: Entry[] = [];
  private byId = new Map<string, Entry>();
  private pos: Float32Array;
  private color: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private originId = SOL_ID;
  private originLy = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private enabled = true;
  private linkOpacity = 0;
  private chart = false;
  private linkNodes: LinkNode[] = [];

  constructor() {
    for (const id of NEIGHBOURHOOD_IDS) {
      if (id === SOL_ID) {
        this.entries.push({
          id,
          name: 'The Sun',
          magV: SUN_MAG_V,
          refLy: AU_IN_LY,
          color: blackbodyColor(5772),
          distLy: 0,
          mag: SUN_MAG_V,
          scenePos: new THREE.Vector3(),
          drawPos: new THREE.Vector3(),
        });
        continue;
      }
      const sys = STAR_SYSTEMS.find((s) => s.id === id)!;
      const hottest = sys.stars.reduce(
        (best, s) => ((s.magV ?? 99) < (best.magV ?? 99) ? s : best),
        sys.stars[0],
      );
      this.entries.push({
        id,
        name: sys.name,
        magV: combinedMagV(sys),
        refLy: sys.distanceLy,
        color: blackbodyColor(hottest.tempK ?? 3500),
        distLy: sys.distanceLy,
        mag: combinedMagV(sys),
        scenePos: new THREE.Vector3(),
        drawPos: new THREE.Vector3(),
      });
    }
    for (const e of this.entries) this.byId.set(e.id, e);

    const n = this.entries.length;
    this.pos = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPr: { value: Math.min(2, window.devicePixelRatio || 1) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.group.add(this.points);
    this.points.frustumCulled = false;
    // after the sky and the naked-eye planets, before anything solid, so a
    // planet's disc still paints over a star behind it
    this.points.renderOrder = -8;
    this.group.add(this.links.lines);
  }

  /** Move the frame onto another system. Everything is re-expressed, not moved. */
  setOrigin(systemId: string): void {
    this.originId = systemId;
    this.originLy.copy(positionLyOf(systemId));
  }

  get origin(): string {
    return this.originId;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.group.visible = v;
  }

  /**
   * Sky, or chart.
   *
   * As sky, this layer is what the neighbours look like from here: brightness
   * follows apparent magnitude, so the dwarfs that make up most of the local
   * catalogue are correctly invisible. As chart - once the camera has pulled
   * back far enough that the neighbourhood is the subject rather than the
   * backdrop - every catalogued system is a node, whether or not you could see
   * it, and the routes between them are drawn.
   *
   * One switch for both, because they have to agree. The label layer already
   * names every system on the chart; if the points kept their sky brightness
   * the faint ones would be labels hanging over nothing, with their routes
   * silently dropped for want of a visible endpoint.
   */
  setChartMode(on: boolean): void {
    this.chart = on;
    this.linkOpacity = on ? 0.5 : 0;
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPr.value = pr;
  }

  /**
   * @param observer camera position in scene units
   * @param scaleT explorer↔true-scale blend, which sets units per light-year
   * @param fadeIn 0 suppresses the layer entirely (used while a cruise is
   *        handing the view over to a system's own geometry)
   */
  update(observer: THREE.Vector3, scaleT: number, fadeIn = 1): void {
    if (!this.enabled) return;
    this.group.position.copy(observer);
    const uply = unitsPerLy(scaleT);
    if (this.linkNodes.length !== this.entries.length) {
      this.linkNodes = this.entries.map((e) => ({
        id: e.id,
        ly: new THREE.Vector3(),
        draw: new THREE.Vector3(),
        visible: false,
      }));
    }
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      this.tmp.copy(positionLyOf(e.id)).sub(this.originLy);
      e.distLy = this.tmp.length();
      e.scenePos.copy(this.tmp).multiplyScalar(uply);

      // apparent magnitude from wherever we are, by the inverse-square law
      // applied to the star's catalogued brightness at its catalogued distance
      e.mag =
        e.distLy < 1e-9
          ? -99
          : e.magV + 5 * Math.log10(e.distLy / e.refLy);

      // the system you are standing in is drawn as geometry, not as a point -
      // leaving its point on too would double up into an over-bright blob
      const isHome = e.id === this.originId;

      // the route network is laid out in light-years, which is the real
      // adjacency and does not move when the camera does
      this.linkNodes[i].ly.copy(this.tmp);
      this.linkNodes[i].visible = false;

      this.dir.copy(e.scenePos).sub(observer);
      const viewDist = this.dir.length();
      if (viewDist < 1e-6) {
        this.alpha[i] = 0;
        continue;
      }
      this.dir.divideScalar(viewDist);
      // beyond the shell it is at optical infinity; inside it, draw it truly
      const drawDist = Math.min(viewDist, SKY_R);
      // vertex positions are relative to the camera-pinned group; drawPos is
      // the world position the same point ends up at, for the label layer
      this.pos[i * 3] = this.dir.x * drawDist;
      this.pos[i * 3 + 1] = this.dir.y * drawDist;
      this.pos[i * 3 + 2] = this.dir.z * drawDist;
      e.drawPos.copy(observer).addScaledVector(this.dir, drawDist);

      // size and alpha from magnitude, on the same curve scene/nakedeye uses
      let size = 2.0 + 6.0 * THREE.MathUtils.clamp((4.5 - e.mag) / 10, 0, 1);
      if (e.mag < -6) size += Math.min(5, (-6 - e.mag) * 0.3);
      // On the chart, every system is a node: a faint dwarf is floored to a dim
      // but real dot rather than left at nothing, so its label and its routes
      // have a star to attach to.
      const sky = THREE.MathUtils.clamp((7.5 - e.mag) / 5, 0, 1);
      const alpha = isHome ? 0 : Math.max(sky, this.chart ? 0.75 : 0) * fadeIn;
      // big enough to read as a node a route can end on, rather than as a
      // speck of starfield that happens to have a name next to it
      if (this.chart) size = Math.max(size, 7);
      const gain = e.mag < -8 ? 1.4 : e.mag < -2 ? 1.05 : 0.85;
      this.color[i * 3] = e.color.r * gain;
      this.color[i * 3 + 1] = e.color.g * gain;
      this.color[i * 3 + 2] = e.color.b * gain;
      this.size[i] = Math.min(size, 9);
      this.alpha[i] = alpha;

      // The route endpoint is the point's own vertex, not the star's true
      // position: beyond the shell those differ by light-years, and routing to
      // the latter would end every line in empty space near its star.
      this.linkNodes[i].draw.set(
        this.pos[i * 3],
        this.pos[i * 3 + 1],
        this.pos[i * 3 + 2],
      );
      this.linkNodes[i].visible = alpha > 0.02;
    }
    this.links.update(this.linkNodes, this.originId, this.linkOpacity);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  entry(id: string): Entry | undefined {
    return this.byId.get(id);
  }

  /** Scene position of a system relative to the current origin. */
  positionOf(id: string, scaleT: number, out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(positionLyOf(id))
      .sub(this.originLy)
      .multiplyScalar(unitsPerLy(scaleT));
  }

  /** Distance in light-years from the current origin. */
  distanceLy(id: string): number {
    return positionLyOf(id).distanceTo(this.originLy);
  }

  /** The route layer's own view of what it drew, for the test. */
  get linkInfo(): StarLinks['info'] {
    return this.links.info;
  }

  get linkNodeList(): LinkNode[] {
    return this.linkNodes;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.links.dispose();
  }
}
