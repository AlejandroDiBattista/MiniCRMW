import type { Client } from "@/lib/types"

export const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

export const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Tucuman",
})

const contactDateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Tucuman",
})

export function formatContactDate(value: string) {
  return value.includes("T")
    ? contactDateTimeFormatter.format(new Date(value))
    : dateFormatter.format(new Date(value))
}

export function initials(client: Client) {
  // Array.from toma puntos de código completos y evita cortar emojis a la
  // mitad, lo que produciría el carácter de reemplazo `�` durante SSR.
  const firstNameInitial = Array.from(client.firstName.trim())[0] ?? ""
  const lastNameInitial = Array.from(client.lastName.trim())[0] ?? ""
  return `${firstNameInitial}${lastNameInitial}`.toUpperCase()
}

export function fullName(client: Client) {
  return `${client.firstName} ${client.lastName}`.trim()
}

export function avatarUrl(client: Client) {
  if (!client.avatarUpdatedAt) return undefined
  return `/api/clients/${client.id}/avatar?v=${encodeURIComponent(client.avatarUpdatedAt)}`
}
