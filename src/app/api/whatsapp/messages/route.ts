import { getMessages } from "@/lib/db"
import { whatsappManager } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const clientId = searchParams.get("clientId")
  if (!clientId) return Response.json({ error: "Falta seleccionar un cliente." }, { status: 400 })
  if (searchParams.get("sync") === "1") {
    try {
      await whatsappManager.fetchMessageHistory(clientId)
    } catch {
      // La carga local sigue siendo válida aunque el teléfono no responda
      // una solicitud puntual de historial.
    }
  }
  return Response.json(getMessages(clientId))
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { clientId?: string; body?: string }
    if (!payload.clientId || !payload.body?.trim()) {
      return Response.json({ error: "Seleccioná un cliente y escribí un mensaje." }, { status: 400 })
    }
    const message = await whatsappManager.sendText(payload.clientId, payload.body)
    return Response.json(message, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos enviar el mensaje." }, { status: 503 })
  }
}
