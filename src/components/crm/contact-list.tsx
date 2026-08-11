"use client"

import { useEffect } from "react"
import { Bot, CheckCheck, Sparkles, UsersRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import type { Client } from "@/lib/types"
import { avatarUrl, fullName, initials, timeFormatter } from "./format"

export function ContactList({ clients, selectedId, onSelect, onSelectAssistant, assistantSelected, className }: {
  clients: Client[]
  selectedId: string
  onSelect: (id: string) => void
  onSelectAssistant: () => void
  assistantSelected: boolean
  className?: string
}) {
  const groupClients = clients.filter((client) => client.isGroup)
  const individualClients = clients.filter((client) => !client.isGroup)

  useEffect(() => {
    const missingAvatars = clients.filter((client) => !client.isGroup && !client.avatarUpdatedAt)
    if (missingAvatars.length === 0) return
    const controller = new AbortController()
    for (const client of missingAvatars) {
      void fetch(`/api/clients/${client.id}/avatar?sync=1`, { signal: controller.signal }).catch(() => undefined)
    }
    return () => controller.abort()
  }, [clients])

  function conversationItem(client: Client) {
    return (
      <CommandItem
        key={client.id}
        value={`${client.isGroup ? "grupo" : "contacto"} ${fullName(client)} ${client.phone} ${client.dni}`}
        onSelect={() => onSelect(client.id)}
        data-selected={client.id === selectedId}
        className="mb-1 min-h-[74px] cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:translate-x-0.5 hover:bg-muted/70 active:translate-x-0 data-[selected=true]:bg-accent data-[selected=true]:ring-1 data-[selected=true]:ring-primary/10"
      >
        <Avatar className="size-11 border border-border/80 shadow-xs">
          <AvatarImage src={avatarUrl(client)} alt={client.isGroup ? `Imagen de ${fullName(client)}` : `Foto de ${fullName(client)}`} className="object-cover" />
          <AvatarFallback className="bg-secondary font-heading text-sm font-semibold">{client.isGroup ? <UsersRound className="size-4" aria-hidden="true" /> : initials(client)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-semibold">{fullName(client)}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {client.lastMessage ? <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{timeFormatter.format(new Date(client.lastMessage.timestamp))}</span> : null}
              {client.unreadCount > 0 ? <span aria-label={`${client.unreadCount} ${client.unreadCount === 1 ? "mensaje no leído" : "mensajes no leídos"}`} className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">{client.unreadCount > 99 ? "99+" : client.unreadCount}</span> : null}
            </div>
          </div>
          <p className="mt-1 truncate text-[13px] leading-snug text-muted-foreground">
            {client.lastMessage?.direction === "outgoing" ? <CheckCheck className={cn("mr-1 inline size-3.5 stroke-[2.5]", client.lastMessage.readAt ? "text-wa-read" : "text-muted-foreground/70")} /> : null}
            {client.lastMessage?.body ?? (client.isGroup ? "Grupo de WhatsApp" : client.phone)}
          </p>
        </div>
      </CommandItem>
    )
  }

  return (
    <aside className={cn("h-full min-h-0 flex flex-col overflow-hidden border-r border-border/70 bg-card", className)}>
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/80 px-5">
        <div>
          <h1 className="font-heading text-[22px] font-semibold leading-tight tracking-tight">Conversaciones</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{clients.length} {clients.length === 1 ? "conversación" : "conversaciones"}</p>
        </div>
        <Badge variant="secondary" className="min-w-7 justify-center rounded-full text-xs font-semibold tabular-nums">{clients.length}</Badge>
      </div>
      <Command className="min-h-0 flex-1 rounded-none bg-transparent p-0 [&>[data-slot=command-input-wrapper]]:p-2 [&>[data-slot=command-input-wrapper]]:pb-1" shouldFilter>
        <CommandInput placeholder="Buscar nombre, DNI o teléfono…" className="h-10 text-[15px] placeholder:text-muted-foreground/80" />
        <div className="mx-2 mt-1 mb-2 border-b border-border/70 pb-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onSelectAssistant}
            aria-pressed={assistantSelected}
            className={cn(
              "group h-auto min-h-[68px] w-full justify-start gap-3 rounded-xl border border-assistant/20 bg-assistant-soft/45 px-3 py-2.5 text-left shadow-none transition-[background-color,border-color,transform] duration-200 hover:translate-x-0.5 hover:border-assistant/35 hover:bg-assistant-soft/75",
              assistantSelected && "border-assistant/45 bg-assistant-soft ring-1 ring-assistant/15",
            )}
          >
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-assistant text-white shadow-sm">
              <Bot className="size-5" />
              <Sparkles className="absolute -right-1 -top-1 size-3.5 rounded-full bg-card p-0.5 text-assistant" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Asistente de Lazo</span>
              <span className="mt-0.5 block truncate text-[12px] font-normal text-assistant/80">Disponible siempre · todo tu CRM</span>
            </span>
          </Button>
        </div>
        <CommandList className="max-h-none flex-1 px-2 pb-2">
          <CommandEmpty>
            <div className="mx-auto flex max-w-[220px] flex-col items-center gap-2 py-8 text-muted-foreground">
              <UsersRound className="size-7" />
              <p className="font-medium text-foreground">No encontramos conversaciones</p>
              <p className="text-xs leading-relaxed">Probá otra búsqueda o creá una nueva ficha.</p>
            </div>
          </CommandEmpty>
          {groupClients.length > 0 ? (
            <CommandGroup heading="Grupos" className="p-0 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em]">
              {groupClients.map(conversationItem)}
            </CommandGroup>
          ) : null}
          {individualClients.length > 0 ? (
            <CommandGroup heading={groupClients.length > 0 ? "Contactos" : undefined} className="p-0 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em]">
              {individualClients.map(conversationItem)}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </aside>
  )
}
