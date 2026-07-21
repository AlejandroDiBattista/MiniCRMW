# Asistente integrado

## Objetivo

Incorporar un asistente de IA dentro de cada conversación con un cliente. El asistente debe participar como un interlocutor adicional, pero toda su comunicación será privada: solamente podrá verla el usuario de la aplicación y nunca se enviará al cliente por WhatsApp.

El asistente debe ayudar al usuario a:

- Registrar, consultar y modificar los datos del cliente.
- Administrar la historia de contactos y las tareas.
- Detectar posibles acciones a partir de la conversación.
- Tomar decisiones mediante varias sugerencias accionables.
- Redactar mensajes para enviar al cliente.

## Canales de comunicación

La conversación tendrá dos canales:

### Canal público

Los mensajes escritos por el usuario se envían al cliente mediante WhatsApp. También pertenecen a este canal los mensajes recibidos del cliente.

### Canal privado

Los mensajes escritos por el usuario se envían exclusivamente al asistente. Las respuestas del asistente también pertenecen a este canal y nunca deben enviarse al cliente.

El canal privado debe seguir disponible aunque WhatsApp esté desconectado. En ese caso, solamente se bloqueará el envío de mensajes por el canal público.

## Persistencia de los mensajes

Debe guardarse toda la comunicación asociada con cada cliente, incluidos:

- Los mensajes recibidos del cliente.
- Los mensajes públicos enviados por el usuario.
- Los mensajes privados enviados por el usuario al asistente.
- Las respuestas y sugerencias generadas por el asistente.
- El estado y el resultado de las sugerencias ejecutadas, descartadas o canceladas.

Cada mensaje debe registrar, como mínimo:

- El cliente al que pertenece la conversación.
- El autor: `cliente`, `usuario` o `asistente`.
- El canal: `publico` o `privado`.
- El texto original completo.
- La fecha y hora en que se produjo.
- Su tipo, cuando corresponda: mensaje común, sugerencia o resumen de una acción.

Además, una sugerencia debe guardar:

- La acción concreta que propone y todos los parámetros necesarios para ejecutarla.
- Su estado: `pendiente`, `ejecutada`, `descartada` o `cancelada`.
- La fecha y hora en que cambió de estado.
- El resumen del resultado, cuando haya sido ejecutada.

Si una sugerencia se reemplaza visualmente por un resumen, el texto original y el resultado de la acción deben conservarse en la base de datos. Recargar la página debe reconstruir la conversación y el estado de sus sugerencias.

## Evaluación proactiva

Después de cada mensaje público recibido o enviado, el asistente debe evaluar si existe alguna acción útil para proponer. Para decidirlo debe considerar:

- La conversación completa con el cliente.
- La conversación privada completa con el usuario.
- Todos los datos actuales de la ficha del cliente.
- Su historia de contactos.
- Las tareas pendientes y completadas.

Si no encuentra una acción útil, no debe publicar un mensaje innecesario.

Toda intervención proactiva del asistente se publica en el canal privado.

## Conversación directa con el asistente

El usuario puede cambiar al canal privado y conversar directamente con el asistente. Esta conversación puede extenderse durante varios mensajes para aclarar datos, completar una tarea o preparar una acción.

Cuando falte información necesaria, el asistente debe solicitarla en el canal privado antes de ofrecer una acción que no pueda ejecutarse correctamente.

Enviar un nuevo mensaje por el canal privado cancela todas las sugerencias que estén pendientes. El asistente podrá generar nuevas sugerencias a partir de la información actualizada.

## Acceso a los datos del CRM

El asistente debe poder realizar sobre los datos del cliente las mismas operaciones disponibles para el usuario en la interfaz, incluidas las siguientes:

- Crear, consultar, modificar y eliminar datos de la ficha del cliente.
- Crear, consultar, modificar y eliminar registros de la historia de contactos.
- Crear, consultar, modificar, completar y eliminar tareas.
- Administrar fechas, descripciones y repeticiones de las tareas.

El asistente no debe ejecutar una modificación solamente porque la haya detectado. Primero debe presentarla como una sugerencia accionable y esperar que el usuario la acepte.

## Sugerencias accionables

Una respuesta del asistente puede contener una o varias sugerencias. Cada sugerencia debe mostrarse como una burbuja independiente e incluir:

- Una descripción breve de lo que se propone.
- La información necesaria para comprender el resultado.
- Un ícono o control que identifique el tipo de acción.

La burbuja completa es accionable. No es necesario pulsar exactamente el ícono o el botón: tocar cualquier parte de la burbuja debe aceptar la sugerencia.

Pueden existir varias sugerencias pendientes al mismo tiempo. Aceptar una de ellas debe:

1. Ejecutar inmediatamente la acción correspondiente.
2. Reemplazar visualmente la sugerencia aceptada por un resumen muy breve del resultado.
3. Marcar como descartadas todas las demás sugerencias pendientes.
4. Conservar en la base de datos las sugerencias originales, sus estados y el resumen de la acción ejecutada.

Las nuevas sugerencias generadas por la evaluación de un mensaje público se agregan a las que ya estén pendientes. No las reemplazan ni las cancelan.

