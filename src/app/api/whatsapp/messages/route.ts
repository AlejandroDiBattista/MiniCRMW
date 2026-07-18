import { getMessages } from "@/lib/db"
import { whatsappManager } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")
  if (!clientId) return Response.json({ error: "Falta clientId" }, { status: 400 })
  return Response.json(getMessages(clientId))
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { clientId?: string; body?: string }
    if (!payload.clientId || !payload.body?.trim()) {
      return Response.json({ error: "Falta el cliente o el mensaje" }, { status: 400 })
    }
    const message = await whatsappManager.sendText(payload.clientId, payload.body)
    return Response.json(message, { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo enviar" }, { status: 503 })
  }
}

