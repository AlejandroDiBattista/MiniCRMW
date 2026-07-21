import "server-only"

import OpenAI from "openai"

const openai = new OpenAI()

export async function transcribeAudio(file: File) {
  const transcription = await openai.audio.transcriptions.create({
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
