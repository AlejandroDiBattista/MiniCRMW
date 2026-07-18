"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Link2, Menu, MessageCircleMore, MessageSquareText, PanelRight, Plus, Smartphone, UsersRound, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { ChatPanel } from "@/components/crm/chat-panel"
import { ClientDetails } from "@/components/crm/client-details"
import { ClientFormSheet } from "@/components/crm/client-form-sheet"
import { ContactList } from "@/components/crm/contact-list"
import { WhatsappDialog } from "@/components/crm/whatsapp-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Client, Message, WhatsappConnectionStatus } from "@/lib/types"

type MobileView = "clients" | "chat" | "details"

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
  const [selectedId, setSelectedId] = useState(initialClients[0]?.id ?? "")
  const [mobileView, setMobileView] = useState<MobileView>("clients")
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(Boolean(initialClients[0]))
  const [status, setStatus] = useState<WhatsappConnectionStatus>(disconnectedStatus)
  const [qrOpen, setQrOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [desktopDetailsOpen, setDesktopDetailsOpen] = useState(true)
  const selectedIdRef = useRef(selectedId)

  const effectiveSelectedId = initialClients.some((client) => client.id === selectedId)
    ? selectedId
    : initialClients[0]?.id ?? ""

  useEffect(() => { selectedIdRef.current = effectiveSelectedId }, [effectiveSelectedId])

  const selectedClient = useMemo(
    () => initialClients.find((client) => client.id === effectiveSelectedId) ?? null,
    [initialClients, effectiveSelectedId],
  )

  useEffect(() => {
    if (!effectiveSelectedId) return
    const controller = new AbortController()
    fetch(`/api/whatsapp/messages?clientId=${effectiveSelectedId}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (Array.isArray(data)) setMessages(data) })
      .catch((error) => { if (error.name !== "AbortError") toast.error("No pudimos cargar la conversación", { description: "Revisá tu conexión e intentá de nuevo." }) })
      .finally(() => setLoadingMessages(false))
    return () => controller.abort()
  }, [effectiveSelectedId])

  useEffect(() => {
    fetch("/api/whatsapp/status").then((response) => response.json()).then(setStatus).catch(() => undefined)
    const events = new EventSource("/api/whatsapp/events")
    events.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type: string; status?: WhatsappConnectionStatus; clientId?: string; message?: Message }
      if (payload.type === "status" && payload.status) {
        setStatus(payload.status)
        if (payload.status.state === "qr") setQrOpen(true)
      }
      if (payload.type === "message" && payload.message) {
        if (payload.clientId === selectedIdRef.current) {
          setMessages((current) => current.some((message) => message.id === payload.message!.id)
            ? current.map((message) => message.id === payload.message!.id ? payload.message! : message)
            : [...current, payload.message!])
        }
        router.refresh()
      }
      if (payload.type === "profile") router.refresh()
    }
    return () => events.close()
  }, [router])

  function selectClient(id: string) {
    setSelectedId(id)
    if (id !== effectiveSelectedId) setLoadingMessages(true)
    setMobileView("chat")
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
            <SheetContent side="right" className="w-[300px]">
              <SheetHeader><SheetTitle>Conexión de WhatsApp</SheetTitle><SheetDescription>Vinculá o revisá el teléfono conectado.</SheetDescription></SheetHeader>
              <div className="px-4"><Alert><Smartphone /><AlertTitle>{statusCopy(status)}</AlertTitle><AlertDescription>{status.user ? `Sesión ${status.user}` : "Vinculá un teléfono para enviar y recibir mensajes."}</AlertDescription></Alert><Button className="mt-4 w-full" onClick={connectWhatsapp}>Abrir conexión</Button></div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <Tabs value={mobileView} onValueChange={(value) => setMobileView(value as MobileView)} className="border-b bg-card p-2 md:hidden">
        <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="clients"><UsersRound />Clientes</TabsTrigger><TabsTrigger value="chat" disabled={!selectedClient}><MessageSquareText />Chat</TabsTrigger><TabsTrigger value="details" disabled={!selectedClient}><PanelRight />Ficha</TabsTrigger></TabsList>
      </Tabs>

      <main className={cn("grid h-0 min-h-0 flex-1 overflow-hidden md:grid-cols-[330px_minmax(360px,1fr)]", desktopDetailsOpen ? "xl:grid-cols-[340px_minmax(480px,1fr)_360px]" : "xl:grid-cols-[340px_minmax(480px,1fr)]")}>
        <ContactList clients={initialClients} selectedId={effectiveSelectedId} onSelect={selectClient} className={cn(mobileView !== "clients" && "hidden md:flex")} />
        <ChatPanel key={effectiveSelectedId || "empty"} client={selectedClient} messages={effectiveSelectedId ? messages : []} loading={loadingMessages} status={status} onConnect={connectWhatsapp} onBack={() => setMobileView("clients")} onDetails={showDetails} detailsVisible={desktopDetailsOpen} onMessage={(message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])} className={cn(mobileView !== "chat" && "hidden md:flex")} />
        <ClientDetails client={selectedClient} onEdit={() => setEditOpen(true)} onDeleted={() => { setSelectedId(""); setMobileView("clients"); router.refresh() }} className={cn(desktopDetailsOpen ? "xl:flex" : "xl:hidden", mobileView !== "details" ? "hidden" : "flex md:hidden")} />
      </main>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-[380px]">
          <SheetTitle className="sr-only">Ficha de {selectedClient?.firstName}</SheetTitle>
          <SheetDescription className="sr-only">Datos e historia de contactos del cliente seleccionado.</SheetDescription>
          <ClientDetails client={selectedClient} onEdit={() => { setDetailsOpen(false); setEditOpen(true) }} onDeleted={() => { setDetailsOpen(false); setSelectedId(""); router.refresh() }} className="flex h-full border-l-0" />
        </SheetContent>
      </Sheet>
      {selectedClient ? <ClientFormSheet client={selectedClient} open={editOpen} onOpenChange={setEditOpen} onSaved={() => router.refresh()} /> : null}
      <WhatsappDialog open={qrOpen} onOpenChange={setQrOpen} status={status} onConnect={connectWhatsapp} />
    </div>
  )
}
