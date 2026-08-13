/**
 * Numerical checks on src/spacecraft/orbit.ts - the two-body maths behind orbit mode.
 *
 * Runs without a browser: node --experimental-strip-types scripts/orbittest.mts
 * (or `npm run test:orbit`). Asserts closed-form identities, conservation over
 * absurd step sizes, reversibility, and that each burn axis moves the orbit the
 * way orbital mechanics says it should.
 */
import * as THREE from 'three';
import {
  propagate, elementsFrom, sampleConic, circularSpeed, escapeSpeed, stumpffC, stumpffS,
  burnDirection, propagateWithThrust,
} from '../src/spacecraft/orbit.ts';

let fails = 0;
const ok = (name: string, got: number, want: number, tol: number) => {
  const bad = !(Math.abs(got - want) <= tol);
  if (bad) fails++;
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${name.padEnd(46)} got ${got.toPrecision(10)}  want ${want.toPrecision(10)}`);
};
const okRel = (name: string, got: number, want: number, rel: number) =>
  ok(name, got, want, Math.abs(want) * rel);

// ---- Stumpff limits -------------------------------------------------------
ok('C(0)', stumpffC(0), 0.5, 1e-12);
ok('S(0)', stumpffS(0), 1/6, 1e-12);
ok('C(1e-9) continuous', stumpffC(1e-9), 0.5, 1e-9);
ok('C(4) vs closed form', stumpffC(4), (1-Math.cos(2))/4, 1e-12);
ok('S(-4) vs closed form', stumpffS(-4), (Math.sinh(2)-2)/8, 1e-12);

// ---- circular orbit around Earth -----------------------------------------
const MU_E = 398600.4418, R = 50000;
const vc = circularSpeed(MU_E, R);
okRel('Earth 50,000 km circular speed', vc, Math.sqrt(MU_E/R), 1e-12);
console.log(`      -> ${vc.toFixed(4)} km/s, escape ${escapeSpeed(MU_E,R).toFixed(4)} km/s`);

const r0 = new THREE.Vector3(R, 0, 0);
const v0 = new THREE.Vector3(0, 0, -vc);   // in the ecliptic plane (scene XZ)
const el0 = elementsFrom(r0, v0, MU_E);
okRel('circular: a == R', el0.a, R, 1e-12);
ok('circular: e == 0', el0.e, 0, 1e-12);
// r along +X with v along -Z is the ecliptic plane itself, so i = 0
ok('circular: inclination 0 (orbit lies in the ecliptic)', el0.inc, 0, 1e-12);
// and a genuinely polar one must read 90 deg
const elPolar = elementsFrom(r0, new THREE.Vector3(0, vc, 0), MU_E);
ok('polar orbit: inclination 90 deg', elPolar.inc, Math.PI/2, 1e-12);
const T = 2*Math.PI*Math.sqrt(R**3/MU_E);
okRel('circular: period', el0.period, T, 1e-12);
console.log(`      -> period ${(T/3600).toFixed(3)} h`);

// propagate exactly one period -> back to start
const st = { r: new THREE.Vector3(), v: new THREE.Vector3() };
propagate(r0, v0, MU_E, T, st);
okRel('after 1 period: x', st.r.x, R, 1e-8);
ok('after 1 period: |r| - R', st.r.length() - R, 0, 1e-6);
ok('after 1 period: |v| - vc', st.v.length() - vc, 0, 1e-9);

// propagate a quarter period
propagate(r0, v0, MU_E, T/4, st);
ok('quarter period: x ~ 0', st.r.x, 0, 1e-6);
okRel('quarter period: z ~ -R', st.r.z, -R, 1e-9);

// 1000 periods in ONE step (the extreme-compression case)
propagate(r0, v0, MU_E, T*1000, st);
ok('1000 periods in one step: |r|-R', st.r.length()-R, 0, 1e-5);
const elBig = elementsFrom(st.r, st.v, MU_E);
okRel('1000 periods: energy preserved', elBig.energy, el0.energy, 1e-12);

// ---- eccentric orbit, apsides --------------------------------------------
const v1 = new THREE.Vector3(0, 0, -vc*1.2);
const el1 = elementsFrom(r0, v1, MU_E);
okRel('e=0.44 case: eccentricity', el1.e, 0.44, 1e-9);
okRel('e=0.44 case: periapsis', el1.rp, R, 1e-9);
okRel('e=0.44 case: apoapsis', el1.ra, R*(1+0.44)/(1-0.44), 1e-9);
// half a period from periapsis must land on apoapsis
propagate(r0, v1, MU_E, el1.period/2, st);
okRel('half period -> apoapsis radius', st.r.length(), el1.ra, 1e-7);

// ---- hyperbolic escape ----------------------------------------------------
const vEsc = new THREE.Vector3(0, 0, -escapeSpeed(MU_E, R)*1.1);
const elH = elementsFrom(r0, vEsc, MU_E);
console.log(`      -> escape case e=${elH.e.toFixed(4)} energy=${elH.energy.toFixed(6)} escaping=${elH.escaping}`);
if (!elH.escaping) { fails++; console.log('FAIL  escape not detected'); }
if (!(elH.e > 1)) { fails++; console.log('FAIL  e <= 1 on a hyperbolic orbit'); }
propagate(r0, vEsc, MU_E, 86400, st);
const elH2 = elementsFrom(st.r, st.v, MU_E);
okRel('hyperbolic: energy conserved over 1 day', elH2.energy, elH.energy, 1e-9);
console.log(`      -> after 1 day r=${st.r.length().toFixed(0)} km v=${st.v.length().toFixed(4)} km/s`);

// ---- reversibility --------------------------------------------------------
propagate(r0, v1, MU_E, 12345.6, st);
const back = { r: new THREE.Vector3(), v: new THREE.Vector3() };
propagate(st.r, st.v, MU_E, -12345.6, back);
ok('reversible: |r - r0|', back.r.distanceTo(r0), 0, 1e-6);
ok('reversible: |v - v0|', back.v.distanceTo(v1), 0, 1e-10);

// ---- prograde burn raises the orbit ---------------------------------------
const dir = new THREE.Vector3();
burnDirection('prograde', r0, v0, dir);
ok('prograde dir is along v', dir.dot(v0.clone().normalize()), 1, 1e-12);
const st2 = { r: new THREE.Vector3(), v: new THREE.Vector3() };
const accel = dir.clone().multiplyScalar(0.001); // km/s^2
propagateWithThrust(r0, v0, MU_E, 100, accel, st2);
const elAfter = elementsFrom(st2.r, st2.v, MU_E);
console.log(`      -> prograde 100 s @1 m/s2: a ${el0.a.toFixed(0)} -> ${elAfter.a.toFixed(0)} km, e ${elAfter.e.toFixed(5)}`);
if (!(elAfter.a > el0.a)) { fails++; console.log('FAIL  prograde burn did not raise the orbit'); }
if (!(elAfter.energy > el0.energy)) { fails++; console.log('FAIL  prograde burn did not add energy'); }

burnDirection('retrograde', r0, v0, dir);
propagateWithThrust(r0, v0, MU_E, 100, dir.clone().multiplyScalar(0.001), st2);
const elRetro = elementsFrom(st2.r, st2.v, MU_E);
console.log(`      -> retrograde 100 s: a ${el0.a.toFixed(0)} -> ${elRetro.a.toFixed(0)} km`);
if (!(elRetro.a < el0.a)) { fails++; console.log('FAIL  retrograde burn did not lower the orbit'); }

burnDirection('normal', r0, v0, dir);
propagateWithThrust(r0, v0, MU_E, 200, dir.clone().multiplyScalar(0.002), st2);
const elNorm = elementsFrom(st2.r, st2.v, MU_E);
console.log(`      -> normal 200 s: inc ${(el0.inc*180/Math.PI).toFixed(2)} -> ${(elNorm.inc*180/Math.PI).toFixed(2)} deg`);
if (!(Math.abs(elNorm.inc - el0.inc) > 1e-4)) { fails++; console.log('FAIL  normal burn did not change inclination'); }

// ---- conic sampling -------------------------------------------------------
const pts = sampleConic(r0, v1, MU_E, 128, 1e7);
console.log(`      -> ellipse sampled ${pts.length} pts, radii ${Math.min(...pts.map(p=>p.length())).toFixed(0)}..${Math.max(...pts.map(p=>p.length())).toFixed(0)} km`);
ok('conic min radius == periapsis', Math.min(...pts.map(p=>p.length())), el1.rp, el1.rp*1e-4);
ok('conic max radius == apoapsis', Math.max(...pts.map(p=>p.length())), el1.ra, el1.ra*1e-4);
const hp = sampleConic(r0, vEsc, MU_E, 128, 2e6);
console.log(`      -> hyperbola sampled ${hp.length} pts, max radius ${Math.max(...hp.map(p=>p.length())).toFixed(0)} km`);
if (hp.length < 8) { fails++; console.log('FAIL  hyperbolic conic produced too few points'); }
if (Math.max(...hp.map(p=>p.length())) > 2.1e6) { fails++; console.log('FAIL  hyperbolic conic exceeded max radius'); }

// ---- high eccentricity: the case that broke plain Newton ------------------
// A diverged universal anomaly returns a FINITE but astronomically wrong radius
// that no isFinite check rejects. This sweep is the guard for that.
{
  const MU_M = 42828.37;
  const rp2 = 20000;
  for (const ecc of [0.5, 0.9, 0.99, 0.999, 0.9999]) {
    const aa = rp2 / (1 - ecc);
    const vp = Math.sqrt((MU_M * (1 + ecc)) / rp2);
    const rr = new THREE.Vector3(rp2, 0, 0);
    const vv = new THREE.Vector3(0, 0, -vp);
    const period = 2 * Math.PI * Math.sqrt(aa ** 3 / MU_M);
    const e0 = (vp * vp) / 2 - MU_M / rp2;
    let worstRadius = 0;
    let worstEnergy = 0;
    for (let k = 1; k <= 120; k++) {
      propagate(rr, vv, MU_M, (period * k) / 120, st);
      const m = st.r.length();
      if (!Number.isFinite(m) || m > worstRadius) worstRadius = m;
      const el = elementsFrom(st.r, st.v, MU_M);
      worstEnergy = Math.max(worstEnergy, Math.abs(el.energy - e0) / Math.abs(e0));
    }
    const sane = Number.isFinite(worstRadius) && worstRadius < aa * (1 + ecc) * 1.001;
    if (!sane) {
      fails++;
      console.log(`FAIL  e=${ecc}: radius reached ${worstRadius.toExponential(3)} km (apoapsis is ${(aa * (1 + ecc)).toExponential(3)})`);
    } else {
      console.log(`ok    e=${ecc.toFixed(4).padEnd(6)} 120 samples over a full period stay <= apoapsis, energy drift ${worstEnergy.toExponential(2)}`);
    }
    // 1e-6 relative, not tighter: at e = 0.9999 the orbit spans 20,000:1 in
    // radius and float64 genuinely gives up a few digits. A diverged solve
    // misses by order unity, so this still catches every real failure.
    if (worstEnergy > 1e-6) {
      fails++;
      console.log(`FAIL  e=${ecc}: energy drifted ${worstEnergy.toExponential(2)}`);
    }
  }
}

// ---- reference numbers for other bodies ----------------------------------
for (const [n, mu, r] of [['Mars', 42828.37, 20000], ['Jupiter', 126686534, 500000],
                          ['Saturn', 37931187, 1000000]] as [string,number,number][]) {
  const v = circularSpeed(mu, r), p = 2*Math.PI*Math.sqrt(r**3/mu);
  console.log(`      -> ${n} @${r} km: v=${v.toFixed(4)} km/s, T=${(p/3600).toFixed(2)} h, dV_esc=${(v*(Math.SQRT2-1)).toFixed(4)} km/s`);
}

console.log(fails ? `\n${fails} FAILURES` : '\nAll orbital-mechanics checks passed.');
process.exit(fails ? 1 : 0);
