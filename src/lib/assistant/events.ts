import "server-only"

import type { Message, WorkspaceAssistantMessage } from "@/lib/types"

export type AssistantEvent =
  | { type: "assistant"; clientId: string; messages: Message[] }
  | { type: "workspace-assistant"; messages: WorkspaceAssistantMessage[] }

type Listener = (event: AssistantEvent) => void

class AssistantEventBus {
  private listeners = new Set<Listener>()

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: AssistantEvent) {
    for (const listener of this.listeners) listener(event)
  }
}

const globalForAssistantEvents = globalThis as unknown as { assistantEvents?: AssistantEventBus }
export const assistantEvents = globalForAssistantEvents.assistantEvents ?? new AssistantEventBus()
if (process.env.NODE_ENV !== "production") globalForAssistantEvents.assistantEvents = assistantEvents
