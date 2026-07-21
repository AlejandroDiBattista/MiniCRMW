"use client"

import { useEffect, useState, useTransition, type ElementType } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronDown, Clock3, FileText, LoaderCircle, Mail, Pencil, Phone, Plus, Repeat2, Sparkles, Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { completeHistoryAction, deleteHistoryAction } from "@/app/actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Client, ContactHistory } from "@/lib/types"
import { avatarUrl, dateFormatter, formatContactDate, fullName, initials } from "./format"
import { HistoryFormSheet } from "./history-form-sheet"

export function ClientDetails({ client, onEdit, taskReview, onTaskReviewComplete, onTaskReviewCancel, className }: {
  client: Client | null
  onEdit: () => void
  taskReview?: { taskId: string; action: "completar_tarea" | "eliminar_tarea" }
  onTaskReviewComplete?: (resultSummary: string) => void
  onTaskReviewCancel?: () => void
  className?: string
}) {
  const router = useRouter()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!taskReview) return
    requestAnimationFrame(() => document.getElementById(`task-${taskReview.taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }, [taskReview])

  if (!client) return <aside className={cn("h-full min-h-0 flex flex-col overflow-hidden border-l border-border/70 bg-card", className)} />

  function completeHistory(id: string) {
    setCompletingId(id)
    startTransition(async () => {
      const result = await completeHistoryAction(id)
      setCompletingId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Tarea completada", {
        description: result.repeated ? "Se creó automáticamente la próxima repetición." : "La historia del cliente quedó actualizada.",
      })
      if (taskReview?.taskId === id && taskReview.action === "completar_tarea") onTaskReviewComplete?.(result.resultSummary)
      router.refresh()
    })
  }

  function deleteHistory(id: string) {
    startTransition(async () => {
      const result = await deleteHistoryAction(id)
      if (taskReview?.taskId === id && taskReview.action === "eliminar_tarea") onTaskReviewComplete?.(result.resultSummary)
      toast.success("Tarea eliminada")
      router.refresh()
    })
  }

  return (
    <aside className={cn("h-full min-h-0 flex flex-col overflow-hidden border-l border-border/70 bg-card", className)}>
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/80 px-5">
        <div><h2 className="font-heading text-xl font-semibold leading-tight">Ficha del cliente</h2><p className="mt-0.5 text-[13px] text-muted-foreground">Datos e historial</p></div>
        <Tooltip>
          <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}><Pencil /><span className="sr-only">Editar cliente</span></Button></TooltipTrigger>
          <TooltipContent>Editar cliente</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-[60px] border border-border shadow-xs"><AvatarImage src={avatarUrl(client)} alt={`Foto de ${fullName(client)}`} className="object-cover" /><AvatarFallback className="bg-secondary font-heading text-base font-semibold">{initials(client)}</AvatarFallback></Avatar>
            <div className="min-w-0"><h3 className="truncate font-heading text-[22px] font-semibold leading-tight">{fullName(client)}</h3><Badge variant="secondary" className="mt-1.5 rounded-full px-2.5 text-xs">Cliente</Badge></div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <DetailRow icon={Phone} label="Teléfono" value={client.phone} />
            <DetailRow icon={Mail} label="Email" value={client.email || "Sin email"} muted={!client.email} />
            <DetailRow icon={FileText} label="DNI" value={client.dni || "Sin DNI"} muted={!client.dni} />
            <DetailRow icon={CalendarDays} label="Cliente desde" value={dateFormatter.format(new Date(client.createdAt))} />
          </div>

          <Separator className="my-5" />
          <div className="flex items-center justify-between"><div><h3 className="font-heading text-lg font-semibold leading-tight">Historia de contactos</h3><p className="mt-0.5 text-[13px] text-muted-foreground">{client.history.length} tareas</p></div><Clock3 className="size-4 text-muted-foreground" /></div>
          {taskReview ? (
            <div className="mt-3 rounded-xl border border-assistant/30 bg-assistant-soft/65 p-3 text-assistant-foreground shadow-xs">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-assistant" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-assistant">Revisión del asistente</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Revisá la tarea destacada y confirmá la acción cuando estés listo.</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="xs" onClick={onTaskReviewCancel}>Cancelar</Button>
                <Button
                  type="button"
                  size="xs"
                  variant={taskReview.action === "eliminar_tarea" ? "destructive" : "default"}
                  onClick={() => taskReview.action === "completar_tarea" ? completeHistory(taskReview.taskId) : deleteHistory(taskReview.taskId)}
                  disabled={completingId === taskReview.taskId}
                >
                  {taskReview.action === "completar_tarea" ? <Square /> : <Trash2 />}
                  {taskReview.action === "completar_tarea" ? "Completar" : "Eliminar"}
                </Button>
              </div>
            </div>
          ) : null}
          <HistoryFormSheet
            client={client}
            onSaved={() => router.refresh()}
            trigger={<Button variant="outline" size="sm" className="mt-3 h-9 w-full justify-center text-[13px] shadow-xs"><Plus />Registrar tarea</Button>}
          />
          <div className="relative mt-2 divide-y divide-border/70">
            {client.history.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm leading-relaxed text-muted-foreground">Todavía no hay tareas. Registrá un seguimiento para empezar.</p>
            ) : client.history.map((item, index) => <HistoryTask key={item.id} item={item} reveal={index === 0} highlighted={taskReview?.taskId === item.id} completing={completingId === item.id} onComplete={() => completeHistory(item.id)} onDelete={() => deleteHistory(item.id)} />)}
          </div>
        </div>
      </ScrollArea>

    </aside>
  )
}

function DetailRow({ icon: Icon, label, value, muted }: { icon: ElementType; label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center bg-transparent text-muted-foreground"><Icon className="size-4" /></div><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className={cn("mt-0.5 truncate text-[15px] leading-tight", muted ? "text-muted-foreground" : "font-medium")}>{value}</p></div></div>
}

const repeatUnitLabels: Record<ContactHistory["repeatUnit"], [string, string]> = {
  days: ["día", "días"],
  hours: ["hora", "horas"],
  minutes: ["minuto", "minutos"],
}

function taskDateLabel(item: ContactHistory) {
  if (item.isCompleted) return `Completada ${formatContactDate(item.completedAt ?? item.dueAt ?? item.createdAt)}`
  if (item.dueAt) return `Para ${formatContactDate(item.dueAt)}`
  return `Pendiente desde ${formatContactDate(item.createdAt)}`
}

function HistoryTask({ item, reveal, highlighted, completing, onComplete, onDelete }: {
  item: ContactHistory
  reveal: boolean
  highlighted: boolean
  completing: boolean
  onComplete: () => void
  onDelete: () => void
}) {
  const unitLabel = repeatUnitLabels[item.repeatUnit][item.repeatInterval === 1 ? 0 : 1]

  return (
    <Collapsible id={`task-${item.id}`} defaultOpen={highlighted} className={cn("group/task scroll-m-4 transition-colors duration-200", reveal && "crm-reveal", highlighted && "rounded-lg bg-assistant-soft/60 ring-1 ring-assistant/30")}>
      <div className="flex min-h-11 items-start gap-1 py-1.5">
        {item.isCompleted ? (
          <div className="flex size-8 shrink-0 items-center justify-center" aria-label="Tarea completada"><span className="size-1.5 rounded-full bg-muted-foreground/65" /></div>
        ) : (
          <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="size-8 shrink-0 rounded-none text-primary hover:text-primary" onClick={onComplete} disabled={completing}>{completing ? <LoaderCircle className="animate-spin" /> : <Square className="size-4 stroke-[1.75]" />}<span className="sr-only">Marcar como completada</span></Button></TooltipTrigger><TooltipContent>Marcar como completada</TooltipContent></Tooltip>
        )}
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-none px-1 py-1 text-left whitespace-normal hover:bg-transparent data-[state=open]:bg-transparent [&[data-state=open]_.task-chevron]:rotate-180">
            <span className="flex min-w-0 items-start gap-2"><span className={cn("min-w-0 flex-1 text-[13px] font-medium leading-snug", item.isCompleted && "text-muted-foreground")}>{item.title}</span><ChevronDown className="task-chevron mt-0.5 size-3 text-muted-foreground/60 transition-transform" /></span>
            <span className="w-full text-right text-[10px] font-normal leading-none text-muted-foreground/65">{taskDateLabel(item)}</span>
          </Button>
        </CollapsibleTrigger>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="mt-0.5 shrink-0 opacity-30 transition-opacity hover:opacity-100 group-hover/task:opacity-100" onClick={onDelete}><Trash2 /><span className="sr-only">Eliminar tarea</span></Button></TooltipTrigger><TooltipContent>Eliminar tarea</TooltipContent></Tooltip>
      </div>
      <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
        <div className="mb-2 ml-9 mr-8 pt-0.5">
          {item.description ? <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">{item.description}</p> : null}
          {item.repeatCount > 0 ? <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Repeat2 className="size-3.5" />{item.repeatCount} {item.repeatCount === 1 ? "repetición restante" : "repeticiones restantes"} · cada {item.repeatInterval} {unitLabel}</p> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
