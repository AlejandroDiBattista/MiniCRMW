import { z } from "zod"
import { acceptAssistantSuggestion, AssistantActionError } from "@/lib/assistant/execute"
import { assistantEvents } from "@/lib/assistant/events"
import { getMessages, resolveAssistantSuggestionInteractively } from "@/lib/db"

export const runtime = "nodejs"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const result = await acceptAssistantSuggestion(id)
    return Response.json(result)
  } catch (error) {
    const status = error instanceof AssistantActionError ? error.status : 500
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
  const result = resolveAssistantSuggestionInteractively(id, parsed.data.outcome, parsed.data.resultSummary)
  if (result.reason === "not_found") return Response.json({ error: "La sugerencia no existe." }, { status: 404 })
  if (result.reason === "busy") return Response.json({ error: "La sugerencia se está ejecutando en otra ventana." }, { status: 409 })

  const suggestion = result.suggestion!
  const messages = getMessages(suggestion.clientId)
  assistantEvents.emit({ type: "assistant", clientId: suggestion.clientId, messages })
  return Response.json({ suggestion, messages, alreadySettled: result.reason === "settled" })
}
