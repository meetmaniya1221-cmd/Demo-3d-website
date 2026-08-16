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
 * end: the aperture simply opens until the overlay is gone. That is also what
 * hides the loading: the destination is built while the throat is shut, and
 * the sequence waits there for as long as the build and the real flight need
 * (see `hold`), so a system that takes a moment to appear never shows as a
 * progress bar.
 *
 * Six acts
 * --------
 * departure, distortion, formation, transit, reveal, arrival. They are not
 * separate effects cross-fading - the shader has one body, and each act is a
 * stretch of the run where a different set of its dials is doing the work
 * (see WormholePhase and the schedule in `update`). Aberration leads, then
 * deflection, then the throat, then the far end; the overlaps between those
 * curves are the transitions.
 *
 * Depth
 * -----
 * The wall is marched in slices rather than sampled once, each further down
 * the tunnel, scrolling at its own rate and twisted a little further round the
 * axis, composited front to back. That parallax is what gives the throat an
 * inside. A single noise lookup, however detailed, is a painted cylinder and
 * reads as one.
 *
 * Cost
 * ----
 * One full-screen pass: two cubemap fetches (the two lensed images), and up to
 * five noise-marched wall slices, plus ~900 four-segment polylines for the
 * trails. The pass runs only while a transition is playing. 'reduced' keeps
 * every stage of the sequence and thins what is inside it - two slices, one
 * octave, one lensed image - so a slower machine gets the same effect with
 * less detail rather than a different, cheaper one.
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
  // The camera's orientation and lens, rather than its position and an
  // inverse view-projection. See the note in the fragment body.
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uCamFwd;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform samplerCube uSky;
  uniform float uHasSky;
  uniform float uTime;
  uniform float uIntensity;  // 0 = nothing, 1 = fully inside the throat
  uniform float uAperture;   // 0 = covered, 1 = opened out to nothing
  uniform float uMouth;      // angular radius of the throat, in radians
  uniform float uDetail;     // noise octaves, as a float for the loop bound
  // ---- the act being played, as separate dials -------------------------
  // Each stage of the sequence moves these rather than switching between
  // shaders, so departure, distortion, formation, transit and reveal are one
  // continuous piece of geometry being pushed, not five effects cross-fading.
  uniform float uStretch;    // aberration: the sky crowding forward
  uniform float uLens;       // deflection strength
  uniform float uTunnel;     // how formed the throat is
  uniform float uFlow;       // how fast the walls run past
  uniform float uTwist;      // azimuthal shear per unit depth - curved trails
  uniform float uReveal;     // the far end opening onto the destination
  uniform float uExposure;   // cinematic exposure ramp
  uniform float uLayers;     // wall slices, as a float for the loop bound
  uniform float uSecondImage; // 1 to sample the far-side lensed image
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
    // World-space view ray for this pixel, built from the camera's basis and
    // its lens.
    //
    // This used to unproject to the far plane and subtract the camera
    // position. That is the textbook reconstruction and it is fine in a scene
    // that stays near the origin - but this one does not. During an
    // interstellar cruise the ship passes fourteen million units out while the
    // far plane is twenty thousand, so both terms of that subtraction are
    // around 1e7, where a 32-bit float's neighbours are a whole unit apart.
    // The direction therefore came out quantised, and the shader amplifies
    // exactly that quantity: depth goes as 1/theta, whose slope near the
    // throat is -400, and fbm scales its input by 2.11^3 on the way in. A ray
    // error of 2.5e-4 arrived at the noise as a jump of more than one cell, so
    // neighbouring pixels sampled different simplex tetrahedra and the lattice
    // itself was drawn - the flat violet facets in the report.
    //
    // A ray needs the camera's orientation, not its whereabouts. Every term
    // below is of order one, so the result carries full precision wherever in
    // the galaxy the ship happens to be.
    vec3 d = normalize(
      uCamRight * (vNdc.x * uAspect * uTanHalfFov) +
      uCamUp * (vNdc.y * uTanHalfFov) +
      uCamFwd
    );

    float ct = clamp(dot(d, uAxis), -1.0, 1.0);
    float theta = acos(ct);                       // angle off the travel axis
    vec3 perp = normalize(d - uAxis * ct + vec3(1e-6));
    float az = atan(dot(d, uUp), dot(d, uSide));

    // Two radii, and keeping them apart is what lets the throat be a place
    // rather than a hole.
    //
    // R is what the throat LOOKS like: where the ring sits, where the walls
    // start, how big the dark centre is. It opens out during the formation and
    // stays open through the transit, so the tunnel is a large mouth you are
    // flying into.
    //
    // uAperture is what the overlay LETS THROUGH, and it stays shut until the
    // reveal. Tying the two together - as this did - meant the mouth could not
    // open without also uncovering the scene behind it, so the throat spent
    // the whole sequence as a ten-pixel dot at the centre of frame and the
    // tunnel had nothing to be the inside of.
    //
    // Both are judged against the half field of view, about 0.45 rad at the
    // default 52 degrees, not against a hemisphere.
    float R = uMouth;
    float openR = uAperture * 1.25 + 0.010;

    // ---- aberration: the sky piles up ahead --------------------------------
    // Before anything bends, the view compresses toward the direction of
    // travel. This is the departure: the real sky is still the real sky, it is
    // simply being crowded forward, which is what makes the first seconds read
    // as acceleration rather than as an effect switching on.
    float ahead = exp(-theta * 1.35);
    float sTheta = theta / (1.0 + uStretch * 2.3 * ahead);

    // ---- gravitational-lensing-like deflection -----------------------------
    // Einstein's deflection angle falls off as the impact parameter, so a ray
    // grazing the throat is bent far more than one passing wide.
    // Bounded, because 1/b is not. Straight down the axis the impact
    // parameter goes to zero and the raw deflection ran to thirteen radians,
    // which wraps the cubemap several times and saturates the middle of frame
    // to white - the one thing a throat must never be. Clamping the *bend*
    // rather than clamping the result keeps the falloff intact everywhere it
    // is visible and only tames the singularity at the centre.
    float b = max(sTheta, 0.055);
    float defl = min(uLens * 0.42 / b, 2.6);
    float bent = sTheta + defl;
    vec3 lensed = normalize(uAxis * cos(bent) + perp * sin(bent));

    vec3 sky = uHasSky > 0.5
      ? textureCube(uSky, lensed).rgb
      : vec3(0.015, 0.020, 0.042);

    // The second image. A real lens produces two of everything - light that
    // went round the near side and light that went round the far side - and
    // that doubling is the difference between a sky that is bent and a sky
    // that has merely been smeared. It arrives from the opposite azimuth, so
    // the band appears to wrap the opening from both sides and close into a
    // ring. Cinematic only: it costs a second cubemap fetch.
    if (uSecondImage > 0.5 && uHasSky > 0.5) {
      float bent2 = abs(sTheta - defl * 0.8);
      vec3 lensed2 = normalize(uAxis * cos(bent2) - perp * sin(bent2));
      sky += textureCube(uSky, lensed2).rgb * (0.9 * uLens);
    }

    // ---- the tunnel wall, in layers ----------------------------------------
    // Depth into the throat goes as 1/theta - the far end is infinitely far in
    // this projection, so structure crowds together toward the opening exactly
    // the way perspective says it should.
    //
    // The wall is marched rather than sampled once. Each slice sits further
    // down the tunnel, scrolls at its own rate and is twisted a little further
    // round the axis, and they are composited front to back so a near filament
    // occludes a far one. That parallax between slices is what gives the throat
    // an inside; a single noise lookup, however detailed, is a painted cylinder
    // and reads as one however much you dress it.
    float depth = 1.0 / max(theta, 0.042);
    float wallT = uTime * (1.5 + uFlow * 3.4);
    vec3 wall = vec3(0.0);
    float occ = 0.0;
    float wsum = 0.0;
    for (int i = 0; i < 5; i++) {
      if (float(i) >= uLayers) break;
      float fi = float(i);
      // deeper slices are further in and move more slowly - the parallax
      float slice = depth * (1.0 + fi * 0.62);
      // The radial term is deliberately slack and the azimuthal one wide: run
      // the other way round and the slices line up into concentric onion
      // rings, which is a ripple pattern rather than gas. The per-layer offset
      // keeps them from agreeing with each other.
      float aw = az + uTwist * slice * 0.35 + fi * 2.1;
      float f = fbm(
        vec3(cos(aw) * 2.6, sin(aw) * 2.6, slice * 0.5 - wallT * (1.0 - fi * 0.13) + fi * 7.0),
        uDetail
      ) * 0.5 + 0.5;
      f = pow(clamp(f, 0.0, 1.0), 2.6 + fi * 0.3);
      float vis = (1.0 - occ) * exp(-fi * 0.42);
      wall += vec3(f * vis);
      wsum += vis;
      occ = min(occ + f * vis * 0.42, 0.92);
    }
    // normalised, so adding slices adds depth rather than brightness - five
    // layers must not be five times as bright as one
    wall /= max(wsum, 1e-3);
    // Violet where the tube runs away from you, cooling to blue-white on the
    // near wall beside the ship. The ramp was the other way round, which put
    // every violet pixel outside the frame and left the visible throat a
    // uniform grey-white - a temperature ramp needs its cold end where you can
    // actually see it. Narrow either way: this is energy, not a rainbow.
    wall *= mix(vec3(0.30, 0.18, 0.62), vec3(0.58, 0.76, 1.0),
                smoothstep(R * 1.0, R * 2.5, theta));
    wall *= (0.12 + 0.78 * uTunnel);

    // ---- the rim -----------------------------------------------------------
    // A thin, bright edge where the deflection diverges: the Einstein ring. It
    // is the brightest thing on screen and the only place bloom is wanted.
    float rim = exp(-pow((theta - R) / (R * 0.075 + 0.003), 2.0));
    // A second, fainter arc just outside it, which is what stops the ring
    // reading as a drawn circle. It has to stay tight: at a third-radian mouth
    // a wide one covers the entire frame and the whole picture goes white,
    // which is the opposite of the deep sky this is supposed to sit in.
    float halo = exp(-pow((theta - R * 1.22) / (R * 0.26 + 0.006), 2.0)) * 0.22;
    vec3 ringCol = vec3(0.72, 0.85, 1.0) * (rim * 1.5 + halo) * (0.3 + 0.8 * uTunnel);

    // ---- the dark centre ---------------------------------------------------
    // Light that would have come from straight ahead has been swept aside into
    // the ring, so the middle is genuinely darker rather than painted black.
    float throat = smoothstep(R * 1.4, R * 0.45, theta);
    float skyDim = mix(0.26, 0.012, throat * uTunnel);
    // Beyond the mouth the walls run away behind the ship and there is nothing
    // out there but unlensed sky, so the far field falls off. Without this the
    // frame edge stays as bright as the throat and the shot has no depth of
    // field at all - everything at one exposure, which is what a flat effect
    // looks like.
    float outer = 1.0 - 0.45 * uTunnel * smoothstep(R * 1.5, R * 3.2, theta);

    // ---- the far end -------------------------------------------------------
    // During the reveal a light grows at the end of the tunnel and the walls
    // fall away behind it. The destination itself is the real scene showing
    // through the opening - this is only the glow around it, so the system
    // does not simply appear through a hole.
    // A lip of light on the edge of the opening as it widens - not a glow
    // filling the middle. Centred on the axis and wide, as this was, it simply
    // washes the frame out, and a white flash is the one exit this effect must
    // not have. The destination arrives by being uncovered, not by being lit.
    float lip = exp(-pow((theta - openR) / (openR * 0.32 + 0.01), 2.0));
    vec3 farEnd = vec3(0.55, 0.72, 1.0) * lip * uReveal * 0.5;

    // The walls stop at the mouth. Inside it there is nothing to be lit, which
    // is what makes the centre read as depth rather than as a dark disc
    // painted over the middle.
    vec3 col = (sky * skyDim + wall * (1.0 - throat * 0.96) * (1.0 - uReveal * 0.75)) * outer
             + ringCol
             + farEnd;
    // cinematic exposure: the sequence darkens as it bores in and lifts again
    // on the way out, so the reveal has somewhere to come up from
    col *= uExposure;

    // ---- coverage ----------------------------------------------------------
    // Transparent inside the opening, so the real destination shows through it.
    // Everything else is covered while the effect is at strength.
    float open = smoothstep(openR * 0.86, openR * 1.02, theta);
    float alpha = clamp(open * uIntensity, 0.0, 1.0);
    // the ring itself stays visible over the opening for a moment, which is
    // what stops the reveal reading as a hole cut in a poster
    alpha = max(alpha, min((rim + lip * uReveal * 0.5) * uIntensity * 0.85, 1.0));

    if (alpha < 0.003) discard;
    // capped below the bloom threshold's runaway range: the ring is meant to be
    // the brightest thing in frame, not the whole frame
    gl_FragColor = vec4(min(col, vec3(1.6)), alpha);
  }
