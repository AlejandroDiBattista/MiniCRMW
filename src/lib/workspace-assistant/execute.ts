import "server-only"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  addContactHistory,
  claimWorkspaceAssistantSuggestion,
  completeContactHistory,
  createClient,
  deleteClient,
  deleteContactHistory,
  executeWorkspaceAssistantSuggestion as settleWorkspaceSuggestion,
  getClient,
  getContactHistory,
  getWorkspaceAssistantDeliveries,
  getWorkspaceAssistantMessages,
  markWorkspaceAssistantDeliveryError,
  markWorkspaceAssistantDeliverySent,
  normalizePhone,
  replacePendingWorkspaceAssistantDeliveries,
  releaseWorkspaceAssistantSuggestion,
  runInDatabaseTransaction,
  updateClient,
  updateContactHistory,
} from "@/lib/db"
import { assistantEvents } from "@/lib/assistant/events"
import { scheduleAssistantEvaluation } from "@/lib/assistant/service"
import { whatsappManager } from "@/lib/whatsapp"
import type { WorkspaceAssistantRecipient, WorkspaceAssistantSuggestion } from "@/lib/types"

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

export class WorkspaceAssistantActionError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
    this.name = "WorkspaceAssistantActionError"
  }
}

function assertVersion(current: string, expected?: string) {
  if (!expected || current !== expected) {
    throw new WorkspaceAssistantActionError("Los datos cambiaron desde que se preparó la sugerencia. Pedile al asistente que la actualice.")
  }
}

function requireClient(id?: string) {
  const client = id ? getClient(id) : null
  if (!client) throw new WorkspaceAssistantActionError("El cliente ya no está disponible.", 404)
  return client
}

