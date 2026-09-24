// espectador.js — la nave vista desde arriba, en un navegador.
//
// Corre la misma simulación que la nave —navegacion.js y estado.js, sin tocar
// una línea— sobre el mismo documento, parseado como XML. Sirve para mirar
// cómo camina la tripulación, a quién caza el impostor y qué dice cada uno en
// la reunión, sin ponerse el visor y a la velocidad que haga falta. No es parte
// del juego: es una ventana para revisarlo.
(async function () {
  "use strict";
  const NAV = globalThis.NAVE_NAV, EST = globalThis.NAVE_ESTADO;
  const $ = (id) => document.getElementById(id);

  // ── El documento ──────────────────────────────────────────────────────────
  const texto = await (await fetch("./", { cache: "no-store" })).text();
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  const num = (el, k, d = 0) => { const v = parseFloat(el.getAttribute(k)); return Number.isFinite(v) ? v : d; };
  const nodo = (el) => ({
    id: el.getAttribute("id"), attr: (k) => el.getAttribute(k),
    x: num(el, "x"), z: num(el, "z"), sx: num(el, "sx", 1), sy: num(el, "sy", 1),
  });
  const porClase = (clase) => [...doc.querySelectorAll("*")].filter((el) => (el.getAttribute("class") || "").split(/\s+/).includes(clase)).map(nodo);
  const porId = (id) => { const el = doc.querySelector(`[id="${id}"]`); return el ? nodo(el) : null; };
  const mundo = NAV.mundoDe({ porId, porClase });
  if (!mundo) { $("reloj").textContent = "el documento no trae #navegacion"; return; }

  const pisos = [...doc.querySelectorAll("plane")].filter((el) => /^piso_/.test(el.getAttribute("id") || ""))
    .map((el) => ({ ...nodo(el), color: el.getAttribute("color"), franja: el.getAttribute("franja"), nombre: el.getAttribute("nombre") }));
  const paredes = [...doc.querySelectorAll("box")].filter((el) => /^pared_/.test(el.getAttribute("id") || ""))
    .map((el) => ({ x: num(el, "x"), z: num(el, "z"), sx: num(el, "sx"), sz: num(el, "sz") }));
  const tripulacion = porClase("tripulante").map((t) => ({ id: t.attr("quien"), nombre: t.attr("nombre"), color: t.attr("tinte") }));
  const color = Object.fromEntries(tripulacion.map((t) => [t.id, t.color]));
  color.local = "#FFFFFF";

  // ── El lienzo ─────────────────────────────────────────────────────────────
  const G = mundo.grilla;
  const ancho = G.cols * G.celda, alto = G.filas * G.celda;
  const lienzo = $("lienzo"), c = lienzo.getContext("2d");
  const ESC = 20;   // px por metro, en el lienzo interno
  lienzo.width = Math.round(ancho * ESC); lienzo.height = Math.round(alto * ESC);
  const X = (x) => (x - G.x0) * ESC, Z = (z) => (z - G.z0) * ESC;

  // El fondo no cambia: se dibuja una vez.
  const fondo = document.createElement("canvas");
  fondo.width = lienzo.width; fondo.height = lienzo.height;
  (function dibujarFondo() {
    const f = fondo.getContext("2d");
    f.fillStyle = "#070A0F"; f.fillRect(0, 0, fondo.width, fondo.height);
    for (const p of pisos) {
      f.fillStyle = p.color || "#20242C";
      f.fillRect(X(p.x - p.sx / 2), Z(p.z - p.sy / 2), p.sx * ESC, p.sy * ESC);
    }
    // Lo que no es libre adentro de una sala: muebles y el borde de las paredes.
    f.fillStyle = "rgba(0,0,0,.28)";
    for (let fi = 0; fi < G.filas; fi++) for (let ci = 0; ci < G.cols; ci++) {
      const i = fi * G.cols + ci;
      if (G.piso[i] && !G.libre[i]) f.fillRect(ci * G.celda * ESC, fi * G.celda * ESC, G.celda * ESC + 0.5, G.celda * ESC + 0.5);
    }
    f.fillStyle = "#39414F";
    for (const w of paredes) f.fillRect(X(w.x - w.sx / 2), Z(w.z - w.sz / 2), w.sx * ESC, w.sz * ESC);
    for (const cons of mundo.consolas) {
      f.fillStyle = "#F1C40F"; f.fillRect(X(cons.x) - 3, Z(cons.z) - 3, 6, 6);
    }
    for (const v of mundo.conductos) {
      f.strokeStyle = "#8E9CB4"; f.lineWidth = 2;
      f.beginPath(); f.arc(X(v.x), Z(v.z), 7, 0, Math.PI * 2); f.stroke();
      f.beginPath(); f.moveTo(X(v.x) - 5, Z(v.z)); f.lineTo(X(v.x) + 5, Z(v.z)); f.stroke();
    }
    f.font = "600 15px system-ui, sans-serif"; f.textAlign = "center";
    for (const p of pisos) {
      if (!p.nombre) continue;
      f.fillStyle = (p.franja || "#8E9CB4") + "CC";
      f.fillText(p.nombre.toUpperCase(), X(p.x), Z(p.z - p.sy / 2) + 20);
    }
  })();

  // ── La partida ────────────────────────────────────────────────────────────
  let tienda = null, antes = null, desde = {}, hasta = {}, jugador = null;
  let acumulado = 0, pausa = false, cierreEn = 0, reinicioEn = 0, arreglo = 0, vistos = 0;
  const TIC = 0.25;

  function nueva(semilla) {
    tienda = EST.crearTienda();
    tienda.despachar("PARTIDA_NUEVA", {
      semilla: semilla >>> 0, jugador: "local", tripulacion, mundo, rolJugador: "tripulante",
      tareas: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, juego: "-", titulo: "-", sala: "cafeteria" })),
    });
    antes = tienda.estado();
    desde = {}; hasta = {};
    for (const id of Object.keys(antes.bots)) desde[id] = hasta[id] = { ...antes.bots[id] };
    cierreEn = reinicioEn = arreglo = 0; vistos = 0;
    if (jugador) tienda.despachar("POSICION", { jugador: "local", ...jugador });
    $("bitacora").innerHTML = "";
    anotar("partida " + (semilla >>> 0) + (verImpostor() ? " · impostor: " + nombre(impostor()) : ""), "");
  }

  const impostor = () => Object.keys(tienda.estado().jugadores).find((id) => tienda.estado().jugadores[id].rol === "impostor");
  const nombre = (id) => id === "local" ? "vos" : ((tienda.estado().jugadores[id] || {}).nombre || id);
  const verImpostor = () => $("verImpostor").checked;

  function anotar(texto, clase) {
    const e = tienda.estado();
    const p = document.createElement("p");
    if (clase) p.className = clase;
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = Math.floor(e.t / 60) + ":" + String(Math.floor(e.t % 60)).padStart(2, "0");
    p.append(t, texto);
    const b = $("bitacora");
    b.append(p);
    b.scrollTop = b.scrollHeight;
  }

  /** Lo que cambió entre un tic y el siguiente, contado. */
  function contar(e, a) {
    for (const q of Object.keys(e.cuerpos)) {
      if (a.cuerpos[q]) continue;
      const cu = e.cuerpos[q];
      const sala = (mundo.salas.find((s) => cu.x >= s.x0 && cu.x <= s.x1 && cu.z >= s.z0 && cu.z <= s.z1) || {}).nombre || "un pasillo";
      anotar(nombre(q) + " murió en " + sala, "muerte");
    }
    for (const id of Object.keys(e.bots)) {
      const b = e.bots[id], b0 = a.bots[id];
      if (b0 && !(b0.oculto > 0) && b.oculto > 0) {
        const testigos = Object.keys(e.bots).filter((t) => e.bots[t].conductos && e.bots[t].conductos[id] === e.t);
        anotar(nombre(id) + " se metió en un conducto" + (testigos.length ? " — lo vio " + testigos.map(nombre).join(", ") : ""), "muerte");
      }
    }
    if (e.sabotaje && !a.sabotaje) anotar(EST.SABOTAJES[e.sabotaje.tipo].nombre, "");
    if (e.fase === "reunion" && a.fase !== "reunion") { anotar("REUNIÓN: " + e.reunion.por, "reunion"); vistos = 0; }
    if (e.reunion) {
      const pasado = EST.REUNION_SEG - e.reunion.restante;
      const dichos = e.reunion.dichos.filter((d) => d.en <= pasado);
      for (const d of dichos.slice(vistos)) anotar(nombre(d.quien) + ": " + d.texto, "dicho");
      vistos = dichos.length;
      if (e.reunion.resultado && !(a.reunion && a.reunion.resultado)) {
        const votos = Object.entries(e.reunion.votos).filter(([q]) => q !== "local").map(([q, v]) => nombre(q) + "→" + (v === "nadie" ? "saltea" : nombre(v)));
        anotar("votos: " + votos.join(", "), "dicho");
        const r = e.reunion.resultado;
        anotar(r === "nadie" ? e.aviso : nombre(r) + " fue expulsado — " + (e.jugadores[r].rol === "impostor" ? "era el impostor" : "no era el impostor"), "reunion");
      }
    }
    if (e.fin && !a.fin) anotar(e.fin === "tripulantes" ? "GANARON LOS TRIPULANTES" : "GANARON LOS IMPOSTORES (era " + nombre(impostor()) + ")", "fin");
  }

  function tic() {
    tienda.despachar("TIC", { dt: TIC });
    const e = tienda.estado();
    contar(e, antes);
    for (const id of Object.keys(e.bots)) {
      const b = e.bots[id];
      desde[id] = hasta[id] || b;
      hasta[id] = b;
      if (Math.hypot(b.x - desde[id].x, b.z - desde[id].z) > 2) desde[id] = b;
    }
    // Lo que en la nave hace el jugador, acá lo hace el espectador solo: saltea
    // en la reunión, la cierra un rato después de que se cuentan los votos, y
    // hace sus tareas a una cada cuarenta segundos. Los sabotajes los arreglan
    // los que caminan.
    if (e.fase === "reunion" && e.reunion && e.reunion.votos.local === undefined && !e.reunion.resultado) tienda.despachar("VOTO", { por: "local", a: "nadie" });
    if (e.reunion && e.reunion.resultado) { cierreEn += TIC; if (cierreEn > 3) { cierreEn = 0; tienda.despachar("REUNION_CERRADA", {}); } }
    const mias = Object.keys(e.tareas).filter((id) => !e.tareas[id].hecha);
    if (mias.length && e.fase === "jugando" && Math.floor(e.t / 40) > Object.keys(e.tareas).length - mias.length) tienda.despachar("TAREA_HECHA", { consola: mias[0] });
    if (e.fin) { reinicioEn += TIC; if (reinicioEn > 6) nueva(Date.now()); }
    antes = tienda.estado();
  }

  // ── Dibujar ───────────────────────────────────────────────────────────────
  function dibujar(f) {
    const e = tienda.estado();
    c.drawImage(fondo, 0, 0);
    const malo = impostor();
    const apagon = e.sabotaje && e.sabotaje.tipo === "luces";
    for (const q of Object.keys(e.cuerpos)) {
      const cu = e.cuerpos[q];
      if (cu.reportado || cu.x == null) continue;
      c.strokeStyle = color[q]; c.lineWidth = 5;
      c.beginPath(); c.moveTo(X(cu.x) - 9, Z(cu.z) - 9); c.lineTo(X(cu.x) + 9, Z(cu.z) + 9);
      c.moveTo(X(cu.x) + 9, Z(cu.z) - 9); c.lineTo(X(cu.x) - 9, Z(cu.z) + 9); c.stroke();
    }
    for (const id of Object.keys(e.bots)) {
      const b = e.bots[id], j = e.jugadores[id];
      if (b.oculto > 0 || !hasta[id]) continue;
      // Los fantasmas —los muertos que siguen con sus tareas— casi no se ven.
      if (!j.vivo && j.rol === "impostor") continue;
      c.globalAlpha = j.vivo ? 1 : 0.22;
      const a = desde[id] || b, z = hasta[id];
      const x = a.x + (z.x - a.x) * f, zz = a.z + (z.z - a.z) * f;
      if ($("verVista").checked && j.rol !== "impostor") {
        c.fillStyle = "rgba(255,255,255,.035)";
        c.beginPath(); c.arc(X(x), Z(zz), (apagon ? EST.VISTA_APAGON : EST.VISTA) * ESC, 0, Math.PI * 2); c.fill();
      }
      if (id === malo && verImpostor()) {
        c.strokeStyle = "#E74C3C"; c.lineWidth = 3;
        c.beginPath(); c.arc(X(x), Z(zz), 14, 0, Math.PI * 2); c.stroke();
        if (b.meta && b.meta.tipo === "cazar" && e.bots[b.meta.presa]) {
          const p = e.bots[b.meta.presa];
          c.setLineDash([4, 5]); c.strokeStyle = "rgba(231,76,60,.55)"; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(X(x), Z(zz)); c.lineTo(X(p.x), Z(p.z)); c.stroke(); c.setLineDash([]);
        }
      }
      c.fillStyle = color[id];
      c.beginPath(); c.arc(X(x), Z(zz), 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#0B0E14"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(x), Z(zz)); c.lineTo(X(x) + Math.sin(z.yaw) * 13, Z(zz) + Math.cos(z.yaw) * 13); c.stroke();
      c.fillStyle = "#E8ECF3"; c.font = "12px system-ui, sans-serif"; c.textAlign = "center";
      c.fillText(j.nombre, X(x), Z(zz) - 14);
      c.globalAlpha = 1;
    }
    if (jugador) {
      c.fillStyle = "#FFFFFF";
      c.beginPath(); c.arc(X(jugador.x), Z(jugador.z), 8, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 1;
      c.beginPath(); c.arc(X(jugador.x), Z(jugador.z), EST.CUIDADO_JUGADOR * ESC, 0, Math.PI * 2); c.stroke();
    }
    if (apagon) { c.fillStyle = "rgba(0,0,10,.35)"; c.fillRect(0, 0, lienzo.width, lienzo.height); }

    const m = Math.floor(e.t / 60), s = Math.floor(e.t % 60);
    const eq = EST.tareasDeEquipo(e);
    $("reloj").textContent = m + ":" + String(s).padStart(2, "0") + " · tareas " + eq.hechas + "/" + eq.total + (e.fase === "reunion" ? " · reunión " + Math.ceil(e.reunion.restante) + " s" : "") +
      (e.sabotaje ? " · " + EST.SABOTAJES[e.sabotaje.tipo].nombre.toLowerCase() : "") + (e.fin ? " · terminó" : "");
    $("gente").innerHTML = Object.keys(e.bots).map((id) => {
      const j = e.jugadores[id], b = e.bots[id];
      const que = !j.vivo ? (j.rol === "impostor" ? "" : "fantasma") : b.oculto > 0 ? "en un conducto" :
        b.meta && b.meta.tipo === "arreglo" ? "arreglando " + b.meta.punto.replace("_", " ") : b.meta && b.meta.tipo === "cazar" && verImpostor() ? "cazando a " + nombre(b.meta.presa)
        : b.espera > 0 ? "en una tarea" : "caminando";
      const rol = verImpostor() && j.rol === "impostor" ? " (impostor)" : "";
      return `<div class="${j.vivo ? "" : "muerto"}"><i style="background:${color[id]}"></i>${j.nombre}${rol}<small>${que}</small></div>`;
    }).join("");
  }

  let ultimo = null;
  function cuadro(t) {
    const dt = ultimo == null ? 0 : Math.min(0.1, (t - ultimo) / 1000);
    ultimo = t;
    if (!pausa) {
      acumulado += dt * +$("velocidad").value;
      let tope = 40;
      while (acumulado >= TIC && tope--) { tic(); acumulado -= TIC; }
    }
    dibujar(Math.min(1, acumulado / TIC));
  }

  $("pausa").onclick = () => { pausa = !pausa; $("pausa").textContent = pausa ? "seguir" : "pausa"; };
  $("otra").onclick = () => nueva(Date.now());
  lienzo.addEventListener("click", (ev) => {
    const r = lienzo.getBoundingClientRect();
    const x = G.x0 + (ev.clientX - r.left) / r.width * ancho, z = G.z0 + (ev.clientY - r.top) / r.height * alto;
    if (!NAV.libre(G, x, z)) { jugador = null; return; }
    jugador = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
    tienda.despachar("POSICION", { jugador: "local", ...jugador });
  });

  const pedida = +(new URLSearchParams(location.search).get("semilla") || 0);
  nueva(pedida || Date.now());
  // Con un intervalo y no con requestAnimationFrame: una ventana tapada por
  // otra deja de recibir cuadros, y la partida se quedaba quieta en 0:00.
  setInterval(() => cuadro(performance.now()), 33);
})();
