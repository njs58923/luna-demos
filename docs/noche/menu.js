// La maqueta del menú VR: toda la cuenta del layout, en un archivo.
//
// Lo que hay que portar al motor son tres funciones —`enArco`, `distribuir` y
// `fila`— y el orden en que se las llama. El resto es relleno para poder mirarlo.
//
// La idea de fondo: **ningún elemento sabe dónde está**. Cada pieza se registra
// con dos números —`u`, cuánto se corre sobre el arco, y `y`, la altura— y una
// sola función traduce ese par a (x, y, z, ry) según el modo. Cambiar de plano
// a curvo es recorrer la lista otra vez. Si cada nodo trajera su x y su z
// escritas, el modo curvo habría que rehacerlo a mano.
const CFG = globalThis.MENU || {};
const M = CFG.M;
const PALETA = CFG.PALETA || ["#888888"];
const root = hiperspace.dimention;

const BLANCO = "#F2F5FA";
const PLACA = "#1B1F27";
const PLACA_ALTA = "#252A34";
const TENUE = "#8A94A6";

/** Piezas colocables: cada una guarda su coordenada de arco y su altura, no su
 *  posición. `radio` es propio porque la barra vive en un cilindro más chico. */
const piezas = [];

// El modo arranca en curvo salvo que la URL diga otra cosa: `?modo=plano`.
// Existe para poder mirar los dos sin tocar el boton — una captura de cada
// uno, con la misma camara, es lo que hace evidente el problema del plano.
let modo = new URLSearchParams(location.search).get("modo") === "plano" ? "plano" : "curvo";
/** Qué icono apunta el puntero y cuál quedó tocado. Son dos cosas distintas:
 *  uno es dónde está el dedo, el otro qué se eligió. Los dos se dibujan igual
 *  —con el borde blanco— pero sólo el hover levanta el icono. */
let hover = null;
let anclado = null;

/** El arco. El visitante está en el origen mirando a -Z, así que el punto a
 *  `u` metros de arco sobre un cilindro de radio R es:
 *
 *      t = u / R      x = R sen t      z = -R cos t
 *
 *  y el giro para que la pieza lo mire es **ry = -t**. R_y(t) lleva el +Z local
 *  a (sen t, 0, cos t), y la dirección de la pieza al origen es (-sen t, 0,
 *  cos t): sale de igualar las dos. Es la opuesta a la de orientar un arco
 *  hacia el centro de una sala, y se confunden solas. */
function enArco(u, radio, m) {
  if (m === "plano") return { x: u, z: -radio, ry: 0 };
  const t = u / radio;
  return { x: Math.sin(t) * radio, z: -Math.cos(t) * radio, ry: -t };
}

/** n posiciones centradas en cero, con paso fijo. La grilla y la tira de
 *  fijados salen de acá. */
function distribuir(cantidad, paso) {
  const out = [];
  for (let i = 0; i < cantidad; i++) out.push((i - (cantidad - 1) / 2) * paso);
  return out;
}

/** Una fila de anchos distintos: devuelve el centro de cada item y el ancho
 *  total. Es lo que la grilla no puede hacer —ahí todo mide igual— y lo que la
 *  barra necesita, porque un reloj es más ancho que un icono. */
function fila(anchos, hueco) {
  let total = 0;
  for (let i = 0; i < anchos.length; i++) total += anchos[i] + (i ? hueco : 0);
  const centros = [];
  let x = -total / 2;
  for (let i = 0; i < anchos.length; i++) {
    x += anchos[i] / 2;
    centros.push(x);
    x += anchos[i] / 2 + hueco;
  }
  return { centros: centros, total: total };
}

