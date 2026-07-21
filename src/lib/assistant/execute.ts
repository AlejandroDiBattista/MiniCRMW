import "server-only"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  addContactHistory,
  claimAssistantSuggestion,
  completeContactHistory,
  deleteClient,
  deleteContactHistory,
  discardProactiveAssistantSuggestion,
  executeAssistantSuggestion as settleAssistantSuggestion,
  getAssistantSuggestion,
  getClient,
  getContactHistory,
  getMessages,
  getMessage,
  normalizePhone,
  releaseAssistantSuggestion,
  runInDatabaseTransaction,
  updateClient,
  updateContactHistory,
} from "@/lib/db"
import { whatsappManager } from "@/lib/whatsapp"
import type { AssistantSuggestion } from "@/lib/types"
import { assistantEvents } from "./events"
import { scheduleAssistantEvaluation } from "./service"

const clientValuesSchema = z.object({
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().max(120),
  dni: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email()]),
  phone: z.string().trim().refine((value) => normalizePhone(value).length >= 8),
})

const taskValuesSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2_000),
  dueAt: z.string().datetime().nullable(),
  repeatCount: z.number().int().min(0).max(999),
  repeatInterval: z.number().int().min(1).max(525_600),
  repeatUnit: z.enum(["days", "hours", "minutes"]),
})

export class AssistantActionError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
    this.name = "AssistantActionError"
  }
}

function assertVersion(current: string, expected?: string) {
  if (!expected || current !== expected) {
    throw new AssistantActionError("Los datos cambiaron desde que se generó la sugerencia. Pedile al asistente que la prepare nuevamente.")
  }
}

function executeDatabaseAction(suggestion: AssistantSuggestion) {
  const client = getClient(suggestion.clientId)
  if (!client) throw new AssistantActionError("El cliente ya no está disponible.", 404)
  const payload = suggestion.payload

  switch (suggestion.actionType) {
    case "actualizar_cliente": {
      assertVersion(client.updatedAt, payload.expectedUpdatedAt)
      const values = clientValuesSchema.safeParse({
        firstName: payload.firstName ?? client.firstName,
        lastName: payload.lastName ?? client.lastName,
        dni: payload.dni ?? client.dni,
        email: payload.email ?? client.email,
        phone: payload.phone ?? client.phone,
      })
      if (!values.success) throw new AssistantActionError("La sugerencia contiene datos de cliente inválidos.", 422)
      updateClient(client.id, values.data)
      return { summary: "Ficha del cliente actualizada.", clientDeleted: false }
    }
    case "eliminar_cliente":
      assertVersion(client.updatedAt, payload.expectedUpdatedAt)
      if (!deleteClient(client.id)) throw new AssistantActionError("El cliente ya había sido eliminado.", 404)
      return { summary: "Cliente eliminado.", clientDeleted: true }
    case "crear_tarea": {
      const values = taskValuesSchema.safeParse({
        title: payload.title,
        description: payload.description ?? "",
        dueAt: payload.dueAt ?? null,
        repeatCount: payload.repeatCount ?? 0,
        repeatInterval: payload.repeatInterval ?? 1,
        repeatUnit: payload.repeatUnit ?? "days",
      })
      if (!values.success) throw new AssistantActionError("La sugerencia contiene datos de tarea inválidos.", 422)
      addContactHistory(client.id, values.data)
      return { summary: `Tarea “${values.data.title}” creada.`, clientDeleted: false }
    }
    case "actualizar_tarea": {
      const task = payload.taskId ? getContactHistory(payload.taskId) : null
      if (!task || task.clientId !== client.id) throw new AssistantActionError("La tarea ya no existe.", 404)
      assertVersion(task.updatedAt, payload.expectedUpdatedAt)
      const values = taskValuesSchema.safeParse({
        title: payload.title ?? task.title,
        description: payload.description ?? task.description,
        dueAt: payload.clearDueAt ? null : payload.dueAt !== undefined ? payload.dueAt : task.dueAt,
        repeatCount: payload.repeatCount ?? task.repeatCount,
        repeatInterval: payload.repeatInterval ?? task.repeatInterval,
        repeatUnit: payload.repeatUnit ?? task.repeatUnit,
      })
      if (!values.success) throw new AssistantActionError("La sugerencia contiene datos de tarea inválidos.", 422)
      updateContactHistory(task.id, values.data)
      return { summary: `Tarea “${values.data.title}” actualizada.`, clientDeleted: false }
    }
    case "completar_tarea": {
      const task = payload.taskId ? getContactHistory(payload.taskId) : null
      if (!task || task.clientId !== client.id) throw new AssistantActionError("La tarea ya no existe.", 404)
      assertVersion(task.updatedAt, payload.expectedUpdatedAt)
      if (!completeContactHistory(task.id)) throw new AssistantActionError("La tarea ya estaba completada.")
      return { summary: `Tarea “${task.title}” completada.`, clientDeleted: false }
    }
    case "eliminar_tarea": {
      const task = payload.taskId ? getContactHistory(payload.taskId) : null
      if (!task || task.clientId !== client.id) throw new AssistantActionError("La tarea ya no existe.", 404)
      assertVersion(task.updatedAt, payload.expectedUpdatedAt)
      if (!deleteContactHistory(task.id)) throw new AssistantActionError("La tarea ya había sido eliminada.", 404)
      return { summary: `Tarea “${task.title}” eliminada.`, clientDeleted: false }
    }
    case "enviar_mensaje":
      throw new AssistantActionError("Esta acción necesita el canal de WhatsApp.", 500)
  }
}

