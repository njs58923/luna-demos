// demo.js — la primera interfaz declarada con el framework.
//
// El marcado es una cadena y no un árbol de llamadas a propósito: la promesa de
// WPF es que la interfaz se **declara**, no se construye. Si para poner un botón
// hay que escribir `new Button({...})` y `.agregar(...)`, es una librería de
// widgets, no un framework declarativo.
const C = globalThis.UI_CFG.C;

const MARCADO = `
<Border Background="${C.superficie}" BorderBrush="${C.borde}" BorderThickness="0.004"
        CornerRadius="0.02" Padding="0.03">
  <StackPanel Orientation="Vertical" Spacing="0.022">

    <TextBlock Text="Panel de control" FontSize="0.055" Foreground="${C.texto}"/>
    <Border Background="${C.azul}" Height="0.004"/>

    <Grid ColumnDefinitions="Auto,*,0.22" RowDefinitions="Auto,Auto,Auto"
          ColumnSpacing="0.02" RowSpacing="0.014">

      <TextBlock Grid.Row="0" Grid.Column="0" Text="Estado" FontSize="0.032"
                 Foreground="${C.textoTenue}" VerticalAlignment="Center"/>
      <Border    Grid.Row="0" Grid.Column="1" Background="${C.verde}"
                 CornerRadius="0.008" Height="0.05"/>
      <TextBlock Grid.Row="0" Grid.Column="2" Text="OK" FontSize="0.032"
                 Foreground="${C.verde}" TextAlignment="Right" VerticalAlignment="Center"/>

      <TextBlock Grid.Row="1" Grid.Column="0" Text="Carga" FontSize="0.032"
                 Foreground="${C.textoTenue}" VerticalAlignment="Center"/>
      <Border    Grid.Row="1" Grid.Column="1" Background="${C.amarillo}"
                 CornerRadius="0.008" Height="0.05"/>
      <TextBlock Grid.Row="1" Grid.Column="2" Text="72%" FontSize="0.032"
                 Foreground="${C.amarillo}" TextAlignment="Right" VerticalAlignment="Center"/>

      <TextBlock Grid.Row="2" Grid.Column="0" Text="Fallos" FontSize="0.032"
                 Foreground="${C.textoTenue}" VerticalAlignment="Center"/>
      <Border    Grid.Row="2" Grid.Column="1" Background="${C.rojo}"
                 CornerRadius="0.008" Height="0.05"/>
      <TextBlock Grid.Row="2" Grid.Column="2" Text="3" FontSize="0.032"
                 Foreground="${C.rojo}" TextAlignment="Right" VerticalAlignment="Center"/>
    </Grid>

    <StackPanel Orientation="Horizontal" Spacing="0.018">
      <Border Background="${C.violeta}" CornerRadius="0.012" Padding="0.018,0.012" >
        <TextBlock Text="Uno" FontSize="0.034" Foreground="${C.texto}"/>
      </Border>
      <Border Background="${C.naranja}" CornerRadius="0.012" Padding="0.018,0.012">
        <TextBlock Text="Dos" FontSize="0.034" Foreground="${C.fondo}"/>
      </Border>
      <Border Background="${C.cian}" CornerRadius="0.012" Padding="0.018,0.012">
        <TextBlock Text="Tres" FontSize="0.034" Foreground="${C.fondo}"/>
      </Border>
    </StackPanel>

  </StackPanel>
</Border>
`;

const app = new UI.Aplicacion({ ancho: 1.25, alto: 0.86, y: 1.6 });
app.cargar(MARCADO);
app.correr();

// Una pasada ya corrió al cargar; el informe sale del bucle en el cuadro
// siguiente, cuando `ultimoCosto` ya tiene valor.
requestAnimationFrame(function () {
  console.log("[demo] " + app.ultimosTriangulos + " triangulos, " +
              app.textos.items.length + " textos, " +
              app.blancos.items.length + " blancos, " +
              app.ultimoCosto + " ms de pasada");
});
