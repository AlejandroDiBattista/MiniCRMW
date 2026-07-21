"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Bot,
  Check,
  ClipboardCheck,
  ExternalLink,
  ListPlus,
  LoaderCircle,
  MessageSquareReply,
  Pencil,
  SendHorizontal,
  Sparkles,
  Trash2,
  UserPlus,
  UserRoundPen,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  Client,
  WorkspaceAssistantActionType,
  WorkspaceAssistantMessage,
} from "@/lib/types"
import { dateFormatter, timeFormatter } from "./format"
import { VoiceDictationButton } from "./voice-dictation-button"
import { WhatsAppMessage } from "./whatsapp-message"

const actionPresentation: Record<WorkspaceAssistantActionType, { label: string; executeLabel: string; icon: typeof Pencil }> = {
  crear_cliente: { label: "Crear cliente", executeLabel: "Crear", icon: UserPlus },
  actualizar_cliente: { label: "Actualizar ficha", executeLabel: "Guardar", icon: UserRoundPen },
  eliminar_cliente: { label: "Eliminar cliente", executeLabel: "Eliminar", icon: Trash2 },
  crear_tarea: { label: "Crear tarea", executeLabel: "Crear", icon: ListPlus },
  actualizar_tarea: { label: "Actualizar tarea", executeLabel: "Guardar", icon: Pencil },
  completar_tarea: { label: "Completar tarea", executeLabel: "Completar", icon: ClipboardCheck },
  eliminar_tarea: { label: "Eliminar tarea", executeLabel: "Eliminar", icon: Trash2 },
  enviar_mensaje: { label: "Enviar por WhatsApp", executeLabel: "Enviar", icon: MessageSquareReply },
  enviar_campana: { label: "Enviar a varios clientes", executeLabel: "Enviar", icon: UsersRound },
  abrir_conversacion: { label: "Abrir conversación", executeLabel: "Abrir", icon: ExternalLink },
}

const starterPrompts = [
  "Resumime el estado general del CRM",
  "¿Qué tareas están pendientes?",
  "Quiero agregar un nuevo contacto",
  "Prepará recordatorios para quienes tengan tareas pendientes",
]