function nodo(tag, padre, attrs) {
  const e = root.createElement(tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  padre.appendChild(e);
  return e;
}

/** `border-radius` en un `plane` es una **fracción del lado**, no metros: el
 *  motor se lo pasa crudo a `create_rounded_plane`, que arma el contorno sobre
 *  un cuadrado unitario con `h = 0.5 - r`. En un `box`, en cambio, el mismo
 *  atributo son metros del mundo y se divide por la escala. Esta función traduce
 *  de lo que uno quiere —milímetros de esquina— a lo que el plane espera. Media
 *  fracción, 0,5, es un círculo. */
function fr(metros, lado) {
  return Math.min(0.499, metros / lado);
}

/** Aclarar un color hacia el blanco. El realce del hover no puede ser un color
 *  fijo: los accesos de la barra traen el color de su app y un gris de más los
 *  borraría a todos por igual. */
function aclarar(hex, k) {
  const v = parseInt(String(hex).replace("#", ""), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const b = Math.round(c[i] + (255 - c[i]) * k);
    out += (b < 16 ? "0" : "") + b.toString(16);
  }
  return out;
}

/** Realce de hover para lo que no lleva borde: el riel, la barra y el botón
 *  de modo. Un icono de la grilla se levanta y se contornea; acá alcanza con
 *  aclarar el color, que es un solo atributo y no pide nodo de más. Se guarda el color propio y se restituye al salir —**pero sólo si
 *  nadie más sigue apuntando**. En VR hay dos rayos: el derecho puede salirse
 *  mientras el izquierdo sigue adentro, y ahí `pointerleave` llega igual. Eso
 *  es lo que `matches(':hover')` contesta, y por eso el leave pregunta antes
 *  de soltar. Es la misma forma que tiene el hover en HTML. */
function realzar(el, base) {
  const alto = aclarar(base, 0.22);
  el.addEventListener("pointerenter", function () {
    el.setAttribute("color", alto);
  });
  el.addEventListener("pointerleave", function () {
    if (!el.matches(":hover")) el.setAttribute("color", base);
  });
}

/** Registrar un grupo como pieza del layout. `rx` sirve para la barra, que se
 *  inclina hacia arriba porque está por debajo de los ojos. */
function pieza(padre, u, y, radio, rx) {
  const g = nodo("group", padre, {});
  const p = { g: g, u: u, y: y, radio: radio, rx: rx || 0 };
  piezas.push(p);
  return g;
}

function colocar(p, m) {
  const a = enArco(p.u, p.radio, m);
  p.g.setAttribute("x", String(a.x));
  p.g.setAttribute("y", String(p.y));
  p.g.setAttribute("z", String(a.z));
  p.g.setAttribute("ry", String(a.ry));
  if (p.rx) p.g.setAttribute("rx", String(p.rx));
}

function aplicar(m) {
  for (let i = 0; i < piezas.length; i++) colocar(piezas[i], m);
}

// ── Iconos ──────────────────────────────────────────────────────────────────
/** La URL de un icono a partir de `categoria/nombre`.
 *
 *  El motor resuelve una textura absoluta tal cual —`resolve_remote_path` deja
 *  pasar cualquier http(s) sin tocarla— así que **colgarlos de un CDN funciona**,
 *  y así estuvo un rato. Pero de veintisiete pedidos en paralelo, dos no
 *  llegaban nunca: `operation timed out` en el log del motor, siempre los mismos
 *  dos, y el icono quedaba en blanco sin que nada fallara a la vista.
 *
 *  Ahora salen de `public/iconos/`, del mismo servidor que el documento. Es lo
 *  que hay que hacer igual en el shell: un menú que necesita internet para
 *  dibujarse no es un menú. */
function url(ico) {
  return CFG.ICONOS + "/" + ico + ".png";
}

/** Ponerle un icono a una pieza que ya tiene color y forma.
 *
 *  Va sobre el **mismo nodo**, no en uno encima: con `texture-face="front"` el
 *  motor entra en modo overlay y el shader hace
 *
 *      base_color.rgb = mix(base_color.rgb, texel.rgb, texel.a)
 *
 *  o sea compone el PNG sobre el color del squircle usando el alfa del PNG. Un
 *  nodo por icono en vez de dos, y sin capa extra en z que pueda parpadear.
 *
 *  De ahí sale la exigencia de que los PNG sean **blancos**: en overlay el color
 *  del glifo lo pone la textura y el atributo `color` es el del fondo. Con los
 *  negros del repo actual el glifo saldría negro sobre el color de la app.
 *
 *  `texture-padding` es lo que lo mete hacia adentro: con p, la textura ocupa
 *  (1 - 2p) del lado y el resto queda como aire alrededor. Sin esto el icono
 *  llega hasta el borde redondeado y el squircle deja de leerse. */
function pintarIcono(nodo, ico, padding) {
  nodo.setAttribute("texture", url(ico));
  nodo.setAttribute("texture-face", "front");
  nodo.setAttribute("texture-fit", "contain");
  nodo.setAttribute("texture-padding", String(padding));
}

/** Un icono: placa redondeada + glifo + etiqueta. El squircle es un `plane`,
 *  no un `box`: `border-radius` es un radio en metros del mundo que se aplica a
 *  los tres ejes de la caja y se topea en 0,499 de cada escala, así que una
 *  tarjeta fina no puede tener esquinas grandes —el radio choca contra el
 *  espesor y la caja se convierte en una esfera. En un `plane` el radio es 2D. */
/** El borde de hover: un plane apenas más grande **detrás** del squircle. El
 *  motor no tiene atributo de contorno, así que el contorno es geometría, y
 *  como va atrás lo único que se ve de él es el anillo que sobresale.
 *
 *  Dos milímetros y medio: menos no se lee a 1,6 m, más deja de ser sutil y se
 *  convierte en un marco.
 *
 *  Nace del **color del icono**, no de un gris ni de un nodo que aparezca al
 *  apuntar: un anillo del mismo color alrededor de la placa no se ve, y encender
 *  el hover es un único `setAttribute` de color. Se enciende y se apaga con el
 *  puntero, y con nada más —ver `aplicarEstado()`. Crear y destruir el borde en
 *  cada entrada costaría dos mutaciones de DOM por icono y una sincronización,
 *  para el mismo píxel.
 *
 *  El radio de la esquina **no** es la misma fracción que la del squircle. Un
 *  contorno concéntrico tiene radio exterior = interior + grosor, y como en un
 *  `plane` el radio es fracción del lado, hay que rehacer la cuenta con el lado
 *  nuevo: repitiendo la fracción original el borde sale más cuadrado que el
 *  icono y asoma en las esquinas. */
const GROSOR_BORDE = 0.0025;
const Z_BORDE = 0.0008;
const Z_HIT = 0.0004;

/** **El blanco del hover no puede ser lo que el hover mueve.** Con el rayo
 *  apuntando cerca del filo, la placa se adelantaba, su silueta en pantalla
 *  cambiaba, el puntero quedaba afuera, salía el `pointerleave`, la placa
 *  volvía —y quedaba otra vez debajo del puntero. Un ciclo cerrado a la
 *  frecuencia del cuadro: parpadeo.
 *
 *  Acercarse no es sólo agrandarse. La pieza se mueve sobre su +z local, que
 *  apunta al **eje** del cilindro, y el ojo está a 1,70 mientras el icono está
 *  a 1,38: al acortarse la distancia horizontal el icono también baja en
 *  pantalla. Por eso el filo se corre y no alcanza con que el objetivo crezca.
 *
 *  La salida es un nodo aparte que **no se mueve nunca** y se lleva el
 *  `touchable`; la placa y el borde pasan a ser decorado. Que funcione depende
 *  de un detalle del motor, verificado en `crates/luna/src/touch.rs`: el
 *  raycast recorre `Query<(&GlobalTransform, &Toqueable, ...)>`, o sea que
 *  **sólo los touchable son candidatos**. Un nodo no-touchable por delante no
 *  tapa el rayo, ni siquiera siendo opaco. Sin eso, la placa de adelante
 *  eclipsaría a su propio hitbox y no habría hover.
 *
 *  Va con la forma y el tamaño exactos del borde, medio milímetro atrás: así
 *  queda oculto siempre —una silueta idéntica y más lejos no asoma por ningún
 *  lado— y el límite del hover coincide con el del anillo. Un rectángulo sin
 *  redondear asomaría por las esquinas.
 *
 *  Y no se hunde detrás de él al tocarlo porque `HUNDIDO < LEVANTE`, y un
 *  `toque` siempre llega con hover: los dos salen del mismo raycast, en el
 *  mismo sistema y el mismo cuadro. */
function icono(padre, u, y, radio, lado, color, texto, tamTexto, ico, id) {
  const g = pieza(padre, u, y, radio, 0);
  const ladoBorde = lado + 2 * GROSOR_BORDE;
  const esquinaBorde = fr(M.esquina * lado + GROSOR_BORDE, ladoBorde);
  const hit = nodo("plane", g, {
    z: M.zIcono - Z_BORDE - Z_HIT, sx: ladoBorde, sy: ladoBorde, color: color,
    "border-radius": esquinaBorde,
    touchable: "true",
  });
  const borde = nodo("plane", g, {
    z: M.zIcono - Z_BORDE, sx: ladoBorde, sy: ladoBorde, color: color,
    "border-radius": esquinaBorde,
    touchable: "false",
  });
  const cara = nodo("plane", g, {
    z: M.zIcono, sx: lado, sy: lado, color: color,
    "border-radius": M.esquina,
    touchable: "false",
  });
  if (id) cara.setAttribute("id", id);
  if (ico) pintarIcono(cara, ico, 0.24);
  if (texto) {
    nodo("text", g, {
      y: M.dyEtiqueta * (lado / M.icono), z: M.zTexto,
      value: texto, size: tamTexto, color: BLANCO,
    });
  }
  // `z` y `zObjetivo` son del acercamiento: dónde está y adónde va. `golpe` es
  // el hundimiento del click y `hasta` el instante en que deja de estar
  // apretado: los dos se persiguen igual que el acercamiento.
  return { grupo: g, hit: hit, cara: cara, borde: borde, color: color,
           u: u, y: y, z: M.zIcono, zObjetivo: M.zIcono, golpe: 0, hasta: 0,
           pendiente: false };
}

/** Un fondo. **No es un nodo**: es una anotación que se cobra al final, cuando
 *  se arma la malla de todos los fondos juntos.
 *
 *  Fue un `<plane>` y no funcionaba, por la razón que este archivo repite en
 *  todos lados: un plano es plano y las piezas van sobre un cilindro. La flecha
 *  del arco sobre el ancho de un fondo es `d² / 2R`, y para el panel —1,27 m de
 *  ancho sobre radio 1,6— eso da **12 cm**: la placa se hunde justo donde los
 *  iconos se adelantan. En la barra el efecto era peor porque cada pieza es
 *  tangente en *su* punto: la placa y el ítem del extremo son dos planos que se
 *  cruzan, y el del extremo salía cortado en recto.
 *
 *  Curvarlo lo arregla de raíz y además deja **acercar los iconos**: el fondo
 *  sigue el arco, así que 8 mm de separación valen igual en el centro que en la
 *  punta. Con el plano había que retranquearlo 30 mm para que no cortara. */
const fondos = [];
function placa(u, y, radio, ancho, alto, color, phi) {
  fondos.push({ u: u, y: y, radio: radio, ancho: ancho, alto: alto,
                color: color, phi: phi || 0 });
}

/** El color de un fondo, de "#RRGGBB" a los cuatro flotantes que pide la malla.
 *  El motor rechaza la malla entera si un canal se va de [0,1]. */
function rgba(hex) {
  const v = parseInt(String(hex).replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
}

/** El perfil de una pastilla: cuánto mide de alto a `x` metros de su centro.
 *  Recto en el medio, arco de radio `r` en las puntas. Es lo que le da la forma
 *  de pastilla sin tener que redondear nada por atributo. */
function medioAlto(x, ancho, alto, r) {
  const d = ancho / 2 - Math.abs(x);
  if (d >= r) return alto / 2;
  const c = r - d;
  return alto / 2 - r + Math.sqrt(Math.max(0, r * r - c * c));
}

/** Todos los fondos en una sola malla.
 *
 *  Para cada muestra a lo largo del fondo se calcula el punto del arco y el
 *  **arriba local**, que no es (0,1,0) sino el (0,1,0) girado `phi` alrededor de
 *  la tangente — que es lo que hace que la barra mire hacia arriba:
 *
 *      n(t)   = (-sen t, 0, cos t)              hacia el visitante
 *      up(t)  = (sen t · sen φ, cos φ, -cos t · sen φ)
 *      normal = n · cos φ + (0,1,0) · sen φ
 *
 *  El orden de los triángulos importa —el motor saca la cara de ahí— y sale de
 *  que (tangente, up, normal) es una terna a derechas: tangente × up = normal. */
function mallaFondos(m) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  for (let f = 0; f < fondos.length; f++) {
    const F = fondos[f];
    const r = Math.min(0.05, F.alto / 2 - 0.001);
    const pasos = Math.max(16, Math.round(F.ancho / 0.02));
    const col = rgba(F.color);
    const base = positions.length / 3;   // en vértices, no en flotantes

    for (let i = 0; i <= pasos; i++) {
      const x = -F.ancho / 2 + (F.ancho * i) / pasos;
      const u = F.u + x;
      const t = m === "plano" ? 0 : u / F.radio;
      const cx = m === "plano" ? u : Math.sin(t) * F.radio;
      const cz = m === "plano" ? -F.radio : -Math.cos(t) * F.radio;
      const sf = Math.sin(F.phi);
      const cf = Math.cos(F.phi);
      const ux = Math.sin(t) * sf, uy = cf, uz = -Math.cos(t) * sf;
      const nx = -Math.sin(t) * cf, ny = sf, nz = Math.cos(t) * cf;
      const h = medioAlto(x, F.ancho, F.alto, r);

      positions.push(cx - ux * h, F.y - uy * h, cz - uz * h);
      positions.push(cx + ux * h, F.y + uy * h, cz + uz * h);
      normals.push(nx, ny, nz, nx, ny, nz);
      colors.push(col[0], col[1], col[2], col[3], col[0], col[1], col[2], col[3]);
    }
    for (let i = 0; i < pasos; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, c, d, b);
    }
  }
  // Arrays **tipados y planos**: la API los quiere así. Pasarle arrays de
  // ternas —[[x,y,z], …]— no da un error de tipo sino
  // «Mesh attributes must be finite and bounded», que manda a buscar un NaN que
  // no existe.
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
  };
}

