/**
 * The long-distance travel transition.
 *
 * A wormhole is a piece of cinema, and this one is labelled as such wherever it
 * appears in the UI. Nothing here claims that a traversable throat exists, that
 * the ship went through one, or that the trip was shorter than it was. The
 * flight computer underneath is untouched: it covers the real distance at the
 * real velocity and advances the real simulation clock, and all three numbers
 * stay on the HUD while this plays. What this file adds is what you see out of
 * the window during a crossing that would otherwise be several seconds of an
 * empty black frame.
 *
 * The one thing it does honestly, and the reason it looks like the good
 * versions rather than a spinning tube, is that the background is real. The
 * Milky Way is already baked into a cubemap by scene/galaxy, so the shader
 * samples THAT along a deflected ray rather than inventing a texture: the band
 * you see smeared around the throat is the actual galaxy, bent. The deflection
 * follows the shape of gravitational lensing - Einstein's angle goes as 1/b, so
 * rays passing close to the throat are bent hardest and the sky piles up into a
 * ring around the opening. That single term is what produces the curved light,
 * the ring, and the dark centre, all from one piece of physics rather than
 * three hand-drawn effects.
 *
 * Composition
 * -----------
 * The effect is an overlay, not a place. It draws over the finished frame and
 * is transparent inside the throat, so what shows through the opening is the
 * real scene - the destination system, already built and already rendering.
 * There is no second scene, no fake destination, and nothing to swap at the
 * end: the aperture simply opens until the overlay is gone.
 *
 * Cost
 * ----
 * One full-screen pass with one cubemap fetch and a few noise octaves, plus
 * ~1,400 two-vertex line segments for the streaks. The pass runs only while a
 * transition is playing, and 'reduced' quality drops the lensing and most of
 * the noise for weaker hardware.
 */
import * as THREE from 'three';
import { SNOISE_GLSL } from './glslnoise';
import type { TravelEffects } from '../sim/travel';

// ------------------------------------------------------------- the throat --

/**
 * A single triangle covering the screen, positioned in clip space directly.
 *
 * Bypassing the projection matrix means the overlay cannot be clipped by a near
 * or far plane, which matters because this app moves both over nine orders of
 * magnitude. It still lives in the main scene, so it goes through the bloom
 * pass with everything else rather than needing a pass of its own.
 */
