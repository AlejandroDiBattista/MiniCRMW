import { whatsappManager } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  await whatsappManager.connectIfAuthenticated()
  return Response.json(whatsappManager.getStatus())
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string }
  if (body.action === "connect") await whatsappManager.connect()
  else if (body.action === "disconnect") whatsappManager.disconnect()
  else return Response.json({ error: "Acción inválida" }, { status: 400 })
  return Response.json(whatsappManager.getStatus())
}
