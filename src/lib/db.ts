import "server-only"

import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import Database from "better-sqlite3"
import type { Client, ContactHistory, Message } from "@/lib/types"

const dataDirectory = path.join(process.cwd(), ".data")
fs.mkdirSync(dataDirectory, { recursive: true })

const globalForDb = globalThis as unknown as { crmDb?: Database.Database }
const db = globalForDb.crmDb ?? new Database(path.join(dataDirectory, "mini-crm.sqlite"))

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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_history (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    contact_date TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    remote_jid TEXT NOT NULL,
    whatsapp_id TEXT UNIQUE,
    direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('received', 'sent', 'failed')),
    read_at TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_client_date ON contact_history(client_id, contact_date DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_client_time ON messages(client_id, timestamp ASC);
`)

const clientColumns = db.pragma("table_info(clients)") as Array<{ name: string }>
if (!clientColumns.some((column) => column.name === "avatar_updated_at")) {
  db.exec("ALTER TABLE clients ADD COLUMN avatar_updated_at TEXT")
}

const messageColumns = db.pragma("table_info(messages)") as Array<{ name: string }>
if (!messageColumns.some((column) => column.name === "read_at")) {
  db.exec("ALTER TABLE messages ADD COLUMN read_at TEXT")
}

type ClientRow = {
  id: string
  first_name: string
  last_name: string
  dni: string
  email: string
  phone: string
  avatar_updated_at: string | null
  created_at: string
  updated_at: string
}

type HistoryRow = {
  id: string
  client_id: string
  contact_date: string
  description: string
  created_at: string
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
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}

function mapHistory(row: HistoryRow): ContactHistory {
  return {
    id: row.id,
    clientId: row.client_id,
    contactDate: row.contact_date,
    description: row.description,
    createdAt: row.created_at,
  }
}

function mapMessage(row: MessageRow): Message {
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
  }
}

function mapClient(row: ClientRow): Client {
  const history = db
    .prepare("SELECT * FROM contact_history WHERE client_id = ? ORDER BY contact_date DESC, created_at DESC")
    .all(row.id) as HistoryRow[]
  const lastMessage = db
    .prepare("SELECT * FROM messages WHERE client_id = ? ORDER BY timestamp DESC LIMIT 1")
    .get(row.id) as MessageRow | undefined

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dni: row.dni,
    email: row.email,
    phone: row.phone,
    avatarUpdatedAt: row.avatar_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: history.map(mapHistory),
    lastMessage: lastMessage ? mapMessage(lastMessage) : null,
  }
}

export function getClients(): Client[] {
  const rows = db
    .prepare(`
      SELECT c.* FROM clients c
      LEFT JOIN messages m ON m.id = (
        SELECT id FROM messages WHERE client_id = c.id ORDER BY timestamp DESC LIMIT 1
      )
      ORDER BY COALESCE(m.timestamp, c.updated_at) DESC
    `)
    .all() as ClientRow[]
  return rows.map(mapClient)
}

export function getClient(id: string): Client | null {
  const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientRow | undefined
  return row ? mapClient(row) : null
}

export function getClientByPhone(phone: string): Client | null {
  const row = db
    .prepare("SELECT * FROM clients WHERE phone_normalized = ?")
    .get(normalizePhone(phone)) as ClientRow | undefined
  return row ? mapClient(row) : null
}

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
  return db.prepare("DELETE FROM clients WHERE id = ?").run(id).changes > 0
}

export function markClientAvatarUpdated(id: string, updatedAt = new Date().toISOString()) {
  db.prepare("UPDATE clients SET avatar_updated_at = ? WHERE id = ?").run(updatedAt, id)
  return updatedAt
}

export function addContactHistory(clientId: string, contactDate: string, description: string) {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  db.prepare(`
    INSERT INTO contact_history (id, client_id, contact_date, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, clientId, contactDate, description.trim(), createdAt)
  return mapHistory({ id, client_id: clientId, contact_date: contactDate, description: description.trim(), created_at: createdAt })
}

export function deleteContactHistory(id: string) {
  return db.prepare("DELETE FROM contact_history WHERE id = ?").run(id).changes > 0
}

export function ensureWhatsappClient(phone: string, displayName?: string): Client {
  const existing = getClientByPhone(phone)
  if (existing) return existing

  const parts = (displayName || "Contacto WhatsApp").trim().split(/\s+/)
  return createClient({
    firstName: parts.shift() || "Contacto",
    lastName: parts.join(" "),
    phone: `+${normalizePhone(phone)}`,
  })
}

export function getMessages(clientId: string): Message[] {
  return (db
    .prepare("SELECT * FROM messages WHERE client_id = ? ORDER BY timestamp ASC")
    .all(clientId) as MessageRow[]).map(mapMessage)
}

export function saveMessage(input: {
  clientId: string
  remoteJid: string
  whatsappId?: string | null
  direction: "incoming" | "outgoing"
  body: string
  status: "received" | "sent" | "failed"
  readAt?: string | null
  timestamp?: string
}): Message {
  const id = randomUUID()
  const timestamp = input.timestamp ?? new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, client_id, remote_jid, whatsapp_id, direction, body, status, read_at, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.clientId, input.remoteJid, input.whatsappId ?? null, input.direction, input.body, input.status, input.readAt ?? null, timestamp)

  if (input.whatsappId && input.readAt) {
    db.prepare("UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE whatsapp_id = ?").run(input.readAt, input.whatsappId)
  }

  const row = input.whatsappId
    ? (db.prepare("SELECT * FROM messages WHERE whatsapp_id = ?").get(input.whatsappId) as MessageRow)
    : (db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow)
  return mapMessage(row)
}

export function markMessageRead(whatsappId: string, readAt = new Date().toISOString()): Message | null {
  db.prepare("UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE whatsapp_id = ?").run(readAt, whatsappId)
  const row = db.prepare("SELECT * FROM messages WHERE whatsapp_id = ?").get(whatsappId) as MessageRow | undefined
  return row ? mapMessage(row) : null
}

export default db
