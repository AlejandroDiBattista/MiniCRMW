import { whatsappManager } from "@/lib/whatsapp"
import { assistantEvents } from "@/lib/assistant/events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await whatsappManager.connectIfAuthenticated()
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let unsubscribeAssistant: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      send({ type: "status", status: whatsappManager.getStatus() })
      unsubscribe = whatsappManager.subscribe(send)
      unsubscribeAssistant = assistantEvents.subscribe(send)
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 20000)

      request.signal.addEventListener("abort", () => {
        unsubscribe?.()
        unsubscribeAssistant?.()
        if (heartbeat) clearInterval(heartbeat)
        try { controller.close() } catch { /* stream already closed */ }
      })
    },
    cancel() {
      unsubscribe?.()
      unsubscribeAssistant?.()
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
