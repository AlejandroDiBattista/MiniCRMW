"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  ClipboardCheck,
  ChevronDown,
  ListPlus,
  LoaderCircle,
  MessageSquareReply,
  MessageSquareText,
  PanelRight,
  Pencil,
  SendHorizontal,
  Sparkles,
  Trash2,
  UserRoundPen,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { AssistantActionType, Client, Message, WhatsappConnectionStatus } from "@/lib/types"
import { avatarUrl, dateFormatter, fullName, initials, timeFormatter } from "./format"
import { VoiceDictationButton } from "./voice-dictation-button"
import { WhatsAppMessage } from "./whatsapp-message"

type Channel = "publico" | "privado"
type ConversationDisplayItem =
  | { kind: "message"; message: Message }
  | { kind: "private-summary"; id: string; messages: Message[] }

const actionPresentation: Record<AssistantActionType, { label: string; executeLabel: string; icon: typeof Pencil }> = {
  actualizar_cliente: { label: "Actualizar ficha", executeLabel: "Guardar", icon: UserRoundPen },
  eliminar_cliente: { label: "Eliminar cliente", executeLabel: "Eliminar", icon: Trash2 },
  crear_tarea: { label: "Crear tarea", executeLabel: "Crear", icon: ListPlus },
  actualizar_tarea: { label: "Actualizar tarea", executeLabel: "Guardar", icon: Pencil },
  completar_tarea: { label: "Completar tarea", executeLabel: "Completar", icon: ClipboardCheck },
  eliminar_tarea: { label: "Eliminar tarea", executeLabel: "Eliminar", icon: Trash2 },
  enviar_mensaje: { label: "Enviar por WhatsApp", executeLabel: "Enviar", icon: MessageSquareReply },
}

