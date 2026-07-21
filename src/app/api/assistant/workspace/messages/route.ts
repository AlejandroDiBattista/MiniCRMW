import { z } from "zod"
import {
  getWorkspaceAssistantMessages,
  saveWorkspaceAssistantUserMessage,
} from "@/lib/db"
import { assistantEvents } from "@/lib/assistant/events"
import { runWorkspaceAssistant } from "@/lib/workspace-assistant/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({ body: z.string().trim().min(1).max(6_000) })

export async function GET() {
  return Response.json(getWorkspaceAssistantMessages())
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Escribí un mensaje para el asistente." }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Falta configurar la credencial de OpenAI." }, { status: 503 })
  }

  const userMessage = saveWorkspaceAssistantUserMessage(parsed.data.body)
  assistantEvents.emit({ type: "workspace-assistant", messages: getWorkspaceAssistantMessages() })
  try {
    await runWorkspaceAssistant()
    return Response.json({ messages: getWorkspaceAssistantMessages() }, { status: 201 })
  } catch (error) {
    console.error("Workspace assistant request failed", error instanceof Error ? error.name : "UnknownError")
    return Response.json({
      error: "El asistente no pudo responder. Tu mensaje quedó guardado para que puedas reintentarlo.",
      message: userMessage,
      messages: getWorkspaceAssistantMessages(),
    }, { status: 502 })
  }
}
