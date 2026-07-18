export type ContactHistory = {
  id: string
  clientId: string
  contactDate: string
  description: string
  createdAt: string
}

export type Client = {
  id: string
  firstName: string
  lastName: string
  dni: string
  email: string
  phone: string
  avatarUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  history: ContactHistory[]
  lastMessage: Message | null
}

export type Message = {
  id: string
  clientId: string
  remoteJid: string
  whatsappId: string | null
  direction: "incoming" | "outgoing"
  body: string
  status: "received" | "sent" | "failed"
  readAt: string | null
  timestamp: string
}

export type WhatsappConnectionStatus = {
  state: "disconnected" | "connecting" | "qr" | "connected" | "error"
  qrDataUrl: string | null
  user: string | null
  error: string | null
}
