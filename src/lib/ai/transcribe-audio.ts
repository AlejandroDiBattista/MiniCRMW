import "server-only"

import OpenAI from "openai"

let openai: OpenAI | undefined

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada")
  }

  return (openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))
}

export async function transcribeAudio(file: File) {
  const transcription = await getOpenAI().audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe",
    language: "es",
    response_format: "json",
  })

  const text = transcription.text.trim()
  if (!text) throw new EmptyTranscriptionError()
  return text
}

export class EmptyTranscriptionError extends Error {
  constructor() {
    super("The transcription was empty")
    this.name = "EmptyTranscriptionError"
  }
}
