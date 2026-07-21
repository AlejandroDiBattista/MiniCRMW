"use client"

import { useState } from "react"
import { LoaderCircle, SendHorizontal, Sparkles, Trash2, UsersRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import type { Client, WorkspaceAssistantRecipient, WorkspaceAssistantSuggestion } from "@/lib/types"
import { avatarUrl, fullName, initials } from "./format"

export function CampaignReviewSheet({ suggestion, clients, onConfirm, onCancel }: {
  suggestion: WorkspaceAssistantSuggestion
  clients: Client[]
  onConfirm: (recipients: WorkspaceAssistantRecipient[]) => Promise<void>
  onCancel: () => void
}) {
  const [recipients, setRecipients] = useState<WorkspaceAssistantRecipient[]>(suggestion.payload.recipients ?? [])
  const [pending, setPending] = useState(false)
  const clientsById = new Map(clients.map((client) => [client.id, client]))

  async function confirm() {
    if (pending || recipients.length === 0 || recipients.some((recipient) => !recipient.message.trim())) return
    setPending(true)
    try {
      await onConfirm(recipients.map((recipient) => ({ ...recipient, message: recipient.message.trim() })))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open && !pending) onCancel() }}>
      <SheetContent panelSize="md" className="gap-0 overflow-hidden border-l-border/70 bg-card p-0">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="shrink-0 border-b border-border/70 px-6 py-6">
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-assistant-soft text-assistant"><Sparkles className="size-5" /></div>
            <SheetTitle className="font-heading text-2xl">Revisar campaña</SheetTitle>
            <SheetDescription>Editá cada mensaje antes de enviarlo. Solo se enviará cuando confirmes desde acá.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><UsersRound className="size-4 text-assistant" />{recipients.length} {recipients.length === 1 ? "destinatario" : "destinatarios"}</div>
            <div className="space-y-5">
              {recipients.map((recipient, index) => {
                const client = clientsById.get(recipient.clientId)
                if (!client) return null
                return (
                  <Field key={recipient.clientId} className="rounded-xl border border-border/75 bg-background/70 p-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 border border-border"><AvatarImage src={avatarUrl(client)} alt={`Foto de ${fullName(client)}`} /><AvatarFallback>{initials(client)}</AvatarFallback></Avatar>
                      <FieldLabel htmlFor={`campaign-message-${recipient.clientId}`} className="min-w-0 flex-1 truncate">{fullName(client)}</FieldLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRecipients((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        disabled={pending}
                      >
                        <Trash2 /><span className="sr-only">Quitar a {fullName(client)}</span>
                      </Button>
                    </div>
                    <Textarea
                      id={`campaign-message-${recipient.clientId}`}
                      value={recipient.message}
                      onChange={(event) => setRecipients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, message: event.target.value } : item))}
                      className="mt-1 min-h-28 resize-y bg-card"
                      maxLength={4_000}
                      disabled={pending}
                    />
                  </Field>
                )
              })}
            </div>
          </div>

          <SheetFooter className="shrink-0 border-t border-border/70 bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
            <Button type="button" onClick={() => void confirm()} disabled={pending || recipients.length === 0 || recipients.some((recipient) => !recipient.message.trim())}>
              {pending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
              Enviar {recipients.length || ""} {recipients.length === 1 ? "mensaje" : "mensajes"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
