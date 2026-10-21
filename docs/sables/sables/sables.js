// Los dos sables: rojo en la izquierda, azul en la derecha.
//
// La hoja sigue la dirección del rayo del mando (la misma con la que Luna
// apunta, `dx dy dz` del posemove): es lo que en la mano se siente como
// "adelante". Cada cuadro se guarda dónde estaba la hoja antes y dónde está
// ahora: el corte se busca en el barrido entre las dos (notas.js), no en la
// hoja quieta, así un golpe rápido no atraviesa un cubo sin tocarlo.
//
// La historia de la punta (los últimos 500 ms) sirve para el puntaje: cuánto
// giró la hoja antes del corte (envión) y después (remate).
(globalThis.__modulos ||= []).push(["sables/sables", ["comun/algebra", "sables/config", "sables/escena"], (A, C, E) => {
  const { v3, suma, por, punto, resta, largo, unitario, rotar, qEjeY, qEnX } = A;
  const LADOS = { left: "i", right: "d" };

  const nuevo = (mano) => ({
    mano, el: E.byId("sable_" + LADOS[mano]), pos: null, dir: v3(0, 0, -1),
    base: null, punta: null, baseAntes: null, puntaAntes: null, t: 0, tAntes: 0,
    historia: [], boton: false, visto: 0, demo: false, arriba: 0, nativo: false, ladoAncla: null, tramos: [],
  });
  const sables = { left: nuevo("left"), right: nuevo("right") };
  let ultimaPose = -1e9, alPausar = null;
  const anchors = globalThis.dimension && dimension.anchors;
  const namespace = "sables-" + Math.random().toString(36).slice(2);

  /** Poner la hoja: la mano en `pos`, apuntando a `dir`. */
  function ubicar(s, pos, dir, t, dibujar = true) {
    const previa = s.base && { base: s.base, punta: s.punta, t: s.t };
    s.pos = pos;
    s.dir = unitario(dir);
    s.base = suma(pos, por(s.dir, C.mango));
    s.punta = suma(pos, por(s.dir, C.mango + C.hoja));
    s.t = t;
    s.historia.push({ t, base: s.base, punta: s.punta, dir: s.dir });
    while (s.historia.length && t - s.historia[0].t > 0.5) s.historia.shift();
    E.ver(s.el, true);
    if (dibujar) E.poner(s.el, pos, qEjeY(s.dir));
    else if (previa) {
      if (s.tramos.length >= 64) { s.tramos.length = 0; s.baseAntes = null; }
      s.tramos.push({ baseAntes: previa.base, puntaAntes: previa.punta, tAntes: previa.t,
        base: s.base, punta: s.punta, t: s.t, dir: s.dir });
    }
  }

  /** La dirección de la hoja: la del rayo del mando, levantada
   *  C.INCLINACION grados alrededor del eje X del mando (hacia su lado de
   *  arriba). El rayo sale del -Y de la pose grip y en la mano queda bajo.
   *  Cuál de ±Z del mando es "arriba" depende del runtime: se aprende de
   *  cómo se lo sostiene mientras apunta más o menos horizontal. */
  function inclinar(s, evt) {
    const dir = unitario(v3(evt.dx, evt.dy, evt.dz));
    const a = (C.INCLINACION || 0) * Math.PI / 180;
    if (!a || evt.qw == null) return dir;
    const z = rotar({ x: evt.qx, y: evt.qy, z: evt.qz, w: evt.qw }, v3(0, 0, 1));
    // El eje Z del mando, sin la parte a lo largo del rayo.
    const p = resta(z, por(dir, punto(z, dir)));
    if (largo(p) < 0.3) return dir;
    const u = unitario(p);
    if (Math.abs(dir.y) < 0.6) s.arriba = Math.max(-1, Math.min(1, s.arriba + u.y * 0.05));
    const lado = s.arriba < 0 ? -1 : 1;
    return unitario(suma(por(dir, Math.cos(a)), por(u, lado * Math.sin(a))));
  }

  /** Lo que llega de un mando. Devuelve true si se apretó B / Y (pausa). */
  function onPose(evt, t) {
    const mano = evt.hand === "left" ? "left" : "right";
    const s = sables[mano];
    if (s.nativo && s.inputNativo) return false;
    ultimaPose = t;
    s.visto = t;
    const antes = s.boton;
    s.boton = !!evt.secondary;
    if (!s.demo && !s.nativo && evt.dx != null) ubicar(s, v3(evt.px, evt.py, evt.pz), inclinar(s, evt), t);
    return !antes && s.boton;
  }

  /** Al empezar cada cuadro: lo de ahora pasa a ser lo de antes. */
  function cerrarCuadro() {
    for (const s of Object.values(sables)) {
      s.baseAntes = s.base; s.puntaAntes = s.punta; s.tAntes = s.t;
      s.tramos.length = 0;
    }
  }

  function reiniciar(s) {
    s.base = s.punta = s.baseAntes = s.puntaAntes = null;
    s.historia.length = s.tramos.length = 0;
  }
  function programaSable(s, lado) {
    const q = qEnX(lado * (Math.PI - (C.INCLINACION || 0) * Math.PI / 180));
    return { type: "program", version: 1, inputs: { mano: s.mano + "-grip" },
      constants: { offset: [q.x, q.y, q.z, q.w] }, code: `
        input pose mano
        const quat offset
        output pose result = mano
        multiplyQuat result.rotation, mano.rotation, offset
      ` };
  }
  function anclar(s) {
    if (!s.el || !s.nativo || s.demo) return;
    const lado = s.arriba < 0 ? -1 : 1;
    s.ladoAncla = lado;
    s.el.position = v3(0, 0, 0);
    if (anchors && anchors.supportsPrograms) {
      s.programWanted = lado;
      if (!s.programPending && s.programSide !== lado && s.programFailed !== lado) {
        s.programPending = true;
        const key = s.programKey || (s.programKey = namespace + "-" + s.mano);
        anchors.create(key, programaSable(s, lado)).then(handle => {
          s.programPending = false;
          if (s.demo || s.programWanted == null) { handle.dispose().catch(() => {}); return; }
          s.programHandle = handle; s.programSide = lado;
          reiniciar(s); anclar(s);
        }).catch(error => { s.programPending = false; s.programFailed = lado; console.error("Programa del sable:", error); });
      }
      if (s.programHandle) {
        E.attr(s.el, "anchor", s.programKey); E.rot(s.el, 0, 0, 0); return;
      }
    }
    E.attr(s.el, "anchor", s.mano + "-grip");
    E.rot(s.el, lado * (Math.PI - (C.INCLINACION || 0) * Math.PI / 180), 0, 0);
  }
  function activarDemo(si) {
    for (const s of Object.values(sables)) {
      s.demo = !!si; reiniciar(s);
      if (si) {
        s.programWanted = null;
        if (s.programHandle) { s.programHandle.dispose().catch(() => {}); s.programHandle = null; s.programSide = null; }
        E.attr(s.el, "anchor", ""); s.ladoAncla = null;
      }
      else anclar(s);
    }
  }
  function iniciarAnclas() {
    const anchors = globalThis.dimension && dimension.anchors;
    if (!anchors || typeof anchors.listen !== "function") return;
    const manos = [sables.left, sables.right];
    try {
      const listener = anchors.listen(["left-grip", "right-grip", ...manos.map(s => s.el)], frame => {
        const t = frame.timestamp / 1000;
        let pausar = false;
        for (let i = 0; i < manos.length; i++) {
          const s = manos[i], grip = frame.samples[i], sample = frame.samples[i + 2];
          s.inputNativo = !!grip.input;
          if (grip.available && grip.input) {
            pausar ||= !s.boton && grip.input.secondary; s.boton = !!grip.input.secondary;
          }
          if (s.demo) continue;
          if (frame.discontinuous) reiniciar(s);
          if (!grip.available || !sample.available || largo(resta(sample.position, grip.position)) > 0.002) { reiniciar(s); continue; }
          ultimaPose = s.visto = t;
          const q = grip.rotation, d = rotar(q, v3(0, -1, 0));
          inclinar(s, { dx: d.x, dy: d.y, dz: d.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
          const lado = s.arriba < 0 ? -1 : 1;
          if (s.ladoAncla !== lado) { anclar(s); reiniciar(s); }
          ubicar(s, sample.position, rotar(sample.rotation, v3(0, 1, 0)), t, false);
        }
        if (pausar && alPausar) alPausar();
      }, { priority: "input", delivery: "history" });
      for (const s of manos) { s.nativo = true; anclar(s); }
      return listener;
    } catch (e) { console.error("Anclajes de sables:", e); }
  }
  const listener = iniciarAnclas();

  /** Cuánto barrió la hoja entre t0 y t1 en el sentido `sentido` (la
   *  velocidad del corte), en grados: lo que viajó la punta medido en radios
   *  de hoja, contando sólo el movimiento hacia ese lado. Así cuenta el brazo
   *  que barre sin girar la muñeca, y no cuenta el ir y volver. */
  function barrido(s, t0, t1, sentido) {
    const h = s.historia;
    let viaje = 0;
    for (let i = 1; i < h.length; i++) {
      if (h[i].t <= t0 || h[i].t > t1) continue;
      const d = { x: h[i].punta.x - h[i - 1].punta.x, y: h[i].punta.y - h[i - 1].punta.y, z: h[i].punta.z - h[i - 1].punta.z };
      const k = sentido ? d.x * sentido.x + d.y * sentido.y + d.z * sentido.z : Math.hypot(d.x, d.y, d.z);
      if (k > 0) viaje += k;
    }
    return (viaje / (C.mango + C.hoja)) * 180 / Math.PI;
  }

  const hayMandos = (t) => t - ultimaPose < 2;
  function ocultar() { for (const s of Object.values(sables)) E.ver(s.el, false); }

  return { sables, programaSable, listener, escucharPausa(fn) { alPausar = fn; }, activarDemo, onPose, ubicar, cerrarCuadro, barrido, hayMandos, ocultar };
}]);
