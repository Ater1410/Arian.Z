# 📅 Mi Agenda · III SCB

Agenda escolar para la PC (se abre en el navegador) con **Luna**, una asistente de IA que anota tus exámenes, tareas y eventos en el calendario y te propone un plan de estudio en tus horas libres.

## Qué hace

- **Tu horario ya cargado**: las clases de III SCB (Colegio Raimondi), fútbol (lun/mié/vie), gimnasio (mar/jue), el camino a casa y el almuerzo.
- **Cada vez que creas algo te pregunta**: ¿qué tan importante es? (1–5), ¿qué tan difícil? (1–5) y ¿cuánto tiempo te tomará?
- **Plan de estudio que tú apruebas**: reparte las horas de estudio en sesiones antes del examen, solo en tus huecos libres y nunca después de las 21:00. Puedes cambiar fechas y horas antes de aprobar.
- **Luna (chat)**: escríbele, por ejemplo, *"Tengo examen de mate el jueves, entra derivadas"* o *"¿Qué tengo esta semana?"*.
- **Metas con check diario y rachas 🔥**: dormir antes de las 21:30, leer 10 min, avanzar tus ideas de negocio (2 veces por semana, con tu lista de ideas). El negocio solo usa huecos que no le quitan tiempo al estudio.
- **Resumen del día** al abrir la app, **recordatorios** (la noche anterior y la mañana de cada examen, 10 min antes de cada sesión y a la hora de leer/dormir), **modo oscuro** y vista de **mes**.
- Todo se guarda **solo en tu navegador**. En ⚙️ Ajustes puedes exportar o importar una copia.

## Activar la IA gratis (Google Gemini)

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Haz clic en **Create API key**.
3. En la app ve a ⚙️ **Ajustes** → pega la clave → **Probar conexión** → **Guardar**.

Sin clave, Luna funciona en **modo básico**: entiende frases simples como "examen de física el miércoles" o "tarea de inglés para el 20/11".

## Atajos

| Tecla | Acción |
|---|---|
| `N` | Nuevo evento |
| `←` `→` | Semana anterior o siguiente |
| `T` | Ir a hoy |
| `/` | Escribirle a Luna |
| Clic en una clase | Agregar un examen o tarea de esa materia |
| Clic en un hueco vacío | Crear un evento a esa hora |
| 🏫 en la cabecera de un día | Marcar ese día como feriado (sin clases) |

## Abrirla

- **Con un link (GitHub Pages)**: en GitHub ve a *Settings → Pages → Build and deployment*, elige *Deploy from a branch*, selecciona la rama `claude/calendar-app-ai-assistant-5mznp3` y la carpeta `/ (root)`, y guarda. En 1–2 minutos estará en `https://ater1410.github.io/Arian.Z/`.
- **En tu PC**: descarga el proyecto y abre `index.html` con Chrome o Edge.

Después de abrirla, en Chrome o Edge puedes ir al menú ⋮ → *Guardar y compartir* → *Crear acceso directo* para tenerla como app en el escritorio.

## Archivos

```
index.html        estructura de la página
css/styles.css    diseño (claro y oscuro)
js/data.js        horario, valores por defecto, guardado
js/planner.js     huecos libres y plan de estudio
js/ai.js          Luna: Gemini y modo básico
js/app.js         calendario, metas, chat, recordatorios
```
