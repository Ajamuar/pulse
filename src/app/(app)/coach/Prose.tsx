import * as React from "react"

/**
 * The coach's answer text: paragraphs, "- " bullets and **bold**, nothing else (the instructions ask for exactly
 * that). Built from strings into React elements, so model output is never parsed as HTML.
 */
export function Prose({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-3 text-[16px] leading-6 text-pretty text-foreground">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim())
        if (lines.length && lines.every((l) => /^\s*[-*•] /.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•] /, ""))}</li>
              ))}
            </ul>
          )
        return <p key={i}>{inline(lines.join(" "))}</p>
      })}
    </div>
  )
}

/** `**bold**` spans; an unclosed `**` (mid-stream) stays as text. */
function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}
