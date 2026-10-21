// Carga diferida por áreas: un recorrido lineal partido en documentos, de los
// que sólo están montados el del jugador y sus vecinos.
//
// Cada área es un <include>. Montar uno es crear el nodo; desmontarlo es
// sacarlo, y el motor se lleva con él todo lo suyo: sus nodos, sus modelos, su
// isolate y sus scripts. No hay que llevar la cuenta de qué borrar: el
// include es la unidad de carga y de descarga.
//
//   const carga = crearCarga({
//     padre: byId("mundo"),                 // donde se cuelgan los includes
//     areas: [                              // en orden de recorrido
//       { id: "porton", src: BASE + "/area/porton.hsml",
//         origen: { x: 0, y: 0, z: 0 },    // dónde va su (0,0,0) en el mundo
//         ry: 0,                            // y su giro
//         caja: { min: { x: -8, z: -20 }, max: { x: 8, z: 0 } } },   // en mundo, en planta
//       ...
//     ],
//     alcance: 1,          // cuántas áreas antes y después del actual
//     retencionMs: 4000,   // cuánto espera una que quedó fuera antes de irse
//     recursos: "",        // resources del include (delegados)
//     eventos: "lista",    // events del include
//     alEntrar(area, anterior) {},     // el jugador pasó a otra área
//     alMontar(area, include) {},      // se creó su include
//     alDesmontar(area) {},            // se sacó
//   });
//   carga.actualizar({ x, z });        // en cada cuadro, con la posición del jugador
//
// Qué área es la actual lo decide la caja (en planta, x y z de mundo). Fuera
// de toda caja, sigue la última: el jugador que se asoma a un borde no hace
// saltar nada. Las que quedan lejos no se van en el acto: esperan
// `retencionMs`, por si vuelve; así ir y venir sobre un límite no monta y
// desmonta una y otra vez.
(globalThis.__modulos ||= []).push(["comun/areas", [], () => {
  const root = hiperspace.dimention;

  function crearCarga(o) {
    const areas = o.areas.map((a, i) => ({ ...a, indice: i, include: null, grupo: null, montadaEn: 0, fueraDesde: 0, estado: "fuera" }));
    const alcance = o.alcance ?? 1;
    const retencion = o.retencionMs ?? 4000;
    const c = { areas, actual: null, montadas: () => areas.filter((a) => a.grupo) };

    const dentro = (a, p) => p.x >= a.caja.min.x && p.x <= a.caja.max.x && p.z >= a.caja.min.z && p.z <= a.caja.max.z;

    function montar(a, ahora) {
      if (a.grupo) return;
      const g = root.createElement("group");
      g.setAttribute("id", "area_" + a.id);
      g.setAttribute("x", String(a.origen.x));
      g.setAttribute("y", String(a.origen.y || 0));
      g.setAttribute("z", String(a.origen.z));
      if (a.ry) g.setAttribute("ry", String(a.ry));
      const inc = root.createElement("include");
      inc.setAttribute("id", "include_" + a.id);
      if (o.recursos) inc.setAttribute("resources", o.recursos);
      if (o.eventos) inc.setAttribute("events", o.eventos);
      inc.setAttribute("props", JSON.stringify(a.props || {}));
      inc.setAttribute("src", a.src);
      g.appendChild(inc);
      o.padre.appendChild(g);
      a.grupo = g;
      a.include = inc;
      a.montadaEn = ahora;
      a.estado = "cargando";
      if (o.eventos && /(^|[\s,])lista([\s,]|$)/.test(o.eventos)) {
        inc.addEventListener("component:lista", (e) => {
          a.estado = "lista";
          a.listaEn = performance.now();
          if (o.alLista) o.alLista(a, e.detail);
        });
      }
      if (o.alMontar) o.alMontar(a, inc);
    }

    function desmontar(a) {
      if (!a.grupo) return;
      a.grupo.remove();
      a.grupo = null;
      a.include = null;
      a.estado = "fuera";
      a.fueraDesde = 0;
      if (o.alDesmontar) o.alDesmontar(a);
    }

    /** Con la posición del jugador (en mundo): quién es el actual, qué se
     *  monta y qué se va. Devuelve el área actual. */
    c.actualizar = (p, ahora = performance.now()) => {
      const nueva = areas.find((a) => dentro(a, p)) || c.actual || areas[0];
      if (nueva !== c.actual) {
        const anterior = c.actual;
        c.actual = nueva;
        if (o.alEntrar) o.alEntrar(nueva, anterior);
      }
      const i = c.actual.indice;
      for (const a of areas) {
        const cerca = Math.abs(a.indice - i) <= alcance;
        if (cerca) {
          a.fueraDesde = 0;
          montar(a, ahora);
        } else if (a.grupo) {
          if (!a.fueraDesde) a.fueraDesde = ahora;
          else if (ahora - a.fueraDesde >= retencion) desmontar(a);
        }
      }
      return c.actual;
    };

    /** Sacar todo (fin del juego, o volver a empezar). */
    c.vaciar = () => { for (const a of areas) desmontar(a); c.actual = null; };
    return c;
  }

  return { crearCarga };
}]);