`;

// ------------------------------------------------------------- the streaks --

const STREAK_VERT = /* glsl */ `
  attribute float aPhase;   // 0..1 position along the run, before scrolling
  attribute float aRadius;
  attribute float aAngle;
  attribute float aEnd;     // 0 at the tail, 1 at the head, in steps between
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
  uniform float uCurve;     // how far a trail is sheared round the axis
  uniform float uPinch;     // how strongly trails are drawn in toward the throat

  void main() {
    // Everything is built in view space and handed straight to the projection.
    // The field is therefore sized against the frustum rather than against the
    // world, which is the only way one effect can look right both inside a
    // planetary system and across a light-year - those two differ by a factor
    // of ten million in world units and by nothing at all on screen.
    float head = fract(aPhase + uTravel) * 2.0 - 0.25;   // 0..1 run, biased ahead
    // Where this vertex sits along its own trail. A trail is several segments
    // now rather than one, which is the whole point: a straight line cannot be
    // bent, and a star being dragged past a gravity well does not travel in a
    // straight line.
    float along = aEnd * uStreak;
    float z = head + along;

    // The shear. Space is turning about the axis of travel, and it turns more
    // the further down the throat you look, so a trail laid along z comes out
    // as an arc rather than a spoke. Same uTwist idea the wall layers use, so
    // the streaks and the walls curve together instead of disagreeing.
    float ang = aAngle + uCurve * along * (0.6 + 1.4 * aRadius);
    // and drawn inward as it goes, so the field funnels toward the opening
    float r = aRadius * uSpread * (1.0 - uPinch * clamp(along / max(uStreak, 1e-4), 0.0, 1.0) * 0.35);

    vec3 pos = uAxisView * (z * uDepth)
             + uSideView * (cos(ang) * r * uDepth)
             + uUpView * (sin(ang) * r * uDepth);
    // Fade in at the far end and out as a streak sweeps past the camera, and
    // keep clear of the throat: a trail drawn across the dark centre is a
    // scratch on the lens, not a star going by.
    vFade = smoothstep(-0.2, 0.05, z)
          * (1.0 - smoothstep(1.35, 1.75, z))
          * smoothstep(0.16, 0.44, aRadius);
    // Tapered along its own length - bright at the head, thinning to nothing
    // at the tail. Untapered these read as rigid sticks, which is the cheap
    // particle-vortex look; tapered they read as motion.
    vBright = aBright * (0.12 + 0.88 * aEnd * aEnd);
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
    float a = vFade * uIntensity * vBright * 0.22;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uTint * (0.35 + 0.55 * vBright), a);
  }