export function ChatPanel({ client, messages, loading, status, onConnect, onBack, onDetails, detailsVisible, onMessage, onMessagesReplace, onReviewSuggestion, composerRequest, onComposerReviewComplete, className }: {
  client: Client | null
  messages: Message[]
  loading: boolean
  status: WhatsappConnectionStatus
  onConnect: () => void
  onBack: () => void
  onDetails: () => void
  detailsVisible: boolean
  onMessage: (message: Message) => void
  onMessagesReplace: (messages: Message[]) => void
  onReviewSuggestion: (suggestion: NonNullable<Message["suggestion"]>) => void
  composerRequest?: { key: number; clientId: string; channel: Channel; body?: string; suggestionId?: string }
  onComposerReviewComplete?: (outcome: "ejecutada" | "descartada", resultSummary?: string) => void
  className?: string
}) {
  const initialComposerRequest = client && composerRequest?.clientId === client.id ? composerRequest : undefined
  const [body, setBody] = useState(initialComposerRequest?.body ?? "")
  const [channel, setChannel] = useState<Channel>(initialComposerRequest?.channel ?? "publico")
  const [sending, setSending] = useState(false)
  const [improving, setImproving] = useState(false)
  const [dictationBusy, setDictationBusy] = useState(false)
  const [executingSuggestion, setExecutingSuggestion] = useState<string | null>(null)
  const [expandedPrivateSummaryIds, setExpandedPrivateSummaryIds] = useState<Set<string>>(new Set())
  const [dismissedSuggestionId, setDismissedSuggestionId] = useState<string | null>(null)
  const [dismissingSuggestion, setDismissingSuggestion] = useState(false)
  const [sentAcknowledgement, setSentAcknowledgement] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sparkleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSparkleClickRef = useRef(0)

  const proactiveSuggestion = useMemo(() => {
    if (channel !== "publico") return null
    return messages
      .filter((message) => message.assistantMode === "proactivo" && message.suggestion?.status === "pendiente")
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .at(-1) ?? null
  }, [channel, messages])

  const displayItems = useMemo<ConversationDisplayItem[]>(() => {
    const source = messages.filter((message) => message.assistantMode !== "proactivo")
    if (channel === "privado") return source.map((message) => ({ kind: "message", message }))

    const items: ConversationDisplayItem[] = []
    let privateGroup: Message[] = []
    const flushPrivateGroup = () => {
      if (privateGroup.length === 0) return
      items.push({ kind: "private-summary", id: privateGroup[0].id, messages: privateGroup })
      privateGroup = []
    }

    for (const message of source) {
      if (message.channel === "privado") privateGroup.push(message)
      else {
        flushPrivateGroup()
        items.push({ kind: "message", message })
      }
    }
    flushPrivateGroup()
    return items
  }, [channel, messages])

  const floatingSuggestion = proactiveSuggestion && proactiveSuggestion.suggestion?.id !== dismissedSuggestionId
    ? proactiveSuggestion
    : null

  useEffect(() => {
    const viewport = bottomRef.current?.closest<HTMLElement>("[data-slot='scroll-area-viewport']")
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => () => {
    if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
    if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current)
  }, [])

  async function dismissFloatingSuggestion() {
    if (!floatingSuggestion || dismissingSuggestion || !client) return
    setDismissedSuggestionId(floatingSuggestion.suggestion!.id)
    setDismissingSuggestion(true)
    try {
      const response = await fetch("/api/assistant/suggestions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      })
      const data = await response.json()
      if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
    } catch {
      // La sugerencia ya desapareció de la interfaz; no interrumpimos la actividad del usuario.
    } finally {
      setDismissingSuggestion(false)
    }
  }

  async function send() {
    if (!client || !body.trim() || sending || improving || dictationBusy) return
    if (floatingSuggestion) void dismissFloatingSuggestion()
    const outgoing = body.trim()
    setBody("")
    setSending(true)
    try {
      const response = await fetch(channel === "publico" ? "/api/whatsapp/messages" : "/api/assistant/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, body: outgoing }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
        throw new Error(data.error)
      }
      if (channel === "publico") onMessage(data)
      else if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
      if (channel === "publico" && composerRequest?.suggestionId) {
        onComposerReviewComplete?.("ejecutada", "Mensaje enviado al cliente.")
      }
      setSentAcknowledgement(true)
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
      sentTimerRef.current = setTimeout(() => setSentAcknowledgement(false), 850)
    } catch (error) {
      setBody(outgoing)
      toast.error(error instanceof Error && error.message ? error.message : "No pudimos enviar el mensaje.", {
        description: channel === "publico"
          ? "Revisá la conexión con WhatsApp y volvé a intentarlo."
          : "El borrador quedó restaurado para que puedas reintentar.",
      })
    } finally {
      setSending(false)
    }
  }

  async function improveDraft() {
    if (!body.trim() || improving || sending || dictationBusy) return
    const original = body
    setImproving(true)
    try {
      const response = await fetch("/api/ai/improve-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) throw new Error(data.error)
      setBody(data.text)
      setSentAcknowledgement(false)
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "No pudimos mejorar el mensaje.", {
        description: "Tu borrador sigue intacto. Podés volver a intentarlo.",
      })
    } finally {
      setImproving(false)
    }
  }

  async function changeChannel(next: Channel) {
    if (!client || next === channel || dictationBusy) return
    if (floatingSuggestion) void dismissFloatingSuggestion()
    setExpandedPrivateSummaryIds(new Set())
    setChannel(next)
    setSentAcknowledgement(false)
    if (channel === "privado" && next === "publico") {
      try {
        const response = await fetch("/api/assistant/suggestions/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
      } catch {
        toast.error("No pudimos cerrar la sesión privada correctamente.")
      }
    }
  }

  function handleSparkleClick() {
    if (improving || sending || dictationBusy) return
    if (floatingSuggestion) void dismissFloatingSuggestion()
    const now = Date.now()
    if (channel === "publico" && now - lastSparkleClickRef.current < 300) {
      if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current)
      sparkleTimerRef.current = null
      lastSparkleClickRef.current = 0
      void improveDraft()
      return
    }

    lastSparkleClickRef.current = now
    if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current)
    sparkleTimerRef.current = setTimeout(() => {
      lastSparkleClickRef.current = 0
      sparkleTimerRef.current = null
      void changeChannel(channel === "publico" ? "privado" : "publico")
    }, 250)
  }

  async function acceptSuggestion(message: Message) {
    const suggestion = message.suggestion
    if (!suggestion || suggestion.status !== "pendiente" || executingSuggestion) return
    setExecutingSuggestion(suggestion.id)
    try {
      const response = await fetch(`/api/assistant/suggestions/${suggestion.id}`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
      toast.success(data.suggestion?.resultSummary ?? "Sugerencia ejecutada")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos ejecutar la sugerencia.", {
        description: "La sugerencia sigue pendiente; podés revisarla e intentarlo otra vez.",
      })
    } finally {
      setExecutingSuggestion(null)
    }
  }

  async function confirmFloatingSuggestion() {
    if (!proactiveSuggestion || !proactiveSuggestion.suggestion || executingSuggestion || dismissingSuggestion) return
    await acceptSuggestion(proactiveSuggestion)
    setDismissedSuggestionId(proactiveSuggestion.suggestion.id)
  }

  if (!client) {
    return (
      <section className={cn("h-full min-h-0 flex flex-col items-center justify-center overflow-hidden bg-chat", className)}>
        <div className="mx-6 max-w-sm border-l-2 border-primary/30 pl-5 text-left">
          <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquareText className="size-5" /></div>
          <h2 className="font-heading text-xl font-semibold">Tu próxima conversación empieza acá</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Creá o elegí un cliente para abrir su chat y su historia de contactos.</p>
        </div>
      </section>
    )
  }

  const publicUnavailable = channel === "publico" && status.state !== "connected"
  const hasVisibleConversation = displayItems.length > 0

  return (
    <section
      className={cn("h-full min-h-0 flex flex-col overflow-hidden bg-chat", className)}
      onPointerDownCapture={(event) => {
        const target = event.target as Element
        if (floatingSuggestion && !target.closest("[data-composer], [data-proactive-suggestion]")) void dismissFloatingSuggestion()
      }}
    >
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-border/80 bg-card px-4 md:px-5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack}><ArrowLeft /><span className="sr-only">Volver</span></Button>
        <Avatar className="size-11 border border-border/80 shadow-xs"><AvatarImage src={avatarUrl(client)} alt={`Foto de ${fullName(client)}`} className="object-cover" /><AvatarFallback className="bg-secondary font-heading text-sm font-semibold">{initials(client)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-lg font-semibold leading-tight">{fullName(client)}</h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className={cn("size-2 rounded-full", status.state === "connected" ? "crm-status-dot bg-wa-green text-wa-green" : "bg-muted-foreground/50")} />
            {status.state === "connected" ? "Sincronizado con WhatsApp" : client.phone}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={onDetails} aria-label={detailsVisible ? "Ocultar ficha" : "Ver ficha"}><PanelRight /><span className="sr-only">{detailsVisible ? "Ocultar ficha" : "Ver ficha"}</span></Button></TooltipTrigger>
          <TooltipContent>{detailsVisible ? "Ocultar ficha" : "Ver ficha"}</TooltipContent>
        </Tooltip>
      </div>

      {status.state !== "connected" ? (
        <Alert className="m-3 shrink-0 rounded-lg border-warning-border/30 bg-warning/10 text-warning-foreground">
          <CircleAlert />
          <AlertTitle>WhatsApp no está conectado</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>El asistente privado sigue disponible. Conectá el teléfono para usar el chat público.</span>
            <Button size="xs" variant="outline" onClick={onConnect}>Conectar</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full w-full flex-col justify-end gap-2.5 px-3 py-3 md:px-4">
          {loading ? <ConversationSkeleton /> : !hasVisibleConversation ? (
            <div className="my-auto flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"><MessageSquareText className="size-5" /></div>
              <p className="font-heading font-semibold">Esta conversación todavía no tiene mensajes</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Escribí abajo para enviar el primero.</p>
            </div>
          ) : displayItems.map((item, index) => {
            const timestamp = item.kind === "message" ? item.message.timestamp : item.messages[0].timestamp
            const previous = displayItems[index - 1]
            const previousTimestamp = previous ? previous.kind === "message" ? previous.message.timestamp : previous.messages[0].timestamp : null
            const showDate = !previousTimestamp || new Date(previousTimestamp).toDateString() !== new Date(timestamp).toDateString()
            return (
              <div key={item.kind === "message" ? item.message.id : item.id} className={cn("shrink-0", index === displayItems.length - 1 && "crm-reveal")}>
                {showDate ? <div className="my-2 flex justify-center"><Badge variant="secondary" className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-xs">{dateFormatter.format(new Date(timestamp))}</Badge></div> : null}
                {item.kind === "private-summary" ? (
                  <PrivateConversationSummary
                    messages={item.messages}
                    expanded={expandedPrivateSummaryIds.has(item.id)}
                    onToggle={() => setExpandedPrivateSummaryIds((current) => {
                      const next = new Set(current)
                      if (next.has(item.id)) next.delete(item.id)
                      else next.add(item.id)
                      return next
                    })}
                  />
                ) : (
                  <div className={cn("flex", item.message.channel === "privado" ? item.message.author === "usuario" ? "justify-end" : "justify-start" : item.message.direction === "outgoing" ? "justify-end" : "justify-start")}>
                    {item.message.type === "sugerencia" && item.message.suggestion ? (
                      <SuggestionBubble message={item.message} busy={executingSuggestion === item.message.suggestion.id} onAccept={() => void acceptSuggestion(item.message)} onReview={() => onReviewSuggestion(item.message.suggestion!)} />
                    ) : (
                      <ChatMessageBubble message={item.message} isPrivate={item.message.channel === "privado"} alignRight={item.message.channel === "privado" ? item.message.author === "usuario" : item.message.direction === "outgoing"} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div data-composer className={cn("relative z-10 shrink-0 border-t bg-card px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-colors", channel === "privado" ? "border-assistant/35 bg-assistant-soft/45" : "border-border/80")}>
        {composerRequest?.suggestionId ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-assistant/25 bg-assistant-soft/65 px-3 py-2 text-xs text-assistant-foreground">
            <span className="flex min-w-0 items-center gap-2"><Sparkles className="size-3.5 shrink-0 text-assistant" /><span className="truncate">Borrador del asistente · podés editarlo antes de enviar</span></span>
            <Button type="button" variant="ghost" size="xs" className="h-7 shrink-0 px-2" onClick={() => onComposerReviewComplete?.("descartada")}>Cancelar</Button>
          </div>
        ) : null}
        <div className="flex w-full items-end gap-2">
          <div className="relative min-w-0 flex-1">
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => { if (floatingSuggestion) void dismissFloatingSuggestion(); setBody(event.target.value); if (sentAcknowledgement) setSentAcknowledgement(false) }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.shiftKey && floatingSuggestion && proactiveSuggestion) {
                  event.preventDefault()
                  void confirmFloatingSuggestion()
                  return
                }
                if (floatingSuggestion) void dismissFloatingSuggestion()
                if (event.key !== "Enter") return
                event.preventDefault()
                if (event.shiftKey) {
                  if (body.trim()) void improveDraft()
                  else void changeChannel(channel === "publico" ? "privado" : "publico")
                  return
                }
                void send()
              }}
              placeholder={channel === "privado" ? "Consultale al asistente…" : `Mensaje para ${client.firstName}…`}
              className={cn(
                "max-h-32 min-h-11 resize-none rounded-xl bg-background py-3 pr-[4.75rem] pl-4 text-[15px] shadow-xs placeholder:text-muted-foreground/80",
                channel === "privado" ? "border-dashed border-assistant/60 focus-visible:border-assistant focus-visible:ring-assistant/25" : "border-input",
              )}
              rows={1}
              readOnly={dictationBusy}
              disabled={sending || improving || publicUnavailable}
            />
            {floatingSuggestion ? (
              <div data-proactive-suggestion>
                <FloatingSuggestion suggestion={floatingSuggestion.suggestion!} body={floatingSuggestion.body} />
              </div>
            ) : null}
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
              <VoiceDictationButton
                textareaRef={textareaRef}
                value={body}
                onValueChange={(value) => { setBody(value); setSentAcknowledgement(false) }}
                onBusyChange={setDictationBusy}
                disabled={sending || improving || publicUnavailable}
                assistant={channel === "privado"}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={cn("bg-transparent shadow-none", channel === "privado" ? "text-assistant hover:text-assistant" : "text-muted-foreground hover:text-primary")}
                    onClick={handleSparkleClick}
                    disabled={improving || sending || dictationBusy}
                    aria-label={channel === "privado" ? "Cambiar al chat público" : "Cambiar al asistente privado; doble pulsación para mejorar el texto"}
                    aria-pressed={channel === "privado"}
                    aria-busy={improving}
                  >
                    {improving ? <LoaderCircle className="animate-spin" /> : channel === "privado" ? <Bot /> : <Sparkles />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{channel === "privado" ? "Volver al chat público" : "Asistente privado · doble clic para mejorar"}</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <Button size="icon" className={cn("group/send size-11 shrink-0 rounded-full shadow-xs transition-transform duration-150 active:scale-95", channel === "privado" && "bg-assistant text-white hover:bg-assistant/90", sentAcknowledgement && "bg-wa-green disabled:opacity-100")} onClick={send} disabled={!body.trim() || publicUnavailable || sending || improving || dictationBusy}>
            {sending ? <LoaderCircle className="animate-spin" /> : sentAcknowledgement ? <Check className="crm-check-in" /> : <SendHorizontal className="transition-transform duration-200 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5" />}
            <span className="sr-only">{sentAcknowledgement ? "Mensaje enviado" : channel === "privado" ? "Enviar al asistente" : "Enviar mensaje"}</span>
          </Button>
        </div>
      </div>
    </section>
  )
}

function ChatMessageBubble({ message, isPrivate, alignRight }: { message: Message; isPrivate: boolean; alignRight: boolean }) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLDivElement>(null)
  const [inlineMeta, setInlineMeta] = useState(false)
  const hasAssistantLabel = isPrivate && message.author === "asistente"

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    const content = contentRef.current
    const meta = metaRef.current
    const available = bubble?.parentElement
    if (!bubble || !content || !meta || !available) return

    const measure = () => {
      const contentStyles = window.getComputedStyle(content)
      const bubbleStyles = window.getComputedStyle(bubble)
      const lineHeight = Number.parseFloat(contentStyles.lineHeight) || 24
      const horizontalPadding = Number.parseFloat(bubbleStyles.paddingLeft) + Number.parseFloat(bubbleStyles.paddingRight)
      const estimatedInlineWidth = content.scrollWidth + meta.scrollWidth + horizontalPadding + 6
      const isSingleLine = !message.body.includes("\n") && content.scrollHeight <= lineHeight * 1.25
      const shouldInline = !hasAssistantLabel && isSingleLine && estimatedInlineWidth <= available.clientWidth * 0.75
      setInlineMeta((current) => current === shouldInline ? current : shouldInline)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(available)
    observer.observe(content)
    return () => observer.disconnect()
  }, [hasAssistantLabel, message.body])

  return (
    <div ref={bubbleRef} className={cn(
      "chat-bubble max-w-[86%] rounded-2xl px-3 py-2 text-[15px] leading-6 shadow-xs md:max-w-[74%]",
      isPrivate
        ? cn("border border-dashed border-assistant/55 bg-assistant-soft text-assistant-foreground", alignRight ? "rounded-br-sm" : "rounded-bl-sm")
        : message.direction === "outgoing"
          ? "chat-bubble-outgoing rounded-br-sm bg-wa-bubble text-wa-bubble-foreground"
          : "chat-bubble-incoming rounded-bl-sm border border-border/80 bg-card",
    )}>
      {hasAssistantLabel ? <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-assistant"><Bot className="size-3.5" />Asistente</div> : null}
      <div className={cn(inlineMeta && "flex items-end gap-1.5")}>
        <div ref={contentRef} className="min-w-0"><WhatsAppMessage>{message.body}</WhatsAppMessage></div>
        <div ref={metaRef} className={cn(inlineMeta && "shrink-0 pb-[0.18rem]")}>
          <MessageMeta message={message} isPrivate={isPrivate} inline={inlineMeta} />
        </div>
      </div>
    </div>
  )
}

function MessageMeta({ message, isPrivate, inline = false }: { message: Message; isPrivate: boolean; inline?: boolean }) {
  return (
    <div className={cn("flex items-center justify-end gap-0.5 text-[10px] font-normal leading-none tabular-nums", !inline && "mt-0.5", isPrivate ? "text-assistant/70" : message.direction === "outgoing" ? "text-wa-bubble-muted" : "text-muted-foreground")}>
      <span className="opacity-60">{timeFormatter.format(new Date(message.timestamp))}</span>
      {!isPrivate && message.direction === "outgoing" ? <CheckCheck className={cn("size-3.5 stroke-[2.5] transition-colors duration-200", message.readAt ? "crm-check-in text-wa-read" : "text-muted-foreground/80")} /> : null}
    </div>
  )
}

function FloatingSuggestion({ suggestion, body }: { suggestion: NonNullable<Message["suggestion"]>; body: string }) {
  const presentation = actionPresentation[suggestion.actionType]
  const Icon = presentation.icon
  return (
    <div className="crm-suggestion-float absolute bottom-[calc(100%+0.65rem)] right-4 z-30 w-[min(23rem,calc(100vw-2rem))]" role="status" aria-live="polite">
      <div className="relative rounded-2xl border border-assistant/35 bg-assistant-soft/95 px-3.5 py-3 text-assistant-foreground shadow-lg shadow-assistant/10 backdrop-blur-sm">
        <span className="absolute -bottom-2 right-2 size-4 rotate-45 border-b border-r border-assistant/35 bg-assistant-soft/95" aria-hidden="true" />
        <div className="relative flex items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-assistant text-white shadow-sm"><Icon className="size-3.5" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-assistant"><Sparkles className="size-3" />Sugerencia del asistente</div>
            <p className="mt-1 text-sm font-medium leading-5">{body}</p>
            <p className="mt-1.5 text-[11px] text-assistant/75">Shift + Enter para aplicar · cualquier otra actividad la descarta</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PrivateConversationSummary({ messages, expanded, onToggle }: { messages: Message[]; expanded: boolean; onToggle: () => void }) {
  const assistantMessages = messages.filter((message) => message.author === "asistente")
  const lastMessage = messages.at(-1)
  const preview = assistantMessages.at(-1)?.body ?? messages[0]?.body ?? "Conversación privada con el asistente"
  const compactPreview = preview.replace(/\s+/g, " ").trim()
  return (
    <div className="w-full max-w-2xl self-center rounded-xl border border-dashed border-assistant/35 bg-assistant-soft/35 shadow-xs">
      <button type="button" className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-assistant-soft/55" onClick={onToggle} aria-expanded={expanded}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-assistant/12 text-assistant"><Bot className="size-3.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-assistant">Resumen del asistente</span>
          <span className="mt-0.5 block truncate text-xs text-assistant-foreground">{compactPreview}</span>
          <span className="mt-0.5 block text-[10px] text-assistant/65">{messages.length} {messages.length === 1 ? "mensaje privado" : "mensajes privados"}{lastMessage ? ` · ${timeFormatter.format(new Date(lastMessage.timestamp))}` : ""}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-assistant/70 transition-transform duration-200", expanded && "rotate-180")} />
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-assistant/20 px-3.5 py-3">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.author === "usuario" ? "justify-end" : "justify-start")}>
              <ChatMessageBubble message={message} isPrivate alignRight={message.author === "usuario"} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SuggestionBubble({ message, busy, onAccept, onReview }: { message: Message; busy: boolean; onAccept: () => void; onReview: () => void }) {
  const suggestion = message.suggestion!
  const presentation = actionPresentation[suggestion.actionType]
  const Icon = presentation.icon
  const pending = suggestion.status === "pendiente"
  const completed = suggestion.status === "ejecutada"

  if (!pending) {
    return (
      <div className={cn("max-w-[86%] rounded-xl border border-dashed px-4 py-3 text-sm md:max-w-[74%]", completed ? "border-assistant/35 bg-assistant-soft/55" : "border-border bg-card/65 text-muted-foreground opacity-75")}>
        <div className="flex items-start gap-2.5">
          {completed ? <Check className="mt-0.5 size-4 shrink-0 text-assistant" /> : <Icon className="mt-0.5 size-4 shrink-0" />}
          <div className="min-w-0">
            <p className="font-medium">{completed ? suggestion.resultSummary ?? "Sugerencia ejecutada" : message.body}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[86%] overflow-hidden rounded-xl border border-dashed border-assistant/55 bg-assistant-soft/70 text-assistant-foreground shadow-xs transition-colors duration-200 hover:border-assistant md:max-w-[74%]">
      <Button type="button" variant="ghost" className="h-auto w-full justify-start rounded-none px-4 py-3 text-left hover:bg-assistant-soft" onClick={onReview} disabled={busy}>
        <Icon className="size-4 shrink-0 self-start text-assistant" />
        <div className="min-w-0 whitespace-normal">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-assistant">Sugerencia · {presentation.label}</span>
          <span className="mt-1 block text-sm font-medium leading-5">{message.body}</span>
          {suggestion.actionType === "enviar_mensaje" && suggestion.payload.message ? (
            <span className="mt-2 block rounded-md border border-assistant/20 bg-background/45 px-2.5 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-assistant/75">Texto a enviar</span>
              <span className="mt-1 block text-sm font-normal leading-5 text-assistant-foreground"><WhatsAppMessage>{suggestion.payload.message}</WhatsAppMessage></span>
            </span>
          ) : null}
        </div>
      </Button>
      <div className="flex items-center justify-between gap-3 border-t border-assistant/20 px-3 py-2">
        <span className="text-[11px] text-assistant/75">Abrir para revisar y editar</span>
        <Button type="button" size="xs" className="shrink-0 bg-assistant text-white hover:bg-assistant/90" onClick={onAccept} disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Icon />}
          {busy ? "Ejecutando…" : presentation.executeLabel}
        </Button>
      </div>
    </div>
  )
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 py-2" aria-label="Cargando mensajes">
      <div className="flex justify-start"><Skeleton className="h-16 w-[38%] rounded-2xl rounded-bl-md" /></div>
      <div className="flex justify-end"><Skeleton className="h-20 w-[54%] rounded-2xl rounded-br-md" /></div>
      <div className="flex justify-start"><Skeleton className="h-14 w-[30%] rounded-2xl rounded-bl-md" /></div>
      <span className="sr-only">Cargando mensajes…</span>
    </div>
  )
}