function executeDatabaseAction(suggestion: WorkspaceAssistantSuggestion) {
  const payload = suggestion.payload
  switch (suggestion.actionType) {
    case "crear_cliente": { 
      const values = clientValuesSchema.safeParse({
        firstName: payload.firstName,
        lastName: payload.lastName ?? "",
        dni: payload.dni ?? "",
        email: payload.email ?? "",
        phone: payload.phone,
      })
      if (!values.success) throw new WorkspaceAssistantActionError("La sugerencia no tiene datos suficientes para crear el cliente.", 422)
      try {
        const client = createClient(values.data)
        return { summary: `Cliente “${client.firstName} ${client.lastName}” creado.`.replace(/\s+”/, "”"), navigateToClientId: null }
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE")) {
          throw new WorkspaceAssistantActionError("Ya existe un cliente con ese teléfono.", 409)
        }
        throw error
      }
    }
    case "actualizar_cliente": {
      const client = requireClient(payload.clientId)
      assertVersion(client.updatedAt, payload.expectedUpdatedAt)
      const values = clientValuesSchema.safeParse({
        firstName: payload.firstName ?? client.firstName,
        lastName: payload.lastName ?? client.lastName,
        dni: payload.dni ?? client.dni,
        email: payload.email ?? client.email,
        phone: payload.phone ?? client.phone,
      })
      if (!values.success) throw new WorkspaceAssistantActionError("La sugerencia contiene datos de cliente inválidos.", 422)
      updateClient(client.id, values.data)
      return { summary: `Ficha de ${client.firstName} actualizada.`, navigateToClientId: null }
    }
    case "eliminar_cliente": {
      const client = requireClient(payload.clientId)
      assertVersion(client.updatedAt, payload.expectedUpdatedAt)
      if (!deleteClient(client.id)) throw new WorkspaceAssistantActionError("El cliente ya había sido eliminado.", 404)
      return { summary: `Cliente “${client.firstName} ${client.lastName}” eliminado.`.replace(/\s+”/, "”"), navigateToClientId: null }
    }
    case "crear_tarea": {
      const client = requireClient(payload.clientId)
      const values = taskValuesSchema.safeParse({
        title: payload.title,
        description: payload.description ?? "",
        dueAt: payload.dueAt ?? null,
        repeatCount: payload.repeatCount ?? 0,
        repeatInterval: payload.repeatInterval ?? 1,
        repeatUnit: payload.repeatUnit ?? "days",
      })
      if (!values.success) throw new WorkspaceAssistantActionError("La sugerencia contiene datos de tarea inválidos.", 422)
      addContactHistory(client.id, values.data)
      return { summary: `Tarea “${values.data.title}” creada para ${client.firstName}.`, navigateToClientId: null }
    }
    case "actualizar_tarea": {
      const client = requireClient(payload.clientId)
      const task = payload.taskId ? getContactHistory(payload.taskId) : null
      if (!task || task.clientId !== client.id) throw new WorkspaceAssistantActionError("La tarea ya no existe.", 404)
      assertVersion(task.updatedAt, payload.expectedUpdatedAt)
      const values = taskValuesSchema.safeParse({
        title: payload.title ?? task.title,
        description: payload.description ?? task.description,
        dueAt: payload.clearDueAt ? null : payload.dueAt !== undefined ? payload.dueAt : task.dueAt,
        repeatCount: payload.repeatCount ?? task.repeatCount,
        repeatInterval: payload.repeatInterval ?? task.repeatInterval,
        repeatUnit: payload.repeatUnit ?? task.repeatUnit,
      })
      if (!values.success) throw new WorkspaceAssistantActionError("La sugerencia contiene datos de tarea inválidos.", 422)
      updateContactHistory(task.id, values.data)
      return { summary: `Tarea “${values.data.title}” actualizada.`, navigateToClientId: null }
    }
    case "completar_tarea": {
      const client = requireClient(payload.clientId)
      const task = payload.taskId ? getContactHistory(payload.taskId) : null
      if (!task || task.clientId !== client.id) throw new WorkspaceAssistantActionError("La tarea ya no existe.", 404)
      assertVersion(task.updatedAt, payload.expectedUpdatedAt)
      if (!completeContactHistory(task.id)) throw new WorkspaceAssistantActionError("La tarea ya estaba completada.")
      return { summary: `Tarea “${task.title}” completada.`, navigateToClientId: null }
    }
    case "eliminar_tarea": {
      const client = requireClient(payload.clientId)
      const task = payload.taskId ? getContactHistory(payload.taskId) : null
      if (!task || task.clientId !== client.id) throw new WorkspaceAssistantActionError("La tarea ya no existe.", 404)
      assertVersion(task.updatedAt, payload.expectedUpdatedAt)
      if (!deleteContactHistory(task.id)) throw new WorkspaceAssistantActionError("La tarea ya había sido eliminada.", 404)
      return { summary: `Tarea “${task.title}” eliminada.`, navigateToClientId: null }
    }
    case "abrir_conversacion": {
      const client = requireClient(payload.clientId)
      return { summary: `Conversación con ${client.firstName} abierta.`, navigateToClientId: client.id }
    }
    case "enviar_mensaje":
    case "enviar_campana":
      throw new WorkspaceAssistantActionError("Esta acción necesita el canal de WhatsApp.", 500)
  }
}

