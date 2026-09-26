// Módulos para varios <script src> que llegan en cualquier orden.
//
// Luna carga los <script src> en asíncrono y sin orden garantizado: no hay
// defer ni type="module" (guides/trampas.md). Un script que usa algo de otro en
// su nivel superior puede evaluarse primero y morir con ReferenceError.
//
// Así que un módulo no llama a nada al cargarse: sólo se anota en una cola
// global, que existe aunque este archivo todavía no haya llegado.
//
//   (globalThis.__modulos ||= []).push(["sonido", ["algebra"], (algebra) => {
//     ...
//     return { sonar };            // lo que ven los que dependen de "sonido"
//   }]);
//
// Este archivo, cuando llega, procesa lo que ya estaba en la cola y engancha el
// push para lo que venga después. Cada módulo corre apenas están sus
// dependencias, en el orden que haga falta, sin esperar de más: desde
// localhost todo llega en milisegundos, desde la red cada archivo es un pedido
// aparte y puede tardar cientos de ms o segundos.
//
// El plazo no demora nada: sólo avisa. Si a los PLAZO_MS sigue habiendo
// módulos esperando, un console.error dice cuál espera a cuál. Esperar para
// siempre en silencio es el mismo error que morir con ReferenceError.
(function () {
  const PLAZO_MS = 10000;
  const cola = globalThis.__modulos || (globalThis.__modulos = []);
  if (cola.__cargador) return; // ya estaba: un segundo <script src> del mismo archivo

  /** nombre → lo que devolvió su fábrica */
  const listos = new Map();
  /** [nombre, dependencias, fábrica] que todavía esperan */
  const esperando = [];
  const desde = performance.now();
  let avisado = false;

  function resolver() {
    let avanzo = true;
    while (avanzo) {
      avanzo = false;
      for (let i = 0; i < esperando.length; i++) {
        const [nombre, deps, fabrica] = esperando[i];
        if (!deps.every((d) => listos.has(d))) continue;
        esperando.splice(i--, 1);
        avanzo = true;
        try {
          listos.set(nombre, fabrica(...deps.map((d) => listos.get(d))) || {});
        } catch (e) {
          // Queda sin registrar: los que dependen de él siguen esperando y el
          // plazo los nombra.
          console.error("[modulos] " + nombre + " falló al arrancar:", (e && e.stack) || e);
        }
      }
    }
  }

  function anotar(def) {
    if (!Array.isArray(def) || typeof def[0] !== "string" || typeof def[2] !== "function") {
      console.error("[modulos] definición inválida:", def);
      return;
    }
    if (listos.has(def[0]) || esperando.some((e) => e[0] === def[0])) {
      console.error("[modulos] " + def[0] + " definido dos veces");
      return;
    }
    esperando.push([def[0], def[1] || [], def[2]]);
  }

  for (const def of cola.splice(0)) anotar(def);
  cola.push = function (...defs) {
    for (const def of defs) anotar(def);
    resolver();
    return 0;
  };
  cola.__cargador = true;
  resolver();

  // El aviso, en el bucle de cuadros: no deja un temporizador vivo y se apaga
  // solo cuando no queda nadie esperando.
  function vigilar() {
    if (!esperando.length) return;
    if (!avisado && performance.now() - desde > PLAZO_MS) {
      avisado = true;
      console.error("[modulos] siguen esperando a los " + PLAZO_MS / 1000 + " s: " + esperando
        .map(([n, deps]) => n + " → " + deps.filter((d) => !listos.has(d)).join(", "))
        .join("; "));
    }
    requestAnimationFrame(vigilar);
  }
  requestAnimationFrame(vigilar);
})();
