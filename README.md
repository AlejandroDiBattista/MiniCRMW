# Lazo — mini CRM con WhatsApp

CRM liviano construido con Next.js 16, shadcn/ui, Tailwind CSS, SQLite y WhiskeySockets/Baileys.

## Funcionalidades

- Alta, edición, búsqueda y eliminación de clientes.
- Ficha con nombre, apellido, DNI, email y teléfono.
- Historia cronológica de contactos con fecha y descripción.
- Vinculación de WhatsApp mediante QR.
- Envío y recepción de mensajes de texto en tiempo real.
- Persistencia y deduplicación de mensajes en SQLite.
- Creación automática de ficha al recibir un mensaje de un número desconocido.
- Interfaz responsive para escritorio, tablet y móvil.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000), elegí **WhatsApp sin vincular** y escaneá el QR desde WhatsApp → Dispositivos vinculados.

Los datos se guardan en `.data/mini-crm.sqlite` y la sesión vinculada en `.baileys-auth/`. Ambos directorios están ignorados por Git.

## Producción

Baileys mantiene un WebSocket abierto y SQLite necesita disco persistente. Desplegá esta aplicación como un proceso Node de larga duración (VPS, contenedor o servicio con volumen persistente), no como funciones serverless efímeras. Ejecutá:

```bash
npm run build
npm start
```

Baileys no es una API oficial de WhatsApp. Usalo de forma responsable, sin spam y teniendo en cuenta los términos de servicio de WhatsApp.