const THROAT_VERT = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const THROAT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vNdc;

  uniform vec3 uAxis;        // world-space direction of travel
  uniform vec3 uSide;        // an axis-perpendicular reference, for azimuth
  uniform vec3 uUp;
  uniform vec3 uCamPos;
  uniform mat4 uInvViewProj;
  uniform samplerCube uSky;
  uniform float uHasSky;
  uniform float uTime;
  uniform float uIntensity;  // 0 = nothing, 1 = fully inside the throat
  uniform float uAperture;   // 0 = closed, 1 = opened out to nothing
  uniform float uLensing;    // 0 disables the deflection (reduced quality)
  uniform float uDetail;     // noise octaves, as a float for the loop bound
  ${SNOISE_GLSL}

  float fbm(vec3 p, float oct) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      if (float(i) >= oct) break;
      s += snoise(p) * a;
      p *= 2.11;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    // world-space view ray for this pixel
    vec4 far = uInvViewProj * vec4(vNdc, 1.0, 1.0);
    vec3 d = normalize(far.xyz / far.w - uCamPos);

    float ct = clamp(dot(d, uAxis), -1.0, 1.0);
    float theta = acos(ct);                       // angle off the travel axis

    // The opening, as an angular radius. It has to be judged against the half
    // field of view (about 0.45 rad at the default 52 degrees), not against a
    // hemisphere: an aperture of 3.3 rad clears the entire frame a third of the
    // way through the sequence, which showed the raw scene instead of a reveal.
    float R = uAperture * 1.25 + 0.010;

    // ---- gravitational-lensing-like deflection -----------------------------
    // Einstein's deflection angle falls off as 1/b, so a ray grazing the throat
    // is bent far more than one passing wide. Sampling the real baked Milky Way
    // along the bent ray is what produces the ring and the curved light; none of
    // it is painted.
    float k = 0.42 * uIntensity * uLensing;
    float bent = theta + k / max(theta, 0.05);
    vec3 perp = normalize(d - uAxis * ct + vec3(1e-6));
    vec3 lensed = normalize(uAxis * cos(bent) + perp * sin(bent));

    vec3 sky = uHasSky > 0.5
      ? textureCube(uSky, lensed).rgb
      : vec3(0.015, 0.020, 0.042);

    // ---- energy running down the walls -------------------------------------
    // Depth into the tunnel goes as 1/theta: the throat is infinitely far in
    // this projection, so filaments crowd together toward the opening exactly
    // the way perspective says they should.
    float depth = 1.0 / max(theta, 0.05);
    float az = atan(dot(d, uUp), dot(d, uSide));
    float flow = depth * 1.35 - uTime * 2.1;
    float fil = fbm(vec3(cos(az) * 1.9, sin(az) * 1.9, flow), uDetail) * 0.5 + 0.5;
    fil = pow(clamp(fil, 0.0, 1.0), 2.4);

    // violet in the deep, blue-white toward the rim - a temperature ramp, not
    // a rainbow. Kept narrow so it reads as energy and not as a cartoon.
    vec3 deep = vec3(0.24, 0.16, 0.52);
    vec3 hot  = vec3(0.72, 0.86, 1.00);
    float toward = smoothstep(R * 3.2, R * 0.9, theta);
    vec3 energy = mix(deep, hot, toward) * fil * (0.16 + 0.50 * uIntensity);

    // ---- the rim -----------------------------------------------------------
    // A thin, bright edge where the deflection diverges. This is the Einstein
    // ring; it is the brightest thing on screen and the only place bloom is
    // really wanted.
    float rim = exp(-pow((theta - R) / (R * 0.16 + 0.004), 2.0));
    vec3 ringCol = vec3(0.78, 0.90, 1.0) * rim * (0.45 + 0.85 * uIntensity);

    // ---- the dark centre ---------------------------------------------------
    // Light that would have come from straight ahead has been swept aside into
    // the ring, so the middle is genuinely darker rather than painted black.
    float throat = smoothstep(R * 1.35, R * 0.55, theta);

    vec3 col = sky * (0.40 + 0.30 * (1.0 - throat)) + energy + ringCol;
    col *= 0.30 + 0.62 * uIntensity;

    // ---- coverage ----------------------------------------------------------
    // Transparent inside the opening, so the real destination shows through it.
    // Everything else is covered while the effect is at strength.
    float open = smoothstep(R * 0.86, R * 1.02, theta);
    float alpha = clamp(open * uIntensity, 0.0, 1.0);
    // the ring itself stays visible over the opening for a moment, which is
    // what stops the reveal reading as a hole cut in a poster
    alpha = max(alpha, min(rim * uIntensity * 0.85, 1.0));

    if (alpha < 0.003) discard;
    // capped below the bloom threshold's runaway range: the ring is meant to be
    // the brightest thing in frame, not the whole frame
    gl_FragColor = vec4(min(col, vec3(1.45)), alpha);
  }