export async function acceptAssistantSuggestion(id: string) {
  const token = randomUUID()
  const claim = claimAssistantSuggestion(id, token)
  if (!claim.ok) {
    if (claim.reason === "not_found") throw new AssistantActionError("La sugerencia no existe.", 404)
    if (claim.reason === "settled") return {
      suggestion: claim.suggestion!,
      messages: getMessages(claim.suggestion!.clientId),
      clientDeleted: false,
      alreadySettled: true,
    }
    throw new AssistantActionError("Esta sugerencia ya se está ejecutando. Esperá un instante.", 409)
  }

  const suggestion = claim.suggestion
  const proactive = getMessage(suggestion.messageId)?.assistantMode === "proactivo"
  try {
    let result: { summary: string; clientDeleted: boolean }
    let sentMessage = null
    let settled
    if (suggestion.actionType === "enviar_mensaje") {
      const text = suggestion.payload.message?.trim()
      if (!text) throw new AssistantActionError("La sugerencia no contiene un mensaje válido.", 422)
      sentMessage = await whatsappManager.sendText(suggestion.clientId, text, { evaluate: false })
      result = { summary: "Mensaje enviado al cliente.", clientDeleted: false }
      settled = settleAssistantSuggestion(id, token, result.summary)
    } else {
      const atomicResult = runInDatabaseTransaction(() => {
        const databaseResult = executeDatabaseAction(suggestion)
        const databaseSettled = settleAssistantSuggestion(id, token, databaseResult.summary)
        if (!databaseSettled) throw new AssistantActionError("No pudimos confirmar el resultado de la sugerencia.", 500)
        return { result: databaseResult, settled: databaseSettled }
      })
      result = atomicResult.result
      settled = atomicResult.settled
    }

    if (!settled) throw new AssistantActionError("No pudimos confirmar el resultado de la sugerencia.", 500)
    if (proactive) discardProactiveAssistantSuggestion(suggestion.messageId)
    const messages = getMessages(suggestion.clientId)
    assistantEvents.emit({ type: "assistant", clientId: suggestion.clientId, messages })
    if (sentMessage) scheduleAssistantEvaluation(suggestion.clientId, sentMessage)
    return { suggestion: settled, messages, clientDeleted: result.clientDeleted, alreadySettled: false }
  } catch (error) {
    releaseAssistantSuggestion(id, token)
    throw error
  }
}

export function assistantSuggestionExists(id: string) {
  return Boolean(getAssistantSuggestion(id))
}
