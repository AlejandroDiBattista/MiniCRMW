import "server-only"

import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import Database from "better-sqlite3"
import { dataDirectory } from "@/lib/storage"
import type {
  AssistantActionPayload,
  AssistantActionType,
  AssistantSuggestion,
  AssistantSuggestionStatus,
  Client,
  ContactHistory,
  ConversationAuthor,
  ConversationChannel,
  ConversationMessageType,
  Message,
  WorkspaceAssistantActionPayload,
  WorkspaceAssistantActionType,
  WorkspaceAssistantMessage,
  WorkspaceAssistantRecipient,
  WorkspaceAssistantSuggestion,
} from "@/lib/types"

fs.mkdirSync(dataDirectory, { recursive: true })

const globalForDb = globalThis as unknown as { crmDb?: Database.Database }
const db = globalForDb.crmDb ?? new Database(path.join(/* turbopackIgnore: true */ dataDirectory, "mini-crm.sqlite"))

const historyTableSql = `
  CREATE TABLE IF NOT EXISTS contact_history (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    due_at TEXT,
    repeat_count INTEGER NOT NULL DEFAULT 0 CHECK(repeat_count >= 0),
    repeat_interval INTEGER NOT NULL DEFAULT 1 CHECK(repeat_interval > 0),
    repeat_unit TEXT NOT NULL DEFAULT 'days' CHECK(repeat_unit IN ('days', 'hours', 'minutes')),
    is_completed INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0, 1)),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`

if (process.env.NODE_ENV !== "production") globalForDb.crmDb = db

