"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Link2, Menu, MessageCircleMore, MessageSquareText, PanelRight, Plus, Smartphone, UsersRound, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { ChatPanel } from "@/components/crm/chat-panel"
import { CampaignReviewSheet } from "@/components/crm/campaign-review-sheet"
import { ClientDetails } from "@/components/crm/client-details"
import { ClientFormSheet } from "@/components/crm/client-form-sheet"
import { ContactList } from "@/components/crm/contact-list"
import { HistoryFormSheet } from "@/components/crm/history-form-sheet"
import { WhatsappDialog } from "@/components/crm/whatsapp-dialog"
import { WorkspaceAssistantPanel } from "@/components/crm/workspace-assistant-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type {
  AssistantSuggestion,
  Client,
  Message,
  WhatsappConnectionStatus,
  WorkspaceAssistantMessage,
  WorkspaceAssistantRecipient,
  WorkspaceAssistantSuggestion,
} from "@/lib/types"

type MobileView = "clients" | "chat" | "details"
const WORKSPACE_ASSISTANT_ID = "workspace-assistant"

type SuggestionReview =
  | { scope: "client"; sourceClientId: string; suggestion: AssistantSuggestion }
  | { scope: "workspace"; suggestion: WorkspaceAssistantSuggestion }

const disconnectedStatus: WhatsappConnectionStatus = {
  state: "disconnected",
  qrDataUrl: null,
  user: null,
  error: null,
}

function statusCopy(status: WhatsappConnectionStatus) {
  switch (status.state) {
    case "connected": return "WhatsApp conectado"
    case "connecting": return "Conectando WhatsApp…"
    case "qr": return "QR listo para escanear"
    case "error": return "WhatsApp reconectando…"
    default: return "WhatsApp no vinculado"
  }
}

