"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  addContactHistory,
  completeContactHistory,
  createClient,
  deleteClient,
  deleteContactHistory,
  normalizePhone,
  updateClient,
  updateContactHistory,
} from "@/lib/db"

const clientSchema = z.object({
  firstName: z.string().trim().min(2, "El nombre necesita al menos 2 caracteres."),
  lastName: z.string().trim().optional().default(""),
  dni: z.string().trim().optional().default(""),
  email: z.union([z.literal(""), z.email("El email necesita un formato válido. Ejemplo: nombre@ejemplo.com")]).optional().default(""),
  phone: z.string().trim().refine((value) => normalizePhone(value).length >= 8, "Ingresá un teléfono con código de país y área."),
})

function valuesFromForm(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    dni: String(formData.get("dni") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  }
}

export async function createClientAction(formData: FormData) {
  const parsed = clientSchema.safeParse(valuesFromForm(formData))
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Revisá los campos marcados." }
  try {
    const client = createClient(parsed.data)
    revalidatePath("/")
    return { ok: true as const, clientId: client.id, resultSummary: `Cliente “${client.firstName} ${client.lastName}” creado.`.replace(/\s+”/, "”") }
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE")
      ? "Ya existe una ficha con ese teléfono."
      : "No pudimos guardar la ficha. Revisá los datos e intentá de nuevo."
    return { ok: false as const, error: message }
  }
}

export async function updateClientAction(id: string, formData: FormData) {
  const parsed = clientSchema.safeParse(valuesFromForm(formData))
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Revisá los campos marcados." }
  try {
    updateClient(id, parsed.data)
    revalidatePath("/")
    return { ok: true as const, resultSummary: "Ficha del cliente actualizada." }
  } catch {
    return { ok: false as const, error: "No pudimos actualizar la ficha. Revisá que el teléfono no esté repetido." }
  }
}

export async function deleteClientAction(id: string) {
  deleteClient(id)
  revalidatePath("/")
  return { ok: true as const, resultSummary: "Cliente eliminado." }
}

function parseHistoryForm(formData: FormData) {
  type TaskField = "title" | "description" | "dueAt" | "repeatCount" | "repeatInterval" | "repeatUnit" | "form"
  const taskSchema = z.object({
    title: z.string().trim().min(2, "Ingresá un título para la tarea.").max(120, "El título es demasiado largo."),
    description: z.string().trim().max(2_000, "La descripción es demasiado larga."),
    dueAt: z.string().refine(
      (value) => value === "" || (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())),
      "La fecha y hora no es válida.",
    ),
    repeatCount: z.coerce.number().int().min(0, "Las repeticiones no pueden ser negativas.").max(999, "Ingresá hasta 999 repeticiones."),
    repeatInterval: z.coerce.number().int().min(1, "El intervalo debe ser mayor a cero.").max(525_600, "El intervalo es demasiado grande."),
    repeatUnit: z.enum(["days", "hours", "minutes"]),
  })
  const parsed = taskSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    dueAt: String(formData.get("dueAt") ?? ""),
    repeatCount: String(formData.get("repeatCount") ?? "0"),
    repeatInterval: String(formData.get("repeatInterval") ?? "1"),
    repeatUnit: String(formData.get("repeatUnit") ?? "days"),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const issueField = issue?.path[0]
    const field: TaskField = typeof issueField === "string" && ["title", "description", "dueAt", "repeatCount", "repeatInterval", "repeatUnit"].includes(issueField)
      ? issueField as TaskField
      : "form"
    return { ok: false as const, error: issue?.message ?? "Revisá los datos de la tarea.", field }
  }

  return { ok: true as const, data: { ...parsed.data, dueAt: parsed.data.dueAt || null } }
}

export async function addHistoryAction(clientId: string, formData: FormData) {
  const parsed = parseHistoryForm(formData)
  if (!parsed.ok) return parsed

  try {
    const task = addContactHistory(clientId, parsed.data)
    revalidatePath("/")
    return { ok: true as const, resultSummary: `Tarea “${task.title}” creada.` }
  } catch {
    return { ok: false as const, error: "No pudimos guardar la tarea. Intentá nuevamente.", field: "form" as const }
  }
}

export async function updateHistoryAction(id: string, formData: FormData) {
  const parsed = parseHistoryForm(formData)
  if (!parsed.ok) return parsed

  try {
    const task = updateContactHistory(id, parsed.data)
    if (!task) return { ok: false as const, error: "La tarea ya no está disponible.", field: "form" as const }
    revalidatePath("/")
    return { ok: true as const, resultSummary: `Tarea “${task.title}” actualizada.` }
  } catch {
    return { ok: false as const, error: "No pudimos actualizar la tarea. Intentá nuevamente.", field: "form" as const }
  }
}

export async function completeHistoryAction(id: string) {
  const result = completeContactHistory(id)
  if (!result) return { ok: false as const, error: "La tarea ya fue completada o no existe." }
  revalidatePath("/")
  return { ok: true as const, repeated: Boolean(result.nextTask), resultSummary: `Tarea “${result.completed.title}” completada.` }
}

export async function deleteHistoryAction(id: string) {
  const deleted = deleteContactHistory(id)
  revalidatePath("/")
  return { ok: true as const, resultSummary: deleted ? "Tarea eliminada." : "La tarea ya no estaba disponible." }
}