db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    dni TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL,
    phone_normalized TEXT NOT NULL UNIQUE,
    avatar_updated_at TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  ${historyTableSql};

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    remote_jid TEXT NOT NULL,
    whatsapp_id TEXT UNIQUE,
    direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('received', 'sent', 'failed')),
    read_at TEXT,
    timestamp TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'usuario' CHECK(author IN ('cliente', 'usuario', 'asistente')),
    channel TEXT NOT NULL DEFAULT 'publico' CHECK(channel IN ('publico', 'privado')),
    message_type TEXT NOT NULL DEFAULT 'mensaje' CHECK(message_type IN ('mensaje', 'sugerencia')),
    assistant_mode TEXT CHECK(assistant_mode IN ('directo', 'proactivo'))
  );

  CREATE TABLE IF NOT EXISTS assistant_suggestions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK(action_type IN (
      'actualizar_cliente', 'eliminar_cliente', 'crear_tarea', 'actualizar_tarea',
      'completar_tarea', 'eliminar_tarea', 'enviar_mensaje'
    )),
    action_payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente', 'ejecutada', 'descartada', 'cancelada')),
    status_changed_at TEXT NOT NULL,
    result_summary TEXT,
    execution_token TEXT,
    execution_started_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assistant_evaluations (
    source_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT
  );

  CREATE TABLE IF NOT EXISTS workspace_assistant_messages (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL CHECK(author IN ('usuario', 'asistente')),
    body TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'mensaje' CHECK(message_type IN ('mensaje', 'sugerencia')),
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspace_assistant_suggestions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE REFERENCES workspace_assistant_messages(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK(action_type IN (
      'crear_cliente', 'actualizar_cliente', 'eliminar_cliente', 'crear_tarea',
      'actualizar_tarea', 'completar_tarea', 'eliminar_tarea', 'enviar_mensaje',
      'enviar_campana', 'abrir_conversacion'
    )),
    action_payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente', 'ejecutada', 'descartada', 'cancelada')),
    status_changed_at TEXT NOT NULL,
    result_summary TEXT,
    execution_token TEXT,
    execution_started_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspace_assistant_deliveries (
    suggestion_id TEXT NOT NULL REFERENCES workspace_assistant_suggestions(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente', 'enviado')),
    whatsapp_message_id TEXT,
    error TEXT,
    sent_at TEXT,
    PRIMARY KEY (suggestion_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS whatsapp_jid_aliases (
    jid TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_client_time ON messages(client_id, timestamp ASC);
  CREATE INDEX IF NOT EXISTS idx_suggestions_client_status ON assistant_suggestions(client_id, status, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_workspace_messages_time ON workspace_assistant_messages(timestamp ASC);
  CREATE INDEX IF NOT EXISTS idx_workspace_suggestions_status ON workspace_assistant_suggestions(status, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_jid_aliases_client ON whatsapp_jid_aliases(client_id);
`)

let historyColumns = db.pragma("table_info(contact_history)") as Array<{ name: string }>
if (!historyColumns.some((column) => column.name === "title")) {
  db.exec(`
    DROP TABLE contact_history;
    ${historyTableSql};
  `)
  historyColumns = db.pragma("table_info(contact_history)") as Array<{ name: string }>
}
if (!historyColumns.some((column) => column.name === "updated_at")) {
  db.exec("ALTER TABLE contact_history ADD COLUMN updated_at TEXT")
  db.exec("UPDATE contact_history SET updated_at = created_at WHERE updated_at IS NULL")
}
db.exec("CREATE INDEX IF NOT EXISTS idx_history_client_status_due ON contact_history(client_id, is_completed, due_at, created_at)")

const clientColumns = db.pragma("table_info(clients)") as Array<{ name: string }>
if (!clientColumns.some((column) => column.name === "avatar_updated_at")) {
  db.exec("ALTER TABLE clients ADD COLUMN avatar_updated_at TEXT")
}
if (!clientColumns.some((column) => column.name === "deleted_at")) {
  db.exec("ALTER TABLE clients ADD COLUMN deleted_at TEXT")
}

const messageColumns = db.pragma("table_info(messages)") as Array<{ name: string }>
if (!messageColumns.some((column) => column.name === "read_at")) {
  db.exec("ALTER TABLE messages ADD COLUMN read_at TEXT")
}
if (!messageColumns.some((column) => column.name === "author")) {
  db.exec("ALTER TABLE messages ADD COLUMN author TEXT NOT NULL DEFAULT 'usuario'")
  db.exec("UPDATE messages SET author = CASE WHEN direction = 'incoming' THEN 'cliente' ELSE 'usuario' END")
}
if (!messageColumns.some((column) => column.name === "channel")) {
  db.exec("ALTER TABLE messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'publico'")
}
if (!messageColumns.some((column) => column.name === "message_type")) {
  db.exec("ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'mensaje'")
}
if (!messageColumns.some((column) => column.name === "assistant_mode")) {
  db.exec("ALTER TABLE messages ADD COLUMN assistant_mode TEXT")
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_client_channel_time ON messages(client_id, channel, timestamp ASC);
  CREATE TABLE IF NOT EXISTS assistant_suggestions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK(action_type IN (
      'actualizar_cliente', 'eliminar_cliente', 'crear_tarea', 'actualizar_tarea',
      'completar_tarea', 'eliminar_tarea', 'enviar_mensaje'
    )),
    action_payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente', 'ejecutada', 'descartada', 'cancelada')),
    status_changed_at TEXT NOT NULL,
    result_summary TEXT,
    execution_token TEXT,
    execution_started_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assistant_evaluations (
    source_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_suggestions_client_status ON assistant_suggestions(client_id, status, created_at ASC);
`)

type ClientRow = {
  id: string
  first_name: string
  last_name: string
  dni: string
  email: string
  phone: string
  avatar_updated_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

type HistoryRow = {
  id: string
  client_id: string
  title: string
  description: string
  due_at: string | null
  repeat_count: number
  repeat_interval: number
  repeat_unit: "days" | "hours" | "minutes"
  is_completed: 0 | 1
  completed_at: string | null
  created_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  client_id: string
  remote_jid: string
  whatsapp_id: string | null
  direction: "incoming" | "outgoing"
  body: string
  status: "received" | "sent" | "failed"
  read_at: string | null
  timestamp: string
  author: ConversationAuthor
  channel: ConversationChannel
  message_type: ConversationMessageType
  assistant_mode: "directo" | "proactivo" | null
  suggestion_id?: string | null
  suggestion_action_type?: AssistantActionType | null
  suggestion_action_payload?: string | null
  suggestion_status?: AssistantSuggestionStatus | null
  suggestion_status_changed_at?: string | null
  suggestion_result_summary?: string | null
  suggestion_created_at?: string | null
}

type SuggestionRow = {
  id: string
  message_id: string
  client_id: string
  action_type: AssistantActionType
  action_payload: string
  status: AssistantSuggestionStatus
  status_changed_at: string
  result_summary: string | null
  execution_token: string | null
  execution_started_at: string | null
  created_at: string
}

type WorkspaceSuggestionRow = {
  id: string
  message_id: string
  action_type: WorkspaceAssistantActionType
  action_payload: string
  status: AssistantSuggestionStatus
  status_changed_at: string
  result_summary: string | null
  execution_token: string | null
  execution_started_at: string | null
  created_at: string
}

type WorkspaceMessageRow = {
  id: string
  author: "usuario" | "asistente"
  body: string
  message_type: "mensaje" | "sugerencia"
  timestamp: string
  suggestion_id?: string | null
  suggestion_action_type?: WorkspaceAssistantActionType | null
  suggestion_action_payload?: string | null
  suggestion_status?: AssistantSuggestionStatus | null
  suggestion_status_changed_at?: string | null
  suggestion_result_summary?: string | null
  suggestion_created_at?: string | null
}

export type WorkspaceAssistantDelivery = {
  suggestionId: string
  clientId: string
  message: string
  status: "pendiente" | "enviado"
  whatsappMessageId: string | null
  error: string | null
  sentAt: string | null
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}

export function runInDatabaseTransaction<T>(operation: () => T): T {
  return db.transaction(operation)()
}

function mapHistory(row: HistoryRow): ContactHistory {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    repeatCount: row.repeat_count,
    repeatInterval: row.repeat_interval,
    repeatUnit: row.repeat_unit,
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseActionPayload(payload: string): AssistantActionPayload {
  try {
    const value = JSON.parse(payload)
    return value && typeof value === "object" && !Array.isArray(value) ? value as AssistantActionPayload : {}
  } catch {
    return {}
  }
}

function mapSuggestion(row: SuggestionRow): AssistantSuggestion {
  return {
    id: row.id,
    messageId: row.message_id,
    clientId: row.client_id,
    actionType: row.action_type,
    payload: parseActionPayload(row.action_payload),
    status: row.status,
    statusChangedAt: row.status_changed_at,
    resultSummary: row.result_summary,
    createdAt: row.created_at,
  }
}

function parseWorkspaceActionPayload(payload: string): WorkspaceAssistantActionPayload {
  try {
    const value = JSON.parse(payload)
    return value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceAssistantActionPayload : {}
  } catch {
    return {}
  }
}

function mapWorkspaceSuggestion(row: WorkspaceSuggestionRow): WorkspaceAssistantSuggestion {
  return {
    id: row.id,
    messageId: row.message_id,
    actionType: row.action_type,
    payload: parseWorkspaceActionPayload(row.action_payload),
    status: row.status,
    statusChangedAt: row.status_changed_at,
    resultSummary: row.result_summary,
    createdAt: row.created_at,
  }
}

function mapWorkspaceMessage(row: WorkspaceMessageRow): WorkspaceAssistantMessage {
  const suggestion = row.suggestion_id && row.suggestion_action_type && row.suggestion_action_payload && row.suggestion_status && row.suggestion_status_changed_at && row.suggestion_created_at
    ? mapWorkspaceSuggestion({
      id: row.suggestion_id,
      message_id: row.id,
      action_type: row.suggestion_action_type,
      action_payload: row.suggestion_action_payload,
      status: row.suggestion_status,
      status_changed_at: row.suggestion_status_changed_at,
      result_summary: row.suggestion_result_summary ?? null,
      execution_token: null,
      execution_started_at: null,
      created_at: row.suggestion_created_at,
    })
    : null
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    type: row.message_type,
    timestamp: row.timestamp,
    suggestion,
  }
}

function mapMessage(row: MessageRow): Message {
  const suggestion = row.suggestion_id && row.suggestion_action_type && row.suggestion_action_payload && row.suggestion_status && row.suggestion_status_changed_at && row.suggestion_created_at
    ? mapSuggestion({
      id: row.suggestion_id,
      message_id: row.id,
      client_id: row.client_id,
      action_type: row.suggestion_action_type,
      action_payload: row.suggestion_action_payload,
      status: row.suggestion_status,
      status_changed_at: row.suggestion_status_changed_at,
      result_summary: row.suggestion_result_summary ?? null,
      execution_token: null,
      execution_started_at: null,
      created_at: row.suggestion_created_at,
    })
    : null
  return {
    id: row.id,
    clientId: row.client_id,
    remoteJid: row.remote_jid,
    whatsappId: row.whatsapp_id,
    direction: row.direction,
    body: row.body,
    status: row.status,
    readAt: row.read_at,
    timestamp: row.timestamp,
    author: row.author,
    channel: row.channel,
    type: row.message_type,
    assistantMode: row.assistant_mode ?? null,
    suggestion,
  }
}

const messageWithSuggestionSelect = `
  SELECT
    m.*,
    s.id AS suggestion_id,
    s.action_type AS suggestion_action_type,
    s.action_payload AS suggestion_action_payload,
    s.status AS suggestion_status,
    s.status_changed_at AS suggestion_status_changed_at,
    s.result_summary AS suggestion_result_summary,
    s.created_at AS suggestion_created_at
  FROM messages m
  LEFT JOIN assistant_suggestions s ON s.message_id = m.id
`

function mapClient(row: ClientRow): Client {
  const history = db
    .prepare(`
      SELECT * FROM contact_history
      WHERE client_id = ?
      ORDER BY
        is_completed ASC,
        CASE WHEN is_completed = 0 THEN COALESCE(due_at, created_at) END ASC,
        CASE WHEN is_completed = 1 THEN COALESCE(completed_at, due_at, created_at) END DESC
    `)
    .all(row.id) as HistoryRow[]
  const lastMessage = db
    .prepare(`${messageWithSuggestionSelect} WHERE m.client_id = ? AND m.channel = 'publico' ORDER BY m.timestamp DESC LIMIT 1`)
    .get(row.id) as MessageRow | undefined
  const unanswered = db.prepare(`
    SELECT COUNT(*) AS count
    FROM messages incoming
    WHERE incoming.client_id = ?
      AND incoming.channel = 'publico'
      AND incoming.direction = 'incoming'
      AND incoming.timestamp > COALESCE((
        SELECT MAX(outgoing.timestamp)
        FROM messages outgoing
        WHERE outgoing.client_id = ?
          AND outgoing.channel = 'publico'
          AND outgoing.direction = 'outgoing'
          AND outgoing.status <> 'failed'
      ), '')
  `).get(row.id, row.id) as { count: number }

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dni: row.dni,
    email: row.email,
    phone: row.phone,
    avatarUpdatedAt: row.avatar_updated_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: history.map(mapHistory),
    lastMessage: lastMessage ? mapMessage(lastMessage) : null,
    unansweredCount: unanswered.count,
  }
}

export function getClients(): Client[] {
  const rows = db
    .prepare(`
      SELECT c.* FROM clients c
      LEFT JOIN messages m ON m.id = (
        SELECT id FROM messages WHERE client_id = c.id AND channel = 'publico' ORDER BY timestamp DESC LIMIT 1
      )
      WHERE c.deleted_at IS NULL
      ORDER BY COALESCE(m.timestamp, c.updated_at) DESC
    `)
    .all() as ClientRow[]
  return rows.map(mapClient)
}

export function getClient(id: string): Client | null {
  const row = db.prepare("SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL").get(id) as ClientRow | undefined
  return row ? mapClient(row) : null
}

export function getClientByPhone(phone: string): Client | null {
  const row = db
    .prepare("SELECT * FROM clients WHERE phone_normalized = ? AND deleted_at IS NULL")
    .get(normalizePhone(phone)) as ClientRow | undefined
  return row ? mapClient(row) : null
}

export function getClientByWhatsappJid(jid: string): Client | null {
  const row = db.prepare(`
    SELECT c.*
    FROM whatsapp_jid_aliases a
    JOIN clients c ON c.id = a.client_id
    WHERE a.jid = ? AND c.deleted_at IS NULL
  `).get(jid) as ClientRow | undefined
  return row ? mapClient(row) : null
}

export const linkWhatsappJids = db.transaction((clientId: string, jids: string[]) => {
  const now = new Date().toISOString()
  const statement = db.prepare(`
    INSERT INTO whatsapp_jid_aliases (jid, client_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET
      client_id = excluded.client_id,
      updated_at = excluded.updated_at
  `)

  for (const jid of new Set(jids.map((value) => value.trim()).filter(Boolean))) {
    statement.run(jid, clientId, now, now)
  }
})

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
}

function rowDisplayName(row: ClientRow) {
  return `${row.first_name} ${row.last_name}`.trim().replace(/\s+/g, " ")
}

function isGeneratedWhatsappName(value: string, ownDisplayName?: string | null) {
  const normalized = normalizedName(value)
  return !normalized
    || normalized === "contacto whatsapp"
    || Boolean(ownDisplayName && normalized === normalizedName(ownDisplayName))
}

function splitDisplayName(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean)
  return {
    firstName: parts.shift() || "Contacto",
    lastName: parts.join(" "),
  }
}

export function updateGeneratedWhatsappClientName(
  clientId: string,
  displayName: string | undefined,
  ownDisplayName?: string | null,
) {
  const candidate = displayName?.trim()
  if (!candidate || isGeneratedWhatsappName(candidate, ownDisplayName)) return getClient(clientId)

  const row = db.prepare("SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL").get(clientId) as ClientRow | undefined
  if (!row || !isGeneratedWhatsappName(rowDisplayName(row), ownDisplayName)) return row ? mapClient(row) : null

  const name = splitDisplayName(candidate)
  db.prepare("UPDATE clients SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?")
    .run(name.firstName, name.lastName, new Date().toISOString(), clientId)
  return getClient(clientId)
}

function replaceClientIdInPayload(
  value: unknown,
  sourceClientId: string,
  targetClientId: string,
  targetUpdatedAt: string,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replaceClientIdInPayload(item, sourceClientId, targetClientId, targetUpdatedAt))
  }
  if (!value || typeof value !== "object") return value

  const next: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    next[key] = key === "clientId" && item === sourceClientId
      ? targetClientId
      : replaceClientIdInPayload(item, sourceClientId, targetClientId, targetUpdatedAt)
  }
  if (next.clientId === targetClientId && "expectedUpdatedAt" in next) next.expectedUpdatedAt = targetUpdatedAt
  return next
}

function rewriteSuggestionPayloads(sourceClientId: string, targetClientId: string, targetUpdatedAt: string) {
  const tables = [
    { name: "assistant_suggestions", where: "client_id = ? OR instr(action_payload, ?) > 0", scoped: true },
    { name: "workspace_assistant_suggestions", where: "instr(action_payload, ?) > 0", scoped: false },
  ] as const
  for (const table of tables) {
    const params = table.scoped ? [sourceClientId, sourceClientId] : [sourceClientId]
    const rows = db.prepare(`SELECT id, action_payload FROM ${table.name} WHERE ${table.where}`)
      .all(...params) as Array<{ id: string; action_payload: string }>
    const statement = db.prepare(`UPDATE ${table.name} SET action_payload = ? WHERE id = ?`)
    for (const row of rows) {
      try {
        const payload = replaceClientIdInPayload(JSON.parse(row.action_payload), sourceClientId, targetClientId, targetUpdatedAt)
        if (table.scoped && payload && typeof payload === "object" && !Array.isArray(payload) && "expectedUpdatedAt" in payload) {
          ;(payload as Record<string, unknown>).expectedUpdatedAt = targetUpdatedAt
        }
        statement.run(JSON.stringify(payload), row.id)
      } catch {
        // Un payload inválido no debe impedir recuperar mensajes y tareas.
      }
    }
  }
}

export type WhatsappClientMergeResult = {
  sourceClientId: string
  targetClientId: string
  client: Client
}

export const mergeWhatsappClients = db.transaction((
  sourceClientId: string,
  targetClientId: string,
  options: { preferredName?: string; ownDisplayName?: string | null } = {},
): WhatsappClientMergeResult | null => {
  if (sourceClientId === targetClientId) return null

  const source = db.prepare("SELECT * FROM clients WHERE id = ?").get(sourceClientId) as ClientRow | undefined
  const target = db.prepare("SELECT * FROM clients WHERE id = ?").get(targetClientId) as ClientRow | undefined
  if (!source || !target) return null

  const targetName = rowDisplayName(target)
  const sourceName = rowDisplayName(source)
  const preferredName = options.preferredName?.trim()
  let mergedName = targetName
  if (isGeneratedWhatsappName(targetName, options.ownDisplayName)) {
    mergedName = preferredName && !isGeneratedWhatsappName(preferredName, options.ownDisplayName)
      ? preferredName
      : !isGeneratedWhatsappName(sourceName, options.ownDisplayName)
        ? sourceName
        : "Contacto WhatsApp"
  }
  const splitName = splitDisplayName(mergedName)
  const updatedAt = new Date().toISOString()
  const createdAt = source.created_at < target.created_at ? source.created_at : target.created_at

  db.prepare(`
    UPDATE clients
    SET first_name = ?, last_name = ?, dni = ?, email = ?, avatar_updated_at = ?,
        deleted_at = NULL, created_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    splitName.firstName,
    splitName.lastName,
    target.dni || source.dni,
    target.email || source.email,
    target.avatar_updated_at || source.avatar_updated_at,
    createdAt,
    updatedAt,
    targetClientId,
  )

  rewriteSuggestionPayloads(sourceClientId, targetClientId, updatedAt)

  db.prepare("UPDATE contact_history SET client_id = ? WHERE client_id = ?").run(targetClientId, sourceClientId)
  db.prepare("UPDATE messages SET client_id = ? WHERE client_id = ?").run(targetClientId, sourceClientId)
  db.prepare("UPDATE assistant_suggestions SET client_id = ? WHERE client_id = ?").run(targetClientId, sourceClientId)
  db.prepare("UPDATE assistant_evaluations SET client_id = ? WHERE client_id = ?").run(targetClientId, sourceClientId)

  const deliveries = db.prepare("SELECT * FROM workspace_assistant_deliveries WHERE client_id = ?")
    .all(sourceClientId) as Array<{
      suggestion_id: string
      message: string
      status: "pendiente" | "enviado"
      whatsapp_message_id: string | null
      error: string | null
      sent_at: string | null
    }>
  const existingDelivery = db.prepare("SELECT * FROM workspace_assistant_deliveries WHERE suggestion_id = ? AND client_id = ?")
  const insertDelivery = db.prepare(`
    INSERT INTO workspace_assistant_deliveries
      (suggestion_id, client_id, message, status, whatsapp_message_id, error, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const updateDelivery = db.prepare(`
    UPDATE workspace_assistant_deliveries
    SET message = ?, status = ?, whatsapp_message_id = ?, error = ?, sent_at = ?
    WHERE suggestion_id = ? AND client_id = ?
  `)
  for (const delivery of deliveries) {
    const existing = existingDelivery.get(delivery.suggestion_id, targetClientId) as typeof delivery | undefined
    if (!existing) {
      insertDelivery.run(
        delivery.suggestion_id,
        targetClientId,
        delivery.message,
        delivery.status,
        delivery.whatsapp_message_id,
        delivery.error,
        delivery.sent_at,
      )
    } else if (delivery.status === "enviado" && existing.status !== "enviado") {
      updateDelivery.run(
        delivery.message,
        delivery.status,
        delivery.whatsapp_message_id,
        delivery.error,
        delivery.sent_at,
        delivery.suggestion_id,
        targetClientId,
      )
    }
  }
  db.prepare("DELETE FROM workspace_assistant_deliveries WHERE client_id = ?").run(sourceClientId)

  db.prepare("UPDATE whatsapp_jid_aliases SET client_id = ?, updated_at = ? WHERE client_id = ?")
    .run(targetClientId, updatedAt, sourceClientId)
  db.prepare("DELETE FROM clients WHERE id = ?").run(sourceClientId)

  const client = getClient(targetClientId)
  return client ? { sourceClientId, targetClientId, client } : null
})

export function createClient(input: {
  firstName: string
  lastName?: string
  dni?: string
  email?: string
  phone: string
}): Client {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO clients (id, first_name, last_name, dni, email, phone, phone_normalized, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.firstName.trim(),
    input.lastName?.trim() ?? "",
    input.dni?.trim() ?? "",
    input.email?.trim().toLowerCase() ?? "",
    input.phone.trim(),
    normalizePhone(input.phone),
    now,
    now,
  )
  return getClient(id)!
}

export function updateClient(
  id: string,
  input: { firstName: string; lastName?: string; dni?: string; email?: string; phone: string },
): Client | null {
  db.prepare(`
    UPDATE clients
    SET first_name = ?, last_name = ?, dni = ?, email = ?, phone = ?, phone_normalized = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.firstName.trim(),
    input.lastName?.trim() ?? "",
    input.dni?.trim() ?? "",
    input.email?.trim().toLowerCase() ?? "",
    input.phone.trim(),
    normalizePhone(input.phone),
    new Date().toISOString(),
    id,
  )
  return getClient(id)
}

export function deleteClient(id: string) {
  const deletedAt = new Date().toISOString()
  return db.prepare("UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").run(deletedAt, deletedAt, id).changes > 0
}

export function markClientAvatarUpdated(id: string, updatedAt = new Date().toISOString()) {
  db.prepare("UPDATE clients SET avatar_updated_at = ? WHERE id = ?").run(updatedAt, id)
  return updatedAt
}

export function addContactHistory(clientId: string, input: {
  title: string
  description: string
  dueAt?: string | null
  repeatCount: number
  repeatInterval: number
  repeatUnit: "days" | "hours" | "minutes"
}) {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : null
  const isCompleted = dueAt !== null && new Date(dueAt).getTime() <= new Date(createdAt).getTime()
  const completedAt = isCompleted ? createdAt : null
  db.prepare(`
    INSERT INTO contact_history
      (id, client_id, title, description, due_at, repeat_count, repeat_interval, repeat_unit, is_completed, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clientId,
    input.title.trim(),
    input.description.trim(),
    dueAt,
    input.repeatCount,
    input.repeatInterval,
    input.repeatUnit,
    isCompleted ? 1 : 0,
    completedAt,
    createdAt,
    createdAt,
  )
  return mapHistory({
    id,
    client_id: clientId,
    title: input.title.trim(),
    description: input.description.trim(),
    due_at: dueAt,
    repeat_count: input.repeatCount,
    repeat_interval: input.repeatInterval,
    repeat_unit: input.repeatUnit,
    is_completed: isCompleted ? 1 : 0,
    completed_at: completedAt,
    created_at: createdAt,
    updated_at: createdAt,
  })
}

export function getContactHistory(id: string): ContactHistory | null {
  const row = db.prepare("SELECT * FROM contact_history WHERE id = ?").get(id) as HistoryRow | undefined
  return row ? mapHistory(row) : null
}

export function updateContactHistory(id: string, input: {
  title: string
  description: string
  dueAt?: string | null
  repeatCount: number
  repeatInterval: number
  repeatUnit: "days" | "hours" | "minutes"
}) {
  const updatedAt = new Date().toISOString()
  const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : null
  const result = db.prepare(`
    UPDATE contact_history
    SET title = ?, description = ?, due_at = ?, repeat_count = ?, repeat_interval = ?, repeat_unit = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.title.trim(),
    input.description.trim(),
    dueAt,
    input.repeatCount,
    input.repeatInterval,
    input.repeatUnit,
    updatedAt,
    id,
  )
  return result.changes > 0 ? getContactHistory(id) : null
}

function addRepeatInterval(date: Date, amount: number, unit: HistoryRow["repeat_unit"]) {
  const milliseconds = unit === "days"
    ? amount * 24 * 60 * 60 * 1_000
    : unit === "hours"
      ? amount * 60 * 60 * 1_000
      : amount * 60 * 1_000
  return new Date(date.getTime() + milliseconds).toISOString()
}

export const completeContactHistory = db.transaction((id: string) => {
  const task = db.prepare("SELECT * FROM contact_history WHERE id = ?").get(id) as HistoryRow | undefined
  if (!task || task.is_completed) return null

  const completedAt = new Date().toISOString()
  db.prepare("UPDATE contact_history SET is_completed = 1, completed_at = ?, updated_at = ? WHERE id = ?").run(completedAt, completedAt, id)

  let nextTask: ContactHistory | null = null
  if (task.repeat_count > 0) {
    const nextId = randomUUID()
    const nextDueAt = addRepeatInterval(new Date(completedAt), task.repeat_interval, task.repeat_unit)
    const nextRow: HistoryRow = {
      ...task,
      id: nextId,
      due_at: nextDueAt,
      repeat_count: task.repeat_count - 1,
      is_completed: 0,
      completed_at: null,
      created_at: completedAt,
      updated_at: completedAt,
    }
    db.prepare(`
      INSERT INTO contact_history
        (id, client_id, title, description, due_at, repeat_count, repeat_interval, repeat_unit, is_completed, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(
      nextRow.id,
      nextRow.client_id,
      nextRow.title,
      nextRow.description,
      nextRow.due_at,
      nextRow.repeat_count,
      nextRow.repeat_interval,
      nextRow.repeat_unit,
      nextRow.created_at,
      nextRow.updated_at,
    )
    nextTask = mapHistory(nextRow)
  }

  return {
    completed: mapHistory({ ...task, is_completed: 1, completed_at: completedAt, updated_at: completedAt }),
    nextTask,
  }
})

export function deleteContactHistory(id: string) {
  return db.prepare("DELETE FROM contact_history WHERE id = ?").run(id).changes > 0
}

export function ensureWhatsappClient(phone: string, displayName?: string): Client {
  const existing = getClientByPhone(phone)
  if (existing) return existing

  const deleted = db.prepare("SELECT id FROM clients WHERE phone_normalized = ? AND deleted_at IS NOT NULL").get(normalizePhone(phone)) as { id: string } | undefined
  if (deleted) {
    const restoredAt = new Date().toISOString()
    db.prepare("UPDATE clients SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(restoredAt, deleted.id)
    return getClient(deleted.id)!
  }

  const parts = (displayName || "Contacto WhatsApp").trim().split(/\s+/)
  return createClient({
    firstName: parts.shift() || "Contacto",
    lastName: parts.join(" "),
    phone: `+${normalizePhone(phone)}`,
  })
}

type SaveMessageInput = {
  clientId: string
  remoteJid: string
  whatsappId?: string | null
  direction: "incoming" | "outgoing"
  body: string
  status: "received" | "sent" | "failed"
  readAt?: string | null
  timestamp?: string
  author?: ConversationAuthor
  channel?: ConversationChannel
  type?: ConversationMessageType
  assistantMode?: "directo" | "proactivo" | null
}

export function getMessages(clientId: string): Message[] {
  return (db
    .prepare(`${messageWithSuggestionSelect} WHERE m.client_id = ? ORDER BY m.timestamp ASC, m.rowid ASC`)
    .all(clientId) as MessageRow[]).map(mapMessage)
}

export function getMessage(id: string): Message | null {
  const row = db.prepare(`${messageWithSuggestionSelect} WHERE m.id = ?`).get(id) as MessageRow | undefined
  return row ? mapMessage(row) : null
}

function insertMessage(input: SaveMessageInput): Message {
  const id = randomUUID()
  const timestamp = input.timestamp ?? new Date().toISOString()
  const channel = input.channel ?? "publico"
  const author = input.author ?? (input.direction === "incoming" ? "cliente" : "usuario")
  const type = input.type ?? "mensaje"
  const assistantMode = input.assistantMode ?? null
  db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, client_id, remote_jid, whatsapp_id, direction, body, status, read_at, timestamp, author, channel, message_type, assistant_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.clientId,
    input.remoteJid,
    input.whatsappId ?? null,
    input.direction,
    input.body,
    input.status,
    input.readAt ?? null,
    timestamp,
    author,
    channel,
    type,
    assistantMode,
  )

  if (input.whatsappId && input.readAt) {
    db.prepare("UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE whatsapp_id = ?").run(input.readAt, input.whatsappId)
  }

  const savedId = input.whatsappId
    ? (db.prepare("SELECT id FROM messages WHERE whatsapp_id = ?").get(input.whatsappId) as { id: string }).id
    : id
  return getMessage(savedId)!
}

export function saveMessage(input: SaveMessageInput): Message {
  return insertMessage(input)
}

export function markMessageRead(whatsappId: string, readAt = new Date().toISOString()): Message | null {
  db.prepare("UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE whatsapp_id = ?").run(readAt, whatsappId)
  const row = db.prepare("SELECT id FROM messages WHERE whatsapp_id = ?").get(whatsappId) as { id: string } | undefined
  return row ? getMessage(row.id) : null
}

function cancelPendingSuggestionsNow(clientId: string, changedAt = new Date().toISOString()) {
  // This path is reserved for explicit user activity (new text, channel
  // changes, or dismissal). Confirming a suggestion uses the scoped settle
  // functions below and must not come through here.
  return db.prepare(`
    UPDATE assistant_suggestions
    SET status = 'cancelada', status_changed_at = ?, execution_token = NULL, execution_started_at = NULL
    WHERE client_id = ? AND status = 'pendiente' AND execution_token IS NULL
  `).run(changedAt, clientId).changes
}

export function cancelPendingSuggestions(clientId: string) {
  return cancelPendingSuggestionsNow(clientId)
}

export const savePrivateUserMessage = db.transaction((clientId: string, body: string) => {
  cancelPendingSuggestionsNow(clientId)
  db.prepare("DELETE FROM messages WHERE client_id = ? AND assistant_mode = 'proactivo' AND message_type = 'sugerencia'").run(clientId)
  return insertMessage({
    clientId,
    remoteJid: "assistant@private",
    direction: "outgoing",
    body: body.trim(),
    status: "sent",
    author: "usuario",
    channel: "privado",
  })
})

export const saveAssistantOutput = db.transaction((clientId: string, output: {
  message: string | null
  suggestions: Array<{ text: string; actionType: AssistantActionType; payload: AssistantActionPayload }>
  mode: "directo" | "proactivo"
}) => {
  const saved: Message[] = []
  const baseTime = Date.now()

  if (output.message?.trim()) {
    saved.push(insertMessage({
      clientId,
      remoteJid: "assistant@private",
      direction: "incoming",
      body: output.message.trim(),
      status: "received",
      timestamp: new Date(baseTime).toISOString(),
      author: "asistente",
      channel: "privado",
      assistantMode: output.mode,
    }))
  }

  output.suggestions.forEach((suggestion, index) => {
    const timestamp = new Date(baseTime + index + 1).toISOString()
    const message = insertMessage({
      clientId,
      remoteJid: "assistant@private",
      direction: "incoming",
      body: suggestion.text.trim(),
      status: "received",
      timestamp,
      author: "asistente",
      channel: "privado",
      type: "sugerencia",
      assistantMode: output.mode,
    })
    const id = randomUUID()
    db.prepare(`
      INSERT INTO assistant_suggestions
        (id, message_id, client_id, action_type, action_payload, status, status_changed_at, result_summary, created_at)
      VALUES (?, ?, ?, ?, ?, 'pendiente', ?, NULL, ?)
    `).run(
      id,
      message.id,
      clientId,
      suggestion.actionType,
      JSON.stringify(suggestion.payload),
      timestamp,
      timestamp,
    )
    saved.push(getMessage(message.id)!)
  })

  return saved
})

/** Removes proactive suggestion cards after the user dismisses them. */
export function discardProactiveAssistantSuggestions(clientId: string) {
  return db.transaction((id: string) => {
    const changedAt = new Date().toISOString()
    db.prepare(`
      UPDATE assistant_suggestions
      SET status = 'cancelada', status_changed_at = ?, execution_token = NULL, execution_started_at = NULL
      WHERE client_id = ? AND status = 'pendiente'
        AND message_id IN (
          SELECT id FROM messages
          WHERE client_id = ? AND assistant_mode = 'proactivo' AND message_type = 'sugerencia'
        )
    `).run(changedAt, id, id)
    return db.prepare(`
      DELETE FROM messages
      WHERE client_id = ? AND assistant_mode = 'proactivo' AND message_type = 'sugerencia'
    `).run(id).changes
  })(clientId)
}

export function discardProactiveAssistantSuggestion(messageId: string) {
  return db.prepare(`
    DELETE FROM messages
    WHERE id = ? AND assistant_mode = 'proactivo' AND message_type = 'sugerencia'
  `).run(messageId).changes > 0
}

export function getAssistantSuggestion(id: string): AssistantSuggestion | null {
  const row = db.prepare("SELECT * FROM assistant_suggestions WHERE id = ?").get(id) as SuggestionRow | undefined
  return row ? mapSuggestion(row) : null
}

export type SuggestionClaim =
  | { ok: true; suggestion: AssistantSuggestion }
  | { ok: false; reason: "not_found" | "settled" | "busy"; suggestion?: AssistantSuggestion }

export const claimAssistantSuggestion = db.transaction((id: string, token: string): SuggestionClaim => {
  const row = db.prepare("SELECT * FROM assistant_suggestions WHERE id = ?").get(id) as SuggestionRow | undefined
  if (!row) return { ok: false, reason: "not_found" }
  if (row.status !== "pendiente") return { ok: false, reason: "settled", suggestion: mapSuggestion(row) }
  if (row.execution_token) return { ok: false, reason: "busy", suggestion: mapSuggestion(row) }

  const anotherExecution = db.prepare(`
    SELECT 1 FROM assistant_suggestions
    WHERE client_id = ? AND status = 'pendiente' AND execution_token IS NOT NULL
    LIMIT 1
  `).get(row.client_id)
  if (anotherExecution) return { ok: false, reason: "busy", suggestion: mapSuggestion(row) }

  const startedAt = new Date().toISOString()
  const claimed = db.prepare(`
    UPDATE assistant_suggestions
    SET execution_token = ?, execution_started_at = ?
    WHERE id = ? AND status = 'pendiente' AND execution_token IS NULL
  `).run(token, startedAt, id).changes
  return claimed === 1
    ? { ok: true, suggestion: mapSuggestion({ ...row, execution_token: token, execution_started_at: startedAt }) }
    : { ok: false, reason: "busy", suggestion: mapSuggestion(row) }
})

export function releaseAssistantSuggestion(id: string, token: string) {
  return db.prepare(`
    UPDATE assistant_suggestions
    SET execution_token = NULL, execution_started_at = NULL
    WHERE id = ? AND status = 'pendiente' AND execution_token = ?
  `).run(id, token).changes === 1
}

// Settling is intentionally scoped to the selected suggestion. Other pending
// suggestions from the same assistant response remain available for review.
export const executeAssistantSuggestion = db.transaction((id: string, token: string, resultSummary: string) => {
  const row = db.prepare("SELECT * FROM assistant_suggestions WHERE id = ?").get(id) as SuggestionRow | undefined
  if (!row || row.status !== "pendiente" || row.execution_token !== token) return null

  const changedAt = new Date().toISOString()
  db.prepare(`
    UPDATE assistant_suggestions
    SET status = 'ejecutada', status_changed_at = ?, result_summary = ?, execution_token = NULL, execution_started_at = NULL
    WHERE id = ?
  `).run(changedAt, resultSummary.trim(), id)

  return getAssistantSuggestion(id)
})

export const resolveAssistantSuggestionInteractively = db.transaction((
  id: string,
  outcome: "ejecutada" | "descartada",
  resultSummary: string,
) => {
  const row = db.prepare("SELECT * FROM assistant_suggestions WHERE id = ?").get(id) as SuggestionRow | undefined
  if (!row) return { reason: "not_found" as const, suggestion: null }
  if (row.status !== "pendiente") return { reason: "settled" as const, suggestion: mapSuggestion(row) }
  if (row.execution_token) return { reason: "busy" as const, suggestion: mapSuggestion(row) }

  const changedAt = new Date().toISOString()
  db.prepare(`
    UPDATE assistant_suggestions
    SET status = ?, status_changed_at = ?, result_summary = ?, execution_token = NULL, execution_started_at = NULL
    WHERE id = ? AND status = 'pendiente' AND execution_token IS NULL
  `).run(outcome, changedAt, outcome === "ejecutada" ? resultSummary.trim() : null, id)

  return { reason: null, suggestion: getAssistantSuggestion(id) }
})

const workspaceMessageWithSuggestionSelect = `
  SELECT
    m.*,
    s.id AS suggestion_id,
    s.action_type AS suggestion_action_type,
    s.action_payload AS suggestion_action_payload,
    s.status AS suggestion_status,
    s.status_changed_at AS suggestion_status_changed_at,
    s.result_summary AS suggestion_result_summary,
    s.created_at AS suggestion_created_at
  FROM workspace_assistant_messages m
  LEFT JOIN workspace_assistant_suggestions s ON s.message_id = m.id
`

export function getWorkspaceAssistantMessages(): WorkspaceAssistantMessage[] {
  return (db.prepare(`${workspaceMessageWithSuggestionSelect} ORDER BY m.timestamp ASC, m.rowid ASC`).all() as WorkspaceMessageRow[])
    .map(mapWorkspaceMessage)
}

function insertWorkspaceAssistantMessage(input: {
  author: "usuario" | "asistente"
  body: string
  type?: "mensaje" | "sugerencia"
  timestamp?: string
}) {
  const id = randomUUID()
  const timestamp = input.timestamp ?? new Date().toISOString()
  db.prepare(`
    INSERT INTO workspace_assistant_messages (id, author, body, message_type, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.author, input.body.trim(), input.type ?? "mensaje", timestamp)
  const row = db.prepare(`${workspaceMessageWithSuggestionSelect} WHERE m.id = ?`).get(id) as WorkspaceMessageRow
  return mapWorkspaceMessage(row)
}

function cancelWorkspaceAssistantSuggestionsNow(changedAt = new Date().toISOString()) {
  return db.prepare(`
    UPDATE workspace_assistant_suggestions
    SET status = 'cancelada', status_changed_at = ?, execution_token = NULL, execution_started_at = NULL
    WHERE status = 'pendiente' AND execution_token IS NULL
  `).run(changedAt).changes
}

export const saveWorkspaceAssistantUserMessage = db.transaction((body: string) => {
  cancelWorkspaceAssistantSuggestionsNow()
  return insertWorkspaceAssistantMessage({ author: "usuario", body })
})

export const saveWorkspaceAssistantOutput = db.transaction((output: {
  message: string | null
  suggestions: Array<{
    text: string
    actionType: WorkspaceAssistantActionType
    payload: WorkspaceAssistantActionPayload
  }>
}) => {
  const saved: WorkspaceAssistantMessage[] = []
  const baseTime = Date.now()

  if (output.message?.trim()) {
    saved.push(insertWorkspaceAssistantMessage({
      author: "asistente",
      body: output.message,
      timestamp: new Date(baseTime).toISOString(),
    }))
  }

  output.suggestions.forEach((suggestion, index) => {
    const timestamp = new Date(baseTime + index + 1).toISOString()
    const message = insertWorkspaceAssistantMessage({
      author: "asistente",
      body: suggestion.text,
      type: "sugerencia",
      timestamp,
    })
    const id = randomUUID()
    db.prepare(`
      INSERT INTO workspace_assistant_suggestions
        (id, message_id, action_type, action_payload, status, status_changed_at, result_summary, created_at)
      VALUES (?, ?, ?, ?, 'pendiente', ?, NULL, ?)
    `).run(id, message.id, suggestion.actionType, JSON.stringify(suggestion.payload), timestamp, timestamp)

    const recipients = suggestion.actionType === "enviar_campana"
      ? suggestion.payload.recipients ?? []
      : suggestion.actionType === "enviar_mensaje" && suggestion.payload.clientId && suggestion.payload.message
        ? [{ clientId: suggestion.payload.clientId, message: suggestion.payload.message }]
        : []
    for (const recipient of recipients) {
      db.prepare(`
        INSERT OR IGNORE INTO workspace_assistant_deliveries (suggestion_id, client_id, message)
        VALUES (?, ?, ?)
      `).run(id, recipient.clientId, recipient.message)
    }

    const row = db.prepare(`${workspaceMessageWithSuggestionSelect} WHERE m.id = ?`).get(message.id) as WorkspaceMessageRow
    saved.push(mapWorkspaceMessage(row))
  })

  return saved
})

export function getWorkspaceAssistantSuggestion(id: string): WorkspaceAssistantSuggestion | null {
  const row = db.prepare("SELECT * FROM workspace_assistant_suggestions WHERE id = ?").get(id) as WorkspaceSuggestionRow | undefined
  return row ? mapWorkspaceSuggestion(row) : null
}

export type WorkspaceSuggestionClaim =
  | { ok: true; suggestion: WorkspaceAssistantSuggestion }
  | { ok: false; reason: "not_found" | "settled" | "busy"; suggestion?: WorkspaceAssistantSuggestion }

export const claimWorkspaceAssistantSuggestion = db.transaction((id: string, token: string): WorkspaceSuggestionClaim => {
  const row = db.prepare("SELECT * FROM workspace_assistant_suggestions WHERE id = ?").get(id) as WorkspaceSuggestionRow | undefined
  if (!row) return { ok: false, reason: "not_found" }
  if (row.status !== "pendiente") return { ok: false, reason: "settled", suggestion: mapWorkspaceSuggestion(row) }
  if (row.execution_token) return { ok: false, reason: "busy", suggestion: mapWorkspaceSuggestion(row) }
  if (db.prepare("SELECT 1 FROM workspace_assistant_suggestions WHERE status = 'pendiente' AND execution_token IS NOT NULL LIMIT 1").get()) {
    return { ok: false, reason: "busy", suggestion: mapWorkspaceSuggestion(row) }
  }

  const startedAt = new Date().toISOString()
  const claimed = db.prepare(`
    UPDATE workspace_assistant_suggestions
    SET execution_token = ?, execution_started_at = ?
    WHERE id = ? AND status = 'pendiente' AND execution_token IS NULL
  `).run(token, startedAt, id).changes
  return claimed === 1
    ? { ok: true, suggestion: mapWorkspaceSuggestion({ ...row, execution_token: token, execution_started_at: startedAt }) }
    : { ok: false, reason: "busy", suggestion: mapWorkspaceSuggestion(row) }
})

export function releaseWorkspaceAssistantSuggestion(id: string, token: string) {
  return db.prepare(`
    UPDATE workspace_assistant_suggestions
    SET execution_token = NULL, execution_started_at = NULL
    WHERE id = ? AND status = 'pendiente' AND execution_token = ?
  `).run(id, token).changes === 1
}

// Workspace suggestions are independent as well: confirming one must not
// implicitly discard the rest of the assistant's proposed actions.
export const executeWorkspaceAssistantSuggestion = db.transaction((id: string, token: string, resultSummary: string) => {
  const row = db.prepare("SELECT * FROM workspace_assistant_suggestions WHERE id = ?").get(id) as WorkspaceSuggestionRow | undefined
  if (!row || row.status !== "pendiente" || row.execution_token !== token) return null
  const changedAt = new Date().toISOString()
  db.prepare(`
    UPDATE workspace_assistant_suggestions
    SET status = 'ejecutada', status_changed_at = ?, result_summary = ?, execution_token = NULL, execution_started_at = NULL
    WHERE id = ?
  `).run(changedAt, resultSummary.trim(), id)
  return getWorkspaceAssistantSuggestion(id)
})

export const resolveWorkspaceAssistantSuggestionInteractively = db.transaction((
  id: string,
  outcome: "ejecutada" | "descartada",
  resultSummary: string,
) => {
  const row = db.prepare("SELECT * FROM workspace_assistant_suggestions WHERE id = ?").get(id) as WorkspaceSuggestionRow | undefined
  if (!row) return { reason: "not_found" as const, suggestion: null }
  if (row.status !== "pendiente") return { reason: "settled" as const, suggestion: mapWorkspaceSuggestion(row) }
  if (row.execution_token) return { reason: "busy" as const, suggestion: mapWorkspaceSuggestion(row) }

  const changedAt = new Date().toISOString()
  db.prepare(`
    UPDATE workspace_assistant_suggestions
    SET status = ?, status_changed_at = ?, result_summary = ?, execution_token = NULL, execution_started_at = NULL
    WHERE id = ? AND status = 'pendiente' AND execution_token IS NULL
  `).run(outcome, changedAt, outcome === "ejecutada" ? resultSummary.trim() : null, id)

  return { reason: null, suggestion: getWorkspaceAssistantSuggestion(id) }
})

export function getWorkspaceAssistantDeliveries(suggestionId: string): WorkspaceAssistantDelivery[] {
  const rows = db.prepare(`
    SELECT suggestion_id, client_id, message, status, whatsapp_message_id, error, sent_at
    FROM workspace_assistant_deliveries WHERE suggestion_id = ? ORDER BY rowid ASC
  `).all(suggestionId) as Array<{
    suggestion_id: string
    client_id: string
    message: string
    status: "pendiente" | "enviado"
    whatsapp_message_id: string | null
    error: string | null
    sent_at: string | null
  }>
  return rows.map((row) => ({
    suggestionId: row.suggestion_id,
    clientId: row.client_id,
    message: row.message,
    status: row.status,
    whatsappMessageId: row.whatsapp_message_id,
    error: row.error,
    sentAt: row.sent_at,
  }))
}

export const replacePendingWorkspaceAssistantDeliveries = db.transaction((
  suggestionId: string,
  token: string,
  recipients: WorkspaceAssistantRecipient[],
) => {
  const suggestion = db.prepare(`
    SELECT id FROM workspace_assistant_suggestions
    WHERE id = ? AND status = 'pendiente' AND execution_token = ?
  `).get(suggestionId, token)
  if (!suggestion) return false

  db.prepare("DELETE FROM workspace_assistant_deliveries WHERE suggestion_id = ? AND status = 'pendiente'").run(suggestionId)
  for (const recipient of recipients) {
    db.prepare(`
      INSERT OR IGNORE INTO workspace_assistant_deliveries (suggestion_id, client_id, message)
      VALUES (?, ?, ?)
    `).run(suggestionId, recipient.clientId, recipient.message.trim())
  }
  return true
})

export function markWorkspaceAssistantDeliverySent(suggestionId: string, clientId: string, whatsappMessageId: string | null) {
  const sentAt = new Date().toISOString()
  return db.prepare(`
    UPDATE workspace_assistant_deliveries
    SET status = 'enviado', whatsapp_message_id = ?, error = NULL, sent_at = ?
    WHERE suggestion_id = ? AND client_id = ? AND status = 'pendiente'
  `).run(whatsappMessageId, sentAt, suggestionId, clientId).changes === 1
}

export function markWorkspaceAssistantDeliveryError(suggestionId: string, clientId: string, error: string) {
  db.prepare(`
    UPDATE workspace_assistant_deliveries SET error = ?
    WHERE suggestion_id = ? AND client_id = ? AND status = 'pendiente'
  `).run(error.slice(0, 160), suggestionId, clientId)
}

export function claimAssistantEvaluation(clientId: string, sourceMessageId: string) {
  const startedAt = new Date().toISOString()
  return db.prepare(`
    INSERT OR IGNORE INTO assistant_evaluations (source_message_id, client_id, status, started_at)
    VALUES (?, ?, 'running', ?)
  `).run(sourceMessageId, clientId, startedAt).changes === 1
}

export function finishAssistantEvaluation(sourceMessageId: string, errorCode?: string) {
  const completedAt = new Date().toISOString()
  db.prepare(`
    UPDATE assistant_evaluations
    SET status = ?, completed_at = ?, error_code = ?
    WHERE source_message_id = ?
  `).run(errorCode ? "failed" : "completed", completedAt, errorCode ?? null, sourceMessageId)
}

export default db
