import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Ollama, type Message } from "ollama/browser"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const DEFAULT_PROMPT_PREFIX = `
I'm making flashcards for studying. Create exactly one flashcard in question and answer format.

Rules:
- Return only a single JSON object in this form: {"question": "...", "answer": "..."}.
- Do not wrap it in markdown code blocks or add any text before or after the JSON.
- The question must test recall: it must not contain the answer, synonyms of the answer, or obvious hints.
- Output valid JSON only; escape any quotes inside the strings.
- If the given information is unclear or very short, infer one clear question and one clear answer for the topic.

Create one flashcard with the following information:
`.trim();

export async function generateFlashcard(
  data: string,
  prefix?: string,
  model?: string,
  host?: string,
  apiKey?: string,
  fetchFn?: typeof fetch
): Promise<Message> {
  const content = `${prefix ?? DEFAULT_PROMPT_PREFIX}
  ${data}`

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
    .filter((line) => !line.trimStart().startsWith("["))
    .filter((line) => !line.trimStart().startsWith("]"))
    .join("\n")

  return { ...response.message, content: strippedContent }
}

export type Flashcard = {
  question: string
  answer: string
}

const EMPTY_FLASHCARD: Flashcard = { question: "", answer: "" }

export function parseFlashcard(content: string): Flashcard {
  try {
    const parsed = JSON.parse(content) as unknown
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "question" in parsed &&
      "answer" in parsed &&
      typeof (parsed as Flashcard).question === "string" &&
      typeof (parsed as Flashcard).answer === "string"
    ) {
      return {
        question: (parsed as Flashcard).question,
        answer: (parsed as Flashcard).answer,
      }
    }
  } catch {
    // JSON parse failed or structure invalid
  }
  return EMPTY_FLASHCARD
}
