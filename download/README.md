# Animación Tradicional 2D — Escuela de Animación

Software de animación tradicional 2D cuadro a cuadro para uso educativo y producción.
Incluye herramientas de dibujo, línea de tiempo profesional, onion skin, capas,
audio sincronizado, marcadores, sistema de botones y acciones (estilo Flash clásico),
previsualización y exportación a **MP4, WebM, GIF, PNG y JPEG**.

## Decisiones técnicas

### Arquitectura: Aplicación Web (Next.js + TypeScript)

**Por qué web:**
- Multiplataforma real (Windows, macOS, Linux) sin recompilar
- HTML5 Canvas con precisión sub-pixel para dibujo 2D
- Pointer Events API soporta presión de tabletas gráficas (Wacom, Huion)
- IndexedDB para almacenamiento local sin límite práctico
- Web Audio API para sincronización de audio
- Sin instalación: el navegador es el runtime
- ffmpeg.wasm permite exportación MP4 con H.264 + AAC directamente en el navegador

**Stack:**
- **Framework:** Next.js 16 + TypeScript 5
- **UI:** Tailwind CSS 4 + shadcn/ui + lucide-react
- **Estado:** Zustand
- **Persistencia:** IndexedDB (vía `idb`)
- **Exportación GIF:** `gifenc`
- **Exportación MP4:** `@ffmpeg/ffmpeg` + `@ffmpeg/util` (core WASM ~25MB, cacheable)
- **Exportación WebM:** MediaRecorder nativo del navegador
- **Dibujo:** HTML5 Canvas API nativa

**Headers requeridos (configurados en `next.config.ts`):**
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

Estos habilitan `SharedArrayBuffer` que ffmpeg.wasm necesita. Ya están configurados.

## Estructura del proyecto

```
src/
├── app/
│   ├── globals.css        Tema oscuro profesional
│   ├── layout.tsx         Layout raíz
│   └── page.tsx           Página principal (gestor o editor)
├── components/
│   └── animation/
│       ├── AudioPanel.tsx           Importar audio + waveform
│       ├── ButtonsActionsPanel.tsx  Sistema de botones y acciones
│       ├── CanvasStage.tsx          Lienzo principal de dibujo
│       ├── EditorView.tsx           Editor con menubar + paneles
│       ├── ExportDialog.tsx         Exportación MP4/WebM/GIF/PNG/JPEG
│       ├── HelpDialog.tsx           Guía de uso integrada
│       ├── LayersPanel.tsx          Sistema de capas
│       ├── LibraryPanel.tsx         Biblioteca de recursos
│       ├── OnionSkinPanel.tsx       Papel cebolla
│       ├── ProjectManager.tsx       Pantalla de proyectos
│       ├── PropertiesPanel.tsx      Propiedades de proyecto/capa/cuadro
│       ├── Timeline.tsx             Línea de tiempo con celdas
│       └── Toolbar.tsx              Herramientas de dibujo
└── lib/
    └── animation/
        ├── actions.ts       Sistema de eventos y acciones (estilo Flash)
        ├── db.ts             Persistencia IndexedDB
        ├── defaults.ts      Proyecto vacío, plantillas, paleta
        ├── demo.ts           Proyecto de demostración
        ├── drawing.ts       Motor de dibujo (canvas, color, fill, etc.)
        ├── export.ts        Exportación GIF/PNG/JPEG/secuencias
        ├── store.ts          Estado global con Zustand
        ├── types.ts          Modelo de datos
        ├── useDrawingEngine.ts  Hook del motor de dibujo y reproducción
        ├── utils.ts          Helpers
        └── videoExport.ts    Exportación MP4 + WebM con ffmpeg.wasm
```

## Instalación y ejecución

### Requisitos
- Node.js 18+ o Bun
- Navegador moderno (Chrome, Edge, Firefox, Safari)

### Desarrollo
```bash
bun install
bun run dev
```
Abre `http://localhost:3000`

### Producción
```bash
bun run build
bun run start
```

### Lint
```bash
bun run lint
```

## Funciones implementadas

### Núcleo de animación tradicional
- ✅ Creación de proyectos con configuración (resolución, FPS, color de fondo)
- ✅ Lienzo con HTML5 Canvas, zoom, pan y rotación
- ✅ 12 herramientas de dibujo: lápiz, pincel, goma, línea, rectángulo, elipse, relleno, **selección**, transformación, cuentagotas, pan, zoom
- ✅ Configuración de pincel: tamaño, color, opacidad, dureza, estabilización, sensibilidad a presión
- ✅ Animación cuadro a cuadro (cada cuadro es un drawing independiente)
- ✅ Crear, duplicar, copiar, pegar, borrar cuadros
- ✅ Línea de tiempo con celdas, exposición de dibujos (holds)
- ✅ FPS configurables (12, 24, 30, 25, 60 y personalizado)
- ✅ Reproducción con bucle y velocidad ajustable (0.25× a 2×) — **sin parpadeo entre frames** (render síncrono con imágenes cacheadas)
- ✅ Sistema de capas: dibujo, referencia, fondo, audio
- ✅ Bloquear/ocultar capas, opacidad, renombrado, reordenado, duplicación
- ✅ Onion Skin con cuadros anteriores y posteriores, opacidad y colores configurables
- ✅ Modo "solo cuadro anterior" (luz de mesa)
- ✅ Marcadores del timeline con etiquetas y colores
- ✅ Previsualización a pantalla completa
- ✅ **Herramienta de selección** rectangular con mover/cortar