// ── Construcción ────────────────────────────────────────────────────────────
const contFijados = root.getElementById("fijados");
const contPanel = root.getElementById("panel");
const contBarra = root.getElementById("barra");
const contControles = root.getElementById("controles");

const iconos = [];

/** Los fondos van 8 mm más lejos del visitante que las piezas. Como el fondo
 *  sigue el mismo arco, esa separación vale igual en el centro que en la punta
 *  —que es todo el punto de haberlo hecho con malla. */
const AIRE = 0.008;

/** La grilla. Columnas y filas con paso fijo, centradas en cero: el ancho del
 *  panel sale de la grilla y no al revés. Hacerlo al revés es lo que obliga a
 *  retocar dos números cada vez que se agrega una fila. */
const us = distribuir(M.columnas, M.pasoX);
const vs = distribuir(M.filas, M.pasoY);

for (let f = 0; f < M.filas; f++) {
  for (let c = 0; c < M.columnas; c++) {
    const i = f * M.columnas + c;
    if (i >= CFG.APPS.length) break;
    // vs viene de menor a mayor; la primera fila va arriba.
    const y = M.yGrilla + vs[M.filas - 1 - f];
    iconos.push(icono(contPanel, us[c], y, M.radio, M.icono, PALETA[i % PALETA.length],
                      CFG.APPS[i][0], M.tamEtiqueta, CFG.APPS[i][1], "app_" + i));
  }
}

