/**
 * Stepped navigation routes between the neighbouring systems.
 *
 * A straight line from one star to another is the shortest path and tells you
 * nothing. These are drawn the way a chart draws them: right-angled runs, so a
 * route reads as a decision - so far along this bearing, then turn - rather
 * than as a ruler laid across the sky.
 *
 * What "right-angled" means here
 * ------------------------------
 * Not the world axes. The neighbourhood is drawn as a sky: every system is
 * placed in its true direction on a shell around the camera (see
 * scene/neighbourhood), so a route that stepped along world x, y and z would
 * leave the pair it joins and swing right across the sky to do it - three
 * enormous straight lines through the middle of everything, which is what a
 * first attempt at this did.
 *
 * The runs instead hold one spherical coordinate fixed at a time: along a
 * parallel at constant elevation, then up a meridian at constant azimuth, then
 * along a parallel again. Those two families of curves meet at right angles
 * everywhere on a sphere, so the corners are true 90 degrees, and with the
 * camera level they read as horizontal and vertical on screen - the same
 * language as the celestial grid the app already draws. A route also stays in
 * the neighbourhood of the two systems it joins, which is what stops it
 * crossing the Sun or wandering off through unrelated stars.
 *
 * Where the numbers come from
 * ---------------------------
 * Two different sources, deliberately.
 *
 * WHICH systems are joined, and which way each route turns, is decided from the
 * catalogue positions in light-years. That is the real adjacency, and it does
 * not move when the camera does - a route that re-chose its corners every frame
 * would writhe as you turned, which is exactly the "random-looking bends" this
 * has to avoid.
 *
 * WHERE the corners land is taken from the exact vertices the star points are
 * drawn at, which is not the same thing: a system further away than the sky
 * shell is drawn on the shell in its true direction rather than at its true
 * distance. Routing between catalogue positions while the points sit on the
 * shell would leave every line ending in empty space near its star, which is
 * the class of bug this file is most at risk of. The endpoints are copied from
 * the point buffer itself, so "the route ends on the star" is structural
 * rather than a coincidence that holds until the projection changes.
 *
 * The network
 * -----------
 * A minimum spanning tree over the real distances. Every system is reachable,
 * nothing is joined twice, and the edge count is one less than the star count -
 * which is what keeps this a chart instead of the fully-connected cobweb that
 * drawing every pair would give (30 systems would be 435 lines).
 */
import * as THREE from 'three';

/**
 * Sky separation past which a route is not drawn, and where it starts fading.
 *
 * The tree is built in three dimensions, but it is drawn on a sphere around the
 * camera, and those disagree: two systems six light-years apart are genuine
 * neighbours, yet if they lie on opposite sides of the Sun they are half a sky
 * apart to look at. Drawing that edge sends a line right around the view to
 * join two points that are nowhere near each other on screen - which is most of
 * what made the first version look like debug geometry rather than a chart.
 *
 * So the adjacency stays honest and the drawing does not: an edge whose ends
 * are too far apart to take in at once is faded out and dropped. What is left
 * is the part of the network you can actually see, which is what a chart is
 * for.
 */
const FADE_FROM = Math.PI * (55 / 180);
const DROP_AT = Math.PI * (78 / 180);

/** Samples per run. Enough that a parallel reads as a smooth arc. */
const SAMPLES = 7;
/** Runs per route: parallel, meridian, parallel. */
const RUNS = 3;
/** Line segments, and so vertex pairs, per route. */
const SEGS_PER_EDGE = RUNS * SAMPLES;
const VERTS_PER_EDGE = SEGS_PER_EDGE * 2;

export interface LinkNode {
  id: string;
  /** True position in light-years, relative to the current origin. */
  ly: THREE.Vector3;
  /** The vertex the star's point is actually drawn at, in group space. */
  draw: THREE.Vector3;
  visible: boolean;
}

interface Edge {
  a: number;
  b: number;
  /** True to turn along the parallel first, false to climb the meridian first. */
  alongFirst: boolean;
}