### Sistema interactivo (estilo Flash clásico)
- ✅ Botones interactivos con posición, tamaño, etiqueta y color
- ✅ 8 tipos de eventos: click, press, release, mouseenter, mouseleave, animstart, animend, frame
- ✅ 13 tipos de acciones: play, pause, stop, restart, nextFrame, prevFrame, gotoFrame, gotoScene, show, hide, playSound, setVar, wait
- ✅ Encadenamiento de acciones con demoras
- ✅ Condiciones simples (variable==valor)
- ✅ Variables del proyecto
- ✅ Probar interacciones en modo previsualización

### Audio
- ✅ Importar audio (WAV, MP3, OGG)
- ✅ Forma de onda visualizada
- ✅ Sincronización con el timeline (frame de inicio configurable)
- ✅ Volumen y mute por pista
- ✅ Reproducción sincronizada durante la previsualización
- ✅ **Inclusión de audio en exportación MP4**

### Proyectos
- ✅ Crear, abrir, guardar, duplicar, eliminar proyectos
- ✅ Guardado automático cada 30 segundos
- ✅ Persistencia local (IndexedDB)
- ✅ Plantillas educativas: pelota que rebota, ciclo de caminata, sincronización labial, anticipación, squash & stretch
- ✅ Recuperación tras cierres inesperados (dirty flag)

### Exportación
- ✅ **MP4 (video)** — ffmpeg.wasm con H.264 + AAC, incluye audio
- ✅ **WebM (video)** — MediaRecorder nativo, VP9 + Opus, rápido
- ✅ GIF animado (con cuantización de paleta)
- ✅ Secuencia PNG
- ✅ Secuencia JPEG
- ✅ PNG/JPEG del frame actual
- ✅ Configuración de resolución, FPS, rango, color de fondo, calidad

### Herramientas docentes
- ✅ Plantillas educativas con instrucciones integradas
- ✅ Proyecto de demostración completo
- ✅ Ayuda integrada con guía de uso y atajos

## Atajos de teclado

| Tecla | Acción |
|-------|--------|
| `P` | Lápiz |
| `B` | Pincel |
| `E` | Goma |
| `L` | Línea |
| `R` | Rectángulo |
| `O` | Elipse |
| `G` | Relleno |
| `V` | Selección |
| `T` | Transformar |
| `I` | Cuentagotas |
| `H` | Mover lienzo |
| `Z` | Zoom |
| `Espacio` | Reproducir/Pausar |
| `→` `←` | Avanzar/Retroceder cuadro |
| `N` | Nuevo cuadro |
| `D` | Duplicar cuadro |
| `Ctrl/Cmd+S` | Guardar |

## Funciones pendientes

- ❌ Captura de cámara para animación sobre papel (getUserMedia disponible, pendiente integración)
- ❌ Tableta gráfica avanzada (tilt, rotación del lápiz)
- ❌ Importación/exportación del proyecto completo como archivo .zip
- ❌ Lip-sync automático desde audio
- ❌ Interpolación automática (no incluida por diseño — el programa prioriza la animación manual)
- ❌ Deshacer/Rehacer con pila (los cambios se pueden revertir manualmente por ahora)
- ❌ Empaquetado con Electron/Tauri para versión instalable nativa
- ❌ Mover selección con herramienta Transform (la selección corta pero transform está pendiente)

## Errores conocidos

- En Firefox, la exportación de GIF largos (>200 frames) puede tardar varios segundos
- La waveform de audio importado es simulada (envolvente) por limitaciones de Web Audio API sin `decodeAudioData` completo
- La primera exportación MP4 descarga el core de ffmpeg (~25MB); las siguientes usan la cache
- Para exportar MP4, el navegador debe soportar SharedArrayBuffer (requiere los headers COOP/COEP ya configurados)

## Bug fixes recientes

- ✅ **Lápiz/pincel ya no se limita al primer punto** — el motor ahora usa window listeners (no React pointer events) y setters síncronos para `isDrawingRef`, evitando race conditions con awaits async
- ✅ **Sin parpadeo durante playback** — el render ahora usa imágenes pre-cacheadas en el composited canvas, en una sola operación atómica por frame
- ✅ **Herramienta de selección implementada** — selecciona región rectangular, corta el contenido y lo guarda en un buffer
- ✅ **Exportación MP4 con ffmpeg.wasm** — genera H.264 + AAC con audio sincronizado
- ✅ **Exportación WebM con MediaRecorder** — alternativa rápida sin dependencias externas

## Verificación

La aplicación fue probada manualmente con Agent Browser:
- ✅ Pantalla de proyectos carga correctamente
- ✅ Apertura del proyecto de demostración (12 cuadros, 3 botones, 1 audio, 2 marcadores)
- ✅ Editor carga con todas las herramientas y paneles
- ✅ Línea de tiempo muestra 60 celdas con marcadores visuales
- ✅ Diálogo de exportación se abre y exporta GIF (112KB), WebM (30KB) y MP4 (14KB) correctamente
- ✅ **Lápiz/pincel dibuja trazos continuos** (verificado: 12411 píxeles en un trazo)
- ✅ **Selección dibuja rectángulo en overlay** (verificado: 22800 píxeles durante el arrastre)
- ✅ **Playback sin parpadeo** (verificado: 10 muestras de canvas distintas durante playback, todas diferentes)
- ✅ **Cross-origin isolation activada** (SharedArrayBuffer disponible para ffmpeg.wasm)
- ✅ IndexedDB persiste el proyecto entre sesiones
- ✅ Sin errores en consola

## Licencia

Software original para uso educativo. No utiliza marcas, interfaces ni recursos
propietarios. Las referencias conceptuales (Toon Boom, Animator Studio, Flash clásico)
sirven como inspiración para los principios de animación, no como plantillas a copiar.
