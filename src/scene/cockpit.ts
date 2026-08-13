/**
 * The observation craft's cabin: one continuous 360° glass shell with a
 * structural frame around it.
 *
 * There are no window "modes" here and no six cameras. The cabin is a single
 * piece of geometry that surrounds the viewer, and the head turns inside it, so
 * front / left / right / rear / overhead / floor are just directions you happen
 * to be facing - the glass runs continuously between them. Turn a full circle
 * and the frame slides past exactly as it would if you swivelled a seat.
 *
 * It renders as a second pass over the finished space scene with the depth
 * buffer cleared, so the cabin is always the near field and can never z-fight
 * with a planet 40 AU away, and the real scene shows through the glass
 * untouched - there is no skybox, no faked backdrop and no per-window
 * substitute. What you see through the rear glass is the actual scene behind
 * the ship.
 *
 * The frame is deliberately thin. Mullions sit at 22.5° off the axes so the
 * forward and rear sight lines are clear glass, the overhead ribs converge but
 * stop short of the zenith, and the floor carries a real opening rather than a
 * porthole. It should read as a vessel without ever being the thing you look at.
 */
import * as THREE from 'three';

/** Cabin radius in cockpit-space units. The camera sits at the origin. */
const R = 1;
const GLASS_R = R * 0.97;

/* --------------------------------------------------------------- shaders -- */

const GLASS_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPos;
  void main() {
    vNormalW = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The glass. Almost all of this is restraint: a hint of tint, a fresnel edge
 * that picks out the curvature, a faint bloom of instrument light low in the
 * view, and nothing else. Anything stronger and you are looking at the window
 * instead of through it.
 */
const GLASS_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormalW;
  varying vec3 vPos;
  uniform float uTime;
  uniform vec3 uTint;
  uniform vec3 uHud;
  uniform float uOpacity;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = vec3(0.0, 0.0, 1.0);            // view space: camera looks down -z
    float facing = abs(dot(N, V));
    // grazing angles catch the light - this is what makes a curved pane read
    // as curved rather than as a flat wash over the whole view
    float fres = pow(1.0 - facing, 2.2);

    vec3 col = uTint;
    float a = uOpacity * (0.55 + 0.70 * fres);

    // instrument glow spilling onto the lower glass, and a slow highlight
    // sliding across it as the ship turns
    vec3 dir = normalize(vPos);
    float low = smoothstep(-0.15, -0.72, dir.y);
    col += uHud * low * 0.55;
    a += low * 0.030;

    float sweep = smoothstep(0.90, 1.0, sin(dir.x * 2.1 + dir.y * 1.3 + uTime * 0.12));
    a += sweep * 0.020 * fres;

    gl_FragColor = vec4(col, clamp(a, 0.0, 0.22));
  }
`;

/** Thin emissive piping along the frame edges, so the cabin reads in the dark. */
const EDGE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    gl_FragColor = vec4(uColor * uIntensity, 1.0);
  }
`;

/* ----------------------------------------------------------------- cabin -- */

