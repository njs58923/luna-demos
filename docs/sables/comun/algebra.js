// Vectores, cuaterniones y azar estable: lo que usan todas las escenas de
// manos. Los vectores son objetos { x, y, z } y los giros cuaterniones
// { x, y, z, w }, como los que manda posemove.
(globalThis.__modulos ||= []).push(["comun/algebra", [], () => {
  const v3 = (x, y, z) => ({ x, y, z });
  const suma = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const resta = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const por = (a, k) => v3(a.x * k, a.y * k, a.z * k);
  const punto = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cruz = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const largo = (a) => Math.hypot(a.x, a.y, a.z);
  const unitario = (a) => { const l = largo(a) || 1; return por(a, 1 / l); };
  const ARRIBA = v3(0, 1, 0);
  const ADELANTE = v3(0, 0, -1);
  const acotar = (v, a, b) => Math.max(a, Math.min(b, v));

  function qMul(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  }
  const qConj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
  function qNormal(q) {
    const m = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
  }
  function rotar(q, v) {
    const r = qMul(qMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConj(q));
    return v3(r.x, r.y, r.z);
  }
  /** Un giro de `a` radianes alrededor de X, de Y o de Z. */
  const qEnX = (a) => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
  const qEnY = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
  const qEnZ = (a) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
  /** Euler XYZ intrínseco a cuaternión: lo mismo que Quat::from_euler del motor,
   *  y el inverso de eulerDeQ. */
  const qDeEuler = (x, y, z) => qMul(qMul(qEnX(x), qEnY(y)), qEnZ(z));
  /** El cuaternión de una base ortonormal (las columnas X, Y, Z). */
  function qDeBase(X, Y, Z) {
    const t = X.x + Y.y + Z.z;
    let q;
    if (t > 0) {
      const s = Math.sqrt(t + 1) * 2;
      q = { w: s / 4, x: (Y.z - Z.y) / s, y: (Z.x - X.z) / s, z: (X.y - Y.x) / s };
    } else if (X.x > Y.y && X.x > Z.z) {
      const s = Math.sqrt(1 + X.x - Y.y - Z.z) * 2;
      q = { w: (Y.z - Z.y) / s, x: s / 4, y: (Y.x + X.y) / s, z: (Z.x + X.z) / s };
    } else if (Y.y > Z.z) {
      const s = Math.sqrt(1 + Y.y - X.x - Z.z) * 2;
      q = { w: (Z.x - X.z) / s, x: (Y.x + X.y) / s, y: s / 4, z: (Z.y + Y.z) / s };
    } else {
      const s = Math.sqrt(1 + Z.z - X.x - Y.y) * 2;
      q = { w: (X.y - Y.x) / s, x: (Z.x + X.z) / s, y: (Z.y + Y.z) / s, z: s / 4 };
    }
    return qNormal(q);
  }
  /** Una orientación cuyo -Z local apunta a `frente`, con el +Y lo más cerca
   *  posible de `arriba` (por defecto, el del mundo). */
  function qMirando(frente, arriba = ARRIBA) {
    const Z = por(unitario(frente), -1);
    let Y = resta(arriba, por(Z, punto(arriba, Z)));
    if (largo(Y) < 1e-3) Y = resta(ARRIBA, por(Z, punto(ARRIBA, Z)));
    if (largo(Y) < 1e-3) Y = resta(v3(0, 0, -1), por(Z, punto(v3(0, 0, -1), Z)));
    Y = unitario(Y);
    return qDeBase(cruz(Y, Z), Y, Z);
  }
  /** Un giro que lleva el +Y (el eje de un cilindro) a `n`. */
  function qEjeY(n) {
    const Y = unitario(n);
    const ref = Math.abs(Y.y) < 0.9 ? ARRIBA : v3(1, 0, 0);
    const Z = unitario(cruz(ref, Y));
    return qDeBase(cruz(Y, Z), Y, Z);
  }
  /** Euler XYZ intrínseco, que es lo que el motor arma con Quat::from_euler. */
  function eulerDeQ(q) {
    const { x, y, z, w } = q;
    const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
    const m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
    const m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
    const ey = Math.asin(Math.max(-1, Math.min(1, m02)));
    if (Math.abs(m02) < 0.9999999) return v3(Math.atan2(-m12, m22), ey, Math.atan2(-m01, m00));
    return v3(Math.atan2(m21, m11), ey, 0);
  }

  /** Un azar estable: la misma secuencia en cada carga, así una prueba puede
   *  contar con ella. `base` separa las secuencias de cada escena. */
  function crearAzar(base) {
    const azar = (i) => {
      let h = Math.imul(i + base, 374761393);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    let semilla = 0;
    return { azar, otro: () => azar(semilla++) };
  }

  return {
    v3, suma, resta, por, punto, cruz, largo, unitario, ARRIBA, ADELANTE, acotar,
    qMul, qConj, qNormal, rotar, qEnX, qEnY, qEnZ, qDeEuler, qDeBase, qMirando, qEjeY, eulerDeQ, crearAzar,
  };
}]);