async function executeDeliveries(suggestion: WorkspaceAssistantSuggestion) {
  const deliveries = getWorkspaceAssistantDeliveries(suggestion.id)
  if (deliveries.length === 0) throw new WorkspaceAssistantActionError("La sugerencia no contiene destinatarios válidos.", 422)
  const sentMessages: Array<Awaited<ReturnType<typeof whatsappManager.sendText>>> = []

  for (const delivery of deliveries) {
    if (delivery.status === "enviado") continue
    requireClient(delivery.clientId)
    try {
      const message = await whatsappManager.sendText(delivery.clientId, delivery.message, { evaluate: false })
      markWorkspaceAssistantDeliverySent(suggestion.id, delivery.clientId, message.whatsappId)
      sentMessages.push(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pudimos enviar el mensaje."
      markWorkspaceAssistantDeliveryError(suggestion.id, delivery.clientId, message)
      const delivered = getWorkspaceAssistantDeliveries(suggestion.id).filter((item) => item.status === "enviado").length
      throw new WorkspaceAssistantActionError(`${message} ${delivered > 0 ? `${delivered} envío${delivered === 1 ? "" : "s"} ya quedó registrado y no se repetirá.` : ""}`.trim(), 503)
    }
  }

  const total = deliveries.length
  return {
    summary: total === 1 ? "Mensaje enviado al cliente." : `${total} mensajes enviados.`,
    sentMessages,
  }
}

export async function acceptWorkspaceAssistantSuggestion(id: string, recipientOverrides?: WorkspaceAssistantRecipient[]) {
  const token = randomUUID()
  const claim = claimWorkspaceAssistantSuggestion(id, token)
  if (!claim.ok) {
    if (claim.reason === "not_found") throw new WorkspaceAssistantActionError("La sugerencia no existe.", 404)
    if (claim.reason === "settled") return {
      suggestion: claim.suggestion!,
      messages: getWorkspaceAssistantMessages(),
      navigateToClientId: claim.suggestion?.actionType === "abrir_conversacion" ? claim.suggestion.payload.clientId ?? null : null,
      alreadySettled: true,
    }
    throw new WorkspaceAssistantActionError("Esta sugerencia ya se está ejecutando. Esperá un instante.", 409)
  }

  const suggestion = claim.suggestion
  try {
    let settled
    let navigateToClientId: string | null = null
    let sentMessages: Array<Awaited<ReturnType<typeof whatsappManager.sendText>>> = []

    if (suggestion.actionType === "enviar_mensaje" || suggestion.actionType === "enviar_campana") {
      if (recipientOverrides) {
        if (suggestion.actionType !== "enviar_campana") throw new WorkspaceAssistantActionError("Esta sugerencia no admite una lista de destinatarios.", 422)
        if (recipientOverrides.length === 0 || recipientOverrides.length > 50) throw new WorkspaceAssistantActionError("Seleccioná entre 1 y 50 destinatarios.", 422)
        const unique = new Set<string>()
        for (const recipient of recipientOverrides) {
          requireClient(recipient.clientId)
          if (!recipient.message.trim()) throw new WorkspaceAssistantActionError("Todos los mensajes necesitan contenido.", 422)
          if (unique.has(recipient.clientId)) throw new WorkspaceAssistantActionError("Hay destinatarios repetidos en la campaña.", 422)
          unique.add(recipient.clientId)
        }
        if (!replacePendingWorkspaceAssistantDeliveries(id, token, recipientOverrides)) {
          throw new WorkspaceAssistantActionError("No pudimos actualizar los borradores de la campaña.", 409)
        }
      }
      const result = await executeDeliveries(suggestion)
      sentMessages = result.sentMessages
      settled = settleWorkspaceSuggestion(id, token, result.summary)
    } else {
      const atomicResult = runInDatabaseTransaction(() => {
        const result = executeDatabaseAction(suggestion)
        const next = settleWorkspaceSuggestion(id, token, result.summary)
        if (!next) throw new WorkspaceAssistantActionError("No pudimos confirmar el resultado de la sugerencia.", 500)
        return { result, settled: next }
      })
      settled = atomicResult.settled
      navigateToClientId = atomicResult.result.navigateToClientId
    }

    if (!settled) throw new WorkspaceAssistantActionError("No pudimos confirmar el resultado de la sugerencia.", 500)
    const messages = getWorkspaceAssistantMessages()
    assistantEvents.emit({ type: "workspace-assistant", messages })
    for (const message of sentMessages) scheduleAssistantEvaluation(message.clientId, message)
    return { suggestion: settled, messages, navigateToClientId, alreadySettled: false }
  } catch (error) {
    releaseWorkspaceAssistantSuggestion(id, token)
    throw error
  }
}
