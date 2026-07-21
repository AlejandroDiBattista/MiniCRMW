import { z } from "zod"
import { getClient, getMessages, savePrivateUserMessage } from "@/lib/db"
import { assistantEvents } from "@/lib/assistant/events"
import { runAssistant } from "@/lib/assistant/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(4_000),
})

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Seleccioná un cliente y escribí un mensaje." }, { status: 400 })
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Falta configurar la credencial de OpenAI." }, { status: 503 })
  }
  if (!getClient(parsed.data.clientId)) {
    return Response.json({ error: "El cliente ya no está disponible." }, { status: 404 })
  }

  const userMessage = savePrivateUserMessage(parsed.data.clientId, parsed.data.body)
  assistantEvents.emit({
    type: "assistant",
    clientId: parsed.data.clientId,
    messages: getMessages(parsed.data.clientId),
  })

  try {
    await runAssistant(parsed.data.clientId, "directo")
    return Response.json({ messages: getMessages(parsed.data.clientId) }, { status: 201 })
  } catch (error) {
    console.error("Assistant request failed", error instanceof Error ? error.name : "UnknownError")
    return Response.json({
      error: "El asistente no pudo responder. Tu mensaje privado quedó guardado para que puedas reintentarlo.",
      message: userMessage,
      messages: getMessages(parsed.data.clientId),
    }, { status: 502 })
  }
}
