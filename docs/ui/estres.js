// estres.js — el framework contra sí mismo.
//
// El primer banco (`banco.js`) midió el motor pelado: cuántos rectángulos entran
// en una malla. Éste mide **el framework**: cuánto cuesta una pasada de layout
// completa, con árbol, enlaces, medición, acomodo y emisión.
//
// Son dos preguntas distintas y conviene no mezclarlas. Si una pasada tarda de
// más, el problema puede estar en el motor o en el framework, y sólo teniendo
// las dos mediciones se sabe cuál.
//
//   /estres.hsml?filas=200&porframe=1
const C = globalThis.UI_CFG.C;
const A = globalThis.APP;

const PALETA = [C.azul, C.rojo, C.verde, C.amarillo, C.violeta, C.naranja, C.cian];

function armarFilas(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      indice: String(i + 1).padStart(3, "0"),
      nombre: "elemento de prueba " + (i + 1),
      valor: (i * 37) % 100,
      color: PALETA[i % PALETA.length],
    });
  }
  return out;
}

const datos = { filas: armarFilas(A.filas), titulo: A.filas + " filas" };

const PLANTILLA = `
<Border Background="${C.superficie}" CornerRadius="0.006" Padding="0.01,0.006">
  <Grid ColumnDefinitions="0.06,*,0.14,0.1" ColumnSpacing="0.01">
    <TextBlock Grid.Column="0" Text="{Binding indice}" FontSize="0.022"
               Foreground="${C.textoTenue}"/>
    <TextBlock Grid.Column="1" Text="{Binding nombre}" FontSize="0.024"/>
    <ProgressBar Grid.Column="2" Minimum="0" Maximum="100" Value="{Binding valor}"
                 Foreground="{Binding color}" Height="0.012"
                 VerticalAlignment="Center"/>
    <TextBlock Grid.Column="3" Text="{Binding valor, Format=%v %}" FontSize="0.022"
               Foreground="{Binding color}" TextAlignment="Right"/>
  </Grid>
</Border>
`;

const MARCADO = `
<Border Background="${C.fondo}" BorderBrush="${C.borde}" BorderThickness="0.004"
        CornerRadius="0.016" Padding="0.02">
  <DockPanel>
    <TextBlock DockPanel.Dock="Top" Text="{Binding titulo}" FontSize="0.04"
               Foreground="${C.texto}" Margin="0,0,0,0.012"/>
    <ScrollViewer>
      <ItemsControl ItemsSource="{Binding filas}" ItemTemplate="fila" Spacing="0.004"/>
    </ScrollViewer>
  </DockPanel>
</Border>
`;

const app = new UI.Aplicacion({
  ancho: 1.4, alto: 0.95, y: 1.58,
  datos: datos,
  plantillas: { fila: PLANTILLA },
});

const t0 = Date.now();
app.cargar(MARCADO);
app.pasada();
console.log("[estres] primera pasada con " + A.filas + " filas: " +
            (Date.now() - t0) + " ms, " + app.ultimosTriangulos + " triangulos, " +
            app.textos.usados + " textos, " + app.blancos.usados + " blancos");

if (A.porFrame) {
  // Invalidar en cada cuadro: mide el peor caso, una interfaz que cambia entera
  // sesenta veces por segundo. Ninguna interfaz de verdad hace esto, y por eso
  // mismo es el número que dice cuánto margen hay.
  let acum = 0, cuadros = 0, ultimo = 0, ms = 0;
  function latir(ts) {
    requestAnimationFrame(latir);
    if (ultimo) acum += ts - ultimo;
    ultimo = ts;
    cuadros++;
    const t = Date.now();
    app.pasada();
    ms += Date.now() - t;
    if (acum > 2000) {
      console.log("[estres] " + (cuadros / (acum / 1000)).toFixed(1) + " fps, " +
                  (ms / cuadros).toFixed(2) + " ms por pasada");
      acum = 0; cuadros = 0; ms = 0;
    }
  }
  requestAnimationFrame(latir);
} else {
  app.correr();
}
