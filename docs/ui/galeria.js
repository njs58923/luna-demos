// galeria.js — todos los controles, en un solo lugar.
//
// Sirve de dos cosas: de muestrario y de prueba de integración. Si algo se
// rompe, se rompe acá primero, porque es la única página que usa cada tipo del
// framework a la vez.
//
// También estrena los **estilos por tipo**: en vez de repetir
// `FontSize="0.03" Foreground="#A8A8BC"` en veinte líneas, se declara una vez
// qué es un TextBlock en esta aplicación y el marcado se queda con lo que
// distingue a cada uno.
const C = globalThis.UI_CFG.C;
const BASE = globalThis.UI_CFG.base;

const datos = {
  brillo: 60,
  volumen: 25,
  modo: "Equilibrado",
  sonido: true,
  red: false,
  turbo: false,
  etiquetas: [
    { texto: "reactor" }, { texto: "turbina" }, { texto: "condensador" },
    { texto: "compuerta" }, { texto: "sensor" }, { texto: "bomba" },
    { texto: "filtro" }, { texto: "generador" }, { texto: "batería" },
  ],
};

const ESTILOS = {
  TextBlock: { FontSize: "0.03", Foreground: C.textoTenue },
  Button: { FontSize: "0.03", CornerRadius: "0.01" },
  CheckBox: { FontSize: "0.03" },
  RadioButton: { FontSize: "0.03" },
  ToggleSwitch: { FontSize: "0.03" },
};

const PLANTILLA_ETIQUETA = `
<Border Background="${C.superficieAlta}" CornerRadius="0.012" Padding="0.014,0.008">
  <TextBlock Text="{Binding texto}" FontSize="0.026" Foreground="${C.texto}"/>
</Border>
`;

const MARCADO = `
<Border Background="${C.superficie}" BorderBrush="${C.borde}" BorderThickness="0.004"
        CornerRadius="0.022" Padding="0.026">
  <DockPanel>

    <TextBlock DockPanel.Dock="Top" Text="Galería de controles" FontSize="0.046"
               Foreground="${C.texto}" Margin="0,0,0,0.016"/>

    <TabControl SelectedIndex="${(globalThis.APP && globalThis.APP.tab) || 0}" Accent="${C.azul}" FontSize="0.03">

      <TabItem Header="Ajustes">
        <StackPanel Orientation="Vertical" Spacing="0.016" Margin="0,0.018,0,0">
          <Grid ColumnDefinitions="0.2,*,0.13" ColumnSpacing="0.016"
                RowDefinitions="Auto,Auto" RowSpacing="0.016">
            <TextBlock Grid.Row="0" Grid.Column="0" Text="Brillo" VerticalAlignment="Center"/>
            <Slider Grid.Row="0" Grid.Column="1" Minimum="0" Maximum="100" Step="1"
                    Value="{Binding brillo, Mode=TwoWay}" Foreground="${C.amarillo}"
                    ValueChanged="cambio" VerticalAlignment="Center"/>
            <TextBlock Grid.Row="0" Grid.Column="2" Text="{Binding brillo, Format=%v %}"
                       Foreground="${C.amarillo}" TextAlignment="Right"
                       VerticalAlignment="Center"/>

            <TextBlock Grid.Row="1" Grid.Column="0" Text="Volumen" VerticalAlignment="Center"/>
            <Slider Grid.Row="1" Grid.Column="1" Minimum="0" Maximum="100" Step="5"
                    Value="{Binding volumen, Mode=TwoWay}" Foreground="${C.violeta}"
                    ValueChanged="cambio" VerticalAlignment="Center"/>
            <TextBlock Grid.Row="1" Grid.Column="2" Text="{Binding volumen, Format=%v %}"
                       Foreground="${C.violeta}" TextAlignment="Right"
                       VerticalAlignment="Center"/>
          </Grid>

          <Separator/>

          <StackPanel Orientation="Horizontal" Spacing="0.03">
            <ToggleSwitch Content="Sonido" IsChecked="{Binding sonido, Mode=TwoWay}"
                          Accent="${C.verde}" Changed="cambio"/>
            <ToggleSwitch Content="Red" IsChecked="{Binding red, Mode=TwoWay}"
                          Accent="${C.cian}" Changed="cambio"/>
            <CheckBox Content="Turbo" IsChecked="{Binding turbo, Mode=TwoWay}"
                      Accent="${C.naranja}" Changed="cambio"/>
          </StackPanel>
        </StackPanel>
      </TabItem>

      <TabItem Header="Modo">
        <StackPanel Orientation="Vertical" Spacing="0.014" Margin="0,0.018,0,0">
          <TextBlock Text="Perfil de energía" Foreground="${C.texto}"/>
          <RadioButton Group="modo" Content="Ahorro" Value="Ahorro"
                       IsChecked="{Binding esAhorro}" Changed="elegirModo"/>
          <RadioButton Group="modo" Content="Equilibrado" Value="Equilibrado"
                       IsChecked="{Binding esEquilibrado}" Changed="elegirModo"/>
          <RadioButton Group="modo" Content="Rendimiento" Value="Rendimiento"
                       IsChecked="{Binding esRendimiento}" Changed="elegirModo"/>
          <Separator/>
          <TextBlock Text="{Binding resumenModo}" Foreground="${C.amarillo}"/>
        </StackPanel>
      </TabItem>

      <TabItem Header="Etiquetas">
        <StackPanel Orientation="Vertical" Spacing="0.012" Margin="0,0.018,0,0">
          <TextBlock Text="Un WrapPanel: salta de renglón solo"/>
          <ItemsControl ItemsSource="{Binding etiquetas}" ItemTemplate="etiqueta"
                        ItemsPanel="Wrap" Spacing="0.008"/>
          <Separator/>
          <StackPanel Orientation="Horizontal" Spacing="0.012">
            <Button Content="Agregar" Click="agregar" Background="${C.verde}"
                    Foreground="${C.fondo}"/>
            <Button Content="Sacar" Click="sacar" Background="${C.rojo}"
                    Foreground="${C.fondo}"/>
          </StackPanel>
        </StackPanel>
      </TabItem>

    </TabControl>
  </DockPanel>
</Border>
`;

function recomputar() {
  datos.esAhorro = datos.modo === "Ahorro";
  datos.esEquilibrado = datos.modo === "Equilibrado";
  datos.esRendimiento = datos.modo === "Rendimiento";
  datos.resumenModo = datos.modo + " · brillo " + Math.round(datos.brillo) +
                      " % · volumen " + Math.round(datos.volumen) + " %";
}

let siguiente = 1;

const app = new UI.Aplicacion({
  ancho: 1.4,
  alto: 0.95,
  y: 1.58,
  datos: datos,
  estilos: ESTILOS,
  plantillas: { etiqueta: PLANTILLA_ETIQUETA },
  manejadores: {
    cambio: function () { recomputar(); app.invalidar(); },
    elegirModo: function (control) {
      datos.modo = control.valor;
      recomputar();
      app.invalidar();
    },
    agregar: function () {
      datos.etiquetas.push({ texto: "nueva " + siguiente++ });
      app.invalidar();
    },
    sacar: function () {
      datos.etiquetas.pop();
      app.invalidar();
    },
  },
});

recomputar();
app.cargar(MARCADO);
app.correr();

requestAnimationFrame(function () {
  console.log("[galeria] " + app.ultimosTriangulos + " triangulos, " +
              app.textos.items.length + " textos, " +
              app.blancos.items.length + " blancos, " +
              app.ultimoCosto + " ms");
});
