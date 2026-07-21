import { z } from "zod"

import { improveMessage } from "@/lib/ai/improve-message"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
})

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "La mejora con IA todavía no está configurada." },
      { status: 503 },
    )
  }

  try {
    const payload = requestSchema.safeParse(await request.json())
    if (!payload.success) {
      return Response.json(
        { error: "Escribí un mensaje de hasta 2000 caracteres para mejorarlo." },
        { status: 400 },
      )
    }

    const text = await improveMessage(payload.data.text)
    return Response.json({ text })
  } catch (error) {
    console.error("AI message improvement failed", error instanceof Error ? error.name : "UnknownError")
    return Response.json(
      { error: "No pudimos mejorar el mensaje en este momento." },
      { status: 502 },
    )
  }
}
