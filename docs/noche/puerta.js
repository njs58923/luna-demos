// La puerta: un documento, cincuenta y cinco puertas.
//
// Veintiocho en el anillo del atrio y una de vuelta en cada una de las
// veintisiete escenas. Antes, todo lo que distinguía a una puerta de otra
// viajaba en su URL y se leía de `location.search`:
//
//   ./puerta.hsml?id=cueva&titulo=La%20cueva&sub=una%20onda&num=19&roca=%234A515C
//
// Ahora viaja en **props**, y eso cambia tres cosas de fondo:
//
//   1. Las veintiocho puertas del atrio son **la misma URL**. Con la query eran
//      veintiocho URLs distintas, o sea veintiocho descargas y veintiocho
//      documentos, del mismo archivo.
//   2. Las props se pueden **cambiar sin recargar**. La URL no: para cambiarle
//      una palabra al cartel había que volver a montar el include.
//   3. La puerta puede **contestar**. `component.emit` manda un evento al
//      espacio dueño del include, que es lo único que faltaba.
//
// El (3) es el que reparte de nuevo las responsabilidades. Antes decía acá:
//
//     «El toque se despacha sólo al espacio dueño del nodo, así que un listener
//      puesto desde afuera sobre un nodo de acá no se entera nunca. Por eso el
//      vano tocable lo declara quien usa la puerta.»
//
// Lo primero sigue siendo cierto — `find_owner_space_id` no cambió — pero ya no
// obliga a nada: **el vano vive acá**, recibe su propio toque acá, y lo que
// cruza el borde es el evento, no el nodo. Una puerta es ahora una puerta
// entera, y el que la usa sólo decide a dónde lleva.
//
// Y el último límite, el que obligaba a que alguien de afuera terminara el
// trabajo, se cayó: **la puerta navega sola**.
//
//     hiperspace.world.navigate(destino)
//
// `location.href` sigue navegando el propio include —la escena de destino
// aparecería adentro del marco—, pero `world.navigate` reemplaza el include
// principal del montaje espacial: cambia el mundo entero desde acá adentro. Hace
// falta que el que la usa le **delegue** el permiso:
//
//     <space resources="navigate_self,navigate_world,...">
//       <include src=".../puerta.hsml" resources="navigate_world"
//                props='{"destino":"https://.../cueva.hsml", ...}'/>
//
// Con eso el ciclo entero vive acá: dibuja, recibe el toque, confirma y navega.
// El que la pone ya no escucha nada; sólo dice a dónde lleva.
//
// Dos cosas del contrato que conviene no olvidar:
//
//   - **El destino tiene que ser absoluto.** Las rutas relativas se resuelven
//     contra el documento de la puerta, no contra el mundo que la aloja. La
//     montan servidores que no son el suyo: un "/cueva.hsml" relativo los
//     mandaría a la cueva equivocada.
//   - **La puerta no puede saber si tiene el permiso.** `world.navigate` existe
//     siempre y el rechazo sólo queda en el log del host. Por eso se lo dice
//     explícitamente al no conseguirlo: una puerta que no lleva a nada, sin
//     avisar, es la peor falla posible.
//
// Si no recibe `destino`, cae al canal viejo —emite `abrir` y espera que el
// padre navegue— para no romper a nadie que todavía la monte así.
const root = hiperspace.dimention;

/** Compatibilidad con el montaje viejo, por si esto se despliega contra un
 *  documento que todavía pasa los datos por la query. Se lee una sola vez y
 *  pierde contra las props. */
const P = new URLSearchParams(location.search);
const deLaUrl = {
  id: P.get("id") || "",
  titulo: P.get("titulo") || "",
  sub: P.get("sub") || "",
  num: P.get("num") || "",
  roca: P.get("roca") || "",
  color: P.get("color") || "",
};

/** Los tres tonos salen de uno solo. Escribir tres parámetros sería pedirle a
 *  cada escena que elija una paleta; con uno alcanza, porque lo que hace que una
 *  piedra se lea como piedra no son los colores sino la **relación** entre ellos:
 *  el capitel más claro que el fuste, el plinto más oscuro. */
function tinte(hex, k) {
  const v = parseInt(String(hex).replace("#", ""), 16);
  if (!isFinite(v)) return hex;
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(function (x) {
    return Math.max(0, Math.min(255, Math.round(x * k)));
  });
  return "#" + c.map(function (x) {
    const s = x.toString(16);
    return s.length < 2 ? "0" + s : s;
  }).join("");
}

/** Pintar por clase. `getElementsByClass` evita ponerle un id a cada una de las
 *  veinticuatro piedras. */
function pintarClase(clase, color) {
  const nodos = root.getElementsByClass(clase);
  if (!nodos || !nodos.length) return 0;
  for (let i = 0; i < nodos.length; i++) nodos[i].setAttribute("color", color);
  return nodos.length;
}

/** Las props llegan **antes del primer script**, así que esto no espera a nada.
 *  Lo único que se espera es que existan los nodos, que es otra cosa. */
