"use client"

import { useState, useTransition } from "react"
import { LoaderCircle, UserRoundPlus } from "lucide-react"
import { toast } from "sonner"
import { createClientAction, updateClientAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { Client } from "@/lib/types"

type Props = {
  client?: Client
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (clientId?: string) => void
  trigger?: React.ReactNode
}

export function ClientFormSheet({ client, open: controlledOpen, onOpenChange, onSaved, trigger }: Props) {
  const [localOpen, setLocalOpen] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setError("")
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
      onSaved?.(savedId)
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="w-full overflow-y-auto border-l-border/70 bg-card p-0 sm:max-w-[520px]">
        <form action={submit} className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border/70 px-6 py-6">
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRoundPlus className="size-5" />
            </div>
            <SheetTitle className="font-heading text-2xl">{client ? "Editar cliente" : "Nuevo cliente"}</SheetTitle>
            <SheetDescription>
              {client ? "Actualizá los datos de la ficha." : "Creá la ficha para iniciar el seguimiento y conversar por WhatsApp."}
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="flex-1 px-6 py-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">Nombre</FieldLabel>
                <Input id="firstName" name="firstName" defaultValue={client?.firstName} placeholder="María" autoFocus required />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Apellido</FieldLabel>
                <Input id="lastName" name="lastName" defaultValue={client?.lastName} placeholder="González" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="phone">Teléfono de WhatsApp</FieldLabel>
              <Input id="phone" name="phone" defaultValue={client?.phone} placeholder="+54 9 381 555 0123" inputMode="tel" required />
              <FieldDescription>Usá el número con código de país y área para vincular este chat.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" defaultValue={client?.email} placeholder="maria@ejemplo.com" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="dni">DNI</FieldLabel>
              <Input id="dni" name="dni" defaultValue={client?.dni} placeholder="32.456.789" inputMode="numeric" />
            </Field>
            <FieldError>{error}</FieldError>
          </FieldGroup>
          <SheetFooter className="sticky bottom-0 border-t border-border/70 bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              {client ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
