"use client"

import Image from "next/image"
import { CheckCheck, CircleAlert, LoaderCircle, Smartphone } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { WhatsappConnectionStatus } from "@/lib/types"

export function WhatsappDialog({ open, onOpenChange, status, onConnect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: WhatsappConnectionStatus
  onConnect: () => void
}) {
  const connected = status.state === "connected"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Smartphone className="size-5" /></div>
          <DialogTitle className="font-heading text-2xl">{connected ? "WhatsApp conectado" : "Vincular WhatsApp"}</DialogTitle>
          <DialogDescription>{connected ? `La sesión ${status.user ?? ""} está recibiendo mensajes en tiempo real.` : "En tu teléfono, abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo."}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[260px] items-center justify-center py-2">
          {status.qrDataUrl ? (
            <div className="rounded-2xl border border-border bg-white p-3 shadow-sm"><Image src={status.qrDataUrl} alt="Código QR para vincular WhatsApp" width={260} height={260} unoptimized /></div>
          ) : connected ? (
            <div className="crm-reveal flex flex-col items-center text-center"><div className="flex size-20 items-center justify-center rounded-full bg-[var(--wa-soft)] text-[var(--wa-green)]"><CheckCheck className="crm-check-in size-9" /></div><p className="mt-4 font-medium">Todo en sincronía</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">La conversación ya fluye igual desde Lazo o WhatsApp.</p></div>
          ) : status.state === "error" ? (
            <div className="flex flex-col items-center text-center"><CircleAlert className="size-10 text-destructive" /><p className="mt-4 font-medium">No pudimos conectar</p><p className="mt-1 text-sm text-muted-foreground">{status.error}</p><Button className="mt-5" onClick={onConnect}>Reintentar</Button></div>
          ) : (
            <div className="crm-reveal flex flex-col items-center text-center"><LoaderCircle className="size-9 animate-spin text-primary" /><p className="mt-4 font-medium">Preparando el vínculo…</p><p className="mt-1 text-sm text-muted-foreground">Estamos creando una conexión segura con WhatsApp.</p></div>
          )}
        </div>
        {!connected && status.qrDataUrl ? <Alert><Smartphone /><AlertTitle>Mantené esta pantalla abierta</AlertTitle><AlertDescription>El QR se actualiza automáticamente hasta completar la vinculación.</AlertDescription></Alert> : null}
      </DialogContent>
    </Dialog>
  )
}
