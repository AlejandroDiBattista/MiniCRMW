"use client"

import { useEffect, useRef, useState, useTransition, type ElementType } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Check, Clock3, Ellipsis, FileText, LoaderCircle, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { addHistoryAction, deleteClientAction, deleteHistoryAction } from "@/app/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Client } from "@/lib/types"
import { DateTimePicker } from "./date-time-picker"
import { avatarUrl, dateFormatter, formatContactDate, fullName, initials } from "./format"

export function ClientDetails({ client, onEdit, onDeleted, className }: {
  client: Client | null
  onEdit: () => void
  onDeleted: () => void
  className?: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [historyError, setHistoryError] = useState("")
  const [historySaved, setHistorySaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const now = new Date()
  const currentDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  if (!client) return <aside className={cn("h-full min-h-0 flex flex-col overflow-hidden border-l border-border/70 bg-card", className)} />
  const clientId = client.id

  function addHistory(formData: FormData) {
    setHistoryError("")
    startTransition(async () => {
      const result = await addHistoryAction(clientId, formData)
      if (!result.ok) return setHistoryError(result.error)
      setHistorySaved(true)
      toast.success("Seguimiento registrado", { description: "La historia del cliente quedó actualizada." })
      formRef.current?.reset()
      router.refresh()
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setHistorySaved(false), 950)
    })
  }

  return (
    <aside className={cn("h-full min-h-0 flex flex-col overflow-hidden border-l border-border/70 bg-card", className)}>
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/80 px-5">
        <div><h2 className="font-heading text-xl font-semibold leading-tight">Ficha del cliente</h2><p className="mt-0.5 text-[13px] text-muted-foreground">Datos e historial</p></div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><Ellipsis /><span className="sr-only">Acciones del cliente</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil />Editar ficha</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}><Trash2 />Eliminar cliente</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <Avatar className="size-[60px] border border-border shadow-xs"><AvatarImage src={avatarUrl(client)} alt={`Foto de ${fullName(client)}`} className="object-cover" /><AvatarFallback className="bg-secondary font-heading text-base font-semibold">{initials(client)}</AvatarFallback></Avatar>
            <div className="min-w-0"><h3 className="truncate font-heading text-[22px] font-semibold leading-tight">{fullName(client)}</h3><Badge variant="secondary" className="mt-1.5 rounded-full px-2.5 text-xs">Cliente</Badge></div>
          </div>
          <div className="mt-6 space-y-4 text-sm">
            <DetailRow icon={Phone} label="Teléfono" value={client.phone} />
            <DetailRow icon={Mail} label="Email" value={client.email || "Sin email"} muted={!client.email} />
            <DetailRow icon={FileText} label="DNI" value={client.dni || "Sin DNI"} muted={!client.dni} />
            <DetailRow icon={CalendarDays} label="Cliente desde" value={dateFormatter.format(new Date(client.createdAt))} />
          </div>

          <Separator className="my-6" />
          <div className="flex items-center justify-between"><div><h3 className="font-heading text-lg font-semibold leading-tight">Historia de contactos</h3><p className="mt-0.5 text-[13px] text-muted-foreground">{client.history.length} registros</p></div><Clock3 className="size-4 text-muted-foreground" /></div>
          <form ref={formRef} action={addHistory} className="mt-4 rounded-xl border border-border bg-muted/35 p-3.5 shadow-xs">
            <FieldGroup className="gap-3">
              <Field><FieldLabel htmlFor="contactDate" className="text-[13px] font-semibold">Fecha y hora</FieldLabel><DateTimePicker id="contactDate" name="contactDate" defaultValue={currentDateTime} /></Field>
              <Field><FieldLabel htmlFor="description" className="text-[13px] font-semibold">Descripción</FieldLabel><Textarea id="description" name="description" placeholder="Llamada, reunión, seguimiento…" className="min-h-24 resize-none bg-card text-sm" /></Field>
              <FieldError>{historyError}</FieldError>
              <Button size="sm" className={cn("h-9 text-[13px] shadow-xs", historySaved && "bg-wa-green disabled:opacity-100")} type="submit" disabled={pending || historySaved}>{pending ? <LoaderCircle className="animate-spin" /> : historySaved ? <Check className="crm-check-in" /> : <Plus />}{historySaved ? "Registrado" : "Registrar contacto"}</Button>
            </FieldGroup>
          </form>
          <div className="relative mt-6 space-y-6 before:absolute before:bottom-3 before:left-[5px] before:top-2 before:w-px before:bg-border">
            {client.history.length === 0 ? (
              <p className="pl-6 text-sm leading-relaxed text-muted-foreground">Todavía no hay seguimientos. Registrá una llamada, reunión o mensaje para empezar.</p>
            ) : client.history.map((item, index) => (
              <div key={item.id} className={cn("group relative pl-6", index === 0 && "crm-reveal")}>
                <span className="absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-card bg-primary" />
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{formatContactDate(item.contactDate)}</p><p className="mt-1.5 text-[15px] leading-relaxed">{item.description}</p></div>
                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="opacity-50 transition-opacity duration-150 hover:opacity-100 group-hover:opacity-100" onClick={() => startTransition(async () => { await deleteHistoryAction(item.id); router.refresh() })}><Trash2 /><span className="sr-only">Eliminar registro</span></Button></TooltipTrigger><TooltipContent>Eliminar registro</TooltipContent></Tooltip>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar a {client.firstName}?</AlertDialogTitle><AlertDialogDescription>Se eliminarán también su historial y todos los mensajes guardados. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={async () => { await deleteClientAction(client.id); toast.success("Cliente eliminado", { description: "La ficha y su historial fueron eliminados." }); onDeleted() }}>Eliminar cliente</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}

function DetailRow({ icon: Icon, label, value, muted }: { icon: ElementType; label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center bg-transparent text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className={cn("mt-0.5 truncate text-[15px] leading-tight", muted ? "text-muted-foreground" : "font-medium")}>{value}</p></div></div>
}