// La placa del panel se calcula de los extremos reales de la grilla, incluida
// la etiqueta que cuelga de la última fila.
const anchoPanel = (M.columnas - 1) * M.pasoX + M.icono + 0.14;
const arriba = M.yGrilla + vs[M.filas - 1] + M.icono / 2 + 0.05;
const abajo = M.yGrilla + vs[0] + M.dyEtiqueta - M.tamEtiqueta - 0.04;
placa(0, (arriba + abajo) / 2, M.radio + AIRE, anchoPanel, arriba - abajo, PLACA, 0);

// La tira de fijados: arriba del panel, más chica, con su propia placa. En el
// menú de verdad son los anclados del usuario y por eso están afuera de la
// grilla: no participan de la paginación.
const uf = distribuir(CFG.FIJADOS.length, M.pasoFijados);
for (let i = 0; i < CFG.FIJADOS.length; i++) {
  iconos.push(icono(contFijados, uf[i], M.yFijados, M.radio, M.iconoFijado,
                    PALETA[(i + 6) % PALETA.length], CFG.FIJADOS[i][0], M.tamFijado,
                    CFG.FIJADOS[i][1], "fijado_" + i));
}
placa(0, M.yFijados - 0.02, M.radio + AIRE,
      (CFG.FIJADOS.length - 1) * M.pasoFijados + M.iconoFijado + 0.12,
      M.iconoFijado + 0.16, PLACA, 0);