/** Azimuth and elevation of a direction, in radians. */
function angles(v: THREE.Vector3): { az: number; el: number } {
  const r = Math.max(v.length(), 1e-9);
  return { az: Math.atan2(v.x, v.z), el: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) };
}

/** The signed azimuth difference, taking the short way round. */
function shortAz(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Minimum spanning tree by Prim's algorithm, over real 3D distance.
 *
 * O(n^2) on a few dozen systems is nothing, and it avoids the sort-and-union
 * that Kruskal would need. The result is the same tree either way.
 */
function spanningTree(nodes: LinkNode[], use: number[]): [number, number][] {
  const n = use.length;
  if (n < 2) return [];
  const at = (i: number) => nodes[use[i]].ly;
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const from = new Array<number>(n).fill(-1);
  const edges: [number, number][] = [];
  inTree[0] = true;
  for (let i = 1; i < n; i++) {
    best[i] = at(0).distanceToSquared(at(i));
    from[i] = 0;
  }
  for (let k = 1; k < n; k++) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (pick < 0 || best[i] < best[pick])) pick = i;
    if (pick < 0 || !Number.isFinite(best[pick])) break;
    inTree[pick] = true;
    edges.push([use[from[pick]], use[pick]]);
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const d = at(pick).distanceToSquared(at(i));
      if (d < best[i]) {
        best[i] = d;
        from[i] = pick;
      }
    }
  }
  return edges;
}

/**
 * The route from A to B as a list of (azimuth, elevation, radius fraction)
 * waypoints, one per sample, including both ends.
 *
 * Three runs in a Z: half the turn along a parallel, the whole climb up a
 * meridian, then the rest of the turn. Two corners rather than one, because a
 * single elbow reads as a mistake and a Z reads as a route.
 */
function waypoints(
  aAz: number,
  aEl: number,
  bAz: number,
  bEl: number,
  alongFirst: boolean,
  out: { az: number; el: number; t: number }[],
): void {
  const dAz = shortAz(aAz, bAz);
  const dEl = bEl - aEl;
  let n = 0;
  const push = (az: number, el: number) => {
    const o = out[n] ?? (out[n] = { az: 0, el: 0, t: 0 });
    o.az = az;
    o.el = el;
    o.t = n / (RUNS * SAMPLES);
    n++;
  };
  // Each run is sampled from just past its start to its end, so the runs chain
  // without repeating the shared corner vertex.
  const run = (
    az0: number,
    el0: number,
    az1: number,
    el1: number,
  ) => {
    for (let i = 1; i <= SAMPLES; i++) {
      const f = i / SAMPLES;
      push(az0 + (az1 - az0) * f, el0 + (el1 - el0) * f);
    }
  };
  push(aAz, aEl);
  if (alongFirst) {
    const mid = aAz + dAz * 0.5;
    run(aAz, aEl, mid, aEl); // parallel
    run(mid, aEl, mid, bEl); // meridian
    run(mid, bEl, aAz + dAz, bEl); // parallel
  } else {
    const mid = aEl + dEl * 0.5;
    run(aAz, aEl, aAz, mid); // meridian
    run(aAz, mid, aAz + dAz, mid); // parallel
    run(aAz + dAz, mid, aAz + dAz, bEl); // meridian
  }
  out.length = n;
}

/** Angular distance from a direction to the arc a route sweeps, in radians. */
function angularClearance(
  p: { az: number; el: number },
  path: { az: number; el: number }[],
): number {
  let worst = Infinity;
  for (const w of path) {
    // small-angle spherical distance, good enough for a clearance test
    const dEl = w.el - p.el;
    const dAz = shortAz(p.az, w.az) * Math.cos((w.el + p.el) * 0.5);
    worst = Math.min(worst, Math.hypot(dEl, dAz));
  }
  return worst;
}

const VERT = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying float vFade;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float a = vFade * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Where in the vertex buffer an edge's runs were written. */
interface Drawn {
  edge: number;
  at: number;
}

