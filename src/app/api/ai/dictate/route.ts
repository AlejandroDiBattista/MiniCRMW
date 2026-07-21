import { improveMessage } from "@/lib/ai/improve-message"
import { EmptyTranscriptionError, transcribeAudio } from "@/lib/ai/transcribe-audio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_AUDIO_SIZE = 4 * 1024 * 1024
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
])

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return json({ error: "El dictado con IA todavía no está configurado." }, 503)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: "No pudimos leer la grabación." }, 400)
  }

  const audio = formData.get("audio")
  if (!(audio instanceof File) || audio.size === 0) {
    return json({ error: "La grabación está vacía. Mantené presionado el micrófono mientras hablás." }, 400)
  }
  if (audio.size > MAX_AUDIO_SIZE) {
    return json({ error: "La grabación supera el límite permitido." }, 413)
  }

  const contentType = audio.type.toLowerCase().split(";", 1)[0]
  if (!SUPPORTED_AUDIO_TYPES.has(contentType)) {
    return json({ error: "El formato de audio no es compatible." }, 415)
  }

  try {
    const transcription = await transcribeAudio(audio)
    try {
      const text = await improveMessage(transcription)
      return json({ text, improved: true })
    } catch (error) {
      console.error("Dictation improvement failed", error instanceof Error ? error.name : "UnknownError")
      return json({ text: transcription, improved: false })
    }
  } catch (error) {
    if (error instanceof EmptyTranscriptionError) {
      return json({ error: "No detectamos una voz clara en la grabación." }, 422)
    }
    console.error("Audio transcription failed", error instanceof Error ? error.name : "UnknownError")
    return json({ error: "No pudimos transcribir el audio en este momento." }, 502)
  }
}
