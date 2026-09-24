// El muestrario gira las piezas despacio: un modelo quieto esconde la mitad de
// sus problemas —una cara sin material, una pata mal puesta— hasta que uno
// camina alrededor, y caminar alrededor de quince piezas es lento.
const raiz = hiperspace.dimention;
const piezas = raiz.getElementsByClass("muestra").map((el) => ({
  el, y: el.position.y, fase: Math.random() * 6.28,
}));

function cuadro(t) {
  const s = t / 1000;
  for (const p of piezas) p.el.rotation = { x: 0, y: Math.PI + Math.sin(s * 0.35 + p.fase) * 0.9, z: 0 };
  requestAnimationFrame(cuadro);
}
requestAnimationFrame(cuadro);
