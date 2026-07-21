import { z } from "zod"
import { assistantEvents } from "@/lib/assistant/events"
import { cancelPendingSuggestions, discardProactiveAssistantSuggestions, getClient, getMessages } from "@/lib/db"

export const runtime = "nodejs"

const requestSchema = z.object({ clientId: z.string().uuid() })

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Falta seleccionar un cliente." }, { status: 400 })
  if (!getClient(parsed.data.clientId)) return Response.json({ error: "El cliente ya no está disponible." }, { status: 404 })

  cancelPendingSuggestions(parsed.data.clientId)
  discardProactiveAssistantSuggestions(parsed.data.clientId)
  const messages = getMessages(parsed.data.clientId)
  assistantEvents.emit({ type: "assistant", clientId: parsed.data.clientId, messages })
  return Response.json({ messages })
}