// El riel izquierdo: buscar, menú, inicio. Van **fuera** de la placa, alineados
// a la grilla y no a la placa, porque lo que tiene que leerse alineado son los
// iconos.
const RIEL = CFG.RIEL || [];
for (let i = 0; i < RIEL.length; i++) {
  const g = pieza(contPanel, -(anchoPanel / 2 + 0.085), M.yGrilla + 0.30 - i * 0.18, M.radio, 0);
  const b = nodo("plane", g, {
    sx: 0.066, sy: 0.066, color: PLACA_ALTA, "border-radius": fr(0.018, 0.066), touchable: "true",
  });
  pintarIcono(b, RIEL[i], 0.26);
  realzar(b, PLACA_ALTA);
}

// Los puntos de página, a la derecha. Cinco, con el segundo marcado.
const puntos = distribuir(5, 0.045);
for (let i = 0; i < puntos.length; i++) {
  const g = pieza(contPanel, anchoPanel / 2 + 0.07, M.yGrilla + puntos[puntos.length - 1 - i], M.radio, 0);
  nodo("plane", g, {
    sx: 0.014, sy: 0.014, color: i === 1 ? BLANCO : TENUE,
    "border-radius": 0.5, touchable: "false",
  });
}

// ── La barra ────────────────────────────────────────────────────────────────
// Tres grupos, cada uno con su placa. No es una pastilla sola: una pastilla de
// 1,2 m sobre un cilindro habría que segmentarla, y partida en tres placas
// chicas la curvatura no se nota y además queda dicho qué cosa va con qué.
//
// Cada grupo se arma con `fila`, que acepta anchos distintos —el reloj mide más
// que un icono— y devuelve los centros ya centrados.
const B = CFG.BARRA;
const GRUPOS = [
  { anchos: [0.078, 0.155, 0.046, 0.058],
    tipos: ["avatar", "reloj", "imagen", "imagen"],
    datos: [B.persona, null, B.wifi, B.bateria] },
  { anchos: B.centro.map(function () { return M.itemBarra; }),
    tipos: B.centro.map(function () { return "circulo"; }),
    datos: B.centro },
  { anchos: B.accesos.concat([B.todas]).map(function () { return M.itemBarra; }),
    tipos: B.accesos.map(function () { return "circulo"; }).concat(["todas"]),
    datos: B.accesos.concat([B.todas]) },
];

const anchosGrupo = [];
const filasBarra = [];
for (let i = 0; i < GRUPOS.length; i++) {
  const f = fila(GRUPOS[i].anchos, 0.026);
  filasBarra.push(f);
  anchosGrupo.push(f.total + 0.07);
}
const barra = fila(anchosGrupo, M.huecoGrupo);

