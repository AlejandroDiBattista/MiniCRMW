"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { LoaderCircle, Mic } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type DictationStatus = "idle" | "requesting" | "recording" | "transcribing" | "improving" | "error"

const MAX_DURATION_MS = 60_000
const MIN_DURATION_MS = 350

const statusLabels: Record<DictationStatus, string> = {
  idle: "Mantené presionado para dictar",
  requesting: "Esperando permiso del micrófono",
  recording: "Grabando; soltá para transcribir",
  transcribing: "Transcribiendo audio",
  improving: "Mejorando el texto dictado",
  error: "No se pudo completar el dictado",
}

function preferredMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function extensionFor(type: string) {
  if (type.includes("mp4")) return "m4a"
  if (type.includes("ogg")) return "ogg"
  if (type.includes("wav")) return "wav"
  return "webm"
}

function joinAtCursor(value: string, start: number, end: number, fragment: string) {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const leadingSpace = before && !/[\s([{]$/.test(before) && fragment && !/^[\s,.;:!?)]/.test(fragment) ? " " : ""
  const trailingSpace = after && !/^[\s,.;:!?)]/.test(after) && fragment && !/\s$/.test(fragment) ? " " : ""
  const insertion = `${leadingSpace}${fragment}${trailingSpace}`
  return {
    value: `${before}${insertion}${after}`,
    caret: start + insertion.length,
  }
}

function microphoneError(error: unknown) {
  if (!(error instanceof DOMException)) return "No pudimos acceder al micrófono."
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "Permití el acceso al micrófono para usar el dictado."
  if (error.name === "NotFoundError") return "No encontramos un micrófono disponible."
  if (error.name === "NotReadableError" || error.name === "AbortError") return "El micrófono está ocupado por otra aplicación."
  return "No pudimos iniciar el micrófono."
}

export function VoiceDictationButton({
  textareaRef,
  value,
  onValueChange,
  onBusyChange,
  disabled = false,
  assistant = false,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onValueChange: (value: string) => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
  assistant?: boolean
}) {
  const [status, setStatus] = useState<DictationStatus>("idle")
  const [elapsed, setElapsed] = useState(0)
  const statusRef = useRef<DictationStatus>("idle")
  const mountedRef = useRef(true)
  const pressedRef = useRef(false)
  const requestIdRef = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardRef = useRef(false)
  const startedAtRef = useRef(0)
  const selectionRef = useRef({ start: 0, end: 0, value })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const updateStatus = useCallback((next: DictationStatus) => {
    statusRef.current = next
    if (mountedRef.current) setStatus(next)
  }, [])

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (tickerRef.current) clearInterval(tickerRef.current)
    timeoutRef.current = null
    tickerRef.current = null
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const showError = useCallback((message: string, description?: string) => {
    updateStatus("error")
    toast.error(message, description ? { description } : undefined)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => updateStatus("idle"), 1_200)
  }, [updateStatus])

  const applyText = useCallback((text: string) => {
    const selection = selectionRef.current
    const next = joinAtCursor(selection.value, selection.start, selection.end, text)
    onValueChange(next.value)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }, [onValueChange, textareaRef])

  const transcribe = useCallback(async (blob: Blob) => {
    updateStatus("transcribing")
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const formData = new FormData()
      const type = blob.type || "audio/webm"
      formData.append("audio", new File([blob], `dictado.${extensionFor(type)}`, { type }))
      const response = await fetch("/api/ai/dictate", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })
      const data = (await response.json()) as { text?: string; improved?: boolean; error?: string }
      if (!response.ok || !data.text) throw new Error(data.error || "No pudimos procesar el dictado.")

      if (data.improved) updateStatus("improving")
      applyText(data.text)
      if (!data.improved) {
        toast.warning("El dictado se transcribió sin la mejora de redacción.", {
          description: "Podés usar el botón de chispa para mejorarlo más tarde.",
        })
      }
      updateStatus("idle")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      showError(error instanceof Error && error.message ? error.message : "No pudimos completar el dictado.", "Tu borrador no fue modificado.")
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [applyText, showError, updateStatus])

  const finishRecording = useCallback((discard = false) => {
    pressedRef.current = false
    if (statusRef.current === "requesting") {
      if (discard) requestIdRef.current += 1
      return
    }
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return
    discardRef.current = discard
    clearTimers()
    recorder.stop()
  }, [clearTimers])

  const beginRecording = useCallback(async () => {
    if (disabled || statusRef.current !== "idle") return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showError("Este navegador no permite grabar audio.", "Probá con una versión reciente de Chrome, Edge, Firefox o Safari.")
      return
    }

    const textarea = textareaRef.current
    selectionRef.current = {
      start: textarea?.selectionStart ?? value.length,
      end: textarea?.selectionEnd ?? value.length,
      value,
    }
    pressedRef.current = true
    const requestId = ++requestIdRef.current
    updateStatus("requesting")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current || requestId !== requestIdRef.current || !pressedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        updateStatus("idle")
        return
      }

      streamRef.current = stream
      const mimeType = preferredMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      discardRef.current = false
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        discardRef.current = true
        clearTimers()
        releaseStream()
        showError("La grabación se interrumpió.", "Volvé a mantener presionado el micrófono para intentarlo.")
      }
      recorder.onstop = () => {
        const duration = Date.now() - startedAtRef.current
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
        recorderRef.current = null
        chunksRef.current = []
        clearTimers()
        releaseStream()
        if (!mountedRef.current || discardRef.current) {
          updateStatus("idle")
          return
        }
        if (duration < MIN_DURATION_MS || blob.size === 0) {
          showError("La grabación fue demasiado breve.", "Mantené presionado el micrófono mientras hablás.")
          return
        }
        void transcribe(blob)
      }

      startedAtRef.current = Date.now()
      setElapsed(0)
      recorder.start(250)
      updateStatus("recording")
      tickerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1_000)), 250)
      timeoutRef.current = setTimeout(() => {
        toast.info("Alcanzaste el máximo de 60 segundos. Procesando el dictado…")
        finishRecording(false)
      }, MAX_DURATION_MS)
    } catch (error) {
      pressedRef.current = false
      releaseStream()
      showError(microphoneError(error))
    }
  }, [clearTimers, disabled, finishRecording, releaseStream, showError, textareaRef, transcribe, updateStatus, value])

  const cancel = useCallback(() => {
    requestIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    finishRecording(true)
    clearTimers()
    releaseStream()
    updateStatus("idle")
  }, [clearTimers, finishRecording, releaseStream, updateStatus])

  useEffect(() => {
    onBusyChange?.(!["idle", "error"].includes(status))
  }, [onBusyChange, status])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancel()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [cancel])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      cancel()
    }
  }, [cancel])

  const busy = !["idle", "error"].includes(status)
  const recording = status === "recording"

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              "touch-none select-none rounded-full bg-transparent shadow-none",
              assistant ? "text-assistant hover:text-assistant" : "text-muted-foreground hover:text-primary",
              recording && "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
            )}
            disabled={disabled}
            aria-label={statusLabels[status]}
            aria-pressed={recording}
            aria-busy={busy}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              void beginRecording()
            }}
            onPointerUp={(event) => {
              event.preventDefault()
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
              finishRecording(false)
            }}
            onPointerCancel={() => finishRecording(true)}
            onKeyDown={(event) => {
              if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                event.preventDefault()
                void beginRecording()
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault()
                finishRecording(false)
              }
            }}
          >
            {busy && !recording ? <LoaderCircle className="animate-spin" /> : <Mic className={cn(recording && "animate-pulse stroke-[2.5]")} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{recording ? `Grabando ${elapsed}s · soltá para transcribir` : statusLabels[status]}</TooltipContent>
      </Tooltip>
      <span className="sr-only" aria-live="polite">{recording ? `Grabando audio, ${elapsed} segundos` : statusLabels[status]}</span>
    </>
  )
}
