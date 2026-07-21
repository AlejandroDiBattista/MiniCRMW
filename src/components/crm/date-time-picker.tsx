"use client"

import { useEffect, useRef, useState } from "react"
import { es } from "date-fns/locale"
import { CalendarDays, Check, ChevronDown, Clock3, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"))

const displayFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function parseDateTime(value?: string) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function serializeLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function DateTimePicker({ id, name, defaultValue, optional = false, invalid = false, ariaDescribedBy, className }: {
  id: string
  name: string
  defaultValue?: string
  optional?: boolean
  invalid?: boolean
  ariaDescribedBy?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(() => parseDateTime(defaultValue))
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const form = triggerRef.current?.form
    const reset = () => setValue(parseDateTime(defaultValue))
    form?.addEventListener("reset", reset)
    return () => form?.removeEventListener("reset", reset)
  }, [defaultValue])

  function updateTime(part: "hour" | "minute", nextValue: string) {
    setValue((current) => {
      const next = new Date(current ?? new Date())
      if (part === "hour") next.setHours(Number(nextValue))
      else next.setMinutes(Number(nextValue))
      return next
    })
  }

  const displayedValue = value ?? new Date()

  return (
    <div className={cn("w-full", className)}>
      <input type="hidden" name={name} value={value ? serializeLocalDateTime(value) : ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid || undefined}
            aria-describedby={ariaDescribedBy}
            className="h-11 w-full justify-start gap-2.5 rounded-lg bg-card px-3 text-left text-sm font-normal shadow-xs"
          >
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className={cn("min-w-0 flex-1 truncate capitalize", !value && "text-muted-foreground")}>{value ? displayFormatter.format(value) : "Sin fecha"}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="center"
          sideOffset={8}
          collisionPadding={8}
          className="max-h-[var(--radix-popover-content-available-height)] w-[calc(100vw-1rem)] max-w-[356px] gap-0 overflow-hidden rounded-xl p-0"
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <Calendar
              mode="single"
              selected={value ?? undefined}
              defaultMonth={displayedValue}
              locale={es}
              onSelect={(selected) => {
                if (!selected) return
                const next = new Date(selected)
                next.setHours(displayedValue.getHours(), displayedValue.getMinutes(), 0, 0)
                setValue(next)
              }}
              className="p-2 [--cell-size:--spacing(10)] sm:p-3 sm:[--cell-size:--spacing(11)]"
            />
            <div className="flex items-center gap-2 border-t border-border bg-muted/35 px-3 py-3">
              <Clock3 className="mr-0.5 size-4 text-muted-foreground" />
              <span className="mr-auto text-xs font-semibold text-muted-foreground">Hora</span>
              <Select value={String(displayedValue.getHours()).padStart(2, "0")} onValueChange={(hour) => updateTime("hour", hour)}>
                <SelectTrigger size="lg" aria-label="Hora" className="w-[72px] bg-card font-medium tabular-nums"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" align="end">
                  {hours.map((hour) => <SelectItem className="min-h-11" key={hour} value={hour}>{hour}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="font-semibold text-muted-foreground">:</span>
              <Select value={String(displayedValue.getMinutes()).padStart(2, "0")} onValueChange={(minute) => updateTime("minute", minute)}>
                <SelectTrigger size="lg" aria-label="Minutos" className="w-[72px] bg-card font-medium tabular-nums"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" align="end">
                  {minutes.map((minute) => <SelectItem className="min-h-11" key={minute} value={minute}>{minute}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="shrink-0 flex justify-end gap-2 border-t border-border bg-popover px-3 py-2.5">
            {optional && value ? <Button type="button" variant="ghost" className="h-11 px-3 text-sm" onClick={() => { setValue(null); setOpen(false) }}><X />Quitar fecha</Button> : null}
            <Button type="button" className="h-11 px-3 text-sm" onClick={() => setOpen(false)}><Check />Listo</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