for (let gi = 0; gi < GRUPOS.length; gi++) {
  const centroGrupo = barra.centros[gi];
  // phi = -rx: la inclinación se guarda como rotación de nodo (negativa para
  // que la cara mire arriba) y la malla la quiere como ángulo positivo.
  placa(centroGrupo, M.yBarra, M.radioBarra + AIRE, anchosGrupo[gi], M.altoBarra,
        PLACA, -M.inclinacionBarra);
  for (let j = 0; j < GRUPOS[gi].tipos.length; j++) {
    const u = centroGrupo + filasBarra[gi].centros[j];
    const tipo = GRUPOS[gi].tipos[j];
    const dato = GRUPOS[gi].datos[j];
    const g = pieza(contBarra, u, M.yBarra, M.radioBarra, M.inclinacionBarra);

    if (tipo === "reloj") {
      nodo("text", g, { z: M.zGlifo, value: "3:07", size: 0.03, color: BLANCO });

    } else if (tipo === "imagen") {
      // **La otra forma de poner una imagen, y la diferencia importa.** Un
      // `<image>` es un plane texturado donde la imagen *es* el elemento: no hay
      // fondo abajo, `fit` es `contain` por defecto y `unlit` viene en true.
      //
      // Y sobre todo: **no entra en modo overlay, entra en multiply**
      // (`base_color *= texel`), así que acá el atributo `color` sí tiñe el
      // glifo. Es lo que se quiere para el estado —wifi y batería en gris, no en
      // blanco puro— y es exactamente al revés que en el squircle.
      //
      // `material-alpha="blend"` es obligatorio: sin eso lo transparente del PNG
      // se dibuja negro y el icono queda dentro de un cuadrado.
      nodo("image", g, {
        z: M.zGlifo, sx: 0.042, sy: 0.042, src: url(dato), fit: "contain",
        color: j === 3 ? "#4ADE80" : TENUE, "material-alpha": "blend",
        touchable: "false",
      });

    } else {
      // Los accesos de la barra son **círculos**, no squircles: es lo que los
      // distingue de la grilla de un vistazo. Un círculo es un plane con el
      // radio en la mitad del lado — fracción 0,5.
      const apagado = tipo === "todas";
      // El lado sale de `anchos`, no de la constante: el avatar es un poco más
      // grande que un acceso y si se lo dibuja con el ancho genérico queda
      // descentrado respecto del hueco que `fila` le reservó.
      const lado = GRUPOS[gi].anchos[j];
      const col = apagado ? PLACA_ALTA : PALETA[(gi * 3 + j) % PALETA.length];
      const cara = nodo("plane", g, {
        sx: lado, sy: lado, color: col,
        "border-radius": 0.5, touchable: "true",
      });
      pintarIcono(cara, dato, tipo === "avatar" ? 0.28 : 0.26);
      realzar(cara, col);
    }
  }
}

// ── Controles de la maqueta ─────────────────────────────────────────────────
// El botón que alterna plano y curvo. Es el motivo de que exista la escena: en
// plano se ve que las columnas de las puntas quedan de costado y más lejos que
// las del centro, y que las etiquetas se leen torcidas.
const uControl = -(anchoPanel / 2 + 0.32);

const gBoton = pieza(contControles, uControl, M.yGrilla + 0.30, M.radio, 0);
const caraBoton = nodo("plane", gBoton, {
  sx: 0.30, sy: 0.09, color: PLACA_ALTA, "border-radius": fr(0.02, 0.30), touchable: "true",
});
realzar(caraBoton, PLACA_ALTA);
const txtModo = nodo("text", gBoton, { z: M.zGlifo, value: modo, size: 0.035, color: BLANCO });

// Una ficha con las medidas, para poder leerlas adentro sin volver al código.
const gFicha = pieza(contControles, uControl, M.yGrilla - 0.14, M.radio, 0);
nodo("plane", gFicha, { z: M.zPlaca, sx: 0.34, sy: 0.44, color: PLACA, "border-radius": fr(0.02, 0.34), touchable: "false" });
const LINEAS = [
  "radio panel  " + M.radio + " m",
  "radio barra  " + M.radioBarra + " m",
  "icono        " + M.icono + " m",
  "esquina      " + M.esquina + " m",
  "paso x / y   " + M.pasoX + " / " + M.pasoY,
  "grilla       " + M.columnas + " x " + M.filas,
  "item barra   " + M.itemBarra + " m",
  "inclinacion  " + M.inclinacionBarra + " rad",
];
for (let i = 0; i < LINEAS.length; i++) {
  nodo("text", gFicha, {
    x: -0.148, y: 0.175 - i * 0.042, z: M.zGlifo,
    value: LINEAS[i], size: 0.019, color: TENUE,
  });
}
const txtSel = nodo("text", gFicha, {
  x: -0.148, y: -0.185, z: M.zGlifo, value: "apunta un icono", size: 0.019, color: BLANCO,
});

// ── Hover: el borde y el acercamiento ─────────────────────────────
// Apuntar un icono hace dos cosas, y las dos son baratas: le enciende el borde
// y lo **acerca**. El relieve es lo que dice qué se está apuntando; el borde
// sostiene la lectura cuando el icono es oscuro y el fondo también.
//
// El z es local al grupo de la pieza, y el grupo ya está girado para mirar al
// visitante: su +z apunta a los ojos. Por eso acercar es **sumar**, y vale
// igual en el centro que en la punta del arco, en plano o en curvo. Si esto se
// hiciera en coordenadas de mundo habría que rehacer la cuenta por pieza y
// otra vez al cambiar de modo.
//
// **La animación arranca donde el icono está, no donde empezó.** No hay una
// curva que se reproduzca desde cero: cada icono guarda su z y se lo empuja
// hacia el objetivo. Entrar y salir rápido sobre el mismo icono no reinicia
// nada —se da vuelta desde la altura que tenía— y por eso barrer la grilla con
// el puntero no da saltos.
//
// Lo que se mueve acá es **decorado**: la placa y el borde. El nodo que el rayo
// mira se queda quieto —ver el comentario de `icono()`— porque si el objetivo
// del hover se mueve con el hover, el límite se corre bajo el puntero y la
// animación entra en un ciclo de entrar y salir.
const LEVANTE = 0.028;   // cuánto se adelanta un icono al apuntarlo, en metros
const K_Z = 16;          // rapidez del suavizado, en 1/s