function leer() {
  const p = (typeof component !== "undefined" && component.props) || {};
  const val = (k, porDefecto) => {
    const v = p[k];
    if (typeof v === "string" && v !== "") return v;
    if (typeof v === "number") return String(v);
    return deLaUrl[k] || porDefecto;
  };
  return {
    id: val("id", ""),
    titulo: val("titulo", "Puerta"),
    sub: val("sub", ""),
    num: val("num", ""),
    roca: val("roca", "#4A515C"),
    /** El color del vano lo pone quien la usa: es lo que ata la puerta a la
     *  paleta de la sala del otro lado. */
    color: val("color", "#16223A"),
    /** A dónde lleva, **absoluto**. Con esto la puerta navega sola. */
    destino: val("destino", ""),
    /** `abriendo` desde que se tocó hasta que el mundo cambia. Antes lo
     *  escribía el padre al atender el evento; ahora la puerta se lo pone a sí
     *  misma, y sólo lo recibe de afuera en el camino viejo del canal. */
    estado: typeof p.estado === "string" ? p.estado : "",
  };
}

/** No se cachea: el canal puede conectar después del primer cuadro, y una
 *  constante leída durante la evaluación del script se quedaría en `false`
 *  para siempre. */
function hayCanal() {
  return typeof component !== "undefined" && component.connected;
}

let anterior = null;
/** Encendido propio del vano cuando la puerta navega sola: no hay padre que le
 *  escriba `estado`, así que se lo pone ella. */
let abriendoSola = false;

function pintar(d) {
  const t = root.getElementById("titulo");
  const s = root.getElementById("sub");
  const n = root.getElementById("num");
  const vano = root.getElementById("vano");
  if (!t || !s || !n || !vano) return false;

  t.setAttribute("value", d.titulo);
  s.setAttribute("value", d.sub);
  n.setAttribute("value", d.num);

  // Sólo repintar la piedra cuando cambió: son veinticuatro setAttribute y en
  // el atrio hay veintiocho puertas.
  if (!anterior || anterior.roca !== d.roca) {
    pintarClase("r-osc", tinte(d.roca, 0.78));
    pintarClase("r-med", d.roca);
    pintarClase("r-alt", tinte(d.roca, 1.26));
  }

  const abriendo = d.estado === "abriendo" || abriendoSola;
  vano.setAttribute("color", abriendo ? tinte(d.color, 1.9) : d.color);
  // El vano sólo se enciende si la puerta lleva a algún lado: con destino, o
  // con un canal por el que avisarle a alguien. Sin ninguno de los dos, un toque
  // acá no llega a ningún lado y una puerta que no lleva a nada es peor que una
  // pared.
  // "inherit" y no "true": `true` es Visibility::Visible de Bevy, que se dibuja
  // aunque un padre este oculto, y sin removeAttribute no hay vuelta atras. Una
  // puerta adentro de un grupo que se oculta tiene que irse con el.
  vano.setAttribute("visible", d.destino || hayCanal() ? "inherit" : "false");

  anterior = d;
  return true;
}

let listo = false;

function frame() {
  if (listo) return;
  const d = leer();
  if (!pintar(d)) return requestAnimationFrame(frame);
  listo = true;

  const vano = root.getElementById("vano");
  vano.addEventListener("toque", function (e) {
    // Se relee: las props pueden haber cambiado desde el primer cuadro.
    const ahora = leer();

    if (ahora.destino) {
      // Confirmar en el mismo cuadro, antes de navegar: la carga de la escena
      // tarda, y un toque sin respuesta visible se repite.
      abriendoSola = true;
      anterior = null;
      pintar(ahora);
      try {
        hiperspace.world.navigate(ahora.destino);
      } catch (error) {
        // Sólo tira por un argumento inválido. El rechazo por permiso no llega
        // acá: queda en el log del host. De ahí el aviso de abajo.
        abriendoSola = false;
        anterior = null;
        pintar(leer());
        console.error("[puerta] destino invalido: " + String(error));
        return;
      }
      console.log("[puerta] " + (ahora.id || "?") + " -> " + ahora.destino +
                  "  (si no pasa nada: el que la monta tiene que delegarle " +
                  "navigate_world en el include)");
      return;
    }

    if (!hayCanal()) {
      console.error("[puerta] toque sin destino ni canal: falta la prop destino");
      return;
    }
    // El id se relee: las props pueden haber cambiado desde el primer cuadro,
    // y mandar el de entonces sería mandar a la sala equivocada.
    // El evento confirma encolado, no que el padre haya hecho algo. Si el padre
    // no lo atiende, la puerta se queda como está, que es lo correcto.
    component.emit("abrir", { id: leer().id, x: e.x, y: e.y, z: e.z })
      .catch(function (error) { console.error("[puerta] " + String(error)); });
  });

  // Se suscribe aunque todavía no esté conectado: `connect` y el primer
  // `propschange` pueden llegar después de este cuadro, y ahí es cuando el vano
  // tiene que encenderse.
  if (typeof component !== "undefined") {
    const repintar = function () { anterior = null; pintar(leer()); };
    component.addEventListener("propschange", repintar);
    component.addEventListener("connect", repintar);
    component.addEventListener("disconnect", repintar);
  }

  console.log("[puerta] " + (d.id || "?") + ": " + d.titulo + " | roca " + d.roca +
              (d.destino ? " | navega sola" : hayCanal() ? " | canal" : " | SIN destino"));
}

requestAnimationFrame(frame);
