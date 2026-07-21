import { z } from "zod"
import type { AssistantActionPayload, AssistantActionType, Client } from "@/lib/types"

export const assistantActionTypes = [
  "actualizar_cliente",
  "eliminar_cliente",
  "crear_tarea",
  "actualizar_tarea",
  "completar_tarea",
  "eliminar_tarea",
  "enviar_mensaje",
] as const satisfies readonly AssistantActionType[]

const actionOutputSchema = z.object({
  type: z.enum(assistantActionTypes),
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
})

export const assistantOutputSchema = z.object({
  message: z.string().max(4_000).nullable(),
  suggestions: z.array(z.object({
    text: z.string().min(1).max(1_000),
    action: actionOutputSchema,
  })).max(5),
})

export type AssistantModelOutput = z.infer<typeof assistantOutputSchema>

function validDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function normalizeAssistantSuggestions(output: AssistantModelOutput, client: Client) {
  return output.suggestions.flatMap((suggestion) => {
    const action = suggestion.action
    let payload: AssistantActionPayload | null = null

    switch (action.type) {
      case "actualizar_cliente": {
        const changes = {
          ...(action.firstName !== null ? { firstName: action.firstName.trim() } : {}),
          ...(action.lastName !== null ? { lastName: action.lastName.trim() } : {}),
          ...(action.dni !== null ? { dni: action.dni.trim() } : {}),
          ...(action.email !== null ? { email: action.email.trim() } : {}),
          ...(action.phone !== null ? { phone: action.phone.trim() } : {}),
        }
        if (Object.keys(changes).length > 0) payload = { ...changes, expectedUpdatedAt: client.updatedAt }
        break
      }
      case "eliminar_cliente":
        payload = { expectedUpdatedAt: client.updatedAt }
        break
      case "crear_tarea": {
        if (!action.title?.trim()) break
        payload = {
          title: action.title.trim(),
          description: action.description?.trim() ?? "",
          dueAt: validDate(action.dueAt),
          repeatCount: action.repeatCount ?? 0,
          repeatInterval: action.repeatInterval ?? 1,
          repeatUnit: action.repeatUnit ?? "days",
        }
        break
      }
      case "actualizar_tarea": {
        const task = client.history.find((item) => item.id === action.taskId)
        if (!task) break
        const changes: AssistantActionPayload = {
          taskId: task.id,
          expectedUpdatedAt: task.updatedAt,
          ...(action.title !== null ? { title: action.title.trim() } : {}),
          ...(action.description !== null ? { description: action.description.trim() } : {}),
          ...(action.repeatCount !== null ? { repeatCount: action.repeatCount } : {}),
          ...(action.repeatInterval !== null ? { repeatInterval: action.repeatInterval } : {}),
          ...(action.repeatUnit !== null ? { repeatUnit: action.repeatUnit } : {}),
          ...(action.clearDueAt ? { clearDueAt: true, dueAt: null } : action.dueAt !== null ? { dueAt: validDate(action.dueAt) } : {}),
        }
        if (Object.keys(changes).length > 2) payload = changes
        break
      }
      case "completar_tarea":
      case "eliminar_tarea": {
        const task = client.history.find((item) => item.id === action.taskId)
        if (task) payload = { taskId: task.id, expectedUpdatedAt: task.updatedAt }
        break
      }
      case "enviar_mensaje":
        if (action.message?.trim()) payload = { message: action.message.trim() }
        break
    }

    return payload
      ? [{ text: suggestion.text.trim(), actionType: action.type, payload }]
      : []
  })
}