// El click **hunde** la placa y la deja volver. Es un segundo número, `golpe`,
// que se resta del acercamiento:
//
//     z = zIcono + acercamiento - golpe
//
// Separarlo del acercamiento es lo que hace que las dos animaciones convívan
// sin pisarse: se puede tocar un icono a mitad de camino de subir, o sacarle el
// puntero mientras se recupera del toque, y cada término sigue su cuenta. Un
// solo número para las dos cosas obligaría a elegir cuál gana.
//
// **El golpe tampoco se escribe: se persigue.** La primera versión metía la
// placa a fondo en un cuadro y la dejaba volver, y eso da las dos cosas que
// están mal: el hundimiento se ve como un salto —no hay bajada, ya está
// abajo— y un segundo toque la devuelve de golpe al fondo, o sea reinicia.
//
// Ahora el toque no fija una profundidad sino una **ventana de tiempo**: el
// icono está apretado hasta `hasta`, y `golpe` corre detrás de ese cuadrado
// con el mismo suavizado exponencial que todo lo demás. Baja y sube en vez de
// aparecer abajo, y tocar de nuevo mientras se recupera **extiende la ventana
// desde donde esté la placa** —no la manda al fondo—, que es el mismo criterio
// que el hover.
//
// El motor no da `pointerdown`/`pointerup`, sólo `toque`, así que la duración
// del apretado la pone el reloj y no el dedo. Con el gatillo analógico de VR se
// podría hundir proporcional a cuánto se aprieta, pero eso pide `posemove`
// dentro de un `<posezone>` y no tiene equivalente en escritorio.
const HUNDIDO = 0.013;   // cuánto se mete la placa al tocarla, en metros
const K_GOLPE = 13;      // rapidez del hundimiento y del retorno, en 1/s
const MS_APRETADO = 105; // cuánto se queda abajo antes de volver

/** Los iconos que todavía se están moviendo. Escribir los diecinueve cada
 *  cuadro sería pagar el puente por nada: lo que se anima es el delta, y casi
 *  siempre es uno o dos. Un icono se saca de la lista al llegar. */
const enVuelo = [];

function empujar(it, z) {
  it.zObjetivo = z;
  if (enVuelo.indexOf(it) === -1) enVuelo.push(it);
}

/** `previo` es el instante del último cuadro, y alcanza como "ahora": está en
 *  la misma base de tiempo que el `ts` de `requestAnimationFrame` —que
 *  `Date.now()` no comparte— y a esta escena le sobran cuadros. */
function golpear(it) {
  it.hasta = previo + MS_APRETADO;
  if (enVuelo.indexOf(it) === -1) enVuelo.push(it);
}

/** El suavizado es `1 - exp(-k dt)` y no `k dt` porque el segundo depende del
 *  cuadro: a 500 fps y a 60 el icono tiene que tardar lo mismo. */
let previo = 0;

function animar(ts) {
  requestAnimationFrame(animar);
  const dt = Math.min(0.05, previo ? (ts - previo) / 1000 : 0.016);
  previo = ts;
  const f = 1 - Math.exp(-K_Z * dt);
  const g = 1 - Math.exp(-K_GOLPE * dt);

  for (let i = enVuelo.length - 1; i >= 0; i--) {
    const it = enVuelo[i];

    // La salida que se quedó esperando a que terminara el golpe. Se aplica
    // antes de mover nada, para que el objetivo nuevo valga ya en este cuadro.
    if (it.pendiente && !enGolpe(it, ts)) {
      it.pendiente = false;
      aplicarEstado(it);
    }

    it.z += (it.zObjetivo - it.z) * f;
    it.golpe += ((ts < it.hasta ? HUNDIDO : 0) - it.golpe) * g;
    // Un exponencial no llega nunca: sin este corte el icono seguiría
    // escribiendo su z para siempre, por milésimas de milímetro. Sale de la
    // lista cuando **los tres** se quedaron quietos: el acercamiento, el golpe
    // y la ventana —que todavía puede tener al icono abajo, esperando.
    if (Math.abs(it.zObjetivo - it.z) < 0.0002 && it.golpe < 0.0002 && ts >= it.hasta) {
      it.z = it.zObjetivo;
      it.golpe = 0;
      enVuelo.splice(i, 1);
    }
    const z = it.z - it.golpe;
    it.cara.setAttribute("z", String(z));
    it.borde.setAttribute("z", String(z - Z_BORDE));
  }
}

