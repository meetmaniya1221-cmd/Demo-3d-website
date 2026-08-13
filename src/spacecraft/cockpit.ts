/**
 * The cockpit: a small, separate scene drawn on top of the finished space
 * image with the depth buffer cleared - the same trick first-person games use
 * for held equipment.
 *
 * Doing it this way matters here. The space view spans a near plane of a few
 * hundred metres and a far plane of two hundred AU; no depth buffer can hold a
 * one-metre window frame inside that range. Rendering the cabin in its own pass
 * with its own tiny frustum keeps the frame rock-solid at every distance, and
 * keeps the cockpit out of the bloom pass so the interior never glows.
 *
 * The cabin is fixed to the hull; the pilot's head turns inside it. So the
 * cockpit camera carries the head rotation and the geometry stays put - look
 * left and the A-pillar really does sweep past and the left window arrives.
 *
 * Design brief: research vessel, not fighter jet. Machined panels, a restrained
 * console, no holograms.
 *
 * Everything is laid out in units of the viewport's own frustum (hx, hy at one
 * metre), so the amount of window the pilot gets is identical on a phone and an
 * ultrawide monitor. The cabin is rebuilt when the viewport shape or the field
 * of view changes.
 */
import * as THREE from 'three';

const GLASS_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vLocal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vLocal = position.xy;
    gl_Position = projectionMatrix * mv;
  }
`;

const GLASS_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vLocal;
  uniform vec3 uTint;
  uniform float uStrength;
  uniform float uGlare;   // 0..1, how squarely this pane faces the Sun
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    // grazing angles pick up the coating; straight ahead it is nearly clear
    float fres = pow(1.0 - abs(dot(n, v)), 3.2);
    vec3 col = uTint * (0.014 + fres * 0.22);
    // two soft reflection streaks running across the pane - cabin light caught
    // in the coating, not a lens flare
    float s1 = exp(-pow((vLocal.y - vLocal.x * 0.35 - 0.17) * 26.0, 2.0));
    float s2 = exp(-pow((vLocal.y - vLocal.x * 0.35 + 0.31) * 38.0, 2.0));
    col += vec3(0.62, 0.74, 0.95) * (s1 * 0.030 + s2 * 0.016) * (0.35 + 0.65 * uGlare);
    // a wide, very soft veil when the Sun is ahead of the pane
    col += vec3(1.0, 0.93, 0.82) * uGlare * uGlare * 0.038 * (0.5 + fres);
    gl_FragColor = vec4(col * uStrength, 1.0);
  }
`;

/** Rounded rectangle written into a Path or Shape. */
function roundedRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  path: THREE.Path | THREE.Shape,
): void {
  const rad = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  path.moveTo(x0 + rad, y0);
  path.lineTo(x1 - rad, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + rad);
  path.lineTo(x1, y1 - rad);
  path.quadraticCurveTo(x1, y1, x1 - rad, y1);
  path.lineTo(x0 + rad, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - rad);
  path.lineTo(x0, y0 + rad);
  path.quadraticCurveTo(x0, y0, x0 + rad, y0);
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r?: number;
}

/** A flat panel with an optional window cut out of it, extruded for thickness. */
function panel(outer: Rect, hole: Rect | null, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  roundedRect(outer.x0, outer.y0, outer.x1, outer.y1, outer.r ?? 0.02, shape);
  if (hole) {
    const h = new THREE.Path();
    roundedRect(hole.x0, hole.y0, hole.x1, hole.y1, hole.r ?? 0.05, h);
    shape.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.computeVertexNormals();
  return geo;
}

function pane(rect: Rect): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0, 1, 1);
  g.translate((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2, 0);
  return g;
}

interface GlassEntry {
  mat: THREE.ShaderMaterial;
  normal: THREE.Vector3;
}

export interface ConsoleReadout {
  /** 0..1 fraction of maximum commanded velocity. */
  throttle: number;
  /** 0..1 fraction of maximum time compression. */
  time: number;
  target: string;
  dist: string;
}

