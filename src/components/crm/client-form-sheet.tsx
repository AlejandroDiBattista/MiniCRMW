"use client"

import { useState, useTransition } from "react"
import { LoaderCircle, Sparkles, Trash2, UserRoundPlus } from "lucide-react"
import { toast } from "sonner"
import { createClientAction, deleteClientAction, updateClientAction } from "@/app/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { Client } from "@/lib/types"

type Props = {
  client?: Client
  draft?: Partial<Pick<Client, "firstName" | "lastName" | "dni" | "email" | "phone">>
  review?: { title: string; description: string; intent?: "save" | "delete" }
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (clientId?: string, resultSummary?: string) => void
  onDeleted?: (resultSummary?: string) => void
  onCancelled?: () => void
  trigger?: React.ReactNode
}

export function ClientFormSheet({ client, draft, review, open: controlledOpen, onOpenChange, onSaved, onDeleted, onCancelled, trigger }: Props) {
  const [localOpen, setLocalOpen] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setError("")
    else onCancelled?.()
    setOpen(nextOpen)
  }

  function submit(formData: FormData) {
    setError("")
    startTransition(async () => {
      const result = client
        ? await updateClientAction(client.id, formData)
        : await createClientAction(formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(client ? "Ficha actualizada" : "Cliente creado", {
        description: client ? "Los datos quedaron al día." : "La ficha ya está lista para iniciar una conversación.",
      })
      const savedId = "clientId" in result && typeof result.clientId === "string" ? result.clientId : client?.id
      onSaved?.(savedId, result.resultSummary)
    })
  }

  function removeClient() {
    if (!client) return
    startTransition(async () => {
      const result = await deleteClientAction(client.id)
      setOpen(false)
      toast.success("Cliente eliminado", { description: "La ficha y su historial fueron eliminados." })
      onDeleted?.(result.resultSummary)
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent panelSize="md" showCloseButton={Boolean(review) || !client} className="gap-0 overflow-y-auto border-l-border/70 bg-card p-0">
        {client && review?.intent !== "delete" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon-lg" className="absolute right-2 top-2 z-10 size-11 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending}>
                <Trash2 />
                <span className="sr-only">Eliminar cliente</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>¿Eliminar a {client.firstName}?</AlertDialogTitle><AlertDialogDescription>Se eliminarán también su historial y todos los mensajes guardados. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={removeClient}>Eliminar cliente</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <form action={submit} className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border/70 px-6 py-6">
            <div className={review ? "mb-2 flex size-10 items-center justify-center rounded-full bg-assistant-soft text-assistant" : "mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"}>
              {review ? <Sparkles className="size-5" /> : <UserRoundPlus className="size-5" />}
            </div>
            <SheetTitle className="font-heading text-2xl">{review?.title ?? (client ? "Editar cliente" : "Nuevo cliente")}</SheetTitle>
            <SheetDescription>
              {review?.description ?? (client ? "Actualizá los datos de la ficha." : "Creá la ficha para iniciar el seguimiento y conversar por WhatsApp.")}
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="flex-1 px-6 py-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">Nombre</FieldLabel>
                <Input id="firstName" name="firstName" defaultValue={draft?.firstName ?? client?.firstName} placeholder="María" autoFocus required />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Apellido</FieldLabel>
                <Input id="lastName" name="lastName" defaultValue={draft?.lastName ?? client?.lastName} placeholder="González" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="phone">Teléfono de WhatsApp</FieldLabel>
              <Input id="phone" name="phone" defaultValue={draft?.phone ?? client?.phone} placeholder="+54 9 381 555 0123" inputMode="tel" required />
              <FieldDescription>Usá el número con código de país y área para vincular este chat.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" defaultValue={draft?.email ?? client?.email} placeholder="maria@ejemplo.com" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="dni">DNI</FieldLabel>
              <Input id="dni" name="dni" defaultValue={draft?.dni ?? client?.dni} placeholder="32.456.789" inputMode="numeric" />
            </Field>
            <FieldError>{error}</FieldError>
          </FieldGroup>
          <SheetFooter className="sticky bottom-0 border-t border-border/70 bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>Cancelar</Button>
            {review?.intent === "delete" && client ? (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" variant="destructive" disabled={pending}><Trash2 />Eliminar cliente</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>¿Eliminar a {client.firstName}?</AlertDialogTitle><AlertDialogDescription>Se eliminarán también su historial y todos los mensajes guardados. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Volver</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={removeClient}>Eliminar cliente</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                {client ? "Guardar cambios" : "Crear cliente"}
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
