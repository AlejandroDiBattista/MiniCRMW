import { whatsappManager } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await whatsappManager.connectIfAuthenticated()
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      send({ type: "status", status: whatsappManager.getStatus() })
      unsubscribe = whatsappManager.subscribe(send)
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 20000)

      request.signal.addEventListener("abort", () => {
        unsubscribe?.()
        if (heartbeat) clearInterval(heartbeat)
        try { controller.close() } catch { /* stream already closed */ }
      })
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
