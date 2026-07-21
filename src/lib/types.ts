export type ContactHistory = {
  id: string
  clientId: string
  title: string
  description: string
  dueAt: string | null
  repeatCount: number
  repeatInterval: number
  repeatUnit: "days" | "hours" | "minutes"
  isCompleted: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ConversationAuthor = "cliente" | "usuario" | "asistente"
export type ConversationChannel = "publico" | "privado"
export type ConversationMessageType = "mensaje" | "sugerencia"

export type AssistantActionType =
  | "actualizar_cliente"
  | "eliminar_cliente"
  | "crear_tarea"
  | "actualizar_tarea"
  | "completar_tarea"
  | "eliminar_tarea"
  | "enviar_mensaje"

export type AssistantActionPayload = {
  firstName?: string
  lastName?: string
  dni?: string
  email?: string
  phone?: string
  taskId?: string
  title?: string
  description?: string
  dueAt?: string | null
  clearDueAt?: boolean
  repeatCount?: number
  repeatInterval?: number
  repeatUnit?: "days" | "hours" | "minutes"
  message?: string
  expectedUpdatedAt?: string
}

export type AssistantSuggestionStatus = "pendiente" | "ejecutada" | "descartada" | "cancelada"

export type WorkspaceAssistantActionType =
  | "crear_cliente"
  | "actualizar_cliente"
  | "eliminar_cliente"
  | "crear_tarea"
  | "actualizar_tarea"
  | "completar_tarea"
  | "eliminar_tarea"
  | "enviar_mensaje"
  | "enviar_campana"
  | "abrir_conversacion"

export type WorkspaceAssistantRecipient = {
  clientId: string
  message: string
}

export type WorkspaceAssistantActionPayload = AssistantActionPayload & {
  clientId?: string
  recipients?: WorkspaceAssistantRecipient[]
}

export type WorkspaceAssistantSuggestion = {
  id: string
  messageId: string
  actionType: WorkspaceAssistantActionType
  payload: WorkspaceAssistantActionPayload
  status: AssistantSuggestionStatus
  statusChangedAt: string
  resultSummary: string | null
  createdAt: string
}

export type WorkspaceAssistantMessage = {
  id: string
  author: "usuario" | "asistente"
  body: string
  type: "mensaje" | "sugerencia"
  timestamp: string
  suggestion: WorkspaceAssistantSuggestion | null
}

export type AssistantSuggestion = {
  id: string
  messageId: string
  clientId: string
  actionType: AssistantActionType
  payload: AssistantActionPayload
  status: AssistantSuggestionStatus
  statusChangedAt: string
  resultSummary: string | null
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
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  history: ContactHistory[]
  lastMessage: Message | null
  unansweredCount: number
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
  author: ConversationAuthor
  channel: ConversationChannel
  type: ConversationMessageType
  assistantMode: "directo" | "proactivo" | null
  suggestion: AssistantSuggestion | null
}

export type WhatsappConnectionStatus = {
  state: "disconnected" | "connecting" | "qr" | "connected" | "error"
  qrDataUrl: string | null
  user: string | null
  error: string | null
}