export class Cockpit {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private glassMat: THREE.ShaderMaterial;
  private edgeMats: THREE.ShaderMaterial[] = [];
  private group = new THREE.Group();
  private elapsed = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 12);
    this.scene.add(this.group);

    // Cabin lighting is its own little world - the real Sun is 1 AU away and
    // rendered in another pass, so the frame gets practical lights instead.
    this.scene.add(new THREE.AmbientLight(0x7d9ec0, 0.85));
    const key = new THREE.DirectionalLight(0xeef2f8, 1.15);
    key.position.set(0.4, 1, 0.6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db3cc, 0.45);
    rim.position.set(-0.7, 0.2, -0.8);
    this.scene.add(rim);
    // instrument light washing up from the console, which is what actually
    // sells "lit cabin, dark outside"
    const under = new THREE.PointLight(0x3fc0f0, 0.55, 2.2, 2);
    under.position.set(0, -0.34, -0.55);
    this.scene.add(under);

    this.glassMat = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(0x1a3550) },
        uHud: { value: new THREE.Color(0x0d4f6b) },
        uOpacity: { value: 0.055 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide, // we are inside the shell
      blending: THREE.AdditiveBlending,
    });

    this.buildGlass();
    this.buildFrame();
    this.buildFloor();
    this.buildConsole();
  }

  /* ------------------------------------------------------------- pieces -- */

  private buildGlass(): void {
    // One sphere. Not six panels - the seamlessness is the whole point.
    const glass = new THREE.Mesh(new THREE.SphereGeometry(GLASS_R, 64, 40), this.glassMat);
    glass.renderOrder = 10;
    this.group.add(glass);
  }

  private frameMaterial(): THREE.MeshStandardMaterial {
    // against deep space almost anything reads as black, so the hull is a
    // light warm grey with a little self-illumination of its own
    return new THREE.MeshStandardMaterial({
      color: 0x79808a,
      roughness: 0.45,
      metalness: 0.5,
      emissive: 0x1b2836,
      emissiveIntensity: 1,
    });
  }

  private edgeMaterial(intensity = 1): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      vertexShader: 'void main(){gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}',
      fragmentShader: EDGE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0x66e0ff) },
        uIntensity: { value: intensity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.edgeMats.push(m);
    return m;
  }

  /**
   * Mullions, waist rail, header ring and the overhead ribs.
   *
   * The posts sit at 22.5° off the cardinals on purpose: it leaves dead ahead
   * and dead astern as unbroken glass, which is where you spend the most time
   * looking, and it means turning a full circle never sweeps a post across the
   * exact direction you were tracking.
   */
  private buildFrame(): void {
    const mat = this.frameMaterial();
    const POSTS = 8;
    for (let i = 0; i < POSTS; i++) {
      const a = (i + 0.5) * (Math.PI * 2 / POSTS);
      // a post is an arc of a great circle from the floor line to the header
      const curve = new THREE.CurvePath<THREE.Vector3>();
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const phi = THREE.MathUtils.lerp(-0.98, 1.16, k / 24); // elevation, radians
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * Math.cos(phi) * R,
            Math.sin(phi) * R,
            Math.sin(a) * Math.cos(phi) * R,
          ),
        );
      }
      curve.add(new THREE.CatmullRomCurve3(pts));
      const post = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.020, 8, false), mat);
      this.group.add(post);
      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.005, 6, false),
        this.edgeMaterial(0.55),
      );
      glow.renderOrder = 11;
      this.group.add(glow);
    }

    // waist rail and header ring: horizontal bands that give the cabin a
    // believable eye-level datum without cutting the forward view
    // waist and header sit just inside the vertical field of view, so the
    // cabin frames what you are looking at instead of hiding above and below it
    for (const [elev, radius, glowI] of [
      [-0.34, 0.020, 0.7],
      [0.40, 0.017, 0.8],
    ] as const) {
      const y = Math.sin(elev) * R;
      const rr = Math.cos(elev) * R;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, radius, 8, 96), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.group.add(ring);
      const g = new THREE.Mesh(new THREE.TorusGeometry(rr, radius * 0.3, 6, 96), this.edgeMaterial(glowI));
      g.rotation.x = Math.PI / 2;
      g.position.y = y;
      g.renderOrder = 11;
      this.group.add(g);
    }

    // eyebrow ring where the mullions end and the canopy begins
    {
      const elev = 1.16;
      const y = Math.sin(elev) * R;
      const rr = Math.cos(elev) * R;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.015, 8, 72), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.group.add(ring);
      const g = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.005, 6, 72), this.edgeMaterial(0.5));
      g.rotation.x = Math.PI / 2;
      g.position.y = y;
      g.renderOrder = 11;
      this.group.add(g);
    }

    // Overhead ribs, springing from that ring. They converge toward the zenith
    // but stop short of it, so there is clear glass straight up - if the Sun is
    // overhead you see the Sun, not a boss plate.
    const RIBS = 6;
    for (let i = 0; i < RIBS; i++) {
      const a = i * (Math.PI * 2 / RIBS) + Math.PI / RIBS;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const phi = THREE.MathUtils.lerp(1.16, 1.44, k / 16);
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * Math.cos(phi) * R,
            Math.sin(phi) * R,
            Math.sin(a) * Math.cos(phi) * R,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.012, 5, false), mat));
    }
  }

  /**
   * The floor and its observation opening.
   *
   * A solid floor would throw away half of what makes this vessel worth sitting
   * in - a planet you are descending toward is *below* you. So the deck is an
   * annulus with a real hole in it, ringed and lit, and you can lean over it and
   * look straight down at the scene.
   */
  private buildFloor(): void {
    const mat = this.frameMaterial();
    const yFloor = Math.sin(-0.98) * R;
    const outer = Math.cos(-0.98) * R;
    const inner = outer * 0.72;

    const deck = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 64, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1c232c,
        roughness: 0.9,
        metalness: 0.25,
        emissive: 0x0a1017,
        side: THREE.DoubleSide,
      }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = yFloor;
    this.group.add(deck);

    // coaming around the opening, with a lit inner edge
    const lip = new THREE.Mesh(new THREE.TorusGeometry(inner, 0.016, 8, 64), mat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = yFloor;
    this.group.add(lip);
    const lipGlow = new THREE.Mesh(
      new THREE.TorusGeometry(inner, 0.006, 6, 64),
      this.edgeMaterial(0.8),
    );
    lipGlow.rotation.x = Math.PI / 2;
    lipGlow.position.y = yFloor;
    lipGlow.renderOrder = 11;
    this.group.add(lipGlow);

    // a few radial deck ribs, so the floor reads as structure not as a disc
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * (Math.PI / 4);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(outer - inner, 0.010, 0.022), mat);
      rib.position.set(
        Math.cos(a) * (inner + outer) / 2,
        yFloor + 0.008,
        Math.sin(a) * (inner + outer) / 2,
      );
      rib.rotation.y = -a;
      this.group.add(rib);
    }
  }

  /**
   * A low console below the forward sight line. It exists to sell the cabin -
   * something solid in the bottom of the view that says "you are sitting in a
   * vessel" - and it is kept below the horizon so it never eats the view.
   */
  private buildConsole(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x46566a,
      roughness: 0.65,
      metalness: 0.45,
      emissive: 0x101a24,
    });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.3), mat);
    desk.position.set(0, -0.40, -0.74);
    desk.rotation.x = -0.28;
    this.group.add(desk);

    // a short instrument glow at the desk's inner lip, well below the sight
    // line - enough to say "lit cabin", not enough to be a bar across the view
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.006, 0.006), this.edgeMaterial(0.35));
    strip.position.set(0, -0.395, -0.70);
    strip.rotation.x = -0.28;
    strip.renderOrder = 11;
    this.group.add(strip);
  }

  /* ------------------------------------------------------------- driving -- */

  /**
   * Point the cabin camera the way the head is looking *within the ship*.
   * The main scene camera gets ship orientation × head orientation; the cabin
   * only gets the head part, which is exactly what makes the frame stay put
   * relative to the vessel while the universe swings past outside.
   */
  setHead(head: THREE.Quaternion, fov: number, aspect: number): void {
    this.camera.quaternion.copy(head);
    if (this.camera.fov !== fov || this.camera.aspect !== aspect) {
      this.camera.fov = fov;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.glassMat.uniforms.uTime.value = this.elapsed;
  }

  /** Draw the cabin over the finished space frame. */
  render(renderer: THREE.WebGLRenderer): void {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    // the cabin is the near field by definition - never let a distant planet
    // win a depth test against the frame you are sitting inside
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}
