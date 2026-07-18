"use client"

import { CheckCheck, UsersRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import type { Client } from "@/lib/types"
import { avatarUrl, fullName, initials, timeFormatter } from "./format"

export function ContactList({ clients, selectedId, onSelect, className }: {
  clients: Client[]
  selectedId: string
  onSelect: (id: string) => void
  className?: string
}) {
  return (
    <aside className={cn("h-full min-h-0 flex flex-col overflow-hidden border-r border-border/70 bg-card", className)}>
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/80 px-5">
        <div>
          <h1 className="font-heading text-[22px] font-semibold leading-tight tracking-tight">Conversaciones</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{clients.length} {clients.length === 1 ? "cliente" : "clientes"}</p>
        </div>
        <Badge variant="secondary" className="min-w-7 justify-center rounded-full text-xs font-semibold tabular-nums">{clients.length}</Badge>
      </div>
      <Command className="min-h-0 flex-1 rounded-none bg-transparent p-0 [&>[data-slot=command-input-wrapper]]:p-2 [&>[data-slot=command-input-wrapper]]:pb-1" shouldFilter>
        <CommandInput placeholder="Buscar nombre, DNI o teléfono…" className="h-10 text-[15px] placeholder:text-muted-foreground/80" />
        <CommandList className="max-h-none flex-1 px-2 pb-2">
          <CommandEmpty>
            <div className="mx-auto flex max-w-[220px] flex-col items-center gap-2 py-8 text-muted-foreground">
              <UsersRound className="size-7" />
              <p className="font-medium text-foreground">No encontramos clientes</p>
              <p className="text-xs leading-relaxed">Probá otra búsqueda o creá una nueva ficha.</p>
            </div>
          </CommandEmpty>
          <CommandGroup className="p-0">
            {clients.map((client) => (
              <CommandItem
                key={client.id}
                value={`${fullName(client)} ${client.phone} ${client.dni}`}
                onSelect={() => onSelect(client.id)}
                data-selected={client.id === selectedId}
                className="mb-1 min-h-[74px] cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:translate-x-0.5 hover:bg-muted/70 active:translate-x-0 data-[selected=true]:bg-accent data-[selected=true]:shadow-[inset_0_0_0_1px_oklch(0.35_0.075_157/0.10)]"
              >
                <Avatar className="size-11 border border-border/80 shadow-xs">
                  <AvatarImage src={avatarUrl(client)} alt={`Foto de ${fullName(client)}`} className="object-cover" />
                  <AvatarFallback className="bg-secondary font-heading text-sm font-semibold">{initials(client)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold">{fullName(client)}</p>
                    {client.lastMessage ? <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{timeFormatter.format(new Date(client.lastMessage.timestamp))}</span> : null}
                  </div>
                  <p className="mt-1 truncate text-[13px] leading-snug text-muted-foreground">
                    {client.lastMessage?.direction === "outgoing" ? <CheckCheck className={cn("mr-1 inline size-3.5 stroke-[2.5]", client.lastMessage.readAt ? "text-sky-500" : "text-muted-foreground/70")} /> : null}
                    {client.lastMessage?.body ?? client.phone}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </aside>
  )
}
