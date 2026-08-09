import "server-only"

import fs from "node:fs"
import path from "node:path"
import QRCode from "qrcode"
import pino from "pino"
import makeWASocket, {
  DisconnectReason,
  jidNormalizedUser,
  useMultiFileAuthState as createMultiFileAuthState,
  WAMessageStatus,
  Browsers,
  fetchLatestBaileysVersion,
  type Contact,
  type LIDMapping,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys"
import { clientAvatarPath, ensureAvatarDirectory } from "@/lib/avatar"
import { baileysAuthDirectory } from "@/lib/storage"
import {
  ensureWhatsappClient,
  getClient,
  getClientByPhone,
  getClientByWhatsappJid,
  getClients,
  getMessages,
  linkWhatsappJids,
  markClientAvatarUpdated,
  markMessageRead,
  mergeWhatsappClients,
  normalizePhone,
  saveMessage,
  updateGeneratedWhatsappClientName,
} from "@/lib/db"
import type { Message, WhatsappConnectionStatus } from "@/lib/types"

type WhatsappEvent =
  | { type: "status"; status: WhatsappConnectionStatus }
  | { type: "message"; clientId: string; message: Message }
  | { type: "profile"; clientId: string; avatarUpdatedAt: string }
  | { type: "clients"; mergedClientId: string; removedClientId: string }

type Listener = (event: WhatsappEvent) => void

function messageText(message: WAMessage) {
  const content = message.message
  return (
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.ephemeralMessage?.message?.conversation ??
    content?.ephemeralMessage?.message?.extendedTextMessage?.text ??
    ""
  )
}

function normalizedJid(value: string | null | undefined) {
  if (!value?.includes("@")) return null
  return jidNormalizedUser(value)
}

function isPhoneJid(value: string | null): value is string {
  return Boolean(value?.endsWith("@s.whatsapp.net") || value?.endsWith("@hosted"))
}

function isLidJid(value: string | null): value is string {
  return Boolean(value?.endsWith("@lid") || value?.endsWith("@hosted.lid"))
}

function jidPhone(value: string) {
  return value.split("@")[0].split(":")[0]
}

function contactDisplayName(contact: Contact | null | undefined) {
  return contact?.name?.trim()
    || contact?.verifiedName?.trim()
    || contact?.notify?.trim()
    || undefined
}

type PendingMessage = {
  message: WAMessage
  evaluate: boolean
}

class WhatsappManager {
  private socket: WASocket | null = null
  private connecting: Promise<void> | null = null
  private listeners = new Set<Listener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private profileSyncTimes = new Map<string, number>()
  private profileSyncAttemptTimes = new Map<string, number>()
  private historySyncTimes = new Map<string, number>()
  private contactNames = new Map<string, string>()
  private lidToPhoneJids = new Map<string, string>()
  private pendingMessages = new Map<string, PendingMessage>()
  private whatsappAccountName: string | undefined
  private messageImportQueue: Promise<void> = Promise.resolve()
  private status: WhatsappConnectionStatus = {
    state: "disconnected",
    qrDataUrl: null,
    user: null,
    error: null,
  }

  getStatus() {
    return this.status
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: WhatsappEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private setStatus(next: Partial<WhatsappConnectionStatus>) {
    this.status = { ...this.status, ...next }
    this.emit({ type: "status", status: this.status })
  }

  private enqueueImport(operation: () => Promise<void>) {
    this.messageImportQueue = this.messageImportQueue
      .then(operation)
      .catch((error) => console.error("No pudimos procesar la identidad de WhatsApp", error))
  }

  private enqueueMessages(messages: WAMessage[], evaluate: boolean) {
    this.enqueueImport(async () => {
      for (const message of messages) await this.storeIncomingMessage(message, evaluate)
    })
  }

  async connect() {
    if (this.socket || this.connecting) return this.connecting

    this.shouldReconnect = true
    this.connecting = this.openSocket()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  async connectIfAuthenticated() {
    const credentialsFile = path.join(baileysAuthDirectory, "creds.json")
    if (fs.existsSync(credentialsFile)) await this.connect()
  }

  private async openSocket() {
    this.setStatus({ state: "connecting", qrDataUrl: null, error: null })
    const authDirectory = baileysAuthDirectory
    fs.mkdirSync(authDirectory, { recursive: true })
    const { state, saveCreds } = await createMultiFileAuthState(authDirectory)

    // WhatsApp cambia con frecuencia la versión web aceptada. Usar la versión
    // publicada más reciente evita el cierre 405 (Connection Failure) antes
    // de que Baileys llegue a emitir el QR de vinculación.
    let version: [number, number, number] | undefined
    try {
      const latest = await fetchLatestBaileysVersion()
      if (latest.version) version = latest.version
    } catch {
      // Si no se puede consultar GitHub, Baileys usará su versión incluida.
    }

    const socket = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      // WhatsApp actualmente rechaza el sub-platform de escritorio de
      // Baileys (428 antes de emitir el QR). Ubuntu/Chrome anuncia WEB_BROWSER
      // y mantiene la sincronización completa sin depender de WhatsApp Desktop.
      browser: Browsers.ubuntu("Chrome"),
      logger: pino({ level: process.env.NODE_ENV === "development" ? "warn" : "silent" }),
      markOnlineOnConnect: false,
      syncFullHistory: true,
    })
    this.socket = socket

    socket.ev.on("creds.update", saveCreds)
    socket.ev.on("connection.update", async (update) => {
      // Una reconexión puede dejar eventos pendientes del socket anterior.
      // Nunca permitimos que esos eventos reemplacen el estado del socket
      // actualmente activo.
      if (this.socket !== socket) return

      if (update.qr) {
        const qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 })
        this.setStatus({ state: "qr", qrDataUrl, error: null })
      }

      if (update.connection === "open") {
        this.profileSyncAttemptTimes.clear()
        this.setStatus({
          state: "connected",
          qrDataUrl: null,
          user: socket.user?.id ? jidNormalizedUser(socket.user.id).split("@")[0] : null,
          error: null,
        })
        this.enqueueImport(async () => {
          await this.reconcileWhatsappClients(socket)
          await this.flushPendingMessages()
          setTimeout(() => void this.syncAllProfilePictures(), 1500)
        })
      }

      if (update.connection === "close") {
        if (this.socket !== socket) return
        this.socket = null
        const error = update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        const statusCode = error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut
        const reconnect = this.shouldReconnect && !loggedOut
        this.setStatus({
          state: reconnect ? "error" : "disconnected",
          qrDataUrl: null,
          user: null,
          error: reconnect ? "Se perdió la conexión. Reintentando…" : null,
        })

        if (reconnect) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
          this.reconnectTimer = setTimeout(() => void this.connect(), 2500)
        }
      }
    })

    socket.ev.on("messaging-history.set", ({ contacts, lidPnMappings, messages }) => {
      if (this.socket !== socket) return
      this.rememberOwnDisplayName(messages)
      this.rememberHistoryMetadata(contacts, lidPnMappings ?? [])
      this.enqueueImport(async () => {
        await this.reconcileWhatsappClients(socket)
        for (const message of messages) await this.storeIncomingMessage(message, false)
        await this.flushPendingMessages()
      })
    })

    socket.ev.on("lid-mapping.update", (mapping) => {
      if (this.socket !== socket) return
      this.rememberLidMapping(mapping)
      this.enqueueImport(() => this.flushPendingMessages())
    })

    socket.ev.on("messages.upsert", ({ messages, type }) => {
      if (this.socket !== socket) return
      this.rememberOwnDisplayName(messages)
      this.enqueueMessages(messages, type === "notify")
    })

    socket.ev.on("messages.update", (updates) => {
      if (this.socket !== socket) return
      for (const { key, update } of updates) {
        if (!key.fromMe || !key.id || update.status == null || update.status < WAMessageStatus.READ) continue
        const seconds = Number(update.messageTimestamp ?? Math.floor(Date.now() / 1000))
        const message = markMessageRead(key.id, new Date(seconds * 1000).toISOString())
        if (message) this.emit({ type: "message", clientId: message.clientId, message })
      }
    })
  }

  private rememberLidMapping(mapping: LIDMapping) {
    const lid = normalizedJid(mapping.lid)
    const phoneJid = normalizedJid(mapping.pn)
    if (isLidJid(lid) && isPhoneJid(phoneJid)) this.lidToPhoneJids.set(lid, phoneJid)
  }

  private rememberHistoryMetadata(contacts: Contact[], mappings: LIDMapping[]) {
    for (const mapping of mappings) this.rememberLidMapping(mapping)

    for (const contact of contacts) {
      const id = normalizedJid(contact.id)
      const lid = normalizedJid(contact.lid)
      const phoneJid = normalizedJid(contact.phoneNumber)
      const name = contactDisplayName(contact)
      const aliases = [id, lid, phoneJid].filter((value): value is string => Boolean(value))
      if (name) for (const alias of aliases) this.contactNames.set(alias, name)
      if (isLidJid(lid) && isPhoneJid(phoneJid)) this.lidToPhoneJids.set(lid, phoneJid)
      if (isLidJid(id) && isPhoneJid(phoneJid)) this.lidToPhoneJids.set(id, phoneJid)
    }
  }

  private rememberOwnDisplayName(messages: WAMessage[]) {
    const ownName = messages.find((message) => message.key.fromMe && message.pushName?.trim())?.pushName?.trim()
    if (ownName) this.whatsappAccountName = ownName
  }

  private ownDisplayName(socket: WASocket) {
    return contactDisplayName(socket.user) || this.whatsappAccountName
  }

  private async resolvePhoneJid(socket: WASocket, remoteJid: string, alternateJid: string | null) {
    if (isPhoneJid(alternateJid)) return alternateJid
    if (isPhoneJid(remoteJid)) return remoteJid

    const lid = isLidJid(remoteJid) ? remoteJid : isLidJid(alternateJid) ? alternateJid : null
    if (!lid) return null
    const hinted = this.lidToPhoneJids.get(lid)
    if (hinted) return hinted

    try {
      const resolved = normalizedJid(await socket.signalRepository.lidMapping.getPNForLID(lid))
      if (isPhoneJid(resolved)) {
        this.lidToPhoneJids.set(lid, resolved)
        return resolved
      }
    } catch {
      // La asociación puede llegar unos instantes después mediante lid-mapping.update.
    }
    return null
  }

  private messageDisplayName(rawMessage: WAMessage, aliases: string[]) {
    for (const alias of aliases) {
      const name = this.contactNames.get(alias)
      if (name) return name
    }
    return rawMessage.key.fromMe ? undefined : rawMessage.pushName?.trim() || undefined
  }

  private async mergeClientAvatar(sourceClientId: string, targetClientId: string) {
    const sourcePath = clientAvatarPath(sourceClientId)
    if (!fs.existsSync(sourcePath)) return

    ensureAvatarDirectory()
    const targetPath = clientAvatarPath(targetClientId)
    try {
      if (!fs.existsSync(targetPath)) await fs.promises.rename(sourcePath, targetPath)
      else await fs.promises.unlink(sourcePath)
    } catch {
      // La ficha y sus mensajes ya están fusionados; el avatar puede resincronizarse.
    }
  }

  private async mergeIntoCanonicalClient(
    sourceClientId: string,
    targetClientId: string,
    preferredName: string | undefined,
    ownDisplayName: string | undefined,
  ) {
    const merged = mergeWhatsappClients(sourceClientId, targetClientId, { preferredName, ownDisplayName })
    if (!merged) return getClient(targetClientId)

    await this.mergeClientAvatar(sourceClientId, targetClientId)
    const profileSync = this.profileSyncTimes.get(sourceClientId)
    if (profileSync && !this.profileSyncTimes.has(targetClientId)) this.profileSyncTimes.set(targetClientId, profileSync)
    this.profileSyncTimes.delete(sourceClientId)
    this.profileSyncAttemptTimes.delete(sourceClientId)
    this.historySyncTimes.delete(sourceClientId)
    this.emit({ type: "clients", mergedClientId: targetClientId, removedClientId: sourceClientId })
    return merged.client
  }

  private async resolveMessageClient(rawMessage: WAMessage) {
    const socket = this.socket
    const remoteJid = normalizedJid(rawMessage.key.remoteJid)
    const alternateJid = normalizedJid(rawMessage.key.remoteJidAlt)
    if (!remoteJid) return null

    const directPhoneJid = isPhoneJid(alternateJid) ? alternateJid : isPhoneJid(remoteJid) ? remoteJid : null
    const phoneJid = directPhoneJid ?? (socket ? await this.resolvePhoneJid(socket, remoteJid, alternateJid) : null)
    if (!phoneJid) return null

    const lidJid = isLidJid(remoteJid) ? remoteJid : isLidJid(alternateJid) ? alternateJid : null
    const aliases = [...new Set([remoteJid, alternateJid, lidJid, phoneJid].filter((value): value is string => Boolean(value)))]
    const preferredName = this.messageDisplayName(rawMessage, aliases)
    const ownDisplayName = socket ? this.ownDisplayName(socket) : this.whatsappAccountName
    const phone = jidPhone(phoneJid)

    let client = getClientByPhone(phone) ?? ensureWhatsappClient(phone, preferredName)
    const possibleDuplicates = [...new Map(
      [
        ...aliases.map((alias) => getClientByWhatsappJid(alias)),
        lidJid ? getClientByPhone(jidPhone(lidJid)) : null,
      ]
        .filter((candidate) => candidate && candidate.id !== client.id)
        .map((candidate) => [candidate!.id, candidate!] as const),
    ).values()]

    for (const duplicate of possibleDuplicates) {
      client = await this.mergeIntoCanonicalClient(duplicate.id, client.id, preferredName, ownDisplayName) ?? client
    }

    linkWhatsappJids(client.id, aliases)
    client = updateGeneratedWhatsappClientName(client.id, preferredName, ownDisplayName) ?? client
    return { client, phoneJid }
  }

  private pendingMessageKey(rawMessage: WAMessage) {
    return rawMessage.key.id
      || `${rawMessage.key.remoteJid ?? "unknown"}:${String(rawMessage.messageTimestamp ?? "")}:${messageText(rawMessage)}`
  }

  private deferMessage(rawMessage: WAMessage, evaluate: boolean) {
    const key = this.pendingMessageKey(rawMessage)
    if (!this.pendingMessages.has(key) && this.pendingMessages.size >= 2_000) {
      const oldest = this.pendingMessages.keys().next().value
      if (oldest) this.pendingMessages.delete(oldest)
    }
    this.pendingMessages.set(key, { message: rawMessage, evaluate })
  }

  private async flushPendingMessages() {
    const pending = [...this.pendingMessages.values()]
    this.pendingMessages.clear()
    for (const item of pending) await this.storeIncomingMessage(item.message, item.evaluate)
  }

  private async reconcileWhatsappClients(socket: WASocket) {
    const ownDisplayName = this.ownDisplayName(socket)
    for (const source of getClients()) {
      const lidJid = `${normalizePhone(source.phone)}@lid`
      const phoneJid = await this.resolvePhoneJid(socket, lidJid, null)
      if (!phoneJid || jidPhone(phoneJid) === normalizePhone(source.phone)) continue

      const preferredName = this.contactNames.get(lidJid) || this.contactNames.get(phoneJid)
      let target = getClientByPhone(jidPhone(phoneJid)) ?? ensureWhatsappClient(jidPhone(phoneJid), preferredName)
      target = await this.mergeIntoCanonicalClient(source.id, target.id, preferredName, ownDisplayName) ?? target
      linkWhatsappJids(target.id, [lidJid, phoneJid])
      updateGeneratedWhatsappClientName(target.id, preferredName, ownDisplayName)
    }
  }

  private async storeIncomingMessage(rawMessage: WAMessage, evaluate: boolean) {
    const remoteJid = normalizedJid(rawMessage.key.remoteJid)
    const body = messageText(rawMessage).trim()
    if (!remoteJid || !body || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) return
    if (!isPhoneJid(remoteJid) && !isLidJid(remoteJid)) return

    const identity = await this.resolveMessageClient(rawMessage)
    if (!identity) {
      if (isLidJid(remoteJid)) this.deferMessage(rawMessage, evaluate)
      return
    }
    const { client, phoneJid } = identity
    const seconds = Number(rawMessage.messageTimestamp ?? Math.floor(Date.now() / 1000))
    const message = saveMessage({
      clientId: client.id,
      remoteJid,
      whatsappId: rawMessage.key.id ?? null,
      direction: rawMessage.key.fromMe ? "outgoing" : "incoming",
      body,
      status: rawMessage.key.fromMe ? "sent" : "received",
      readAt: rawMessage.key.fromMe && rawMessage.status != null && rawMessage.status >= WAMessageStatus.READ
        ? new Date(seconds * 1000).toISOString()
        : null,
      timestamp: new Date(seconds * 1000).toISOString(),
    })
    this.emit({ type: "message", clientId: client.id, message })
    if (evaluate) {
      void import("@/lib/assistant/service").then(({ scheduleAssistantEvaluation }) => scheduleAssistantEvaluation(client.id, message))
    }
    void this.syncProfilePicture(client.id, phoneJid)
  }

  async sendText(clientId: string, body: string, options: { evaluate?: boolean } = {}) {
    const client = getClient(clientId)
    if (!client) throw new Error("El cliente no existe")
    if (this.status.state !== "connected" || !this.socket) throw new Error("WhatsApp no está conectado")

    const remoteJid = `${normalizePhone(client.phone)}@s.whatsapp.net`
    const result = await this.socket.sendMessage(remoteJid, { text: body.trim() })
    const message = saveMessage({
      clientId,
      remoteJid,
      whatsappId: result?.key.id ?? null,
      direction: "outgoing",
      body: body.trim(),
      status: "sent",
    })
    this.emit({ type: "message", clientId, message })
    if (options.evaluate !== false) {
      void import("@/lib/assistant/service").then(({ scheduleAssistantEvaluation }) => scheduleAssistantEvaluation(clientId, message))
    }
    void this.syncProfilePicture(clientId, remoteJid)
    return message
  }

  /**
   * Pide a WhatsApp mensajes anteriores al más antiguo que ya tenemos. La
   * respuesta llega de forma asíncrona por `messaging-history.set` y se
   * persiste con el mismo camino idempotente de la sincronización inicial.
   */
  async fetchMessageHistory(clientId: string) {
    const socket = this.socket
    if (this.status.state !== "connected" || !socket) return false

    const now = Date.now()
    if (now - (this.historySyncTimes.get(clientId) ?? 0) < 10 * 60 * 1000) return false

    const oldest = getMessages(clientId).find((message) =>
      message.channel === "publico" && message.whatsappId && !message.remoteJid.startsWith("assistant@"),
    )
    if (!oldest?.whatsappId) return false

    const timestamp = Date.parse(oldest.timestamp)
    if (!Number.isFinite(timestamp)) return false

    await socket.fetchMessageHistory(
      100,
      {
        remoteJid: oldest.remoteJid,
        fromMe: oldest.direction === "outgoing",
        id: oldest.whatsappId,
      },
      timestamp,
    )
    this.historySyncTimes.set(clientId, now)
    return true
  }

  private async syncAllProfilePictures() {
    for (const client of getClients()) {
      const phoneJid = `${normalizePhone(client.phone)}@s.whatsapp.net`
      const jids = [...new Set([client.lastMessage?.remoteJid, phoneJid].filter(Boolean))] as string[]
      for (const jid of jids) {
        if (await this.syncProfilePicture(client.id, jid)) break
      }
    }
  }

  private async syncProfilePicture(clientId: string, jid: string) {
    const socket = this.socket
    if (!socket) return false

    const now = Date.now()
    const lastSync = this.profileSyncTimes.get(clientId) ?? 0
    if (now - lastSync < 6 * 60 * 60 * 1000) return false
    const lastAttempt = this.profileSyncAttemptTimes.get(clientId) ?? 0
    if (now - lastAttempt < 15 * 60 * 1000) return false
    this.profileSyncAttemptTimes.set(clientId, now)
    try {
      const client = getClient(clientId)
      const phoneJid = client ? `${normalizePhone(client.phone)}@s.whatsapp.net` : null
      const candidates = [...new Set([jid, phoneJid].filter((value): value is string => Boolean(value)))]

      // Los chats nuevos pueden llegar como @lid. Resolver también el JID
      // que WhatsApp tiene asociado al número aumenta la tasa de recuperación.
      if (phoneJid) {
        try {
          const resolved = (await socket.onWhatsApp(phoneJid))?.[0]
          if (resolved?.jid && !candidates.includes(resolved.jid)) candidates.unshift(resolved.jid)
        } catch {
          // La resolución es opcional: seguimos intentando con ambos JID conocidos.
        }
      }

      let pictureUrl: string | undefined
      for (const candidate of candidates) {
        for (const type of ["preview", "image"] as const) {
          try {
            pictureUrl = await socket.profilePictureUrl(candidate, type, 5_000)
          } catch {
            // WhatsApp puede denegar la imagen completa y permitir solo la vista previa.
          }
          if (pictureUrl) break
        }
        if (pictureUrl) break
      }
      if (!pictureUrl) return false

      const response = await fetch(pictureUrl, { signal: AbortSignal.timeout(12_000) })
      if (!response.ok) return false
      const contentType = response.headers.get("content-type") ?? ""
      if (contentType && !contentType.startsWith("image/")) return false

      const image = new Uint8Array(await response.arrayBuffer())
      if (image.byteLength === 0 || image.byteLength > 5 * 1024 * 1024) return false

      ensureAvatarDirectory()
      const finalPath = clientAvatarPath(clientId)
      const temporaryPath = `${finalPath}.${process.pid}.tmp`
      await fs.promises.writeFile(temporaryPath, image)
      await fs.promises.rename(temporaryPath, finalPath)

      const avatarUpdatedAt = markClientAvatarUpdated(clientId)
      this.profileSyncTimes.set(clientId, now)
      this.emit({ type: "profile", clientId, avatarUpdatedAt })
      return true
    } catch {
      // La privacidad del contacto o un error temporal pueden impedir obtener la foto.
      return false
    }
  }

  async refreshProfilePicture(clientId: string) {
    const client = getClient(clientId)
    if (!client) return false
    const phoneJid = `${normalizePhone(client.phone)}@s.whatsapp.net`
    const remoteJid = client.lastMessage?.remoteJid
    return this.syncProfilePicture(clientId, remoteJid && !remoteJid.startsWith("assistant@") ? remoteJid : phoneJid)
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.end(undefined)
    this.socket = null
    this.setStatus({ state: "disconnected", qrDataUrl: null, user: null, error: null })
  }
}

const globalForWhatsapp = globalThis as unknown as { whatsappManager?: WhatsappManager }
export const whatsappManager = globalForWhatsapp.whatsappManager ?? new WhatsappManager()
if (process.env.NODE_ENV !== "production") globalForWhatsapp.whatsappManager = whatsappManager
