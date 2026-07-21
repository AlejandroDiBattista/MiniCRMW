import type { ReactNode } from "react"

const inlineFormatPattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__|_[^_\n]+_)/g
const orderedItemPattern = /^\s*\d+[.)]\s+(.+)$/
const unorderedItemPattern = /^\s*[-•]\s+(.+)$/

function formatInline(text: string, keyPrefix: string) {
  return text.split(inlineFormatPattern).map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <strong key={key} className="font-semibold">{part.slice(1, -1)}</strong>
    }

    if (part.startsWith("__") && part.endsWith("__")) {
      return <em key={key}>{part.slice(2, -2)}</em>
    }

    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }

    return part
  })
}

export function WhatsAppMessage({ children }: { children: string }) {
  const lines = children.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    const orderedItem = lines[index].match(orderedItemPattern)
    if (orderedItem) {
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(orderedItemPattern)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="list-decimal space-y-0.5 pl-5 marker:text-current/70">
          {items.map((item, itemIndex) => <li key={itemIndex}>{formatInline(item, `ordered-${index}-${itemIndex}`)}</li>)}
        </ol>,
      )
      continue
    }

    const unorderedItem = lines[index].match(unorderedItemPattern)
    if (unorderedItem) {
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(unorderedItemPattern)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push(
        <ul key={`unordered-${index}`} className="list-disc space-y-0.5 pl-5 marker:text-current/70">
          {items.map((item, itemIndex) => <li key={itemIndex}>{formatInline(item, `unordered-${index}-${itemIndex}`)}</li>)}
        </ul>,
      )
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !orderedItemPattern.test(lines[index]) &&
      !unorderedItemPattern.test(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }

    blocks.push(
      <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
        {formatInline(paragraphLines.join("\n"), `paragraph-${index}`)}
      </p>,
    )
  }

  return <div className="space-y-2 break-words">{blocks}</div>
}