/** Lo que un icono muestra sale de una sola pregunta: **si el puntero está
 *  encima**. Borde y levante son la misma respuesta, y por eso salen juntos:
 *  cuando el hover se va, se apagan los dos.
 *
 *  El borde también se encendía con `anclado`, para que un icono tocado
 *  quedara marcado. Se veía igual que el hover y **se leía como trabado**: el
 *  icono bajaba al salir el puntero pero el borde se quedaba blanco, o sea que
 *  la mitad de la salida ocurría y la otra no. Dos estados distintos no pueden
 *  compartir el único signo que hay. `anclado` sigue existiendo —lo dice la
 *  ficha y lo dice el log— pero no pinta nada: lo que se ve de un toque es su
 *  hundimiento. */
function aplicarEstado(it) {
  it.borde.setAttribute("color", it === hover ? BLANCO : it.color);
  empujar(it, it === hover ? M.zIcono + LEVANTE : M.zIcono);
}

/** Si el click todavía se está animando: apretado, o volviendo. */
function enGolpe(it, ahora) {
  return ahora < it.hasta || it.golpe > 0.0005;
}

/** La ficha dice qué se está apuntando; si no hay nada, invita. */
function rotular() {
  const it = hover || anclado;
  txtSel.setAttribute("value", it === null ? "apunta un icono"
                      : "u " + it.u.toFixed(3) + "   y " + it.y.toFixed(2));
}

for (let i = 0; i < iconos.length; i++) {
  (function (it, idx) {
    it.hit.addEventListener("pointerenter", function () {
      hover = it;
      it.pendiente = false;   // volvió antes de que la salida se aplicara
      aplicarEstado(it);
      rotular();
    });

    it.hit.addEventListener("pointerleave", function () {
      // Con dos rayos en VR, el `pointerleave` del derecho no significa que
      // nadie apunte: el izquierdo puede seguir adentro. Eso lo contesta
      // `matches(':hover')`, y es el único motivo para no hacer nada.
      if (it.hit.matches(':hover')) return;

      // **Un icono siempre apaga lo suyo, mande o no en `hover`.** Acá había un
      // `if (hover !== it) return` para no pisar la variable cuando el puntero
      // ya había entrado en otro icono —el enter del nuevo llega antes que el
      // leave del viejo—, y de paso se llevaba puesto el apagado del que sale:
      // el borde quedaba blanco para siempre. Con la gota no se notaba porque
      // era un único objeto compartido y apagarlo era cosa de nadie en
      // particular; con un borde por icono, la limpieza es de cada uno. Lo que
      // se protege es sólo la variable global.
      if (hover === it) hover = null;
      // **La salida espera a que el click termine.** Apretar el gatillo mueve
      // el rayo, y un temblor de un cuadro sacaba el puntero del icono justo
      // mientras se hundía: el icono se iba para abajo y para atrás a la vez y
      // el golpe se comía a medias. El estado lógico igual cambia acá —la ficha
      // dice la verdad en el momento—; lo que se posterga es mostrarlo.
      if (enGolpe(it, previo)) it.pendiente = true;
      else aplicarEstado(it);
      rotular();
    });

    it.hit.addEventListener("toque", function () {
      golpear(it);
      const antes = anclado;
      anclado = anclado === it ? null : it;
      if (antes && antes !== it) aplicarEstado(antes);
      aplicarEstado(it);
      rotular();
      console.log("[menu] icono " + idx + (anclado === it ? " tomado" : " suelto"));
    });
  })(iconos[i], i);
}

function alternar() {
  modo = modo === "curvo" ? "plano" : "curvo";
  aplicar(modo);
  pintarFondos();
  txtModo.setAttribute("value", modo);
  console.log("[menu] modo " + modo);
}

caraBoton.addEventListener("toque", alternar);

// La malla de los fondos. Se crea una sola vez y se **actualiza** al cambiar de
// modo: el número de vértices no cambia entre plano y curvo, así que alcanza con
// reescribir lo que se movió. Crear una malla nueva por cada toque sería gastar
// del tope de 128 recursos, que además no se liberan al cambiar de espacio.
const nodoFondos = root.getElementById("fondos");
let malla = null;

function pintarFondos() {
  const d = mallaFondos(modo);
  if (!malla) {
    malla = MeshResource.create(d);
    nodoFondos.src = malla.src;
    console.log("[menu] fondos: " + fondos.length + " pastillas, " +
                (d.indices.length / 3) + " triangulos en 1 nodo");
  } else {
    // **Los cuatro buffers, siempre.** `update` manda los cinco al motor y los
    // que uno no pasa viajan vacíos, no "sin cambios": con `indices` vacío el
    // motor los regenera implícitos —0,1,2, 3,4,5…— y la malla se convierte en
    // tiras de triángulos entre vértices consecutivos.
    malla.update(d);
  }
}

aplicar(modo);
pintarFondos();
requestAnimationFrame(animar);
console.log("[menu] " + piezas.length + " piezas, " + iconos.length + " iconos");