`;

/** What the sequence tells the streak field to do this frame. */
interface StreakStage {
  intensity: number;
  stretch: number;
  flow: number;
  curve: number;
  pinch: number;
}

const IDLE_STREAKS: StreakStage = {
  intensity: 0,
  stretch: 0,
  flow: 0,
  curve: 0,
  pinch: 0,
};

const STREAK_COUNT = { cinematic: 900, reduced: 320, off: 0 };
/** Pieces per trail. Four is enough to read as an arc and not as a dogleg. */
const SEGMENTS = 4;

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
        uCurve: { value: 0 },
        uPinch: { value: 0 },
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
    // Above the throat, not below it. These are lights the ship is flying
    // through, in front of the tunnel mouth - and the throat's overlay is
    // opaque across almost the whole frame while the aperture is shut, so
    // underneath it they were drawn and then immediately painted over. They
    // only ever showed during the departure, which is the one act that does
    // not need them most.
    this.lines.renderOrder = 10000;
    this.lines.visible = false;
    this.build(STREAK_COUNT.cinematic);
  }

  private build(count: number): void {
    if (this.built === count) return;
    this.built = count;
    const n = Math.max(count, 1);
    // Each trail is a short polyline rather than one segment. LineSegments
    // draws disconnected pairs, so a trail of SEGMENTS pieces needs its
    // interior points twice - the cost of the extra vertices is what buys a
    // trail that can bend, and a bent trail is the difference between falling
    // toward something and flying past it.
    const verts = n * SEGMENTS * 2;
    const phase = new Float32Array(verts);
    const radius = new Float32Array(verts);
    const angle = new Float32Array(verts);
    const end = new Float32Array(verts);
    const bright = new Float32Array(verts);
    let seed = 20260814;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let j = 0;
    for (let i = 0; i < n; i++) {
      const p = rnd();
      // sqrt keeps the field even in area rather than crowding the axis, and
      // the floor keeps it clear of the throat where the tunnel lives
      const r = 0.12 + 0.88 * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const b = 0.25 + 0.75 * Math.pow(rnd(), 1.7);
      for (let s = 0; s < SEGMENTS; s++) {
        for (let e = 0; e < 2; e++) {
          phase[j] = p;
          radius[j] = r;
          angle[j] = a;
          // 0 at the tail through 1 at the head, shared endpoints duplicated
          end[j] = (s + e) / SEGMENTS;
          bright[j] = b;
          j++;
        }
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
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
    stage: StreakStage,
  ): void {
    const u = this.mat.uniforms;
    // streaks accelerate with the effect, which is what sells the run-up
    this.travel = (this.travel + dt * (0.16 + 0.9 * stage.flow)) % 1;
    u.uTravel.value = this.travel;
    (u.uAxisView.value as THREE.Vector3).copy(axisView);
    (u.uSideView.value as THREE.Vector3).copy(sideView);
    (u.uUpView.value as THREE.Vector3).copy(upView);
    u.uDepth.value = depth;
    u.uSpread.value = 0.62;
    // Length is the departure made visible: the trails draw out well before
    // the throat exists, which is the cue that the ship is gathering way
    // rather than that an effect has started.
    u.uStreak.value = 0.03 + 0.42 * stage.stretch;
    u.uCurve.value = stage.curve;
    u.uPinch.value = stage.pinch;
    u.uIntensity.value = stage.intensity;
    this.lines.visible = stage.intensity > 0.004;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- sequence --

/**
 * Where the sequence has got to.
 *
 * Six acts, and they are acts rather than labels: each one owns a stretch of
 * the run and moves a different set of the shader's dials, so what is on
 * screen during 'formation' is doing something the frame during 'departure'
 * was not. The boundaries below are the whole schedule.
 *
 *   departure   the place you are leaving is still there; the ship gathers way
 *               and the sky begins to crowd forward
 *   distortion  light starts to bend, trails curve, a dark point opens ahead
 *   formation   the throat widens into a ring with an inside
 *   transit     through it: walls running, deep black centre. Waits here for
 *               the real flight and for the destination system to finish
 *               building, which is what the hold point is for
 *   reveal      a light grows at the far end and the walls fall away behind it
 *   arrival     the overlay lets go and hands back the real sky
 */
export type WormholePhase =
  | 'off'
  | 'departure'
  | 'distortion'
  | 'formation'
  | 'transit'
  | 'reveal'
  | 'arrival';

/** Act boundaries, as fractions of the run. */
const ACTS: [number, WormholePhase][] = [
  [0.13, 'departure'],
  [0.3, 'distortion'],
  [0.46, 'formation'],
  [0.72, 'transit'],
  [0.9, 'reveal'],
  [1.01, 'arrival'],
];

function actOf(p: number): WormholePhase {
  for (const [end, name] of ACTS) if (p < end) return name;
  return 'arrival';
}

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
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uTanHalfFov: { value: 0.5 },
        uAspect: { value: 1 },
        uSky: { value: null },
        uHasSky: { value: 0 },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uAperture: { value: 0 },
        uMouth: { value: 0.02 },
        uDetail: { value: 3 },
        uStretch: { value: 0 },
        uLens: { value: 0 },
        uTunnel: { value: 0 },
        uFlow: { value: 0 },
        uTwist: { value: 0 },
        uReveal: { value: 0 },
        uExposure: { value: 1 },
        uLayers: { value: 4 },
        uSecondImage: { value: 1 },
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

  /**
   * Quality changes how much of the throat is resolved, not what it is.
   *
   * 'reduced' keeps the whole sequence - aberration, deflection, the ring, the
   * reveal - and buys its frames back where the cost is: two wall slices
   * instead of five, one noise octave instead of three, and a single lensed
   * image instead of both. The shape of the effect survives; the detail in it
   * thins. That is the setting a slower machine should get, rather than a
   * different, cheaper-looking effect.
   */
  setQuality(q: TravelEffects): void {
    this.quality = q;
    this.streaks.setQuality(q);
    const cine = q === 'cinematic';
    this.mat.uniforms.uDetail.value = cine ? 3 : 1;
    this.mat.uniforms.uLayers.value = cine ? 5 : 2;
    this.mat.uniforms.uSecondImage.value = cine ? 1 : 0;
  }

  get active(): boolean {
    return this.run !== null;
  }

  get phase(): WormholePhase {
    if (!this.run) return 'off';
    return actOf(this.t / this.run.duration);
  }

  /** 0..1 through the whole sequence. */
  get progress(): number {
    return this.run ? Math.min(1, this.t / this.run.duration) : 0;
  }

  /** Seconds the throat has been waiting for something to finish. */
  get holdSeconds(): number {
    return this.held;
  }

  /** The travel axis, for diagnostics that need to know where the throat is
   *  aimed relative to where the camera is looking. */
  get axisArray(): [number, number, number] {
    return [this.axis.x, this.axis.y, this.axis.z];
  }

  /** The dials as the shader currently sees them. Diagnostic only: it is the
   *  difference between reading the sequence and guessing at it from pixels. */
  get dials(): Record<string, number> {
    const u = this.mat.uniforms;
    const out: Record<string, number> = {};
    for (const k of [
      'uIntensity', 'uAperture', 'uMouth', 'uStretch', 'uLens',
      'uTunnel', 'uFlow', 'uTwist', 'uReveal', 'uExposure', 'uLayers',
    ]) {
      out[k.slice(1).toLowerCase()] = +Number(u[k].value).toFixed(3);
    }
    return out;
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
    // Restart the animation clock with each run. It feeds the noise field
    // directly, and simplex noise loses resolution as its input grows: left to
    // accumulate across a long session it would eventually flatten the
    // filaments into cells for the same reason a quantised ray direction did.
    // A run lasts seconds, so a few hundred is the most this ever reaches, and
    // the discontinuity lands where the effect is still at zero intensity.
    this.elapsed = 0;
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
    this.streaks.update(0, this.axisView, this.sideView, this.upView, 1, IDLE_STREAKS);
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

    // ---- the schedule ------------------------------------------------------
    // Every dial the shader reads is a curve over p, and the acts are just the
    // stretches where a given curve is doing the work. Writing them out
    // together rather than branching per act is what keeps the sequence
    // continuous: nothing switches on, things come up and go down, and the
    // overlaps between them are the transitions.

    // Coverage. Low through the departure so the place being left is still
    // plainly there, full from the formation on, released at the end.
    const intensity = p < 0.46 ? smoothstep(p, 0.04, 0.46) : p < 0.86 ? 1 : 1 - smoothstep(p, 0.86, 1);

    // Aberration leads: the sky crowds forward before anything bends.
    const stretch = smoothstep(p, 0.02, 0.34) * (1 - smoothstep(p, 0.86, 1));

    // Deflection follows, and stays up until the walls fall away.
    const lens = smoothstep(p, 0.10, 0.40) * (1 - smoothstep(p, 0.82, 0.98));

    // The throat itself: forms, holds through the transit, collapses.
    const tunnel = smoothstep(p, 0.17, 0.46) * (1 - smoothstep(p, 0.78, 0.95));

    // How fast the walls run past. Slowest as it forms, quickest inside.
    const flow = smoothstep(p, 0.3, 0.56) * (1 - smoothstep(p, 0.8, 1));

    // Azimuthal shear, which is what curves the trails rather than letting
    // them run straight down the axis.
    const twist = 0.5 + 1.5 * smoothstep(p, 0.28, 0.6);

    // The far end. Nothing until the transit is done, then it grows.
    const reveal = smoothstep(p, 0.7, 0.94);

    // Exposure. Bores in and darkens through the transit so the reveal has
    // somewhere to come up from, and lifts at the end.
    const exposure = 1.05 - 0.5 * smoothstep(p, 0.3, 0.62) + 0.3 * smoothstep(p, 0.72, 0.95);

    // What the overlay lets through: shut until the reveal, then widening past
    // the edge of the frame so the last of it leaves the screen.
    const aperture = 0.004 + 1.0 * smoothstep(p, 0.7, 1.0);

    // How big the throat looks. It opens during the formation to about two
    // thirds of the half-field - a mouth that fills a good part of the frame,
    // which is what gives the walls something to be the inside of - breathes
    // slightly through the transit, and then flies open past the edge of the
    // frame as the destination is revealed.
    const mouth =
      0.014 +
      0.30 * smoothstep(p, 0.17, 0.5) +
      0.02 * Math.sin(this.elapsed * 0.9) * tunnel +
      1.1 * smoothstep(p, 0.72, 1.0);

    // The place changes while the throat is shut and the overlay is at full
    // strength - the one stretch where moving the universe under the camera
    // cannot be seen. Held to the transit, comfortably before the reveal.
    if (!this.swapped && p >= 0.5) {
      this.swapped = true;
      this.run.onSwap?.();
    }

    const u = this.mat.uniforms;
    u.uTime.value = this.elapsed;
    u.uIntensity.value = intensity;
    u.uAperture.value = aperture;
    u.uMouth.value = mouth;
    u.uStretch.value = stretch;
    u.uLens.value = lens;
    u.uTunnel.value = tunnel;
    u.uFlow.value = flow;
    u.uTwist.value = twist;
    u.uReveal.value = reveal;
    u.uExposure.value = exposure;
    camera.updateMatrixWorld();
    // The camera's world basis, straight off its matrix: columns 0 and 1 are
    // right and up, and column 2 points backwards, which is why the forward
    // vector is negated. Unit vectors, so nothing here carries the ship's
    // distance from the origin into the shader.
    const m = camera.matrixWorld.elements;
    (u.uCamRight.value as THREE.Vector3).set(m[0], m[1], m[2]).normalize();
    (u.uCamUp.value as THREE.Vector3).set(m[4], m[5], m[6]).normalize();
    (u.uCamFwd.value as THREE.Vector3).set(-m[8], -m[9], -m[10]).normalize();
    u.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    u.uAspect.value = camera.aspect;

    // The streak field is placed in view space, so its size is set by the
    // frustum rather than by the world: a fixed multiple of the near plane is
    // always visible and never intersects anything the camera is looking at.
    this.axisView.copy(this.axis).transformDirection(camera.matrixWorldInverse);
    this.sideView.copy(this.side).transformDirection(camera.matrixWorldInverse);
    this.upView.copy(this.up).transformDirection(camera.matrixWorldInverse);
    const depth = THREE.MathUtils.clamp(camera.near * 260, 1e-5, camera.far * 0.35);
    this.streaks.update(dt, this.axisView, this.sideView, this.upView, depth, {
      intensity,
      // trails stretch early and are still drawn out through the transit
      stretch: Math.max(stretch, tunnel * 0.8),
      flow,
      curve: twist * 0.55 * tunnel,
      pinch: tunnel,
    });
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