export function WorkspaceAssistantPanel({ clients, messages, loading, onBack, onMessagesReplace, onOpenClient, onReviewSuggestion, className }: {
  clients: Client[]
  messages: WorkspaceAssistantMessage[]
  loading: boolean
  onBack: () => void
  onMessagesReplace: (messages: WorkspaceAssistantMessage[]) => void
  onOpenClient: (clientId: string) => void
  onReviewSuggestion: (suggestion: NonNullable<WorkspaceAssistantMessage["suggestion"]>) => void
  className?: string
}) {
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [dictationBusy, setDictationBusy] = useState(false)
  const [executingSuggestion, setExecutingSuggestion] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingTasks = clients.reduce((total, client) => total + client.history.filter((task) => !task.isCompleted).length, 0)

  useEffect(() => {
    const viewport = bottomRef.current?.closest<HTMLElement>("[data-slot='scroll-area-viewport']")
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
  }, [messages])

  async function send() {
    if (!body.trim() || sending || dictationBusy) return
    const outgoing = body.trim()
    setBody("")
    setSending(true)
    try {
      const response = await fetch("/api/assistant/workspace/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: outgoing }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
        throw new Error(data.error)
      }
      if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
    } catch (error) {
      setBody(outgoing)
      toast.error(error instanceof Error ? error.message : "El asistente no pudo responder.", {
        description: "Tu borrador quedó restaurado para que puedas reintentar.",
      })
    } finally {
      setSending(false)
    }
  }

  async function acceptSuggestion(message: WorkspaceAssistantMessage) {
    const suggestion = message.suggestion
    if (!suggestion || suggestion.status !== "pendiente" || executingSuggestion) return
    setExecutingSuggestion(suggestion.id)
    try {
      const response = await fetch(`/api/assistant/workspace/suggestions/${suggestion.id}`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (Array.isArray(data.messages)) onMessagesReplace(data.messages)
      toast.success(data.suggestion?.resultSummary ?? "Sugerencia ejecutada")
      if (typeof data.navigateToClientId === "string" && data.navigateToClientId) onOpenClient(data.navigateToClientId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos ejecutar la sugerencia.", {
        description: "La sugerencia sigue pendiente y podés reintentarla.",
      })
    } finally {
      setExecutingSuggestion(null)
    }
  }

  return (
    <section className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-chat", className)}>
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-assistant/20 bg-card px-4 md:px-5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack}><ArrowLeft /><span className="sr-only">Volver</span></Button>
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-assistant text-white shadow-sm">
          <Bot className="size-5" />
          <Sparkles className="absolute -right-1 -top-1 size-3.5 rounded-full bg-card p-0.5 text-assistant" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-semibold leading-tight">Asistente de Lazo</h2>
          <p className="mt-0.5 truncate text-[13px] text-assistant">{clients.length} clientes · {pendingTasks} {pendingTasks === 1 ? "tarea pendiente" : "tareas pendientes"}</p>
        </div>
        <Badge variant="outline" className="hidden border-assistant/25 bg-assistant-soft/60 text-assistant sm:flex"><span className="mr-1.5 size-1.5 rounded-full bg-assistant" />Privado</Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full w-full flex-col justify-end gap-3 px-3 py-4 md:px-5">
          {loading ? <WorkspaceSkeleton /> : messages.length === 0 ? (
            <div className="my-auto mx-auto flex w-full max-w-xl flex-col items-center px-2 py-10 text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-assistant-soft text-assistant ring-1 ring-assistant/15"><Sparkles className="size-6" /></div>
              <h3 className="font-heading text-2xl font-semibold tracking-tight">Tu asistente para todo el CRM</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Consultá información, organizá tareas o prepará acciones sobre uno o varios clientes. Nada se modifica sin tu aprobación.</p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {starterPrompts.map((prompt) => (
                  <Button key={prompt} variant="outline" className="h-auto justify-start rounded-xl border-assistant/20 bg-card/80 px-4 py-3 text-left text-sm font-normal shadow-xs hover:border-assistant/35 hover:bg-assistant-soft/50" onClick={() => setBody(prompt)}>
                    <Sparkles className="size-4 shrink-0 text-assistant" /><span className="whitespace-normal">{prompt}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : messages.map((message, index) => {
            const previous = messages[index - 1]
            const showDate = !previous || new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString()
            return (
              <div key={message.id} className={cn(index === messages.length - 1 && "crm-reveal")}>
                {showDate ? <div className="my-4 flex justify-center"><Badge variant="secondary" className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-xs">{dateFormatter.format(new Date(message.timestamp))}</Badge></div> : null}
                <div className={cn("flex", message.author === "usuario" ? "justify-end" : "justify-start")}>
                  {message.type === "sugerencia" && message.suggestion ? (
                    <WorkspaceSuggestionBubble message={message} busy={executingSuggestion === message.suggestion.id} onAccept={() => void acceptSuggestion(message)} onReview={() => onReviewSuggestion(message.suggestion!)} />
                  ) : (
                    <div className={cn(
                      "max-w-[88%] rounded-2xl border border-dashed border-assistant/50 bg-assistant-soft px-4 py-3 text-[15px] leading-6 text-assistant-foreground shadow-xs md:max-w-[76%]",
                      message.author === "usuario" ? "rounded-br-sm" : "rounded-bl-sm",
                    )}>
                      {message.author === "asistente" ? <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-assistant"><Bot className="size-3.5" />Asistente</div> : null}
                      <WhatsAppMessage>{message.body}</WhatsAppMessage>
                      <div className="mt-1 flex justify-end text-[10px] tabular-nums text-assistant/55">{timeFormatter.format(new Date(message.timestamp))}</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="relative z-10 shrink-0 border-t border-assistant/25 bg-assistant-soft/45 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full items-end gap-2">
          <div className="relative min-w-0 flex-1">
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() }
              }}
              placeholder="Pedile algo al asistente…"
              className="max-h-36 min-h-11 resize-none rounded-xl border-dashed border-assistant/60 bg-background py-3 pr-[4.75rem] pl-4 text-[15px] shadow-xs placeholder:text-muted-foreground/80 focus-visible:border-assistant focus-visible:ring-assistant/25"
              rows={1}
              readOnly={dictationBusy}
              disabled={sending}
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              <VoiceDictationButton
                textareaRef={textareaRef}
                value={body}
                onValueChange={setBody}
                onBusyChange={setDictationBusy}
                disabled={sending}
                assistant
              />
              <Sparkles className="pointer-events-none size-4 text-assistant/70" />
            </div>
          </div>
          <Button size="icon" className="group/send size-11 shrink-0 rounded-full bg-assistant text-white shadow-xs transition-transform duration-150 hover:bg-assistant/90 active:scale-95" onClick={send} disabled={!body.trim() || sending || dictationBusy}>
            {sending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal className="transition-transform duration-200 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5" />}
            <span className="sr-only">Enviar al asistente</span>
          </Button>
        </div>
        <p className="mt-1 px-2 text-[10px] text-assistant">Privado · las acciones requieren tu aprobación</p>
      </div>
    </section>
  )
}

function WorkspaceSuggestionBubble({ message, busy, onAccept, onReview }: { message: WorkspaceAssistantMessage; busy: boolean; onAccept: () => void; onReview: () => void }) {
  const suggestion = message.suggestion!
  const presentation = actionPresentation[suggestion.actionType]
  const Icon = presentation.icon
  const pending = suggestion.status === "pendiente"
  const completed = suggestion.status === "ejecutada"
  const recipients = suggestion.payload.recipients?.length ?? (suggestion.actionType === "enviar_mensaje" ? 1 : 0)

  if (!pending) {
    return (
      <div className={cn("max-w-[88%] rounded-xl border border-dashed px-4 py-3 text-sm md:max-w-[76%]", completed ? "border-assistant/35 bg-assistant-soft/70" : "border-border bg-card/65 text-muted-foreground opacity-75")}>
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
    <div className="max-w-[88%] overflow-hidden rounded-xl border border-dashed border-assistant/55 bg-assistant-soft/75 text-assistant-foreground shadow-xs transition-colors duration-200 hover:border-assistant md:max-w-[76%]">
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
          ) : suggestion.actionType === "enviar_campana" && suggestion.payload.recipients?.length ? (
            <span className="mt-2 block rounded-md border border-assistant/20 bg-background/45 px-2.5 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-assistant/75">Mensajes a enviar</span>
              <span className="mt-1 block space-y-1.5 text-sm font-normal leading-5 text-assistant-foreground">
                {suggestion.payload.recipients.map((recipient, index) => (
                  <span key={`${recipient.clientId}-${index}`} className="block border-l-2 border-assistant/30 pl-2"><WhatsAppMessage>{recipient.message}</WhatsAppMessage></span>
                ))}
              </span>
            </span>
          ) : null}
          {recipients > 0 ? <span className="mt-1 block text-xs font-normal text-assistant/70">{recipients} {recipients === 1 ? "destinatario" : "destinatarios"}</span> : null}
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

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 py-2" aria-label="Cargando asistente">
      <div className="flex justify-end"><Skeleton className="h-14 w-[42%] rounded-2xl" /></div>
      <div className="flex justify-start"><Skeleton className="h-24 w-[62%] rounded-2xl" /></div>
      <span className="sr-only">Cargando conversación…</span>
    </div>
  )
}
