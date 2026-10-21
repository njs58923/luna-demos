// El cuerpo del jugador: dónde están la cintura, las fundas y los bolsillos.
//
// El frente del cuerpo es el giro en Y de la cabeza, que es lo normal: el
// cinturón gira con ella. Lo da readViewerPose con read_hmd_pose (forwardX,
// forwardZ). Una página remota puede no recibir ese permiso: con sólo
// read_camera_pose llega la posición y la orientación en cero. En ese caso el
// frente se estima con las manos, que casi siempre están delante: la dirección
// en planta de la cabeza al punto medio de los mandos, suavizada. Sin manos se
// queda con la última, y al principio mira hacia el recorrido (−Z).
//
// Todo en mundo. Las fundas van a los costados de la cintura, las armas
// colgando con el cañón abajo; los bolsillos de los cargadores, adelante.
(globalThis.__modulos ||= []).push(["juego/cuerpo", ["comun/algebra", "juego/config"], (A, C) => {
  const { v3, suma, resta, por, unitario, qMirando } = A;
  const { CINTURA, FUNDA, BOLSILLO, SUAVIZADO } = C.CUERPO;
  const root = hiperspace.dimention;

  const c = {
    cabeza: v3(0, 1.6, 0),
    frente: v3(0, 0, -1),     // en planta, unitario
    vistaCabeza: false,        // si readViewerPose respondió alguna vez
    mirada: false,             // si readViewerPose trae hacia dónde mira la cabeza
    manos: { left: null, right: null },
  };

  /** La posición de un mando (la de su último posemove). */
  c.mano = (mano, pos) => { c.manos[mano] = pos; };

  function leerCabeza() {
    if (typeof root.readViewerPose !== "function") return;
    const p = root.readViewerPose();
    if (!p || !Number.isFinite(p.px)) return null;
    c.cabeza = v3(p.px, p.py, p.pz);
    c.vistaCabeza = true;
    // Hacia dónde mira, en planta. Con la orientación en cero (sólo
    // read_camera_pose) no hay mirada.
    const fx = p.forwardX ?? p.forward_x ?? 0, fz = p.forwardZ ?? p.forward_z ?? 0;
    const l = Math.hypot(fx, fz);
    return l > 0.2 ? v3(fx / l, 0, fz / l) : null;
  }

  c.animar = (dt) => {
    const mirada = leerCabeza();
    c.mirada = !!mirada;
    if (mirada) {
      // El giro de la cabeza, apenas suavizado para que el cinturón no tiemble.
      const k = 1 - Math.exp(-SUAVIZADO * 3 * dt);
      c.frente = unitario(suma(c.frente, por(resta(mirada, c.frente), k)));
      return;
    }
    const ms = [c.manos.left, c.manos.right].filter(Boolean);
    if (!ms.length) return;
    let medio = v3(0, 0, 0);
    for (const m of ms) medio = suma(medio, m);
    medio = por(medio, 1 / ms.length);
    const d = resta(medio, c.cabeza);
    const plano = v3(d.x, 0, d.z);
    const l = Math.hypot(plano.x, plano.z);
    if (l < 0.12) return;
    const objetivo = por(plano, 1 / l);
    const k = 1 - Math.exp(-SUAVIZADO * dt);
    c.frente = unitario(suma(c.frente, por(resta(objetivo, c.frente), k)));
  };

  /** La derecha del cuerpo, en planta. */
  const derecha = () => v3(-c.frente.z, 0, c.frente.x);
  /** Un punto de la cintura: `lado` a la derecha (negativo, a la izquierda),
   *  `adelante` hacia el frente, `bajo` más abajo de la cintura. */
  function enCintura(lado, adelante, bajo) {
    const cintura = v3(c.cabeza.x, c.cabeza.y - CINTURA - bajo, c.cabeza.z);
    return suma(suma(cintura, por(derecha(), lado)), por(c.frente, adelante));
  }

  /** La pose de un arma en su funda ("right" o "left"): colgando con el cañón
   *  abajo y la parte de arriba hacia el frente; la empuñadura queda atrás,
   *  donde cae la mano. */
  c.funda = (lado) => ({
    p: enCintura((lado === "left" ? -1 : 1) * FUNDA.lado, FUNDA.adelante, FUNDA.bajo),
    q: qMirando(v3(0, -1, 0), c.frente),
  });

  /** Dónde está el bolsillo de los cargadores del lado `lado`. */
  c.bolsillo = (lado) => enCintura((lado === "left" ? -1 : 1) * BOLSILLO.lado, BOLSILLO.adelante, BOLSILLO.bajo);

  return c;
}]);