`;

// ------------------------------------------------------------- the streaks --

const STREAK_VERT = /* glsl */ `
  attribute float aPhase;   // 0..1 position along the run, before scrolling
  attribute float aRadius;
  attribute float aAngle;
  attribute float aEnd;     // 0 = tail, 1 = head
  attribute float aBright;
  varying float vFade;
  varying float vBright;

  uniform vec3 uAxisView;   // direction of travel, in VIEW space
  uniform vec3 uSideView;
  uniform vec3 uUpView;
  uniform float uDepth;     // how far down the frustum the field sits
  uniform float uTravel;
  uniform float uStreak;    // head-to-tail length, as a fraction of uDepth
  uniform float uSpread;    // radius of the field, as a fraction of uDepth

  void main() {
    // Everything is built in view space and handed straight to the projection.
    // The field is therefore sized against the frustum rather than against the
    // world, which is the only way one effect can look right both inside a
    // planetary system and across a light-year - those two differ by a factor
    // of ten million in world units and by nothing at all on screen.
    float z = fract(aPhase + uTravel) * 2.0 - 0.25;      // 0..1 run, biased ahead
    float r = aRadius * uSpread;
    vec3 pos = uAxisView * (z * uDepth + aEnd * uStreak * uDepth)
             + uSideView * (cos(aAngle) * r * uDepth)
             + uUpView * (sin(aAngle) * r * uDepth);
    // fade in at the far end and out as a streak sweeps past the camera
    vFade = smoothstep(-0.2, 0.05, z) * (1.0 - smoothstep(1.35, 1.75, z));
    vBright = aBright;
    gl_Position = projectionMatrix * vec4(pos, 1.0);
  }
`;

const STREAK_FRAG = /* glsl */ `
  precision highp float;
  varying float vFade;
  varying float vBright;
  uniform float uIntensity;
  uniform vec3 uTint;
  void main() {
    float a = vFade * uIntensity * vBright * 0.55;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uTint * (0.35 + 0.55 * vBright), a);
  }