Las sugerencias también deben cancelarse cuando:

- El usuario envía un nuevo mensaje por el canal privado.
- El usuario cambia del canal privado al canal público.

Una sugerencia descartada o cancelada deja de ser accionable. Su estado debe persistirse para que no vuelva a aparecer como pendiente al recargar la página.

Si una acción falla, la sugerencia debe seguir pendiente y debe mostrarse un error claro. No se deben descartar las demás sugerencias hasta que la acción elegida se haya ejecutado correctamente.

### Ejemplo: registrar información

Si el usuario pregunta el nombre y el cliente responde que se llama Alejandro Di Battista, el asistente podría mostrar:

> Registrar el nombre **Alejandro Di Battista** en la ficha del cliente.

Al tocar la burbuja, el sistema actualiza la ficha y reemplaza visualmente la sugerencia por:

> Nombre y apellido registrados.

### Ejemplo: crear una tarea

Si durante la conversación se acuerda llamar al cliente al día siguiente, el asistente podría sugerir:

> Crear la tarea **Llamar al cliente mañana**.

La tarea solo se crea cuando el usuario toca la sugerencia.

### Ejemplo: redactar y enviar un mensaje

Si el usuario escribe en el canal privado:

> Ofrecele la casa de Rivadavia.

El asistente podría responder con una sugerencia como:

> Tenemos para alquilar una casa de tres habitaciones en Rivadavia...

Esta sugerencia debe incluir el ícono de envío. Al tocar la burbuja:

1. El texto se envía inmediatamente al cliente por el canal público, como un mensaje escrito por el usuario.
2. La sugerencia deja de mostrarse como pendiente.
3. El mensaje enviado aparece en la conversación pública.
4. Se descartan las demás sugerencias pendientes.

Si el usuario desea cambiar el texto sugerido, no lo edita directamente: debe pedirle el cambio al asistente mediante el canal privado. Al hacerlo, las sugerencias anteriores se cancelan y el asistente puede generar una nueva versión.

## Selector de canal y mejora de redacción

El botón con el ícono de brillo tendrá dos funciones:

### Clic o toque simple

- Si el editor está en el canal público, cambia al canal privado.
- Si el editor está en el canal privado, vuelve al canal público.
- Al volver al canal público se cancelan todas las sugerencias pendientes.

El cambio producido por el clic simple debe demorarse aproximadamente 250 ms para permitir detectar un doble clic.

### Doble clic o doble toque en el canal público

Debe conservar el comportamiento actual: reemplazar el borrador por una versión corregida o mejor redactada mediante IA, sin cambiar de canal.

El doble clic o doble toque solamente se aplica cuando el editor se encuentra en el canal público.

## Presentación visual

Los mensajes públicos deben conservar su aspecto actual.

Los mensajes del canal privado deben distinguirse mediante:

- Una gama de color azul.
- Un borde de línea punteada en lugar de una línea continua.
- Un color coherente entre las burbujas privadas y el campo de entrada cuando está seleccionado el canal privado.

No es necesario agregar un nombre, ícono o avatar para identificar al asistente: la combinación del color azul y el borde punteado es suficiente.

Al cambiar de canal, todo el campo de edición debe reflejar de manera inmediata y accesible el canal seleccionado. El placeholder también debe indicarlo claramente, por ejemplo:

- Canal público: `Mensaje para Alejandro…`
- Canal privado: `Mensaje privado para el asistente…`

Las respuestas del asistente deben aprovechar el formato compatible con WhatsApp que ya utiliza la aplicación, incluidas negritas, cursivas, párrafos y listas, cuando ayuden a presentar mejor la información.

## Reglas de seguridad funcional

- Ningún mensaje privado debe enviarse al cliente ni salir por WhatsApp.
- Ninguna sugerencia debe modificar datos antes de ser aceptada por el usuario.
- Una acción debe ejecutarse una sola vez, incluso si el usuario toca repetidamente la burbuja o si se repite una solicitud por un problema de red.
- El asistente debe utilizar los datos más recientes al ejecutar una acción y manejar de forma explícita los conflictos o datos que hayan cambiado.
- Los mensajes originales, las acciones y sus resultados deben conservarse para mantener un historial auditable.

## Criterios de aceptación

La funcionalidad se considera correctamente implementada cuando:

1. Todos los mensajes quedan guardados con autor, canal, texto original, fecha y hora.
2. Los mensajes privados nunca son visibles para el cliente ni se envían por WhatsApp.
3. El asistente evalúa cada mensaje público usando toda la conversación y todos los datos del cliente.
4. El usuario puede mantener una conversación privada interactiva con el asistente.
5. El asistente puede proponer todas las operaciones que el usuario puede realizar sobre la ficha, la historia y las tareas.
6. Pueden mostrarse varias sugerencias pendientes y aceptar una descarta las demás.
7. Las cancelaciones, descartes y acciones ejecutadas sobreviven a una recarga.
8. Las sugerencias de envío se envían directamente como mensajes públicos al tocarlas.
9. El clic simple alterna el canal y el doble clic en el canal público conserva la mejora de redacción actual.
10. El canal privado se identifica mediante el color azul y el borde punteado tanto en sus mensajes como en el editor.
