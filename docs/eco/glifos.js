// glifos.js — los seis símbolos, teselados con PathGeometry.
//
// Cada runa tiene su forma además de su color. No es decoración: **un juego de
// memoria que sólo distingue por color no se puede jugar si no distinguís esos
// colores**, y uno de cada doce hombres no distingue el rojo del verde. Con una
// forma distinta por runa, la secuencia se puede seguir igual.
//
// ── Un nodo para los seis ───────────────────────────────────────────────────
//
// Los seis glifos van en **una sola malla**. Como nodos serían seis entidades
// con sus seis materiales; como malla es un `<model>`. Y encender una runa no
// rehace la geometría: se tesela una vez al arrancar y lo único que se reescribe
// son los colores de vértice.
//
// ── Lo que hay que saber de PathGeometry ────────────────────────────────────
//
//   - `positions` es un arreglo **de pares**: `[[x,y], [x,y], …]`, una entrada
//     por vértice. NO es un arreglo plano. Leerlo como plano da NaN en el
//     primer valor y la malla entera se rechaza con un solo mensaje que no dice
//     cuál. Pasó acá, y costó porque las pruebas usaban un doble que devolvía
//     plano: **un doble que no respeta el contrato no verifica nada**.
//   - `strokeWidth: 0` rellena; un valor positivo traza, con puntas redondas.
//   - Los límites son por llamada: 128 comandos, ±1000, 65 536 vértices. Un
//     dibujo grande se parte en varios trazos, no se estira uno.
//   - Es síncrono y no programa nada. Se guarda el resultado y se vuelve a
//     llamar sólo si la forma cambia — acá, nunca.
(function (global) {
  "use strict";

  /** Medio lado del glifo, en metros. La placa mide 0,42, así que 0,105 de
   *  radio deja un margen parejo alrededor. */
  const R = 0.105;
  const TRAZO = 0.016;

  const m = (x, y) => ({ op: "moveTo", x: x, y: y });
  const l = (x, y) => ({ op: "lineTo", x: x, y: y });
  const c = (c1x, c1y, c2x, c2y, x, y) =>
    ({ op: "bezierTo", c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y, x: x, y: y });
  const cerrar = () => ({ op: "close" });

  /** Un círculo con cuatro bézieres. La constante 0.5523 es la que hace que una
   *  cúbica se parezca a un cuarto de circunferencia; con 0.5 el círculo queda
   *  visiblemente cuadrado en las diagonales. */
  const K = 0.55228475;
  function circulo(r) {
    return [
      m(0, -r),
      c(r * K, -r, r, -r * K, r, 0),
      c(r, r * K, r * K, r, 0, r),
      c(-r * K, r, -r, r * K, -r, 0),
      c(-r, -r * K, -r * K, -r, 0, -r),
      cerrar(),
    ];
  }

  /** Un polígono regular.
   *
   *  El ángulo cero cae **abajo**: el vértice sale en (sin 0, -cos 0) = (0, -r),
   *  y en este plano la Y crece hacia arriba. Un triángulo dibujado sin girar
   *  apunta para abajo y se lee como un botón de reproducir, no como un
   *  triángulo. Se vio en la primera captura. Por eso el giro es explícito. */
  function poligono(lados, r, giro) {
    const out = [];
    for (let i = 0; i < lados; i++) {
      const a = (i / lados) * Math.PI * 2 + (giro || 0);
      const x = Math.sin(a) * r;
      const y = -Math.cos(a) * r;
      out.push(i === 0 ? m(x, y) : l(x, y));
    }
    out.push(cerrar());
    return out;
  }

  /** Las seis formas, en el orden de los ecos. Se eligieron para que se
   *  distingan **de lejos y de reojo**, que es como se las va a mirar: un
   *  círculo, un triángulo, una onda, un rombo, una cruz y un anillo.
   *
   *  El anillo es el único con hueco, y sale gratis: con `strokeWidth: 0` el
   *  relleno usa la regla EvenOdd, así que un subtrazo adentro de otro perfora. */
  const FORMAS = [
    { trazo: 0, comandos: circulo(R * 0.78) },
    { trazo: 0, comandos: poligono(3, R, Math.PI) },   // punta arriba
    {
      trazo: TRAZO,
      comandos: [
        m(-R, 0),
        c(-R * 0.5, -R * 0.95, -R * 0.2, R * 0.95, 0, 0),
        c(R * 0.2, -R * 0.95, R * 0.5, R * 0.95, R, 0),
      ],
    },
    { trazo: 0, comandos: poligono(4, R, 0) },
    {
      trazo: TRAZO,
      comandos: [
        m(-R * 0.8, -R * 0.8), l(R * 0.8, R * 0.8),
        m(R * 0.8, -R * 0.8), l(-R * 0.8, R * 0.8),
      ],
    },
    { trazo: 0, comandos: circulo(R * 0.82).concat(circulo(R * 0.46)) },
  ];

  /** sRGB → lineal. **Los colores de vértice se consumen en lineal**: pasar el
   *  valor de sRGB directo hace que un gris oscuro salga lavanda claro. Costó
   *  una corrida averiguarlo en server_ui y vale para cualquier malla. */
  function aLineal(v) {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function rgb(hex) {
    const v = parseInt(String(hex).replace("#", ""), 16);
    return [aLineal(((v >> 16) & 255) / 255),
            aLineal(((v >> 8) & 255) / 255),
            aLineal((v & 255) / 255)];
  }

  /** Teselar una lista de {comandos, trazo, pose} y juntarlas en una malla.
   *
   *  Devuelve `null` si el motor no tiene PathGeometry: el juego se dibuja
   *  igual, sin símbolos. Es una build vieja, no un error del documento.
   *
   *  Es el motor de los glifos y también el de los puntos de progreso: las dos
   *  cosas son lo mismo —formas planas plantadas en el mundo— y tener dos copias
   *  del armado sería tener dos lugares donde equivocarse con el offset de los
   *  índices, que es el error clásico. */
  function armar(entradas) {
    if (typeof PathGeometry === "undefined") {
      console.warn("[glifos] este Luna no tiene PathGeometry: va sin símbolos");
      return null;
    }

    const posiciones = [];
    const indices = [];
    const normales = [];
    const uvs = [];
    /** Dónde empieza y termina cada glifo dentro del buffer de colores. Es lo
     *  que permite repintar uno solo sin volver a teselar nada. */
    const tramos = [];

    for (let i = 0; i < entradas.length; i++) {
      const forma = entradas[i];
      let geo;
      try {
        geo = PathGeometry.tessellate(forma.comandos, {
          tolerance: 0.0002,
          strokeWidth: forma.trazo,
          nonZero: false,
        });
      } catch (e) {
        console.error("[glifos] glifo " + i + ": " + String(e));
        return null;
      }

      const pose = forma.pose;
      const sen = Math.sin(pose.ry);
      const cos = Math.cos(pose.ry);
      const base = posiciones.length / 3;
      const desde = base;

      // XY → XYZ, girado y corrido al frente de su placa. Va 3,5 cm adelante:
      // menos y el z-fighting lo hace parpadear.
      const FRENTE = forma.frente !== undefined ? forma.frente : 0.035;
      for (let k = 0; k < geo.positions.length; k++) {
        const par = geo.positions[k];
        const lx = par[0];
        const ly = par[1];
        posiciones.push(
          pose.x + lx * cos + FRENTE * sen,
          pose.y + ly,
          pose.z - lx * sen + FRENTE * cos,
        );
        normales.push(sen, 0, cos);
        uvs.push(0, 0);
      }
      for (let k = 0; k < geo.indices.length; k++) indices.push(base + geo.indices[k]);
      tramos.push({ desde: desde, hasta: posiciones.length / 3 });
    }

    // El motor rechaza la malla entera con un solo mensaje —"Mesh attributes
    // must be finite and bounded"— y no dice cuál valor ni de qué buffer. Un
    // NaN acá se paga con media hora de adivinar, así que se busca y se nombra.
    const revisar = function (nombre, arr, porVertice) {
      for (let k = 0; k < arr.length; k++) {
        if (!Number.isFinite(arr[k]) || Math.abs(arr[k]) > 1e6) {
          console.error("[glifos] " + nombre + "[" + k + "] = " + arr[k] +
                        " (vértice " + Math.floor(k / porVertice) + " de " +
                        (arr.length / porVertice) + ")");
          return false;
        }
      }
      return true;
    };
    if (!revisar("positions", posiciones, 3) ||
        !revisar("normals", normales, 3) ||
        !revisar("uvs", uvs, 2)) {
      return null;
    }

    return {
      tramos: tramos,
      buffers: {
        positions: new Float32Array(posiciones),
        indices: new Uint32Array(indices),
        normals: new Float32Array(normales),
        uvs: new Float32Array(uvs),
        colors: new Float32Array((posiciones.length / 3) * 4),
      },
      /** Pintar un glifo. No re-tesela: escribe su tramo del buffer de color. */
      pintar: function (i, hex) {
        const t = this.tramos[i];
        if (!t) return;
        const c = rgb(hex);
        const col = this.buffers.colors;
        for (let v = t.desde; v < t.hasta; v++) {
          col[v * 4] = c[0]; col[v * 4 + 1] = c[1]; col[v * 4 + 2] = c[2]; col[v * 4 + 3] = 1;
        }
      },
    };
  }

  /** Los símbolos de las runas, uno por pose. */
  function tesela(poses) {
    const entradas = [];
    for (let i = 0; i < poses.length && i < FORMAS.length; i++) {
      entradas.push({ comandos: FORMAS[i].comandos, trazo: FORMAS[i].trazo, pose: poses[i] });
    }
    return armar(entradas);
  }

  /** Los puntos de progreso: uno por nota de la ronda, en fila.
   *
   *  Existen porque **el juego no decía cuántas notas llevabas**. En una
   *  secuencia de nueve, perder en la séptima y no saber si ibas por la tercera
   *  o por la sexta hace que la ronda siguiente empiece a ciegas.
   *
   *  Van abajo del arco y no sobre las runas: ahí se ven de reojo sin sacar la
   *  vista de lo que hay que mirar. */
  function teselaPuntos(cuantos, op) {
    const o = op || {};
    const r = o.radio || 0.028;
    const paso = o.paso || 0.085;
    const y = o.y !== undefined ? o.y : 1.02;
    const z = o.z !== undefined ? o.z : -2.05;
    const x0 = -((cuantos - 1) / 2) * paso;
    const entradas = [];
    for (let i = 0; i < cuantos; i++) {
      entradas.push({
        comandos: circulo(r),
        trazo: 0,
        // Todos miran al visitante, así que no hay giro: ry = 0 y el frente es
        // +Z, que es de donde se los mira.
        pose: { x: x0 + i * paso, y: y, z: z, ry: 0 },
        frente: 0,
      });
    }
    return armar(entradas);
  }

  global.Glifos = { tesela: tesela, teselaPuntos: teselaPuntos, armar: armar, FORMAS: FORMAS };
})(globalThis);
