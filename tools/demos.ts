// Los demos que se pueden servir estáticos. Los datos salen de
// server_puente/src/servidores.ts; acá quedan sólo los que no necesitan un
// servidor vivo (ver README.md para los que no entran y por qué).
import path from "path";

/** La carpeta que contiene a todos los server_*. */
export const TALLER = path.resolve(import.meta.dir, "..", "..");
export const PAGES = "https://njs58923.github.io/luna-demos";
/** Servidores que no viajan pero a los que se vuelve desde un demo: el puente y
 *  la arcada (la sala de los ecos tiene una puerta de vuelta a la arcada). Sus
 *  enlaces pasan a la portada. */
export const A_LA_PORTADA = [2050, 2060];

export const urlDe = (id: string) => `${PAGES}/${id}`;

export type Demo = {
  id: string;
  dir: string;
  puerto: number;
  entrada: string;
  nombre: string;
  sub: string;
  color: string;
  descripcion: string;
};

export const DEMOS: Demo[] = [
  // Primero noche: los demás usan sus componentes (cielo, puerta).
  { id: "noche", dir: "server_noche", puerto: 2057, entrada: "/index.hsml", color: "#1C2336",
    nombre: "El atrio de noche", sub: "veintiocho escenas",
    descripcion: "Veintiocho escenas, cada una para averiguar algo: cielos, cuevas, un tren, un bosque." },
  { id: "nave", dir: "server_nave", puerto: 2064, entrada: "/index.hsml", color: "#1B2430",
    nombre: "La nave", sub: "tripulantes e impostores",
    descripcion: "El mapa de la Skeld con sus consolas de tarea, quince minijuegos y los conductos. Un jugador." },
  { id: "expo", dir: "server_expo", puerto: 2053, entrada: "/calle.hsml", color: "#2E3A22",
    nombre: "La calle de los objetos", sub: "cosas para llevar a tu mundo",
    descripcion: "Una calle de locales con más de cien objetos que andan: relojes, juegos, instrumentos, mascotas y bloques de panel." },
  { id: "eco", dir: "server_eco", puerto: 2059, entrada: "/index.hsml", color: "#1E3A34",
    nombre: "La sala de los ecos", sub: "un juego de memoria",
    descripcion: "Un juego de memoria sonora: repetir la secuencia de runas. Sin un solo archivo de audio." },
  { id: "ui", dir: "server_ui", puerto: 2058, entrada: "/index.hsml", color: "#2A2440",
    nombre: "El framework de UI", sub: "controles y ventanas",
    descripcion: "Un framework de interfaces al estilo WPF: ventanas, listas, combos y paneles." },
  { id: "manos", dir: "server_manipulador", puerto: 2062, entrada: "/index.hsml", color: "#1E3A5A",
    nombre: "El taller de las manos", sub: "manipular y tirar con arco",
    descripcion: "Para los mandos de VR: mover, girar y escalar un objeto, y un arco para tirarle a dianas y globos." },
  { id: "stress", dir: "server_stress", puerto: 2056, entrada: "/index.hsml", color: "#37576B",
    nombre: "Luna Stress", sub: "banco de pruebas de carga",
    descripcion: "Un test por eje (figuras, includes, isolates, modelos, montaje, scroll) que sube la carga hasta que el motor se cae." },
];
