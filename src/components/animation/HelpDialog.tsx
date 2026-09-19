"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cómo usar el programa</DialogTitle>
          <DialogDescription>
            Guía rápida de las funciones principales de animación tradicional 2D.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section>
            <h3 className="font-semibold mb-1">1. Dibujar</h3>
            <p className="text-muted-foreground">
              Elegí una herramienta de la barra izquierda (lápiz, pincel, goma, línea,
              rectángulo, elipse, relleno, cuentagotas). Ajustá el tamaño, color y opacidad
              en el mismo panel. La sensibilidad a presión funciona con tabletas gráficas
              compatibles vía Pointer Events.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">2. Crear cuadros nuevos</h3>
            <p className="text-muted-foreground">
              Cada cuadro es un "drawing" independiente. Para avanzar al siguiente cuadro
              vacío pulsá <kbd className="bg-muted px-1.5 rounded">N</kbd>. Para duplicar el
              cuadro actual pulsá <kbd className="bg-muted px-1.5 rounded">D</kbd>. También
              podés usar los botones Nuevo / Duplicar / Borrar en la barra superior de la
              línea de tiempo.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">3. Papel cebolla (Onion Skin)</h3>
            <p className="text-muted-foreground">
              Activá el onion skin en el panel Onion (a la derecha). Verás los cuadros
              anteriores (en naranja) y posteriores (en azul) superpuestos con opacidad
              decreciente. Útil para comparar poses consecutivas y mantener la coherencia
              del movimiento. Activá "Solo cuadro anterior" para el modo luz de mesa.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">4. Exposición de dibujos (timing)</h3>
            <p className="text-muted-foreground">
              Un mismo dibujo puede exponerse durante varios fotogramas (hold). En la
              línea de tiempo, arrastrá el borde derecho de la celda o usá las flechas
              ▲▼ del panel Propiedades. Esto permite trabajar en doses (cada dibujo 2
              frames) o treses (3 frames) sin redibujar.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">5. Capas</h3>
            <p className="text-muted-foreground">
              El proyecto puede tener múltiples capas: dibujo, referencia, fondo y audio.
              Las capas bloqueadas no se pueden editar accidentalmente. Las ocultas no se
              ven durante la edición ni la exportación.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">6. Reproducción</h3>
            <p className="text-muted-foreground">
              Pulsá <kbd className="bg-muted px-1.5 rounded">Espacio</kbd> o el botón ▶
              para reproducir. Cambiá la velocidad con el selector (0.25× a 2×). Activá
              el bucle para repetir. El audio se sincroniza automáticamente con el frame
              actual.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">7. Botones y acciones (estilo Flash)</h3>
            <p className="text-muted-foreground">
              En el panel Botones (a la derecha) podés crear botones interactivos y
              asignarles eventos (clic, presión, entrada/salida del cursor, etc.) y
              acciones (reproducir, pausar, ir a frame, mostrar/ocultar, reproducir
              sonido, cambiar variables). Para probarlos, cambiá a "Modo previsualización"
              desde el menú Ver. El sistema es opcional y no interfiere con la animación
              tradicional.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">8. Atajos de teclado</h3>
            <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
              <li><kbd className="bg-muted px-1.5 rounded">P/B/E/L/R/O/G/V/T/I/H/Z</kbd> — Herramientas</li>
              <li><kbd className="bg-muted px-1.5 rounded">Espacio</kbd> — Reproducir/Pausar</li>
              <li><kbd className="bg-muted px-1.5 rounded">→/←</kbd> — Avanzar/Retroceder un frame</li>
              <li><kbd className="bg-muted px-1.5 rounded">N</kbd> — Nuevo cuadro</li>
              <li><kbd className="bg-muted px-1.5 rounded">D</kbd> — Duplicar cuadro</li>
              <li><kbd className="bg-muted px-1.5 rounded">Ctrl/Cmd+S</kbd> — Guardar</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1">9. Exportar</h3>
            <p className="text-muted-foreground">
              Desde Archivo → Exportar podés elegir formato (GIF animado, secuencia PNG o
              JPEG, frame actual). La exportación respeta el rango, los FPS y la
              resolución que configures. El proyecto original no se modifica.
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1">10. Guardado automático</h3>
            <p className="text-muted-foreground">
              El programa guarda automáticamente cada 30 segundos. También podés guardar
              manualmente con <kbd className="bg-muted px-1.5 rounded">Ctrl/Cmd+S</kbd>.
              Los proyectos se almacenan localmente en el navegador (IndexedDB).
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
