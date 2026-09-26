// Las cajas de balas: una junto a cada arma, de cartón, con la tapa abisagrada
// atrás. Por ahora vacías: son para guardar algo especial.
//
// Se abren y se cierran tocándolas (el `toque` del puntero, o un clic en
// escritorio) o tomándolas con una mano libre (comun/interaccion.js, bisagra).
//
// Bajo la tapa hay un botón, AJUSTAR ARMA: se ve con la caja abierta, y entra o
// sale del modo ajuste de su arma (ajustes.js lo engancha en `alAjustar`).
//
// Para meter algo adentro, cada caja expone `interior`: un grupo apoyado en el
// fondo, en el marco de la caja (x a lo ancho, z a lo hondo, y hacia arriba),
// y `alAbrir` / `alCerrar` para enterarse. Por ejemplo:
//
//   const caja = cajas.porArma.pistola;
//   crear("sphere", { y: 0.02, sx: 0.03, sy: 0.03, sz: 0.03, color: "#FFD60A" }, caja.interior);
//   caja.alAbrir = () => { ... };
(globalThis.__modulos ||= []).push(["tiro/cajas", ["comun/algebra", "comun/interaccion", "tiro/config", "tiro/escena", "tiro/sonidos"], (A, I, C, E, S) => {
  const { v3 } = A;
  const { MESA } = C;
  const { crear, escenario } = E;
  const pieza = (padre, tag, attrs) => crear(tag, { touchable: "false", ...attrs }, padre);

  /** Una caja de 50 cartuchos de pistola: 12 × 6 × 8,5 cm. */
  const ANCHO = 0.12, ALTO = 0.06, FONDO = 0.085, PARED = 0.004;
  /** Cuánto se abre la tapa: pasada la vertical, se queda apoyada atrás. */
  const ABIERTA = -1.95;

  /** Junto a cada arma, del lado de la mesa que le queda libre (las dos mesas
   *  tienen la misma altura). */
  const CAJAS = {
    pistola: { x: 0.36, z: -0.62, color: "#7A2B26", tapa: "#6A2420", rotulo: "9mm LUGER" },
    mp5: { x: 0.795, z: -0.7, color: "#3F5E3A", tapa: "#34502F", rotulo: "9×19 mm" },
    mac10: { x: 1.17, z: -0.62, color: "#2F4B63", tapa: "#273F54", rotulo: ".45 ACP" },
    // Las de los rifles, en el extremo derecho de su mesa, junto a las culatas.
    ak47: { x: -0.29, z: -0.3, color: "#8A6A2A", tapa: "#765A22", rotulo: "7.62×39" },
    m4: { x: -0.29, z: -0.62, color: "#5C6B3A", tapa: "#4E5C30", rotulo: "5.56×45 NATO" },
    m14: { x: -0.29, z: -0.95, color: "#4A4F3A", tapa: "#3E4230", rotulo: "7.62×51 NATO" },
  };
  const CARTON = "#E8DCC0", ADENTRO = "#1B1B1B";

  const cajas = Object.keys(CAJAS).map((id) => {
    const c = CAJAS[id];
    const base = v3(c.x, MESA.y, c.z);
    const el = crear("group", { id: "caja_" + id, x: base.x, y: base.y, z: base.z }, escenario);

    // El cuerpo, hueco: el fondo y cuatro paredes, oscuro por dentro.
    pieza(el, "box", { y: PARED / 2, sx: ANCHO, sy: PARED, sz: FONDO, color: c.color });
    pieza(el, "box", { y: PARED + 0.001, sx: ANCHO - 2 * PARED, sy: 0.002, sz: FONDO - 2 * PARED, color: ADENTRO });
    const frente = pieza(el, "box", { id: "caja_frente_" + id, y: ALTO / 2, z: FONDO / 2 - PARED / 2, sx: ANCHO, sy: ALTO, sz: PARED, color: c.color, touchable: "true" });
    pieza(el, "box", { y: ALTO / 2, z: -FONDO / 2 + PARED / 2, sx: ANCHO, sy: ALTO, sz: PARED, color: c.color });
    for (const s of [-1, 1]) pieza(el, "box", { x: s * (ANCHO / 2 - PARED / 2), y: ALTO / 2, sx: PARED, sy: ALTO, sz: FONDO, color: c.color });
    // El rótulo al frente, en su franja clara.
    pieza(el, "box", { y: ALTO * 0.55, z: FONDO / 2 + 0.0005, sx: ANCHO * 0.86, sy: 0.022, sz: 0.001, color: CARTON });
    pieza(el, "text", { y: ALTO * 0.55, z: FONDO / 2 + 0.002, value: c.rotulo, size: 0.013, color: "#2A2A2E" });

    /** Lo que se guarde, va acá: vacío por ahora. */
    const interior = crear("group", { id: "interior_" + id, y: PARED + 0.002 }, el);

    // La tapa, colgada de su bisagra en el borde de atrás: la placa se extiende
    // hacia adelante y termina en una solapa que baja sobre el frente.
    const nodoTapa = crear("group", { id: "tapa_" + id, y: ALTO, z: -FONDO / 2 }, el);
    const placa = pieza(nodoTapa, "box", { id: "tapa_placa_" + id, y: PARED / 2, z: FONDO / 2, sx: ANCHO + 0.004, sy: PARED, sz: FONDO + 0.004, color: c.tapa, touchable: "true" });
    pieza(nodoTapa, "box", { y: -0.008, z: FONDO + 0.002, sx: ANCHO + 0.004, sy: 0.018, sz: PARED, color: c.tapa });
    pieza(nodoTapa, "text", { y: PARED + 0.001, z: FONDO / 2, rx: -Math.PI / 2, value: c.rotulo + " · 50", size: 0.012, color: CARTON });
    // Bajo la tapa, el botón de ajustar: con la caja abierta, la cara de abajo
    // de la tapa mira al que está parado adelante.
    const boton = pieza(nodoTapa, "box", { id: "ajustar_" + id, y: -0.004, z: FONDO / 2, sx: ANCHO * 0.8, sy: 0.006, sz: 0.03, color: "#2A2A38", touchable: "true" });
    const textoBoton = pieza(nodoTapa, "text", { id: "ajustar_texto_" + id, y: -0.0075, z: FONDO / 2, rx: Math.PI / 2, value: "AJUSTAR ARMA", size: 0.011, color: "#FFFFFF" });

    const caja = { id, el, interior, base, alAbrir: null, alCerrar: null, alAjustar: null };
    /** El botón muestra si su arma se está ajustando. */
    caja.marcarAjuste = (activo) => {
      boton.setAttribute("color", activo ? "#30D158" : "#2A2A38");
      textoBoton.setAttribute("value", activo ? "LISTO" : "AJUSTAR ARMA");
      textoBoton.setAttribute("color", activo ? "#0B2A12" : "#FFFFFF");
    };
    boton.addEventListener("toque", () => { if (caja.alAjustar) caja.alAjustar(caja); });
    caja.tapa = I.bisagra({
      nodo: nodoTapa, eje: v3(1, 0, 0), abierta: ABIERTA, velocidad: 7,
      punto: () => v3(base.x, base.y + ALTO, base.z), radio: 0.07,
      alAbrir() { S.sonar("tomar", 0.6); if (caja.alAbrir) caja.alAbrir(caja); },
      alCerrar() { S.sonar("tomar", 0.4); if (caja.alCerrar) caja.alCerrar(caja); },
    });
    for (const n of [placa, frente]) n.addEventListener("toque", () => caja.tapa.alternar());
    return caja;
  });

  const porArma = Object.fromEntries(cajas.map((c) => [c.id, c]));

  return {
    cajas, porArma,
    agarrables: () => cajas.map((c) => c.tapa),
    animar(dt) { for (const c of cajas) c.tapa.animar(dt); },
  };
}]);
