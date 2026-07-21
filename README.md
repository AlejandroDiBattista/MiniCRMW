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

## Prueba en Railway

Esta aplicación puede desplegarse completa en Railway como un servicio Node persistente. El archivo `railway.json` ya define el build y el arranque.

1. Subí el proyecto a un repositorio GitHub (sin incluir `.data`, `.baileys-auth` ni archivos `.env`).
2. En Railway elegí **New Project → Deploy from GitHub Repo** y seleccioná el repositorio.
3. Agregá un volumen al servicio y montalo en `/data`.
4. Configurá estas variables:

   ```text
   LAZO_PERSISTENT_DIR=/data
   NODE_ENV=production
   OPENAI_API_KEY=...              # opcional, para IA y dictado
   ```

5. Generá un dominio público desde **Settings → Networking → Generate Domain**.
6. Abrí el dominio, elegí **WhatsApp sin vincular** y escaneá el QR desde WhatsApp → Dispositivos vinculados.

El volumen conserva SQLite, avatares y la sesión de Baileys entre reinicios. Para esta prueba usá una sola réplica: SQLite y una sesión de WhatsApp no deben ser abiertas por varios procesos al mismo tiempo.

Railway asigna automáticamente el puerto mediante `PORT`; no hace falta hardcodearlo. Configurá un límite de uso en Billing y detené el servicio cuando no estés probando para evitar consumos inesperados.
