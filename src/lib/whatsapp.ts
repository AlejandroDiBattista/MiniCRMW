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
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys"
import { clientAvatarPath, ensureAvatarDirectory } from "@/lib/avatar"
import { ensureWhatsappClient, getClient, getClients, markClientAvatarUpdated, markMessageRead, normalizePhone, saveMessage } from "@/lib/db"
import type { Message, WhatsappConnectionStatus } from "@/lib/types"

type WhatsappEvent =
  | { type: "status"; status: WhatsappConnectionStatus }
  | { type: "message"; clientId: string; message: Message }
  | { type: "profile"; clientId: string; avatarUpdatedAt: string }

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

class WhatsappManager {
  private socket: WASocket | null = null
  private connecting: Promise<void> | null = null
  private listeners = new Set<Listener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private profileSyncTimes = new Map<string, number>()
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
    const credentialsFile = path.join(process.cwd(), ".baileys-auth", "creds.json")
    if (fs.existsSync(credentialsFile)) await this.connect()
  }

  private async openSocket() {
    this.setStatus({ state: "connecting", qrDataUrl: null, error: null })
    const authDirectory = path.join(process.cwd(), ".baileys-auth")
    fs.mkdirSync(authDirectory, { recursive: true })
    const { state, saveCreds } = await createMultiFileAuthState(authDirectory)

    const socket = makeWASocket({
      auth: state,
      browser: ["Lazo CRM", "Chrome", "1.0.0"],
      logger: pino({ level: process.env.NODE_ENV === "development" ? "warn" : "silent" }),
      markOnlineOnConnect: false,
      syncFullHistory: true,
    })
    this.socket = socket

    socket.ev.on("creds.update", saveCreds)
    socket.ev.on("connection.update", async (update) => {
      if (update.qr) {
        const qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 })
        this.setStatus({ state: "qr", qrDataUrl, error: null })
      }

      if (update.connection === "open") {
        this.setStatus({
          state: "connected",
          qrDataUrl: null,
          user: socket.user?.id ? jidNormalizedUser(socket.user.id).split("@")[0] : null,
          error: null,
        })
        setTimeout(() => void this.syncAllProfilePictures(), 1500)
      }

      if (update.connection === "close") {
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

    socket.ev.on("messages.upsert", ({ messages }) => {
      for (const rawMessage of messages) {
        void this.storeIncomingMessage(rawMessage)
      }
    })

    socket.ev.on("messages.update", (updates) => {
      for (const { key, update } of updates) {
        if (!key.fromMe || !key.id || update.status == null || update.status < WAMessageStatus.READ) continue
        const seconds = Number(update.messageTimestamp ?? Math.floor(Date.now() / 1000))
        const message = markMessageRead(key.id, new Date(seconds * 1000).toISOString())
        if (message) this.emit({ type: "message", clientId: message.clientId, message })
      }
    })
  }

  private async storeIncomingMessage(rawMessage: WAMessage) {
    const remoteJid = rawMessage.key.remoteJid
    const body = messageText(rawMessage).trim()
    if (!remoteJid || !body || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) return

    const phoneJid = rawMessage.key.remoteJidAlt?.endsWith("@s.whatsapp.net")
      ? rawMessage.key.remoteJidAlt
      : remoteJid
    if (!phoneJid.endsWith("@s.whatsapp.net") && !phoneJid.endsWith("@lid")) return
    const phone = phoneJid.split("@")[0].split(":")[0]
    const client = ensureWhatsappClient(phone, rawMessage.pushName ?? undefined)
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
    void this.syncProfilePicture(client.id, phoneJid)
  }

  async sendText(clientId: string, body: string) {
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
    void this.syncProfilePicture(clientId, remoteJid)
    return message
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
    try {
      let pictureUrl: string | undefined
      for (const type of ["preview", "image"] as const) {
        try {
          pictureUrl = await socket.profilePictureUrl(jid, type, 10_000)
        } catch {
          // WhatsApp puede denegar la imagen completa y permitir solo la vista previa.
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