/** The one live surface in the cabin: a small navigation repeater. */
class ConsoleScreen {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.paint({ throttle: 0, time: 0, target: 'NO TARGET', dist: '' });
  }

  paint(v: ConsoleReadout): void {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.fillStyle = '#050912';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(110,170,220,0.09)';
    c.lineWidth = 1;
    for (let x = 16; x < w; x += 16) {
      c.beginPath();
      c.moveTo(x + 0.5, 0);
      c.lineTo(x + 0.5, h);
      c.stroke();
    }
    c.fillStyle = 'rgba(150,190,235,0.5)';
    c.font = '600 12px ui-monospace, monospace';
    c.fillText('PROPULSION', 14, 24);
    c.fillText('SIM RATE', 14, 74);
    const bar = (y: number, frac: number, color: string) => {
      c.fillStyle = 'rgba(120,170,220,0.13)';
      c.fillRect(14, y, 168, 10);
      c.fillStyle = color;
      c.fillRect(14, y, Math.max(3, 168 * THREE.MathUtils.clamp(frac, 0, 1)), 10);
    };
    bar(32, v.throttle, 'rgba(127,212,255,0.85)');
    bar(82, v.time, 'rgba(255,196,107,0.78)');
    c.fillStyle = 'rgba(195,220,248,0.85)';
    c.font = '600 13px ui-monospace, monospace';
    c.fillText(v.target.slice(0, 14).toUpperCase(), 14, 116);
    c.fillStyle = 'rgba(140,180,220,0.55)';
    c.font = '12px ui-monospace, monospace';
    c.fillText(v.dist.slice(0, 14), 150, 116);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export class Cockpit {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private sunLight: THREE.DirectionalLight;
  private cabinLight: THREE.PointLight;
  private glass: GlassEntry[] = [];
  private screen = new ConsoleScreen();
  private screenTimer = 0;
  private built = { aspect: 0, fov: 0 };
  private disposables: Array<{ dispose(): void }> = [];
  private tmp = new THREE.Vector3();

  constructor(fovDeg = 52) {
    this.camera = new THREE.PerspectiveCamera(fovDeg, 1, 0.02, 14);
    this.scene.add(this.root);
    // Cabin lighting is a compromise, deliberately: at Neptune the real cabin
    // would be lit only by its own instruments, and a black rectangle is not a
    // cockpit. So the ambient term is generous enough to read the structure at
    // any heliocentric distance, and the Sun's contribution on top of it is the
    // part that actually tracks the inverse-square law.
    this.scene.add(new THREE.AmbientLight(0x6f83a8, 0.8));
    // the Sun as it actually falls on the cabin - direction and brightness come
    // from the ship's real heliocentric position every frame
    this.sunLight = new THREE.DirectionalLight(0xfff0dc, 1.4);
    this.scene.add(this.sunLight, this.sunLight.target);
    this.cabinLight = new THREE.PointLight(0x8fb4e0, 2.6, 7, 1.5);
    this.cabinLight.position.set(0, 0.08, 0.34);
    this.scene.add(this.cabinLight);
  }

  /** Rebuild the cabin for a viewport shape and field of view. */
  build(aspect: number, fovDeg: number): void {
    if (
      Math.abs(aspect - this.built.aspect) < 1e-3 &&
      Math.abs(fovDeg - this.built.fov) < 1e-3
    ) {
      return;
    }
    this.built = { aspect, fov: fovDeg };
    this.camera.fov = fovDeg;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.clear();

    const hy = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
    const hx = hy * aspect;
    const ZF = -1.0; // windscreen plane
    const ZR = 0.9; // rear bulkhead
    const WX = 1.16 * hx;
    const WYt = 1.1 * hy;
    const WYb = 1.24 * hy;
    const T = 0.05;

    // ~80% of the viewport stays clear glass
    const AW = 0.93 * hx;
    const ATop = 0.9 * hy;
    const ABot = 0.84 * hy;

    const shell = new THREE.MeshStandardMaterial({ color: 0x545d72, roughness: 0.66, metalness: 0.18 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.5, metalness: 0.3 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x20252f, roughness: 0.58, metalness: 0.26 });
    // Bright machined edge right at every aperture. Without it the frame melts
    // into the star field and the cabin stops reading as a cabin; with it the
    // window has an edge you can see from the corner of your eye.
    const seal = new THREE.MeshStandardMaterial({ color: 0x8e9aae, roughness: 0.38, metalness: 0.55 });
    this.disposables.push(shell, trim, deckMat, seal);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      this.root.add(mesh);
      this.disposables.push(geo);
      return mesh;
    };

    /** A thin raised gasket that traces one aperture. */
    const gasket = (hole: Rect, w: number): THREE.ExtrudeGeometry =>
      panel(
        { x0: hole.x0 - w, y0: hole.y0 - w, x1: hole.x1 + w, y1: hole.y1 + w, r: (hole.r ?? 0.05) + w },
        hole,
        0.022,
      );

    // ---- windscreen bulkhead -------------------------------------------------
    // corner radius follows the smaller dimension too, so a portrait phone gets
    // a window rather than an oval
    const front = { x0: -AW, y0: -ABot, x1: AW, y1: ATop, r: Math.min(hy * 0.3, AW * 0.26) };
    add(panel({ x0: -WX, y0: -WYb, x1: WX, y1: WYt, r: 0.05 }, front, T), shell).position.z = ZF;
    add(gasket(front, hy * 0.035), seal).position.z = ZF + T;

    // ---- side walls; shape x maps to -z on the left wall, +z on the right ----
    // The side glass runs almost to the windscreen at the front - the narrower
    // the A-pillar, the less often a tracked body disappears behind it - and
    // well aft of the seat at the back, so that looking a full 90° out to the
    // beam lands in the middle of a window rather than on the wall between two.
    const sw = { z0: -0.985, z1: 0.46, y0: -0.44 * hy, y1: 0.74 * hy };
    const sideR = Math.min(hy * 0.22, (sw.z1 - sw.z0) * 0.2);
    const leftHole = { x0: -sw.z1, y0: sw.y0, x1: -sw.z0, y1: sw.y1, r: sideR };
    const leftGeo = panel({ x0: -ZR, y0: -WYb, x1: -ZF, y1: WYt, r: 0.05 }, leftHole, T);
    leftGeo.rotateY(Math.PI / 2);
    add(leftGeo, shell).position.x = -WX;
    const leftSeal = gasket(leftHole, hy * 0.035);
    leftSeal.rotateY(Math.PI / 2);
    add(leftSeal, seal).position.x = -WX + T;

    const rightHole = { x0: sw.z0, y0: sw.y0, x1: sw.z1, y1: sw.y1, r: sideR };
    const rightGeo = panel({ x0: ZF, y0: -WYb, x1: ZR, y1: WYt, r: 0.05 }, rightHole, T);
    rightGeo.rotateY(-Math.PI / 2);
    add(rightGeo, shell).position.x = WX;
    const rightSeal = gasket(rightHole, hy * 0.035);
    rightSeal.rotateY(-Math.PI / 2);
    add(rightSeal, seal).position.x = WX - T;

    // ---- overhead panel with the observation port (shape y maps to -z) ------
    // a proper canopy: looking up should give sky, not ceiling
    const tw = { x: 0.72 * hx, z0: -0.985, z1: -0.12 };
    const topHole = { x0: -tw.x, y0: -tw.z1, x1: tw.x, y1: -tw.z0, r: Math.min(hx * 0.12, tw.x * 0.3) };
    const ceilGeo = panel({ x0: -WX, y0: -ZR, x1: WX, y1: -ZF, r: 0.05 }, topHole, T);
    ceilGeo.rotateX(-Math.PI / 2);
    add(ceilGeo, shell).position.y = WYt;
    const topSeal = gasket(topHole, hy * 0.035);
    topSeal.rotateX(-Math.PI / 2);
    add(topSeal, seal).position.y = WYt - T;

    // ---- floor with a forward footwell port (shape y maps to +z) -----------
    const floorGeo = panel(
      { x0: -WX, y0: ZF, x1: WX, y1: ZR, r: 0.05 },
      { x0: -0.3 * hx, y0: -0.94, x1: 0.3 * hx, y1: -0.5, r: hx * 0.08 },
      T,
    );
    floorGeo.rotateX(Math.PI / 2);
    add(floorGeo, trim).position.y = -WYb;

    // ---- rear bulkhead -----------------------------------------------------
    add(panel({ x0: -WX, y0: -WYb, x1: WX, y1: WYt, r: 0.05 }, null, T * 0.6), trim).position.z = ZR;

    // ---- console -----------------------------------------------------------
    // A shallow deck under the windscreen, tilted so its leading edge just
    // enters the bottom of the view. Everything on it is a child, so the whole
    // assembly is positioned once.
    const deck = new THREE.Group();
    deck.position.set(0, -0.86 * hy, -0.55);
    deck.rotation.x = THREE.MathUtils.degToRad(12);
    this.root.add(deck);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(WX * 2.1, 0.06, 0.62), deckMat);
    deck.add(slab);
    this.disposables.push(slab.geometry);

    const coaming = new THREE.Mesh(new THREE.BoxGeometry(WX * 2.12, 0.05, 0.05), trim);
    coaming.position.set(0, 0.035, -0.3);
    deck.add(coaming);
    this.disposables.push(coaming.geometry);

    // three restrained indicator strips - the only self-lit surfaces in here
    for (const [x, color, intensity] of [
      [-AW * 0.62, 0x24455e, 0.45],
      [AW * 0.62, 0x53412c, 0.4],
    ] as Array<[number, number, number]>) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x090d14,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.4,
      });
      this.disposables.push(mat);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(AW * 0.2, 0.012, 0.035), mat);
      strip.position.set(x, 0.036, -0.245);
      deck.add(strip);
      this.disposables.push(strip.geometry);
    }

    const screenMat = new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false });
    this.disposables.push(screenMat);
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(AW * 0.19, AW * 0.095),
      screenMat,
    );
    screenMesh.position.set(-AW * 0.36, 0.062, -0.235);
    screenMesh.rotation.x = THREE.MathUtils.degToRad(-30);
    deck.add(screenMesh);
    this.disposables.push(screenMesh.geometry);

    // a couple of recessed panel lines on the windscreen frame: enough to read
    // as machined structure, not enough to draw the eye off the view
    for (const y of [ATop + (WYt - ATop) * 0.55, -ABot - (WYb - ABot) * 0.42]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(WX * 1.86, 0.014, 0.016), trim);
      rib.position.set(0, y, ZF + T + 0.008);
      this.root.add(rib);
      this.disposables.push(rib.geometry);
    }

    // ---- glazing -----------------------------------------------------------
    this.glass = [];
    const addGlass = (
      geo: THREE.BufferGeometry,
      place: (m: THREE.Mesh) => void,
      normal: THREE.Vector3,
    ) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        uniforms: {
          uTint: { value: new THREE.Color(0x6f93c4) },
          uStrength: { value: 1 },
          uGlare: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.disposables.push(mat, geo);
      const mesh = new THREE.Mesh(geo, mat);
      place(mesh);
      mesh.renderOrder = 4;
      this.root.add(mesh);
      this.glass.push({ mat, normal });
    };

    addGlass(
      pane({ x0: -AW * 1.02, y0: -ABot * 1.02, x1: AW * 1.02, y1: ATop * 1.02 }),
      (m) => m.position.set(0, 0, ZF - 0.015),
      new THREE.Vector3(0, 0, -1),
    );
    // left pane: after rotation its local x runs along world -z
    addGlass(
      pane({ x0: -sw.z1, y0: sw.y0, x1: -sw.z0, y1: sw.y1 }),
      (m) => {
        m.rotation.y = Math.PI / 2;
        m.position.x = -WX - 0.015;
      },
      new THREE.Vector3(-1, 0, 0),
    );
    addGlass(
      pane({ x0: sw.z0, y0: sw.y0, x1: sw.z1, y1: sw.y1 }),
      (m) => {
        m.rotation.y = -Math.PI / 2;
        m.position.x = WX + 0.015;
      },
      new THREE.Vector3(1, 0, 0),
    );
    addGlass(
      pane({ x0: -tw.x, y0: tw.z0, x1: tw.x, y1: tw.z1 }),
      (m) => {
        m.rotation.x = Math.PI / 2;
        m.position.y = WYt + 0.015;
      },
      new THREE.Vector3(0, 1, 0),
    );
  }

  private clear(): void {
    this.root.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.glass = [];
  }

  /**
   * @param headQuat     pilot's head rotation inside the hull
   * @param sunDirHull   unit vector toward the Sun in hull coordinates
   * @param sunIntensity 0..1, from the ship's real heliocentric distance
   */
  update(
    dt: number,
    headQuat: THREE.Quaternion,
    sunDirHull: THREE.Vector3,
    sunIntensity: number,
    readout: ConsoleReadout,
  ): void {
    this.camera.quaternion.copy(headQuat);
    this.sunLight.position.copy(sunDirHull).multiplyScalar(6);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.intensity = 0.15 + 3.4 * sunIntensity;
    this.cabinLight.intensity = 1.9 + 1.4 * (1 - sunIntensity);

    for (const g of this.glass) {
      const facing = Math.max(0, this.tmp.copy(g.normal).dot(sunDirHull));
      g.mat.uniforms.uGlare.value = facing * facing * (0.25 + 0.75 * sunIntensity);
      g.mat.uniforms.uStrength.value = 0.5 + 0.5 * sunIntensity;
    }

    this.screenTimer += dt;
    if (this.screenTimer > 0.22) {
      this.screenTimer = 0;
      this.screen.paint(readout);
    }
  }

  dispose(): void {
    this.clear();
    this.screen.dispose();
  }
}
