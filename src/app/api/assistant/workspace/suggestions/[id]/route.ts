import { z } from "zod"
import { assistantEvents } from "@/lib/assistant/events"
import {
  getWorkspaceAssistantMessages,
  resolveWorkspaceAssistantSuggestionInteractively,
} from "@/lib/db"
import {
  acceptWorkspaceAssistantSuggestion,
  WorkspaceAssistantActionError,
} from "@/lib/workspace-assistant/execute"

export const runtime = "nodejs"

const executionSchema = z.object({
  recipients: z.array(z.object({
    clientId: z.string().uuid(),
    message: z.string().trim().min(1).max(4_000),
  })).min(1).max(50).optional(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const raw = await request.json().catch(() => ({}))
    const parsed = executionSchema.safeParse(raw)
    if (!parsed.success) return Response.json({ error: "Revisá los destinatarios y sus mensajes." }, { status: 400 })
    return Response.json(await acceptWorkspaceAssistantSuggestion(id, parsed.data.recipients))
  } catch (error) {
    const status = error instanceof WorkspaceAssistantActionError ? error.status : 500
    return Response.json({
      error: error instanceof Error ? error.message : "No pudimos ejecutar la sugerencia.",
    }, { status })
  }
}

const resolutionSchema = z.object({
  outcome: z.enum(["ejecutada", "descartada"]),
  resultSummary: z.string().trim().max(240).optional().default(""),
})

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = resolutionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || (parsed.data.outcome === "ejecutada" && !parsed.data.resultSummary)) {
    return Response.json({ error: "No pudimos registrar el resultado de la revisión." }, { status: 400 })
  }

  const { id } = await context.params
  const result = resolveWorkspaceAssistantSuggestionInteractively(id, parsed.data.outcome, parsed.data.resultSummary)
  if (result.reason === "not_found") return Response.json({ error: "La sugerencia no existe." }, { status: 404 })
  if (result.reason === "busy") return Response.json({ error: "La sugerencia se está ejecutando en otra ventana." }, { status: 409 })

  const messages = getWorkspaceAssistantMessages()
  assistantEvents.emit({ type: "workspace-assistant", messages })
  return Response.json({ suggestion: result.suggestion, messages, alreadySettled: result.reason === "settled" })
}
