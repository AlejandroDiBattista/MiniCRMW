# Guía visual de Lazo

_Actualizada: 18 de julio de 2026_

## Dirección

CRM editorial y sereno: superficies de papel cálido, tinta oscura y verde bosque reservado para acciones, conexión, selección y mensajes propios. La interfaz debe sentirse humana y profesional, nunca clínica ni estridente.

## Color

- **Primario:** `oklch(0.35 0.075 157)` — marca y acciones principales.
- **Fondo:** `oklch(0.966 0.011 96)` — papel cálido general.
- **Superficie:** `oklch(0.987 0.006 96)` — paneles y mensajes recibidos.
- **Chat:** `oklch(0.952 0.017 102)` — plano de conversación con patrón sutil.
- **Texto:** `oklch(0.205 0.02 88)` — tinta principal.
- **Texto secundario:** `oklch(0.43 0.025 82)` — metadatos con contraste legible.
- **WhatsApp:** `oklch(0.58 0.15 153)` — indicador de conexión.

El verde no se usa como decoración general: comunica estado, selección o una acción disponible.

## Tipografía

- **Interfaz y lectura:** DM Sans.
- **Jerarquía editorial:** Newsreader.
- **Datos técnicos:** Geist Mono sólo cuando el contenido lo requiera.
- Títulos de panel: 18–22 px, semibold.
- Nombres y mensajes: 15 px como base.
- Metadatos: 11–13 px, nunca menos de 11 px.
- Mensajes: 24 px de interlineado para lectura cómoda.

## Layout

- Escritorio ancho: `340 px / contenido flexible / 360 px`.
- Tablet: lista de 330 px y chat flexible; la ficha aparece en Sheet.
- Móvil: navegación por pestañas, una tarea principal por vista.
- Cabeceras de panel: 72 px exactos y borde inferior compartido.
- Márgenes operativos compactos: 8 px en búsqueda/compositor, 12–16 px en conversación.
- Sólo las listas, mensajes y ficha pueden desplazarse; el shell permanece en `100dvh`.

## Componentes

- Botones de cabecera: 36 px; objetivos táctiles de al menos 44 px con puntero grueso.
- Contacto seleccionado: fondo verde suave, borde interno sutil y sin depender sólo del color para el contenido.
- Burbujas: 15 px, radio de 16 px, sombra de un nivel y esquina direccional moderada.
- Formularios secundarios: fondo `muted/35`, borde visible y campos sobre superficie clara.
- Estados interactivos: transiciones de color/transformación de 150 ms; sin rebotes.
- Acciones críticas deben permanecer accesibles sin depender exclusivamente de hover.

## Accesibilidad

- Texto normal apunta a WCAG AA (4.5:1); elementos grandes y UI, al menos 3:1.
- Foco visible provisto por los componentes shadcn/Radix.
- Estado no comunicado únicamente por color: siempre se acompaña con texto o icono.
- Zoom y reflow deben conservarse; no se bloquea el escalado del viewport.
- `prefers-reduced-motion` es respetado por las utilidades de animación del sistema.

## Implementación

Next.js, shadcn/ui sobre Radix UI, Tailwind CSS v4 y tokens OKLCH en `src/app/globals.css`. Toda nueva pantalla debe reutilizar los tokens y escalas anteriores antes de introducir valores ad hoc.