export function CrmDashboard({ initialClients }: { initialClients: Client[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(initialClients[0]?.id ?? WORKSPACE_ASSISTANT_ID)
  const [mobileView, setMobileView] = useState<MobileView>("clients")
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(Boolean(initialClients[0]))
  const [workspaceMessages, setWorkspaceMessages] = useState<WorkspaceAssistantMessage[]>([])
  const [loadingWorkspaceMessages, setLoadingWorkspaceMessages] = useState(initialClients.length === 0)
  const [status, setStatus] = useState<WhatsappConnectionStatus>(disconnectedStatus)
  const [qrOpen, setQrOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [desktopDetailsOpen, setDesktopDetailsOpen] = useState(true)
  const [suggestionReview, setSuggestionReview] = useState<SuggestionReview | null>(null)
  const [composerRequest, setComposerRequest] = useState<{ key: number; clientId: string; channel: "publico" | "privado"; body?: string; suggestionId?: string }>()
  const selectedIdRef = useRef(selectedId)
  const composerRequestKey = useRef(0)

  const effectiveSelectedId = selectedId === WORKSPACE_ASSISTANT_ID
    ? WORKSPACE_ASSISTANT_ID
    : initialClients.some((client) => client.id === selectedId)
      ? selectedId
      : initialClients[0]?.id ?? WORKSPACE_ASSISTANT_ID
  const assistantSelected = effectiveSelectedId === WORKSPACE_ASSISTANT_ID

  useEffect(() => { selectedIdRef.current = effectiveSelectedId }, [effectiveSelectedId])

  const selectedClient = useMemo(
    () => assistantSelected ? null : initialClients.find((client) => client.id === effectiveSelectedId) ?? null,
    [initialClients, effectiveSelectedId, assistantSelected],
  )

  useEffect(() => {
    if (!effectiveSelectedId || assistantSelected) return
    const controller = new AbortController()
    fetch(`/api/whatsapp/messages?clientId=${effectiveSelectedId}&sync=1`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data)
        // La API marca los mensajes entrantes como vistos al abrir el chat.
        // Actualizamos la lista para quitar inmediatamente el indicador.
        router.refresh()
      })
      .catch((error) => { if (error.name !== "AbortError") toast.error("No pudimos cargar la conversación", { description: "Revisá tu conexión e intentá de nuevo." }) })
      .finally(() => setLoadingMessages(false))
    return () => controller.abort()
  }, [effectiveSelectedId, assistantSelected, router])

  useEffect(() => {
    if (!assistantSelected) return
    const controller = new AbortController()
    fetch("/api/assistant/workspace/messages", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (Array.isArray(data)) setWorkspaceMessages(data) })
      .catch((error) => { if (error.name !== "AbortError") toast.error("No pudimos cargar al asistente") })
      .finally(() => setLoadingWorkspaceMessages(false))
    return () => controller.abort()
  }, [assistantSelected])

  useEffect(() => {
    const controller = new AbortController()
    const refreshStatus = () => {
      fetch("/api/whatsapp/status", { signal: controller.signal })
        .then((response) => response.json())
        .then((nextStatus: WhatsappConnectionStatus) => {
          setStatus(nextStatus)
          if (nextStatus.state === "qr") setQrOpen(true)
        })
        .catch((error) => { if (error.name !== "AbortError") return })
    }

    refreshStatus()
    // EventSource is the fast path, but a short polling fallback is important
    // on Railway/proxies that buffer or reconnect long-lived SSE responses.
    const statusPoll = window.setInterval(refreshStatus, 5_000)
    const events = new EventSource("/api/whatsapp/events")
    events.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type: string; status?: WhatsappConnectionStatus; clientId?: string; message?: Message; messages?: Message[] | WorkspaceAssistantMessage[]; mergedClientId?: string; removedClientId?: string }
      if (payload.type === "status" && payload.status) {
        setStatus(payload.status)
        if (payload.status.state === "qr") setQrOpen(true)
      }
      if (payload.type === "message" && payload.message) {
        if (payload.clientId === selectedIdRef.current) {
          setMessages((current) => current.some((message) => message.id === payload.message!.id)
            ? current.map((message) => message.id === payload.message!.id ? payload.message! : message)
            : [...current, payload.message!])
          // Si el chat está abierto, una llegada nueva se considera vista.
          // La respuesta no reemplaza el estado local: sólo actualiza el
          // contador persistido en SQLite.
          void fetch(`/api/whatsapp/messages?clientId=${encodeURIComponent(payload.clientId)}`)
            .catch(() => undefined)
            .finally(() => router.refresh())
        } else {
          router.refresh()
        }
      }
      if (payload.type === "assistant" && payload.clientId === selectedIdRef.current && payload.messages) {
        setMessages(payload.messages as Message[])
        router.refresh()
      }
      if (payload.type === "workspace-assistant" && payload.messages) {
        setWorkspaceMessages(payload.messages as WorkspaceAssistantMessage[])
        router.refresh()
      }
      if (payload.type === "clients") {
        if (payload.removedClientId === selectedIdRef.current && payload.mergedClientId) {
          setSelectedId(payload.mergedClientId)
          selectedIdRef.current = payload.mergedClientId
        }
        router.refresh()
      }
      if (payload.type === "profile") router.refresh()
    }
    return () => {
      controller.abort()
      window.clearInterval(statusPoll)
      events.close()
    }
  }, [router])

  function selectClient(id: string) {
    setSelectedId(id)
    if (id !== effectiveSelectedId) setLoadingMessages(true)
    setMobileView("chat")
  }

  function selectAssistant() {
    if (!assistantSelected) setLoadingWorkspaceMessages(true)
    setSelectedId(WORKSPACE_ASSISTANT_ID)
    setMobileView("chat")
  }

  function requestComposer(clientId: string, channel: "publico" | "privado", body?: string, suggestionId?: string) {
    composerRequestKey.current += 1
    setSelectedId(clientId)
    if (clientId !== effectiveSelectedId) setLoadingMessages(true)
    setMobileView("chat")
    setComposerRequest({ key: composerRequestKey.current, clientId, channel, body, suggestionId })
  }

  function reviewClientId(review: SuggestionReview) {
    return review.scope === "client" ? review.suggestion.clientId : review.suggestion.payload.clientId
  }

  function returnToAssistant(review: SuggestionReview) {
    if (review.scope === "workspace" || review.suggestion.actionType === "eliminar_cliente") {
      selectAssistant()
      return
    }
    requestComposer(review.sourceClientId, "privado")
  }

  async function resolveSuggestionReview(review: SuggestionReview, outcome: "ejecutada" | "descartada", resultSummary = "", returnAfter = true) {
    try {
      const base = review.scope === "workspace" ? "/api/assistant/workspace/suggestions" : "/api/assistant/suggestions"
      const response = await fetch(`${base}/${review.suggestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, resultSummary }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (review.scope === "workspace" && Array.isArray(data.messages)) setWorkspaceMessages(data.messages)
      if (review.scope === "client" && Array.isArray(data.messages)) setMessages(data.messages)
      setSuggestionReview(null)
      setComposerRequest(undefined)
      router.refresh()
      if (returnAfter) returnToAssistant(review)
      if (outcome === "ejecutada") toast.success(data.suggestion?.resultSummary ?? resultSummary)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos registrar la revisión.")
    }
  }

  function startSuggestionReview(review: SuggestionReview) {
    const { suggestion } = review
    setSuggestionReview(review)
    const clientId = reviewClientId(review)

    if (suggestion.actionType === "enviar_mensaje" && clientId && suggestion.payload.message) {
      requestComposer(clientId, "publico", suggestion.payload.message, suggestion.id)
      return
    }
    if (suggestion.actionType === "abrir_conversacion" && clientId) {
      selectClient(clientId)
      void resolveSuggestionReview(review, "ejecutada", "Conversación abierta.", false)
      return
    }
    if ((suggestion.actionType === "actualizar_cliente" || suggestion.actionType === "eliminar_cliente") && clientId) {
      selectClient(clientId)
      return
    }
    if (["crear_tarea", "actualizar_tarea", "completar_tarea", "eliminar_tarea"].includes(suggestion.actionType) && clientId) {
      selectClient(clientId)
      if (suggestion.actionType === "completar_tarea" || suggestion.actionType === "eliminar_tarea") {
        if (window.matchMedia("(min-width: 1280px)").matches) setDesktopDetailsOpen(true)
        else if (window.matchMedia("(min-width: 768px)").matches) setDetailsOpen(true)
        else setMobileView("details")
      }
    }
  }

  async function confirmReviewedCampaign(review: Extract<SuggestionReview, { scope: "workspace" }>, recipients: WorkspaceAssistantRecipient[]) {
    try {
      const response = await fetch(`/api/assistant/workspace/suggestions/${review.suggestion.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (Array.isArray(data.messages)) setWorkspaceMessages(data.messages)
      setSuggestionReview(null)
      router.refresh()
      selectAssistant()
      toast.success(data.suggestion?.resultSummary ?? "Campaña enviada")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos enviar la campaña.")
      throw error
    }
  }

  function showDetails() {
    if (window.matchMedia("(min-width: 1280px)").matches) {
      setDesktopDetailsOpen((current) => !current)
    } else if (window.matchMedia("(min-width: 768px)").matches) {
      setDetailsOpen(true)
    } else {
      setMobileView("details")
    }
  }

  async function connectWhatsapp() {
    setQrOpen(true)
    setStatus((current) => ({ ...current, state: "connecting", error: null }))
    try {
      const response = await fetch("/api/whatsapp/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      })
      if (!response.ok) throw new Error()
      setStatus(await response.json())
    } catch {
      toast.error("No pudimos vincular WhatsApp", { description: "Revisá el teléfono y volvé a intentarlo." })
      setStatus((current) => ({ ...current, state: "error", error: "No pudimos iniciar la conexión." }))
    }
  }

  async function disconnectWhatsapp() {
    await fetch("/api/whatsapp/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    })
    setStatus(disconnectedStatus)
    toast.success("WhatsApp desconectado")
  }

  const reviewedClientId = suggestionReview ? reviewClientId(suggestionReview) : undefined
  const reviewedClient = reviewedClientId ? initialClients.find((client) => client.id === reviewedClientId) : undefined
  const reviewedTask = suggestionReview?.suggestion.payload.taskId
    ? reviewedClient?.history.find((task) => task.id === suggestionReview.suggestion.payload.taskId)
    : undefined
  const reviewedAction = suggestionReview?.suggestion.actionType
  const clientFormReview = reviewedAction && ["crear_cliente", "actualizar_cliente", "eliminar_cliente"].includes(reviewedAction)
  const taskFormReview = reviewedAction === "crear_tarea" || reviewedAction === "actualizar_tarea"
  const taskDetailsReview = suggestionReview && (reviewedAction === "completar_tarea" || reviewedAction === "eliminar_tarea") && suggestionReview.suggestion.payload.taskId
    ? { taskId: suggestionReview.suggestion.payload.taskId, action: reviewedAction }
    : undefined

  return (
    <div className="flex h-dvh overflow-hidden bg-background flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-card px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><MessageCircleMore className="size-5" /></div>
          <div><p className="font-heading text-xl font-semibold leading-none tracking-tight">Lazo</p><p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Clientes + WhatsApp</p></div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden h-9 gap-2 rounded-lg border-border bg-background px-3 text-[13px] shadow-xs md:flex">
                <span className={cn("size-2 rounded-full", status.state === "connected" ? "crm-status-dot bg-wa-green text-wa-green" : status.state === "error" ? "bg-destructive" : "bg-muted-foreground/50")} />
                {statusCopy(status)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={connectWhatsapp}><Link2 />{status.state === "connected" ? "Abrir conexión" : "Vincular WhatsApp"}</DropdownMenuItem>
              {status.state === "connected" ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={disconnectWhatsapp}><WifiOff />Desconectar</DropdownMenuItem></> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <ClientFormSheet trigger={<Button size="sm" className="h-9 rounded-lg px-3 text-[13px] shadow-xs" aria-label="Nuevo cliente"><Plus /><span className="hidden sm:inline">Nuevo cliente</span></Button>} onSaved={(clientId) => { if (clientId) selectClient(clientId); router.refresh() }} />
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon-sm" className="md:hidden"><Menu /><span className="sr-only">Abrir menú</span></Button></SheetTrigger>
            <SheetContent side="right" panelSize="compact">
              <SheetHeader><SheetTitle>Conexión de WhatsApp</SheetTitle><SheetDescription>Vinculá o revisá el teléfono conectado.</SheetDescription></SheetHeader>
              <div className="px-4"><Alert><Smartphone /><AlertTitle>{statusCopy(status)}</AlertTitle><AlertDescription>{status.user ? `Sesión ${status.user}` : "Vinculá un teléfono para enviar y recibir mensajes."}</AlertDescription></Alert><Button className="mt-4 w-full" onClick={connectWhatsapp}>Abrir conexión</Button></div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <Tabs value={mobileView} onValueChange={(value) => setMobileView(value as MobileView)} className="border-b bg-card p-2 md:hidden">
        <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="clients"><UsersRound />Clientes</TabsTrigger><TabsTrigger value="chat"><MessageSquareText />Chat</TabsTrigger><TabsTrigger value="details" disabled={!selectedClient || assistantSelected}><PanelRight />Ficha</TabsTrigger></TabsList>
      </Tabs>

      <main className={cn("grid h-0 min-h-0 flex-1 overflow-hidden md:grid-cols-[330px_minmax(360px,1fr)]", !assistantSelected && desktopDetailsOpen ? "xl:grid-cols-[340px_minmax(480px,1fr)_360px]" : "xl:grid-cols-[340px_minmax(480px,1fr)]")}>
        <ContactList clients={initialClients} selectedId={effectiveSelectedId} onSelect={selectClient} onSelectAssistant={selectAssistant} assistantSelected={assistantSelected} className={cn(mobileView !== "clients" && "hidden md:flex")} />
        {assistantSelected ? (
          <WorkspaceAssistantPanel clients={initialClients} messages={workspaceMessages} loading={loadingWorkspaceMessages} onBack={() => setMobileView("clients")} onMessagesReplace={setWorkspaceMessages} onOpenClient={selectClient} onReviewSuggestion={(suggestion) => startSuggestionReview({ scope: "workspace", suggestion })} className={cn(mobileView !== "chat" && "hidden md:flex")} />
        ) : (
          <ChatPanel key={effectiveSelectedId ? `chat-${effectiveSelectedId}-${composerRequest?.clientId === effectiveSelectedId ? composerRequest.key : 0}` : "empty-chat"} client={selectedClient} messages={effectiveSelectedId ? messages : []} loading={loadingMessages} status={status} onConnect={connectWhatsapp} onBack={() => setMobileView("clients")} onDetails={showDetails} detailsVisible={desktopDetailsOpen} onMessage={(message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])} onMessagesReplace={setMessages} onReviewSuggestion={(suggestion) => startSuggestionReview({ scope: "client", sourceClientId: suggestion.clientId, suggestion })} composerRequest={composerRequest} onComposerReviewComplete={(outcome, summary) => { if (suggestionReview) void resolveSuggestionReview(suggestionReview, outcome, summary) }} className={cn(mobileView !== "chat" && "hidden md:flex")} />
        )}
        {!assistantSelected ? <ClientDetails key={selectedClient ? `details-${selectedClient.id}` : "empty-details"} client={selectedClient} onEdit={() => setEditOpen(true)} taskReview={selectedClient?.id === reviewedClientId ? taskDetailsReview : undefined} onTaskReviewComplete={(summary) => { if (suggestionReview) void resolveSuggestionReview(suggestionReview, "ejecutada", summary) }} onTaskReviewCancel={() => { if (suggestionReview) void resolveSuggestionReview(suggestionReview, "descartada") }} className={cn(desktopDetailsOpen ? "xl:flex" : "xl:hidden", mobileView !== "details" ? "hidden" : "flex md:hidden")} /> : null}
      </main>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" panelSize="sm" className="overflow-hidden p-0">
          <SheetTitle className="sr-only">Ficha de {selectedClient?.firstName}</SheetTitle>
          <SheetDescription className="sr-only">Datos e historia de contactos del cliente seleccionado.</SheetDescription>
          <ClientDetails key={selectedClient ? `sheet-details-${selectedClient.id}` : "empty-sheet-details"} client={selectedClient} onEdit={() => { setDetailsOpen(false); setEditOpen(true) }} taskReview={selectedClient?.id === reviewedClientId ? taskDetailsReview : undefined} onTaskReviewComplete={(summary) => { if (suggestionReview) void resolveSuggestionReview(suggestionReview, "ejecutada", summary) }} onTaskReviewCancel={() => { if (suggestionReview) void resolveSuggestionReview(suggestionReview, "descartada") }} className="flex h-full border-l-0" />
        </SheetContent>
      </Sheet>
      {selectedClient ? <ClientFormSheet client={selectedClient} open={editOpen} onOpenChange={setEditOpen} onSaved={() => router.refresh()} onDeleted={() => { setSelectedId(""); setMobileView("clients"); setDetailsOpen(false); router.refresh() }} /> : null}
      {suggestionReview && clientFormReview ? (
        <ClientFormSheet
          key={`review-client-${suggestionReview.suggestion.id}`}
          client={reviewedAction === "crear_cliente" ? undefined : reviewedClient}
          draft={suggestionReview.suggestion.payload}
          review={{
            title: reviewedAction === "crear_cliente" ? "Revisar nuevo cliente" : reviewedAction === "eliminar_cliente" ? "Revisar eliminación" : "Revisar cambios del cliente",
            description: reviewedAction === "eliminar_cliente" ? "Comprobá la ficha antes de confirmar la eliminación." : "Los datos sugeridos ya están cargados. Podés corregirlos antes de confirmar.",
            intent: reviewedAction === "eliminar_cliente" ? "delete" : "save",
          }}
          open
          onOpenChange={() => undefined}
          onCancelled={() => void resolveSuggestionReview(suggestionReview, "descartada")}
          onSaved={(_clientId, summary) => void resolveSuggestionReview(suggestionReview, "ejecutada", summary ?? "Ficha guardada.")}
          onDeleted={(summary) => void resolveSuggestionReview(suggestionReview, "ejecutada", summary ?? "Cliente eliminado.")}
        />
      ) : null}
      {suggestionReview && taskFormReview && reviewedClient ? (
        <HistoryFormSheet
          key={`review-task-${suggestionReview.suggestion.id}`}
          client={reviewedClient}
          task={reviewedAction === "actualizar_tarea" ? reviewedTask : undefined}
          draft={{
            title: suggestionReview.suggestion.payload.title,
            description: suggestionReview.suggestion.payload.description,
            dueAt: suggestionReview.suggestion.payload.clearDueAt ? null : suggestionReview.suggestion.payload.dueAt,
            repeatCount: suggestionReview.suggestion.payload.repeatCount,
            repeatInterval: suggestionReview.suggestion.payload.repeatInterval,
            repeatUnit: suggestionReview.suggestion.payload.repeatUnit,
          }}
          review={{ title: reviewedAction === "crear_tarea" ? "Revisar nueva tarea" : "Revisar cambios de la tarea", description: "La propuesta ya está cargada. Ajustala y confirmá cuando esté lista." }}
          open
          onOpenChange={() => undefined}
          onCancelled={() => void resolveSuggestionReview(suggestionReview, "descartada")}
          onSaved={(summary) => void resolveSuggestionReview(suggestionReview, "ejecutada", summary ?? "Tarea guardada.")}
        />
      ) : null}
      {suggestionReview?.scope === "workspace" && suggestionReview.suggestion.actionType === "enviar_campana" ? (
        <CampaignReviewSheet
          key={`review-campaign-${suggestionReview.suggestion.id}`}
          suggestion={suggestionReview.suggestion}
          clients={initialClients}
          onConfirm={(recipients) => confirmReviewedCampaign(suggestionReview, recipients)}
          onCancel={() => void resolveSuggestionReview(suggestionReview, "descartada")}
        />
      ) : null}
      <WhatsappDialog open={qrOpen} onOpenChange={setQrOpen} status={status} onConnect={connectWhatsapp} />
    </div>
  )
}
