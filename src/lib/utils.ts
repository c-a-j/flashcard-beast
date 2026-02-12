import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Ollama, type Message } from "ollama"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export async function generateNotecard(
  data: string,
  model?: string,
  host?: string,
  apiKey?: string,
  fetchFn?: typeof fetch
): Promise<Message> {
  const prefix = `I'm making notecards for studying. They should be in a
  question and answer format. The result should be provided in JSON format
  {"question": "the question", "answer": "the answer"}. The question value should never
  give away or contain the answer. Create one notecard with the following
  information: `

  const content = `${prefix}${data}`

  const m = model?.trim() || 'glm-4.7-flash'

  const normalizedHost = host?.replace(/\/$/, "") ?? ""

  const client = host
    ? new Ollama({
        host: normalizedHost,
        ...(apiKey && { headers: { Authorization: `Bearer ${apiKey}` } }),
        ...(fetchFn && { fetch: fetchFn }),
      })
    : new Ollama()
  const response = await client.chat({
    model: m,
    messages: [{ role: 'user', content }]
  })

  const rawContent = response.message.content ?? ""
  const strippedContent = rawContent
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("```"))
    .join("\n")

  return { ...response.message, content: strippedContent }
}

export type Notecard = {
  question: string
  answer: string
}

const EMPTY_NOTECARD: Notecard = { question: "", answer: "" }

export function parseNotecard(content: string): Notecard {
  try {
    const parsed = JSON.parse(content) as unknown
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "question" in parsed &&
      "answer" in parsed &&
      typeof (parsed as Notecard).question === "string" &&
      typeof (parsed as Notecard).answer === "string"
    ) {
      return {
        question: (parsed as Notecard).question,
        answer: (parsed as Notecard).answer,
      }
    }
  } catch {
    // JSON parse failed or structure invalid
  }
  return EMPTY_NOTECARD
}