"use client"

import { useRef, useState, useTransition } from "react"
import { LoaderCircle, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { addHistoryAction, updateHistoryAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Client, ContactHistory } from "@/lib/types"
import { DateTimePicker } from "./date-time-picker"

type TaskField = "title" | "description" | "dueAt" | "repeatCount" | "repeatInterval" | "repeatUnit" | "form"
type TaskError = { field: TaskField; message: string } | null

const fieldIds: Record<Exclude<TaskField, "form">, string> = {
  title: "taskTitle",
  description: "taskDescription",
  dueAt: "taskDueAt",
  repeatCount: "taskRepeatCount",
  repeatInterval: "taskRepeatInterval",
  repeatUnit: "taskRepeatUnit",
}

type Props = {
  client: Pick<Client, "id" | "firstName">
  task?: ContactHistory
  draft?: Partial<Pick<ContactHistory, "title" | "description" | "dueAt" | "repeatCount" | "repeatInterval" | "repeatUnit">>
  review?: { title: string; description: string }
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (resultSummary?: string) => void
  onCancelled?: () => void
  trigger?: React.ReactNode
}

export function HistoryFormSheet({ client, task, draft, review, open: controlledOpen, onOpenChange, onSaved, onCancelled, trigger }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [localOpen, setLocalOpen] = useState(false)
  const initialRepeatCount = draft?.repeatCount ?? task?.repeatCount ?? 0
  const [repeating, setRepeating] = useState(initialRepeatCount > 0)
  const [error, setError] = useState<TaskError>(null)
  const [pending, startTransition] = useTransition()
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen

  function handleOpenChange(nextOpen: boolean) {
    setError(null)
    if (nextOpen) setRepeating(initialRepeatCount > 0)
    if (!nextOpen) {
      formRef.current?.reset()
      setRepeating(initialRepeatCount > 0)
      onCancelled?.()
    }
    setOpen(nextOpen)
  }

  function describedBy(field: Exclude<TaskField, "form">, helpId?: string) {
    return [helpId, error?.field === field ? `${fieldIds[field]}-error` : null].filter(Boolean).join(" ") || undefined
  }

  function fieldError(field: Exclude<TaskField, "form">) {
    return error?.field === field ? <FieldError id={`${fieldIds[field]}-error`}>{error.message}</FieldError> : null
  }

  function focusField(field: TaskField) {
    if (field === "form") return
    requestAnimationFrame(() => {
      const control = formRef.current?.querySelector<HTMLElement>(`#${fieldIds[field]}`)
      control?.scrollIntoView({ behavior: "smooth", block: "center" })
      control?.focus({ preventScroll: true })
    })
  }

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = task
        ? await updateHistoryAction(task.id, formData)
        : await addHistoryAction(client.id, formData)
      if (!result.ok) {
        const nextError = { field: result.field, message: result.error }
        setError(nextError)
        focusField(nextError.field)
        return
      }

      formRef.current?.reset()
      setRepeating(initialRepeatCount > 0)
      setOpen(false)
      toast.success(task ? "Tarea actualizada" : "Tarea registrada", {
        description: task ? "Los cambios quedaron guardados." : "La historia del cliente quedó actualizada.",
      })
      onSaved?.(result.resultSummary)
    })
  }

  const repetitionHasError = error?.field === "repeatCount" || error?.field === "repeatInterval" || error?.field === "repeatUnit"

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        side="right"
        panelSize="md"
        className="gap-0 overflow-hidden border-l-border/70 bg-card p-0"
        onOpenAutoFocus={(event) => {
          if (window.matchMedia("(pointer: coarse)").matches) {
            event.preventDefault()
            requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
          }
        }}
      >
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault()
            submit(new FormData(event.currentTarget))
          }}
          className="flex h-full min-h-0 flex-col"
          noValidate
        >
          <SheetHeader className="shrink-0 border-b border-border/70 px-5 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 sm:py-6">
            {review ? <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-assistant-soft text-assistant"><Sparkles className="size-4" /></div> : null}
            <SheetTitle ref={headingRef} tabIndex={-1} className="pr-10 font-heading text-2xl outline-none">{review?.title ?? (task ? "Editar tarea" : "Registrar tarea")}</SheetTitle>
            <SheetDescription>{review?.description ?? (task ? `Actualizá la tarea de ${client.firstName}.` : `Nueva tarea para ${client.firstName}.`)}</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <FieldGroup className="gap-6 px-5 py-6 sm:px-6 sm:py-7">
              <Field>
                <FieldLabel htmlFor="taskTitle">Título <RequiredMark /></FieldLabel>
                <Input
                  id="taskTitle"
                  name="title"
                  placeholder="Ej. Llamar para confirmar"
                  defaultValue={draft?.title ?? task?.title}
                  maxLength={120}
                  required
                  aria-invalid={error?.field === "title" || undefined}
                  aria-describedby={describedBy("title")}
                  className="h-11"
                />
                {fieldError("title")}
              </Field>
              <Field>
                <FieldLabel htmlFor="taskDescription">Descripción <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
                <Textarea
                  id="taskDescription"
                  name="description"
                  placeholder="Detalles, contexto o próximos pasos…"
                  defaultValue={draft?.description ?? task?.description}
                  maxLength={2_000}
                  aria-invalid={error?.field === "description" || undefined}
                  aria-describedby={describedBy("description")}
                  className="min-h-32 resize-y"
                />
                {fieldError("description")}
              </Field>
              <Field>
                <FieldLabel htmlFor="taskDueAt">Fecha y hora <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
                <DateTimePicker
                  id="taskDueAt"
                  name="dueAt"
                  optional
                  defaultValue={draft?.dueAt ?? task?.dueAt ?? undefined}
                  invalid={error?.field === "dueAt"}
                  ariaDescribedBy={describedBy("dueAt", "taskDueAt-help")}
                />
                <FieldDescription id="taskDueAt-help">Sin fecha, quedará pendiente hasta que la completes.</FieldDescription>
                {fieldError("dueAt")}
              </Field>

              <div className="border-t border-border/70 pt-5">
                <div className="flex min-h-11 items-center justify-between gap-4">
                  <div className="min-w-0">
                    <FieldLabel htmlFor="taskRepeating" className="cursor-pointer">Repetir tarea</FieldLabel>
                    <FieldDescription id="taskRepeating-help" className="mt-1">Creá automáticamente la próxima al completarla.</FieldDescription>
                  </div>
                  <Switch
                    id="taskRepeating"
                    checked={repeating}
                    onCheckedChange={(checked) => {
                      setRepeating(checked)
                      if (!checked && repetitionHasError) setError(null)
                    }}
                    aria-describedby="taskRepeating-help"
                    aria-controls="taskRepetitionSettings"
                    className="shrink-0"
                  />
                </div>

                {repeating ? (
                  <FieldSet id="taskRepetitionSettings" className="mt-5 grid gap-5 border-0 p-0 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                    <FieldLegend className="sr-only">Configuración de repetición</FieldLegend>
                    <Field>
                      <FieldLabel htmlFor="taskRepeatCount">Cantidad</FieldLabel>
                      <Input
                        id="taskRepeatCount"
                        name="repeatCount"
                        type="number"
                        min="1"
                        max="999"
                        defaultValue={draft?.repeatCount ?? task?.repeatCount ?? 1}
                        inputMode="numeric"
                        aria-invalid={error?.field === "repeatCount" || undefined}
                        aria-describedby={describedBy("repeatCount", "taskRepeatCount-help")}
                        className="h-11 tabular-nums"
                      />
                      <FieldDescription id="taskRepeatCount-help">Repeticiones futuras.</FieldDescription>
                      {fieldError("repeatCount")}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="taskRepeatInterval">Tiempo entre repeticiones</FieldLabel>
                      <div className="flex min-w-0 gap-2">
                        <Input
                          id="taskRepeatInterval"
                          name="repeatInterval"
                          type="number"
                          min="1"
                          max="525600"
                          defaultValue={draft?.repeatInterval ?? task?.repeatInterval ?? 1}
                          inputMode="numeric"
                          aria-invalid={error?.field === "repeatInterval" || undefined}
                          aria-describedby={describedBy("repeatInterval")}
                          className="h-11 min-w-0 tabular-nums"
                        />
                        <Select name="repeatUnit" defaultValue={draft?.repeatUnit ?? task?.repeatUnit ?? "days"}>
                          <SelectTrigger
                            id="taskRepeatUnit"
                            size="lg"
                            aria-label="Unidad del intervalo"
                            aria-invalid={error?.field === "repeatUnit" || undefined}
                            aria-describedby={describedBy("repeatUnit")}
                            className="w-[116px] shrink-0"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" align="end">
                            <SelectItem className="min-h-11" value="days">Días</SelectItem>
                            <SelectItem className="min-h-11" value="hours">Horas</SelectItem>
                            <SelectItem className="min-h-11" value="minutes">Minutos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {fieldError("repeatInterval")}
                      {fieldError("repeatUnit")}
                    </Field>
                  </FieldSet>
                ) : (
                  <div id="taskRepetitionSettings" hidden>
                    <input type="hidden" name="repeatCount" value="0" />
                    <input type="hidden" name="repeatInterval" value="1" />
                    <input type="hidden" name="repeatUnit" value="days" />
                  </div>
                )}
              </div>

              {error?.field === "form" ? <FieldError>{error.message}</FieldError> : null}
            </FieldGroup>
          </div>

          <SheetFooter className="shrink-0 border-t border-border/70 bg-card px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button type="button" variant="ghost" className="h-11 sm:px-5" onClick={() => handleOpenChange(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" className="h-11 sm:px-5" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                {task ? "Guardar cambios" : "Guardar tarea"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function RequiredMark() {
  return <><span aria-hidden="true" className="text-destructive">*</span><span className="sr-only">(obligatorio)</span></>
}
