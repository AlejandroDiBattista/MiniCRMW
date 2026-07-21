import { z } from "zod"
import { normalizePhone } from "@/lib/db"
import type {
  Client,
  WorkspaceAssistantActionPayload,
  WorkspaceAssistantActionType,
} from "@/lib/types"

export const workspaceAssistantActionTypes = [
  "crear_cliente",
  "actualizar_cliente",
  "eliminar_cliente",
  "crear_tarea",
  "actualizar_tarea",
  "completar_tarea",
  "eliminar_tarea",
  "enviar_mensaje",
  "enviar_campana",
  "abrir_conversacion",
] as const satisfies readonly WorkspaceAssistantActionType[]

const recipientSchema = z.object({
  clientId: z.string().max(100),
  message: z.string().max(2_000),
})

const actionSchema = z.object({
  type: z.enum(workspaceAssistantActionTypes),
  clientId: z.string().max(100).nullable(),
  firstName: z.string().max(120).nullable(),
  lastName: z.string().max(120).nullable(),
  dni: z.string().max(40).nullable(),
  email: z.string().max(254).nullable(),
  phone: z.string().max(60).nullable(),
  taskId: z.string().max(100).nullable(),
  title: z.string().max(120).nullable(),
  description: z.string().max(2_000).nullable(),
  dueAt: z.string().max(80).nullable(),
  clearDueAt: z.boolean(),
  repeatCount: z.number().int().min(0).max(999).nullable(),
  repeatInterval: z.number().int().min(1).max(525_600).nullable(),
  repeatUnit: z.enum(["days", "hours", "minutes"]).nullable(),
  message: z.string().max(2_000).nullable(),
  recipients: z.array(recipientSchema).max(50),
})

export const workspaceAssistantOutputSchema = z.object({
  message: z.string().max(6_000).nullable(),
  suggestions: z.array(z.object({
    text: z.string().min(1).max(1_200),
    action: actionSchema,
  })).max(8),
})

export type WorkspaceAssistantModelOutput = z.infer<typeof workspaceAssistantOutputSchema>

function validDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function normalizeWorkspaceAssistantSuggestions(output: WorkspaceAssistantModelOutput, clients: Client[]) {
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const tasksById = new Map(clients.flatMap((client) => client.history.map((task) => [task.id, { task, client }] as const)))

  return output.suggestions.flatMap((suggestion) => {
    const action = suggestion.action
    const client = action.clientId ? clientsById.get(action.clientId) : undefined
    let payload: WorkspaceAssistantActionPayload | null = null

    switch (action.type) {
      case "crear_cliente":
        if (action.firstName?.trim() && action.phone && normalizePhone(action.phone).length >= 8) {
          payload = {
            firstName: action.firstName.trim(),
            lastName: action.lastName?.trim() ?? "",
            dni: action.dni?.trim() ?? "",
            email: action.email?.trim() ?? "",
            phone: action.phone.trim(),
          }
        }
        break
      case "actualizar_cliente": {
        if (!client) break
        const changes = {
          ...(action.firstName !== null ? { firstName: action.firstName.trim() } : {}),
          ...(action.lastName !== null ? { lastName: action.lastName.trim() } : {}),
          ...(action.dni !== null ? { dni: action.dni.trim() } : {}),
          ...(action.email !== null ? { email: action.email.trim() } : {}),
          ...(action.phone !== null ? { phone: action.phone.trim() } : {}),
        }
        if (Object.keys(changes).length > 0) payload = { clientId: client.id, ...changes, expectedUpdatedAt: client.updatedAt }
        break
      }
      case "eliminar_cliente":
        if (client) payload = { clientId: client.id, expectedUpdatedAt: client.updatedAt }
        break
      case "crear_tarea":
        if (client && action.title?.trim()) {
          payload = {
            clientId: client.id,
            title: action.title.trim(),
            description: action.description?.trim() ?? "",
            dueAt: validDate(action.dueAt),
            repeatCount: action.repeatCount ?? 0,
            repeatInterval: action.repeatInterval ?? 1,
            repeatUnit: action.repeatUnit ?? "days",
          }
        }
        break
      case "actualizar_tarea": {
        const taskContext = action.taskId ? tasksById.get(action.taskId) : undefined
        if (!taskContext || (client && taskContext.client.id !== client.id)) break
        const changes: WorkspaceAssistantActionPayload = {
          clientId: taskContext.client.id,
          taskId: taskContext.task.id,
          expectedUpdatedAt: taskContext.task.updatedAt,
          ...(action.title !== null ? { title: action.title.trim() } : {}),
          ...(action.description !== null ? { description: action.description.trim() } : {}),
          ...(action.repeatCount !== null ? { repeatCount: action.repeatCount } : {}),
          ...(action.repeatInterval !== null ? { repeatInterval: action.repeatInterval } : {}),
          ...(action.repeatUnit !== null ? { repeatUnit: action.repeatUnit } : {}),
          ...(action.clearDueAt ? { clearDueAt: true, dueAt: null } : action.dueAt !== null ? { dueAt: validDate(action.dueAt) } : {}),
        }
        if (Object.keys(changes).length > 3) payload = changes
        break
      }
      case "completar_tarea":
      case "eliminar_tarea": {
        const taskContext = action.taskId ? tasksById.get(action.taskId) : undefined
        if (taskContext && (!client || taskContext.client.id === client.id)) {
          payload = {
            clientId: taskContext.client.id,
            taskId: taskContext.task.id,
            expectedUpdatedAt: taskContext.task.updatedAt,
          }
        }
        break
      }
      case "enviar_mensaje":
        if (client && action.message?.trim()) payload = { clientId: client.id, message: action.message.trim() }
        break
      case "enviar_campana": {
        const seen = new Set<string>()
        const recipients = action.recipients.flatMap((recipient) => {
          const target = clientsById.get(recipient.clientId)
          if (!target || !recipient.message.trim() || seen.has(target.id)) return []
          seen.add(target.id)
          return [{ clientId: target.id, message: recipient.message.trim() }]
        })
        if (recipients.length > 0) payload = { recipients }
        break
      }
      case "abrir_conversacion":
        if (client) payload = { clientId: client.id }
        break
    }

    return payload
      ? [{ text: suggestion.text.trim(), actionType: action.type, payload }]
      : []
  })
}
