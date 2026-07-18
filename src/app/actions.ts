"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  addContactHistory,
  createClient,
  deleteClient,
  deleteContactHistory,
  normalizePhone,
  updateClient,
} from "@/lib/db"

const clientSchema = z.object({
  firstName: z.string().trim().min(2, "Ingresá al menos 2 caracteres"),
  lastName: z.string().trim().optional().default(""),
  dni: z.string().trim().optional().default(""),
  email: z.union([z.literal(""), z.email("El email no es válido")]).optional().default(""),
  phone: z.string().trim().refine((value) => normalizePhone(value).length >= 8, "Ingresá el número con código de país"),
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
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Revisá los datos" }
  try {
    const client = createClient(parsed.data)
    revalidatePath("/")
    return { ok: true as const, clientId: client.id }
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE")
      ? "Ya existe un cliente con ese teléfono"
      : "No se pudo guardar el cliente"
    return { ok: false as const, error: message }
  }
}

export async function updateClientAction(id: string, formData: FormData) {
  const parsed = clientSchema.safeParse(valuesFromForm(formData))
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Revisá los datos" }
  try {
    updateClient(id, parsed.data)
    revalidatePath("/")
    return { ok: true as const }
  } catch {
    return { ok: false as const, error: "No se pudo actualizar. Verificá que el teléfono no esté repetido." }
  }
}

export async function deleteClientAction(id: string) {
  deleteClient(id)
  revalidatePath("/")
  return { ok: true as const }
}

export async function addHistoryAction(clientId: string, formData: FormData) {
  const description = String(formData.get("description") ?? "").trim()
  const contactDate = String(formData.get("contactDate") ?? "")
  const validDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(contactDate) && !Number.isNaN(new Date(contactDate).getTime())
  if (description.length < 3 || !validDateTime) {
    return { ok: false as const, error: "Completá una fecha, hora y descripción válidas" }
  }
  addContactHistory(clientId, contactDate, description)
  revalidatePath("/")
  return { ok: true as const }
}

export async function deleteHistoryAction(id: string) {
  deleteContactHistory(id)
  revalidatePath("/")
  return { ok: true as const }
}
