// Banco de pruebas: el mismo marcado que usa un minijuego de la nave.
(function arranque() {
  if (!globalThis.UI) return void requestAnimationFrame(arranque);
  const app = new UI.Aplicacion({ ancho: 1.46, alto: 1.0, x: 0, y: 1.6, z: 0.06, datos: { mensaje: "hola" } });
  app.cargar(`<Border Background="#080C12" CornerRadius="0.02" Padding="0.022">
      <DockPanel>
        <TextBlock DockPanel.Dock="Bottom" Text="{Binding mensaje}" FontSize="0.042" Foreground="#8E9CB4"/>
        <Canvas>
          <Border Canvas.Left="0.16" Canvas.Top="0.04" Width="0.14" Height="0.76" Background="#16202C" CornerRadius="0.02"/>
          <Button Name="mango" Click="mango" Canvas.Left="0.08" Canvas.Top="0.06" Width="0.3" Height="0.16"
                  Content="" Background="#E74C3C" CornerRadius="0.03"/>
          <Border Name="compuerta" Canvas.Left="0.56" Canvas.Top="0.14" Width="0.6" Height="0.5"
                  Background="#2B3038" CornerRadius="0.02"/>
        </Canvas>
      </DockPanel>
    </Border>`);
  app.manejadores.mango = () => { app.datos.mensaje = "tirado"; app.invalidar(); };
  app.correr();
  console.log("[prueba-ui] montada, raiz=" + (app.raiz ? "si" : "no"));
})();
