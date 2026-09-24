// lista.js — datos, no controles.
//
// Ejercita las cuatro piezas que hacen falta para mostrar información y no sólo
// botones: DockPanel para el armazón, ItemsControl para repetir una plantilla,
// ScrollViewer para lo que no entra, y el recorte geométrico que hace posible lo
// último.
//
// La plantilla de fila se declara **aparte del marcado principal** y se nombra;
// adentro, los enlaces hablan del elemento del arreglo, no del modelo entero. Es
// el DataTemplate de WPF sin el ceremonial de los recursos.
const C = globalThis.UI_CFG.C;

const NOMBRES = [
  "reactor", "bomba de refrigerante", "válvula principal", "sensor de presión",
  "turbina A", "turbina B", "condensador", "compuerta norte", "compuerta sur",
  "generador auxiliar", "banco de baterías", "radiador", "filtro de partículas",
  "línea de vapor", "purga automática", "sensor de nivel", "grúa de servicio",
  "puerta estanca", "extractor", "panel solar",
];

const ESTADOS = [
  { texto: "OK", color: C.verde },
  { texto: "AVISO", color: C.amarillo },
  { texto: "FALLO", color: C.rojo },
  { texto: "APAG", color: C.textoTenue },
];

/** Un generador con semilla: la misma lista en cada carga. Depurar con datos
 *  que cambian solos es depurar dos cosas a la vez. */
let semilla = 20260908;
function azar() {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
  return semilla / 0x7fffffff;
}

function armarFilas() {
  const out = [];
  for (let i = 0; i < NOMBRES.length; i++) {
    const e = ESTADOS[Math.floor(azar() * ESTADOS.length)];
    out.push({
      indice: String(i + 1).padStart(2, "0"),
      nombre: NOMBRES[i],
      estado: e.texto,
      colorEstado: e.color,
      carga: Math.round(azar() * 100),
    });
  }
  return out;
}

const datos = {
  titulo: "Equipos",
  filas: armarFilas(),
  cuenta: "",
  filtro: "todos",
};

function recontar() {
  const fallos = datos.filas.filter(function (f) { return f.estado === "FALLO"; }).length;
  datos.cuenta = datos.filas.length + " equipos, " + fallos + " en fallo";
}

// La plantilla de una fila. Se infla una vez por elemento y se recicla: cambiar
// el arreglo ajusta la cantidad, no rehace el árbol.
const PLANTILLA_FILA = `
<Border Background="${C.superficie}" CornerRadius="0.008" Padding="0.012,0.008">
  <Grid ColumnDefinitions="0.05,*,0.12,0.13" ColumnSpacing="0.012">
    <TextBlock Grid.Column="0" Text="{Binding indice}" FontSize="0.026"
               Foreground="${C.textoTenue}" VerticalAlignment="Center"/>
    <TextBlock Grid.Column="1" Text="{Binding nombre}" FontSize="0.028"
               VerticalAlignment="Center"/>
    <ProgressBar Grid.Column="2" Minimum="0" Maximum="100" Value="{Binding carga}"
                 Foreground="${C.cian}" Height="0.014" VerticalAlignment="Center"/>
    <TextBlock Grid.Column="3" Text="{Binding estado}" FontSize="0.024"
               Foreground="{Binding colorEstado}" TextAlignment="Right"
               VerticalAlignment="Center"/>
  </Grid>
</Border>
`;

const MARCADO = `
<Border Background="${C.fondo}" BorderBrush="${C.borde}" BorderThickness="0.004"
        CornerRadius="0.02" Padding="0.024">
  <DockPanel>

    <Border DockPanel.Dock="Top" Background="${C.superficieAlta}"
            CornerRadius="0.01" Padding="0.016,0.01" Margin="0,0,0,0.016">
      <Grid ColumnDefinitions="*,Auto">
        <TextBlock Grid.Column="0" Text="{Binding titulo}" FontSize="0.044"
                   VerticalAlignment="Center"/>
        <TextBlock Grid.Column="1" Text="{Binding cuenta}" FontSize="0.026"
                   Foreground="${C.textoTenue}" TextAlignment="Right"
                   VerticalAlignment="Center"/>
      </Grid>
    </Border>

    <StackPanel DockPanel.Dock="Bottom" Orientation="Horizontal" Spacing="0.012"
                Margin="0,0.016,0,0">
      <Button Content="Revolver" Click="revolver" Background="${C.violeta}"
              FontSize="0.03"/>
      <Button Content="Todo OK" Click="sanar" Background="${C.verde}"
              Foreground="${C.fondo}" FontSize="0.03"/>
      <Button Content="Quitar" Click="quitar" Background="${C.rojo}"
              Foreground="${C.fondo}" FontSize="0.03"/>
      <Button Content="Reponer" Click="reponer" Background="${C.azul}"
              FontSize="0.03"/>
    </StackPanel>

    <ScrollViewer>
      <ItemsControl ItemsSource="{Binding filas}" ItemTemplate="fila" Spacing="0.006"/>
    </ScrollViewer>

  </DockPanel>
</Border>
`;

const app = new UI.Aplicacion({
  ancho: 1.35,
  alto: 0.95,
  y: 1.58,
  datos: datos,
  plantillas: { fila: PLANTILLA_FILA },
  manejadores: {
    revolver: function () {
      datos.filas = armarFilas();
      recontar();
      app.invalidar();
    },
    sanar: function () {
      for (const f of datos.filas) { f.estado = "OK"; f.colorEstado = C.verde; }
      recontar();
      app.invalidar();
    },
    quitar: function () {
      datos.filas = datos.filas.slice(0, Math.max(0, datos.filas.length - 4));
      recontar();
      app.invalidar();
    },
    reponer: function () {
      datos.filas = armarFilas();
      recontar();
      app.invalidar();
    },
  },
});

recontar();
app.cargar(MARCADO);
app.correr();

requestAnimationFrame(function () {
  console.log("[lista] " + app.ultimosTriangulos + " triangulos, " +
              app.textos.items.length + " textos, " +
              app.blancos.items.length + " blancos, " +
              app.ultimoCosto + " ms, " + datos.filas.length + " filas");
});