export class StarLinks {
  readonly lines: THREE.LineSegments;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private pos: Float32Array;
  private fade: Float32Array;
  private edges: Edge[] = [];
  private drawnEdges: Drawn[] = [];
  private builtFor = '';
  private capacity = 0;
  private drawn = 0;
  private path: { az: number; el: number; t: number }[] = [];
  private probe: { az: number; el: number; t: number }[] = [];
  /** Diagnostics for the test, filled on the last update. */
  private report = { edges: 0, segments: 0, nodes: 0, worstClearance: 1 };

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * VERTS_PER_EDGE * 3);
    this.fade = new Float32Array(capacity * VERTS_PER_EDGE);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        // the same cyan the rest of the navigation furniture uses, weighted
        // away from red so that adding it to a bright patch of Milky Way still
        // reads as a blue line rather than washing out to white
        uColor: { value: new THREE.Color(0.16, 0.66, 1.0) },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      // additive, so the routes read as drawn light over the starfield and
      // stay legible against it without needing to be thick
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    // with the star points, under anything solid
    this.lines.renderOrder = -8;
    this.lines.visible = false;
  }

  /**
   * Decide which systems are joined, and which way each route turns.
   *
   * Both come from the light-year layout, so they are stable while the camera
   * moves. The turn is chosen in the sky frame of the origin system rather than
   * of the camera for the same reason: the camera's own bearing to a star does
   * shift as it crosses the system, and a choice made from that would flip
   * mid-flight.
   */
  private plan(nodes: LinkNode[], key: string): void {
    if (this.builtFor === key) return;
    this.builtFor = key;
    this.edges = [];
    const sky = nodes.map((n) => angles(n.ly));
    // The system you are standing in is left out of the network. It is drawn as
    // real geometry at the centre of the view rather than as a point on the
    // shell, and a route reaching it would have to dive in from the shell and
    // cross the star itself to get there. The chart is of the neighbours; where
    // you are is already obvious.
    const use = nodes.map((_, i) => i).filter((i) => nodes[i].id !== key);
    const tree = spanningTree(nodes, use);
    for (const [a, b] of tree) {
      if (this.edges.length >= this.capacity) break;
      this.edges.push({ a, b, alongFirst: this.chooseTurn(sky, a, b) });
    }
  }

  /**
   * Parallel first, or meridian first.
   *
   * Longest run first is the stable, legible choice - it puts the big move at
   * the start and the correction at the end, which is what makes a route look
   * intentional. But it is only a preference: a route that passes through a
   * system it has no business touching is worse than an unusual turn, so both
   * options are scored and the better one wins.
   */
  private chooseTurn(sky: { az: number; el: number }[], ai: number, bi: number): boolean {
    const a = sky[ai];
    const b = sky[bi];
    const dAz = Math.abs(shortAz(a.az, b.az)) * Math.cos((a.el + b.el) * 0.5);
    const dEl = Math.abs(b.el - a.el);
    const span = Math.max(Math.hypot(dAz, dEl), 1e-6);
    // how close a route may pass to an uninvolved system, as a fraction of its
    // own angular length
    const clear = span * 0.18;
    let best = true;
    let bestScore = -Infinity;
    for (const alongFirst of [true, false]) {
      waypoints(a.az, a.el, b.az, b.el, alongFirst, this.probe);
      // prefer to make the longer move first
      let score = ((alongFirst ? dAz : dEl) * 2) / span;
      for (let i = 0; i < sky.length; i++) {
        if (i === ai || i === bi) continue;
        const near = angularClearance(sky[i], this.probe);
        if (near < clear) score -= 6 * (1 - near / clear);
      }
      if (score > bestScore) {
        bestScore = score;
        best = alongFirst;
      }
    }
    return best;
  }

  /** Write one waypoint as a vertex. */
  private writeVertex(v: number, w: { az: number; el: number }, radius: number, fade: number): void {
    const ce = Math.cos(w.el);
    this.pos[v * 3] = Math.sin(w.az) * ce * radius;
    this.pos[v * 3 + 1] = Math.sin(w.el) * radius;
    this.pos[v * 3 + 2] = Math.cos(w.az) * ce * radius;
    this.fade[v] = fade;
  }

  /**
   * Rebuild the vertices from where the points are drawn this frame.
   *
   * @param nodes  one per system, in the neighbourhood's own order
   * @param key    changes when the topology should be replanned - the origin
   *               system, essentially
   * @param opacity 0 hides the layer
   */
  update(nodes: LinkNode[], key: string, opacity: number): void {
    this.lines.visible = opacity > 0.004 && nodes.length > 1;
    this.mat.uniforms.uOpacity.value = opacity;
    if (!this.lines.visible) {
      this.drawnEdges = [];
      this.drawn = 0;
      this.geo.setDrawRange(0, 0);
      this.report = { edges: 0, segments: 0, nodes: nodes.length, worstClearance: 1 };
      return;
    }
    this.plan(nodes, key);

    // where every system sits on this frame's sky, for the clearance figure
    const sky = nodes.map((n) => angles(n.draw));

    let v = 0;
    let segments = 0;
    let worstClearance = Infinity;
    this.drawnEdges = [];
    for (let ei = 0; ei < this.edges.length; ei++) {
      const e = this.edges[ei];
      const A = nodes[e.a];
      const B = nodes[e.b];
      // an edge is only drawn when both its ends are - a route to a star that
      // is not on screen is a line into nowhere
      if (!A.visible || !B.visible) continue;
      // and only when the two ends are close enough on the sky to read as a
      // connection rather than as a line around the view
      const sep = A.draw.angleTo(B.draw);
      if (sep >= DROP_AT) continue;
      const reach = 1 - THREE.MathUtils.smoothstep(sep, FADE_FROM, DROP_AT);
      const rA = A.draw.length();
      const rB = B.draw.length();
      waypoints(sky[e.a].az, sky[e.a].el, sky[e.b].az, sky[e.b].el, e.alongFirst, this.path);

      this.drawnEdges.push({ edge: ei, at: v });
      for (let i = 0; i + 1 < this.path.length; i++) {
        const p = this.path[i];
        const q = this.path[i + 1];
        // Bright where the route meets its stars and nearly out in the middle.
        // With only a dozen systems spread over the whole sky, every link spans
        // tens of degrees however it is routed; drawn at an even weight they
        // read as a bright frame laid over the view. Weighted to the ends they
        // read as what they are - each star showing which way its neighbours
        // lie - and the long middle stays out of the way of the sky.
        const glow = (t: number) => reach * (0.12 + 0.88 * Math.abs(t * 2 - 1) ** 3);
        this.writeVertex(v++, p, rA + (rB - rA) * p.t, glow(p.t));
        this.writeVertex(v++, q, rA + (rB - rA) * q.t, glow(q.t));
        segments++;
      }

      for (let i = 0; i < nodes.length; i++) {
        if (i === e.a || i === e.b || !nodes[i].visible) continue;
        const span = Math.max(
          Math.hypot(
            shortAz(sky[e.a].az, sky[e.b].az) * Math.cos((sky[e.a].el + sky[e.b].el) * 0.5),
            sky[e.b].el - sky[e.a].el,
          ),
          1e-6,
        );
        worstClearance = Math.min(worstClearance, angularClearance(sky[i], this.path) / span);
      }
    }

    // anything left over from a previous frame is collapsed to a point
    for (let i = v; i < this.capacity * VERTS_PER_EDGE; i++) {
      this.pos[i * 3] = 0;
      this.pos[i * 3 + 1] = 0;
      this.pos[i * 3 + 2] = 0;
      this.fade[i] = 0;
    }
    this.drawn = v;
    this.geo.setDrawRange(0, v);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aFade.needsUpdate = true;
    this.geo.computeBoundingSphere();

    this.report = {
      edges: this.edges.length,
      segments,
      nodes: nodes.length,
      worstClearance: Number.isFinite(worstClearance) ? worstClearance : 1,
    };
  }

  /** What the last update produced, for the test. */
  get info(): { edges: number; segments: number; nodes: number; worstClearance: number; vertices: number } {
    return { ...this.report, vertices: this.drawn };
  }

  /** The planned edges, as star-id pairs. */
  plannedEdges(nodes: LinkNode[]): { a: string; b: string; alongFirst: boolean }[] {
    return this.edges.map((e) => ({
      a: nodes[e.a]?.id ?? '?',
      b: nodes[e.b]?.id ?? '?',
      alongFirst: e.alongFirst,
    }));
  }

  /**
   * Every route that was actually written to the vertex buffer, measured from
   * that buffer.
   *
   * Read the positions back rather than recomputing them from the waypoints: a
   * check that rebuilds the geometry it is checking can only ever agree with
   * itself. These numbers come from the same Float32Array the GPU draws, so a
   * route that ends short of its star shows up here as a gap.
   *
   * `offAxisRuns` counts runs that failed to hold the coordinate they were
   * supposed to hold - the spherical equivalent of a diagonal - and `breaks`
   * counts places where consecutive segments do not join, which is what a
   * mis-indexed write looks like.
   */
  measured(nodes: LinkNode[]): {
    a: string;
    b: string;
    startGap: number;
    endGap: number;
    offAxisRuns: number;
    breaks: number;
    held: ('az' | 'el')[];
    stepDeg: number[];
    corners: number[];
    span: number;
  }[] {
    const p = (i: number) =>
      new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    return this.drawnEdges.map((d) => {
      const e = this.edges[d.edge];
      const A = nodes[e.a];
      const B = nodes[e.b];
      let breaks = 0;
      for (let s = 1; s < SEGS_PER_EDGE; s++) {
        // segment s starts at d.at + 2s, the previous ended at d.at + 2s - 1
        if (p(d.at + s * 2).distanceTo(p(d.at + s * 2 - 1)) > 1e-3) breaks++;
      }
      // Each run must hold one coordinate: a parallel keeps its elevation, a
      // meridian keeps its azimuth. Which one it held is recorded, because
      // that is what makes the corners right angles - the parallels and the
      // meridians of a sphere are orthogonal wherever they cross, so a route
      // whose runs alternate between the two families turns through exactly 90
      // degrees at every corner, by construction rather than by measurement.
      let offAxisRuns = 0;
      const held: ('az' | 'el')[] = [];
      const stepDeg: number[] = [];
      for (let r = 0; r < RUNS; r++) {
        const first = angles(p(d.at + r * SAMPLES * 2));
        let sweptAz = 0;
        let sweptEl = 0;
        for (let s = 0; s <= SAMPLES; s++) {
          const idx = Math.min(d.at + r * SAMPLES * 2 + s * 2, d.at + VERTS_PER_EDGE - 1);
          const w = angles(p(idx));
          sweptAz = Math.max(sweptAz, Math.abs(shortAz(first.az, w.az)));
          sweptEl = Math.max(sweptEl, Math.abs(w.el - first.el));
        }
        // on-axis means one of the two did not move at all
        if (Math.min(sweptAz, sweptEl) > 1e-4) offAxisRuns++;
        // the coordinate that stayed put is the one this run held
        held.push(sweptAz < sweptEl ? 'az' : 'el');
        stepDeg.push((Math.max(sweptAz, sweptEl) * 180) / Math.PI / SAMPLES);
      }
      // and the measured turn at each corner, for the record. This is taken
      // between chords rather than tangents, so it carries the sampling step as
      // slack; the exact claim is the alternation above.
      const corners: number[] = [];
      for (let r = 1; r < RUNS; r++) {
        const c = p(d.at + r * SAMPLES * 2);
        const before = p(d.at + r * SAMPLES * 2 - 2).sub(c).normalize();
        const after = p(d.at + r * SAMPLES * 2 + 1).sub(c).normalize();
        corners.push((Math.acos(THREE.MathUtils.clamp(before.dot(after), -1, 1)) * 180) / Math.PI);
      }
      const last = p(d.at + VERTS_PER_EDGE - 1);
      return {
        a: A?.id ?? '?',
        b: B?.id ?? '?',
        startGap: A ? p(d.at).distanceTo(A.draw) : 1e9,
        endGap: B ? last.distanceTo(B.draw) : 1e9,
        offAxisRuns,
        breaks,
        held,
        stepDeg,
        corners,
        span: A && B ? A.draw.distanceTo(B.draw) : 0,
      };
    });
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
