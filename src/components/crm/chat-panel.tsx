"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, CheckCheck, CircleAlert, LoaderCircle, MessageSquareText, PanelRight, SendHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Client, Message, WhatsappConnectionStatus } from "@/lib/types"
import { avatarUrl, dateFormatter, fullName, initials, timeFormatter } from "./format"

export function ChatPanel({ client, messages, loading, status, onConnect, onBack, onDetails, onMessage, className }: {
  client: Client | null
  messages: Message[]
  loading: boolean
  status: WhatsappConnectionStatus
  onConnect: () => void
  onBack: () => void
  onDetails: () => void
  onMessage: (message: Message) => void
  className?: string
}) {
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [sentAcknowledgement, setSentAcknowledgement] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const viewport = bottomRef.current?.closest<HTMLElement>("[data-slot='scroll-area-viewport']")
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => () => {
    if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
  }, [])

  async function send() {
    if (!client || !body.trim() || sending) return
    const outgoing = body.trim()
    setBody("")
    setSending(true)
    try {
      const response = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, body: outgoing }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      onMessage(data)
      setSentAcknowledgement(true)
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
      sentTimerRef.current = setTimeout(() => setSentAcknowledgement(false), 850)
    } catch (error) {
      setBody(outgoing)
      toast.error(error instanceof Error ? error.message : "No pudimos enviar el mensaje", {
        description: "Revisá la conexión con WhatsApp y volvé a intentarlo.",
      })
    } finally {
      setSending(false)
    }
  }

  if (!client) {
    return (
      <section className={cn("h-full min-h-0 flex flex-col items-center justify-center overflow-hidden bg-chat", className)}>
        <Card className="mx-6 max-w-sm border-border/70 bg-card/95 shadow-none">
          <CardContent className="flex flex-col items-center px-8 py-10 text-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><MessageSquareText className="size-7" /></div>
            <h2 className="font-heading text-xl font-semibold">Tu próxima conversación empieza acá</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Creá o elegí un cliente para abrir su chat y su historia de contactos.</p>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className={cn("h-full min-h-0 flex flex-col overflow-hidden bg-chat", className)}>
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-border/80 bg-card px-4 md:px-5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack}><ArrowLeft /><span className="sr-only">Volver</span></Button>
        <Avatar className="size-11 border border-border/80 shadow-xs"><AvatarImage src={avatarUrl(client)} alt={`Foto de ${fullName(client)}`} className="object-cover" /><AvatarFallback className="bg-secondary font-heading text-sm font-semibold">{initials(client)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-lg font-semibold leading-tight">{fullName(client)}</h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className={cn("size-2 rounded-full", status.state === "connected" ? "crm-status-dot bg-[var(--wa-green)] text-[var(--wa-green)]" : "bg-muted-foreground/50")} />
            {status.state === "connected" ? "Sincronizado con WhatsApp" : client.phone}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={onDetails}><PanelRight /><span className="sr-only">Ver ficha</span></Button></TooltipTrigger>
          <TooltipContent>Ver ficha del cliente</TooltipContent>
        </Tooltip>
      </div>

      {status.state !== "connected" ? (
        <Alert className="m-3 shrink-0 rounded-lg border-amber-700/20 bg-amber-500/10 text-amber-950 dark:text-amber-100">
          <CircleAlert />
          <AlertTitle>WhatsApp no está conectado</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Vinculá el teléfono para enviar y recibir.</span>
            <Button size="xs" variant="outline" onClick={onConnect}>Vincular</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full w-full flex-col justify-end gap-3 px-3 py-4 md:px-4">
          {loading ? (
            <ConversationSkeleton />
          ) : messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"><MessageSquareText className="size-5" /></div>
              <p className="font-heading font-semibold">Todavía no hay mensajes</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Escribí abajo para iniciar la conversación con {client.firstName}.</p>
            </div>
          ) : messages.map((message, index) => {
            const previous = messages[index - 1]
            const showDate = !previous || new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString()
            return (
              <div key={message.id} className={cn(index === messages.length - 1 && "crm-reveal")}>
                {showDate ? <div className="my-4 flex justify-center"><Badge variant="secondary" className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-xs">{dateFormatter.format(new Date(message.timestamp))}</Badge></div> : null}
                <div className={cn("flex", message.direction === "outgoing" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[86%] rounded-2xl px-4 py-3 text-[15px] leading-6 shadow-[0_1px_2px_oklch(0_0_0/0.07)] md:max-w-[74%]",
                    message.direction === "outgoing" ? "rounded-br-md bg-[var(--wa-bubble)] text-[var(--wa-bubble-foreground)]" : "rounded-bl-md border border-border/80 bg-card",
                  )}>
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <div className={cn("mt-0.5 flex items-center justify-end gap-0.5 text-[10px] font-normal leading-none tabular-nums", message.direction === "outgoing" ? "text-[var(--wa-bubble-muted)]" : "text-muted-foreground")}>
                      <span className="opacity-60">{timeFormatter.format(new Date(message.timestamp))}</span>
                      {message.direction === "outgoing" ? <CheckCheck className={cn("size-3.5 stroke-[2.5] transition-colors duration-200", message.readAt ? "crm-check-in text-sky-500" : "text-muted-foreground/80")} /> : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="relative z-10 shrink-0 border-t border-border/80 bg-card px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
              if (sentAcknowledgement) setSentAcknowledgement(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={`Mensaje para ${client.firstName}…`}
            className="max-h-32 min-h-11 resize-none rounded-xl border-input bg-background px-4 py-3 text-[15px] shadow-xs placeholder:text-muted-foreground/80"
            rows={1}
            disabled={status.state !== "connected" || sending}
          />
          <Button size="icon" className={cn("group/send size-11 shrink-0 rounded-xl shadow-xs transition-transform duration-150 active:scale-95", sentAcknowledgement && "bg-[var(--wa-green)] disabled:opacity-100")} onClick={send} disabled={!body.trim() || status.state !== "connected" || sending}>
            {sending ? <LoaderCircle className="animate-spin" /> : sentAcknowledgement ? <Check className="crm-check-in" /> : <SendHorizontal className="transition-transform duration-200 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5" />}
            <span className="sr-only">{sentAcknowledgement ? "Mensaje enviado" : "Enviar mensaje"}</span>
          </Button>
        </div>
      </div>
    </section>
  )
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 py-2" aria-label="Cargando conversación">
      <div className="flex justify-start"><Skeleton className="h-16 w-[38%] rounded-2xl rounded-bl-md" /></div>
      <div className="flex justify-end"><Skeleton className="h-20 w-[54%] rounded-2xl rounded-br-md" /></div>
      <div className="flex justify-start"><Skeleton className="h-14 w-[30%] rounded-2xl rounded-bl-md" /></div>
      <span className="sr-only">Recuperando mensajes…</span>
    </div>
  )
}
