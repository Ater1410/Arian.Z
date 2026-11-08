# 🌙 Mi Agenda · III SCB

Agenda escolar para la PC (se abre en el navegador) con **Luna**, una asistente de IA que anota tus exámenes, tareas y eventos, te propone un plan de estudio en tus horas libres y te ayuda a cumplir tus metas.

## Lo que trae

### Vistas
- **Hoy** (la pantalla de inicio):
  - Un **pronóstico del día** según qué tan cargado está (☀️ tranquilo, ⛅ normal, 🌧️ cargado, ⛈️ tormenta).
  - **Ahora** y **lo siguiente**, con cuenta regresiva.
  - La **línea de tiempo** de tu día, con "Estás aquí".
  - Los **jefes** que tienes por delante.
- **Semana**:
  - El **colegio comprimido** en una cápsula con el ícono de cada materia, para que tus tardes tengan más espacio. Las horas de la tarde y la noche se ven más grandes.
  - **Zonas verdes** que marcan tus horas libres.
  - **Arrastrar y soltar**: mueve las sesiones, estíralas desde abajo para cambiar su duración, o arrastra sobre un hueco vacío para crear algo nuevo.
- **Mes** y un **mini calendario** en el panel izquierdo, con puntitos de color los días que tienen examen o tarea.
- **Metas: tu cielo nocturno.**
  - Leer enciende estrellas que forman constelaciones.
  - Dormir temprano hace crecer la luna 🌑→🌕.
  - Tu negocio es una **plantita** 🌰→🌳 que crece con cada avance, y cada idea que anotas es una hoja 🍃.

### Exámenes como jefes 🐉
Cada examen es un monstruo con **barra de vida**: su vida son las horas de estudio que estimaste. Mientras más importante y difícil es el examen, más grande es el monstruo (🐛 → 👾 → 🐲 → 🐉). Cada sesión de estudio le baja vida, y si lo derrotas antes del examen sale **confeti** 🎉.

### Modo concentración ⏱️
Al darle ▶ a una sesión se abre una pantalla completa del color de la materia con:
- un temporizador,
- la lista de temas (los que escribiste en Notas, separados por comas),
- la vida del jefe bajando en vivo.

### Barra rápida ✍️🎤
Abajo puedes **escribir o dictar** ("examen de física el miércoles"). Mientras escribes ves lo que la app entendió. Al guardar te pregunta lo de siempre:
- importancia (★★★★★),
- dificultad (😌 → 😱),
- cuánto tiempo te tomará.

### Rituales
- **Modo noche** 🌙: 30 minutos antes de dormir la app se oscurece y te propone **leer 10 minutos** con temporizador. Al terminar te da las buenas noches.
- **Por la mañana**: te pregunta con un toque "¿dormiste antes de las 21:30?".
- **Domingo**: un **repaso de la semana** con tus horas de estudio, tus metas y lo que viene.
- **Después de cada examen**: te pregunta "¿cómo te fue?" (tu nota y si el tiempo de estudio te alcanzó). Con eso la app **aprende**; por ejemplo: "en Física sueles necesitar 30% más tiempo".

### Luna 💬
Una burbuja flotante abajo a la derecha. Su cara cambia según el momento: 😊 por la mañana, 🤓 cuando hay examen cerca, 🥳 cuando cumples tus metas, 😴 de noche.

### Apariencia
- 5 colores: **Violeta**, **Raimondi** (verde, blanco y rojo), **Océano**, **Atardecer** y **Rosa**.
- Modo claro y oscuro, y tipografía *Plus Jakarta Sans*.
- La primera vez que abres la app hay un **recorrido guiado**. Puedes repetirlo con el botón ❔.

## Activar la IA gratis (Google Gemini)

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Haz clic en **Create API key**.
3. En la app ve a ⚙️ **Ajustes** → pega la clave → **Probar conexión** → **Guardar**.

Sin clave, Luna funciona en **modo básico**: entiende frases simples como "examen de física el miércoles" o "tarea de inglés para el 20/11".

## Atajos

| Tecla | Acción |
|---|---|
| `N` | Nuevo evento |
| `/` | Escribir en la barra rápida |
| `L` | Hablar con Luna |
| `←` `→` | Semana o mes anterior / siguiente |
| `T` | Ir a hoy |
| `Espacio` | Pausar o seguir el temporizador (modo concentración) |

## Abrirla

- **Con un link (GitHub Pages)**: en GitHub ve a *Settings → Pages → Build and deployment*, elige *Deploy from a branch*, selecciona la rama `claude/calendar-app-ai-assistant-5mznp3` y la carpeta `/ (root)`, y guarda. En 1–2 minutos estará en `https://ater1410.github.io/Arian.Z/`.
- **En tu PC**: descarga el proyecto y abre `index.html` con Chrome o Edge.

El dictado por voz funciona en Chrome y Edge. Todos tus datos se guardan solo en tu navegador; en ⚙️ Ajustes puedes exportar o importar una copia.

## Archivos

```
index.html        estructura de la página
css/styles.css    diseño (temas, cielo nocturno, animaciones)
js/data.js        horario, materias e íconos, guardado
js/planner.js     huecos libres y plan de estudio
js/ai.js          Luna: Gemini y modo básico
js/icons.js       íconos de línea
js/fx.js          confeti, sonidos y dictado por voz
js/app.js         núcleo: semana, mes, modales, chat, ajustes, jefes
js/today.js       vista Hoy
js/goals.js       metas (cielo nocturno)
js/focus.js       modo concentración
js/rituals.js     modo noche, pregunta de la mañana, repaso semanal
js/tour.js        recorrido guiado
js/main.js        arranque
```