`;

const STREAK_COUNT = { cinematic: 1400, reduced: 500, off: 0 };

/**
 * Stars drawn as streaks along the line of travel.
 *
 * These are not the catalogue stars and are not pretending to be - the real
 * ones are still out there on the sky shell, unchanged. This is the forward
 * motion itself: a field of light that the camera is passing through, which is
 * the only cue in an otherwise empty frame that says the ship is moving.
 */
class StarStreaks {
  readonly lines: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;
  private geo = new THREE.BufferGeometry();
  private travel = 0;
  private built = -1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      uniforms: {
        uAxisView: { value: new THREE.Vector3(0, 0, -1) },
        uSideView: { value: new THREE.Vector3(1, 0, 0) },
        uUpView: { value: new THREE.Vector3(0, 1, 0) },
        uDepth: { value: 10 },
        uTravel: { value: 0 },
        uStreak: { value: 0.05 },
        uSpread: { value: 0.5 },
        uIntensity: { value: 0 },
        uTint: { value: new THREE.Color(0.66, 0.80, 1.0) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 9998;
    this.lines.visible = false;
    this.build(STREAK_COUNT.cinematic);
  }

  private build(count: number): void {
    if (this.built === count) return;
    this.built = count;
    const n = Math.max(count, 1);
    const phase = new Float32Array(n * 2);
    const radius = new Float32Array(n * 2);
    const angle = new Float32Array(n * 2);
    const end = new Float32Array(n * 2);
    const bright = new Float32Array(n * 2);
    let seed = 20260814;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const p = rnd();
      // sqrt keeps the field even in area rather than crowding the axis, and
      // the floor keeps it clear of the throat where the tunnel lives
      const r = 0.12 + 0.88 * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const b = 0.25 + 0.75 * Math.pow(rnd(), 1.7);
      for (let e = 0; e < 2; e++) {
        const j = i * 2 + e;
        phase[j] = p;
        radius[j] = r;
        angle[j] = a;
        end[j] = e;
        bright[j] = b;
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    this.geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
    this.geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
    this.geo.setDrawRange(0, n * 2);
  }

  setQuality(q: TravelEffects): void {
    this.build(STREAK_COUNT[q] || 1);
  }

  update(
    dt: number,
    axisView: THREE.Vector3,
    sideView: THREE.Vector3,
    upView: THREE.Vector3,
    depth: number,
    intensity: number,
  ): void {
    const u = this.mat.uniforms;
    // streaks accelerate with the effect, which is what sells the run-up
    this.travel = (this.travel + dt * (0.16 + 0.75 * intensity)) % 1;
    u.uTravel.value = this.travel;
    (u.uAxisView.value as THREE.Vector3).copy(axisView);
    (u.uSideView.value as THREE.Vector3).copy(sideView);
    (u.uUpView.value as THREE.Vector3).copy(upView);
    u.uDepth.value = depth;
    u.uSpread.value = 0.62;
    u.uStreak.value = 0.02 + 0.30 * intensity * intensity;
    u.uIntensity.value = intensity;
    this.lines.visible = intensity > 0.004;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- sequence --

/** Where the sequence has got to, for the HUD and for callers that care. */
export type WormholePhase = 'off' | 'align' | 'stretch' | 'throat' | 'emerge';

export interface WormholeRun {
  /** Seconds the whole sequence lasts, if nothing holds it up. */
  duration: number;
  /**
   * Called each frame once the throat is shut. While it returns true the
   * sequence waits there instead of opening.
   *
   * This is what stops the picture and the flight coming apart. The autopilot's
   * time compression tops out at a million to one, so an eight-AU run still
   * takes several seconds of real time - longer than the sequence - and on a
   * slow renderer longer again. Rather than guess a duration that fits every
   * machine, the throat simply stays closed until the ship has arrived, which
   * is also the natural place to hide a system that is still being built.
   */
  hold?: () => boolean;
  /** Seconds the hold may last before the sequence gives up and opens anyway,
   *  so a stalled flight can never trap the view inside the effect. */
  maxHold?: number;
  /** Fired once, at the moment the throat is fully closed - the only frame on
   *  which a change of place is invisible. */
  onSwap?: () => void;
  /** Fired when the sequence finishes. */
  onDone?: () => void;
}

/** Fraction of the sequence at which the throat is shut and can wait. */
const HOLD_POINT = 0.6;

export class Wormhole {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private streaks = new StarStreaks();
  private quality: TravelEffects = 'cinematic';

  private axis = new THREE.Vector3(0, 0, 1);
  private side = new THREE.Vector3(1, 0, 0);
  private up = new THREE.Vector3(0, 1, 0);
  private run: WormholeRun | null = null;
  private t = 0;
  private swapped = false;
  private held = 0;
  private elapsed = 0;
  private axisView = new THREE.Vector3();
  private sideView = new THREE.Vector3();
  private upView = new THREE.Vector3();
  private invViewProj = new THREE.Matrix4();

  constructor() {
    const geo = new THREE.BufferGeometry();
    // one oversized triangle in clip space - cheaper than a quad and with no
    // seam down the diagonal
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.mat = new THREE.ShaderMaterial({
      vertexShader: THROAT_VERT,
      fragmentShader: THROAT_FRAG,
      uniforms: {
        uAxis: { value: this.axis },
        uSide: { value: this.side },
        uUp: { value: this.up },
        uCamPos: { value: new THREE.Vector3() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uSky: { value: null },
        uHasSky: { value: 0 },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uAperture: { value: 0 },
        uLensing: { value: 1 },
        uDetail: { value: 3 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9999;
    this.mesh.visible = false;
    this.group.add(this.mesh, this.streaks.lines);
  }

  /** The real baked Milky Way, so the thing being bent is the actual sky. */
  setSkyTexture(tex: THREE.CubeTexture | null): void {
    this.mat.uniforms.uSky.value = tex;
    this.mat.uniforms.uHasSky.value = tex ? 1 : 0;
  }

  setQuality(q: TravelEffects): void {
    this.quality = q;
    this.streaks.setQuality(q);
    this.mat.uniforms.uLensing.value = q === 'cinematic' ? 1 : 0;
    this.mat.uniforms.uDetail.value = q === 'cinematic' ? 3 : 1;
  }

  get active(): boolean {
    return this.run !== null;
  }

  get phase(): WormholePhase {
    if (!this.run) return 'off';
    const p = this.t / this.run.duration;
    if (p < 0.16) return 'align';
    if (p < 0.34) return 'stretch';
    if (p < 0.72) return 'throat';
    return 'emerge';
  }

  /** 0..1 through the whole sequence. */
  get progress(): number {
    return this.run ? Math.min(1, this.t / this.run.duration) : 0;
  }

  /** Seconds the throat has been waiting for something to finish. */
  get holdSeconds(): number {
    return this.held;
  }

  /**
   * Start a run down `axis`, a world-space direction of travel. Nothing else is
   * needed: the streak field is sized against the camera's frustum, so the same
   * call works whether the crossing is 150 scene units or a hundred million.
   */
  start(axis: THREE.Vector3, run: WormholeRun): void {
    if (this.quality === 'off') {
      run.onSwap?.();
      run.onDone?.();
      return;
    }
    this.setAxis(axis);
    this.run = run;
    this.t = 0;
    this.swapped = false;
    this.held = 0;
    this.mesh.visible = true;
  }

  setAxis(axis: THREE.Vector3): void {
    if (axis.lengthSq() < 1e-12) return;
    this.axis.copy(axis).normalize();
    // any stable perpendicular pair; only used for azimuth, so the choice of
    // reference is arbitrary as long as it does not flip frame to frame
    const ref = Math.abs(this.axis.y) > 0.94 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    this.side.crossVectors(ref, this.axis).normalize();
    this.up.crossVectors(this.axis, this.side).normalize();
  }

  /** Stop immediately without firing `onDone`. */
  abort(): void {
    this.run = null;
    this.mesh.visible = false;
    this.mat.uniforms.uIntensity.value = 0;
    this.streaks.update(0, this.axisView, this.sideView, this.upView, 1, 0);
  }

  /** Advance the sequence. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.elapsed += dt;
    if (!this.run) return;

    // Wait in the throat while whatever we are covering for is still going.
    const atHold = this.t / this.run.duration >= HOLD_POINT;
    const waiting =
      atHold && !!this.run.hold?.() && this.held < (this.run.maxHold ?? 30);
    if (waiting) {
      this.held += dt;
      this.t = this.run.duration * HOLD_POINT;
    } else {
      this.t += dt;
    }
    const p = Math.min(1, this.t / this.run.duration);

    // Intensity ramps in over the stretch, holds through the throat, and lets
    // go on the way out. Aperture stays shut until the swap, then opens past
    // the edge of the frame so the last of the overlay leaves the screen.
    const intensity =
      p < 0.34
        ? smoothstep(p, 0.06, 0.34)
        : p < 0.78
          ? 1
          : 1 - smoothstep(p, 0.78, 1);
    // shut until the hold point, then widening past the edge of the frame
    const aperture = p < 0.62 ? 0.004 : smoothstep(p, 0.62, 1.0);

    // The place changes on the frame where the throat is shut and the overlay
    // is at full strength - the one moment when moving the universe under the
    // camera cannot be seen.
    if (!this.swapped && p >= 0.42) {
      this.swapped = true;
      this.run.onSwap?.();
    }

    const u = this.mat.uniforms;
    u.uTime.value = this.elapsed;
    u.uIntensity.value = intensity;
    u.uAperture.value = aperture;
    (u.uCamPos.value as THREE.Vector3).copy(camera.position);
    camera.updateMatrixWorld();
    this.invViewProj
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
    (u.uInvViewProj.value as THREE.Matrix4).copy(this.invViewProj);

    // The streak field is placed in view space, so its size is set by the
    // frustum rather than by the world: a fixed multiple of the near plane is
    // always visible and never intersects anything the camera is looking at.
    this.axisView.copy(this.axis).transformDirection(camera.matrixWorldInverse);
    this.sideView.copy(this.side).transformDirection(camera.matrixWorldInverse);
    this.upView.copy(this.up).transformDirection(camera.matrixWorldInverse);
    const depth = THREE.MathUtils.clamp(camera.near * 260, 1e-5, camera.far * 0.35);
    this.streaks.update(dt, this.axisView, this.sideView, this.upView, depth, intensity);
    this.mesh.visible = intensity > 0.004;

    if (p >= 1) {
      const done = this.run.onDone;
      this.run = null;
      this.mesh.visible = false;
      u.uIntensity.value = 0;
      done?.();
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.streaks.dispose();
  }
}

function smoothstep(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
