// El menú, los resultados y la pausa. Todo en 3D: las canciones son placas,
// las dificultades cubos, JUGAR un cubo blanco con flecha. Cada cosa se toca
// con el puntero (o el clic en el escritorio) o se corta con un sable: en el
// menú, la hoja que atraviesa un botón rápido lo aprieta.
//
// Los récords quedan en localStorage, por canción y dificultad.
(globalThis.__modulos ||= []).push(["sables/menu", [
  "comun/algebra", "sables/datos", "sables/config", "sables/escena", "sables/sables", "sables/sonidos", "sables/musica", "sables/notas",
], (A, D, C, E, S, SN, MU, N) => {
  const { v3, suma, resta, por, largo } = A;
  const el = { menu: E.byId("menu"), resultados: E.byId("resultados"), pausa: E.byId("pausa"), aviso: E.byId("menu_aviso") };
  const sel = { cancion: 0, dificultad: 1, demo: false, sinFallar: false };
  const botones = [];   // { el, accion, grupo: "menu"|"resultados"|"pausa", centro, medio }
  let acciones = {};    // las pone main.js: jugar, repetir, aMenu, seguir, reiniciar

  const leer = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const claveRecord = (c, d) => `sables:record:${c}:${d}`;
  const s0 = leer("sables:seleccion", null);
  if (s0) Object.assign(sel, { cancion: Math.min(D.canciones.length - 1, s0.cancion | 0), dificultad: Math.min(3, s0.dificultad | 0), sinFallar: !!s0.sinFallar });

  /** Un botón: el nodo, qué hace, y la caja donde lo corta un sable (en mundo). */
  function boton(id, grupo, accion) {
    const b = E.byId(id);
    if (!b) return;
    const x = { el: b, accion, grupo, centro: null, medio: null, ultimo: 0 };
    b.addEventListener("toque", () => { if (visible(grupo)) apretar(x); });
    botones.push(x);
  }
  /** Las cajas de corte se miden una vez: posición en mundo de cada botón. */
  function medir() {
    for (const b of botones) {
      let p = v3(0, 0, 0), n = b.el;
      // Sumar las posiciones de los grupos (no hay giros que importen en el menú).
      while (n && n.position) { const q = n.position; p = suma(p, v3(q.x || 0, q.y || 0, q.z || 0)); n = n.parentElement || n.parentNode; if (n && n.id === "menu" || n && n.id === "resultados" || n && n.id === "pausa") break; }
      b.centro = p;
      const sx = +b.el.getAttribute("sx") || 0.3, sy = +b.el.getAttribute("sy") || 0.3, sz = +b.el.getAttribute("sz") || 0.1;
      b.medio = { x: sx / 2 + 0.04, y: sy / 2 + 0.04, z: Math.max(0.12, sz / 2 + 0.06) };
    }
  }
  const visible = (g) => estado.pantalla === g;
  const estado = { pantalla: "menu" };

  function apretar(b) {
    const ahora = performance.now() / 1000;
    if (ahora - b.ultimo < 0.4) return;
    b.ultimo = ahora;
    b.accion();
  }

  /** En el menú, la hoja que cruza rápido un botón lo aprieta. */
  function cortarBotones() {
    for (const s of Object.values(S.sables)) {
      if (!s.base || !s.baseAntes) continue;
      const dt = Math.max(1 / 240, s.t - s.tAntes);
      for (const b of botones) {
        if (!visible(b.grupo) || !b.centro) continue;
        for (let k = 1; k <= 6; k++) {
          const f = 0.1 + 0.9 * (k / 6);
          const p0 = suma(s.baseAntes, por(resta(s.puntaAntes, s.baseAntes), f));
          const p1 = suma(s.base, por(resta(s.punta, s.base), f));
          if (largo(resta(p1, p0)) / dt < 1.4) continue;
          if (N.segmentoCaja(resta(p0, b.centro), resta(p1, b.centro), b.medio) != null) { apretar(b); break; }
        }
      }
    }
  }

  // ── Pintar ────────────────────────────────────────────────────────────────
  function pintarMenu() {
    D.canciones.forEach((c, i) => {
      E.ver(E.byId("cancion_" + i + "_marca"), i === sel.cancion);
      E.attr(E.byId("cancion_" + i), "color", i === sel.cancion ? "#232840" : "#151722");
      const recs = D.dificultades.map((d) => [d, leer(claveRecord(c.id, d.id), null)]).filter(([, r]) => r);
      const r = leer(claveRecord(c.id, D.dificultades[sel.dificultad].id), null);
      E.attr(E.byId("cancion_" + i + "_rec"), "value", r ? `récord ${D.dificultades[sel.dificultad].nombre}: ${r.rango} · ${Math.round(r.puntos).toLocaleString("es")}` : recs.length ? "sin récord en esta dificultad" : "");
    });
    const c = D.canciones[sel.cancion];
    D.dificultades.forEach((d, i) => {
      // El tamaño, en sx/sy/sz: `scale` pisaría el del atributo.
      const g = E.byId("dif_" + i), lado = (i === sel.dificultad ? 0.38 : 0.27).toFixed(2);
      E.attr(g, "sx", lado); E.attr(g, "sy", lado); E.attr(g, "sz", lado);
      E.attr(E.byId("dif_" + i + "_n"), "z", (+lado / 2 + 0.01).toFixed(3));
      E.attr(E.byId("dif_" + i + "_n"), "value", c.mapas[i] ? String(c.mapas[i].cubos) : "");
      E.attr(E.byId("dif_" + i + "_t"), "color", i === sel.dificultad ? "#FFFFFF" : "#8A90A4");
    });
    E.attr(E.byId("op_demo_t"), "value", "Demo: " + (sel.demo ? "sí" : "no"));
    E.attr(E.byId("op_demo"), "color", sel.demo ? "#1F6B3A" : "#2A2D3A");
    E.attr(E.byId("op_nofallar_t"), "value", "Sin fallar: " + (sel.sinFallar ? "sí" : "no"));
    E.attr(E.byId("op_nofallar"), "color", sel.sinFallar ? "#1F6B3A" : "#2A2D3A");
    guardar("sables:seleccion", sel);
  }
  function avisar(t) { E.attr(el.aviso, "value", t || ""); }

  function mostrar(pantalla) {
    estado.pantalla = pantalla;
    E.ver(el.menu, pantalla === "menu");
    E.ver(el.resultados, pantalla === "resultados");
    E.ver(el.pausa, pantalla === "pausa");
    if (pantalla === "menu") pintarMenu();
  }

  /** La vista previa de la canción elegida: desde su primera descarga. */
  function previa() {
    const c = D.canciones[sel.cancion];
    let compas = 0;
    for (const s of c.secciones) { if (s.energia === 3) break; compas += s.compases; }
    MU.previa(c.audio, (compas * 4 * 60) / c.bpm).catch(() => {});
  }

  /** Lo que queda de una partida: rango, puntos, y si es récord. */
  function mostrarResultados(r) {
    const c = D.canciones[sel.cancion], d = D.dificultades[sel.dificultad];
    const clave = claveRecord(c.id, d.id), antes = leer(clave, null);
    const record = !r.fallado && !r.demo && (!antes || r.puntos > antes.puntos);
    if (record) guardar(clave, { puntos: r.puntos, rango: r.rango, combo: r.comboMax, fecha: Date.now() });
    E.attr(E.byId("res_titulo"), "value", r.fallado ? "FALLASTE" : r.demo ? "DEMO TERMINADA" : "¡CANCIÓN COMPLETA!");
    E.attr(E.byId("res_titulo"), "color", r.fallado ? "#FF375F" : "#FFFFFF");
    E.attr(E.byId("res_cancion"), "value", `${c.titulo} · ${d.nombre}${r.sinFallar ? " · sin fallar" : ""}`);
    E.attr(E.byId("res_rango"), "value", r.rango);
    E.attr(E.byId("res_rango"), "color", r.fallado ? "#FF375F" : r.rango === "SS" || r.rango === "S" ? "#FFD60A" : "#FFFFFF");
    E.attr(E.byId("res_puntos"), "value", Math.round(r.puntos).toLocaleString("es"));
    E.attr(E.byId("res_detalle1"), "value", `${(r.porcentaje * 100).toFixed(1)} % · combo máximo ${r.comboMax}`);
    E.attr(E.byId("res_detalle2"), "value", `cortados ${r.cortes} · fallos ${r.fallos} · malos ${r.malos}`);
    E.attr(E.byId("res_detalle3"), "value", r.bombas ? `bombas tocadas ${r.bombas}` : "ninguna bomba tocada");
    E.attr(E.byId("res_record"), "value", record ? "¡NUEVO RÉCORD!" : antes ? `récord: ${antes.rango} · ${Math.round(antes.puntos).toLocaleString("es")}` : "");
    mostrar("resultados");
  }

  function iniciar(a) {
    acciones = a;
    D.canciones.forEach((c, i) => boton("cancion_" + i, "menu", () => { sel.cancion = i; SN.sonar("elegir"); pintarMenu(); previa(); }));
    D.dificultades.forEach((d, i) => boton("dif_" + i, "menu", () => { sel.dificultad = i; SN.sonar("elegir"); pintarMenu(); }));
    boton("op_demo", "menu", () => { sel.demo = !sel.demo; SN.sonar("boton"); pintarMenu(); });
    boton("op_nofallar", "menu", () => { sel.sinFallar = !sel.sinFallar; SN.sonar("boton"); pintarMenu(); });
    boton("jugar", "menu", () => { SN.sonar("boton"); acciones.jugar(); });
    boton("res_repetir", "resultados", () => { SN.sonar("boton"); acciones.jugar(); });
    boton("res_menu", "resultados", () => { SN.sonar("boton"); acciones.aMenu(); });
    boton("pa_seguir", "pausa", () => { SN.sonar("boton"); acciones.seguir(); });
    boton("pa_reiniciar", "pausa", () => { SN.sonar("boton"); acciones.jugar(); });
    boton("pa_menu", "pausa", () => { SN.sonar("boton"); acciones.aMenu(); });
    medir();
    mostrar("menu");
  }

  return { sel, estado, iniciar, mostrar, mostrarResultados, cortarBotones, avisar, previa, pintarMenu, botones };
}]);
