import { z } from "zod";
import { readServerEvents } from "../../shared/sse.js";
import { HttpError } from "../http.js";

const chunkSchema = z.object({
  choices: z.array(
    z.object({
      index: z.number().optional(),
      delta: z.object({
        content: z.string().nullable().optional(),
        tool_calls: z.unknown().optional(),
      }),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
});
const interrupted = () =>
  new HttpError(502, "Sleep coach reply was interrupted. Try again.");

export async function readCoachAnswer(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
): Promise<string> {
  let answer = "";
  let complete = false;
  try {
    for await (const event of readServerEvents(body)) {
      if (event.data === "[DONE]") {
        complete = true;
        break;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        throw interrupted();
      }
      if (payload && typeof payload === "object" && "error" in payload)
        throw new HttpError(503, "Sleep coach is unavailable. Try again.");
      const parsed = chunkSchema.safeParse(payload);
      if (!parsed.success) throw interrupted();
      const choice = parsed.data.choices.find(
        (item) => item.index === undefined || item.index === 0,
      );
      if (!choice) continue; // Usage-only chunks have no choices.
      if (
        choice.delta.tool_calls ||
        (choice.finish_reason && choice.finish_reason !== "stop")
      )
        throw interrupted();
      const text = choice.delta.content;
      if (!text) continue;
      answer += text;
      if (answer.length > 12000) throw interrupted();
      onDelta?.(text);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw interrupted();
  }
  if (!complete || !answer.trim()) throw interrupted();
  return answer.trim();
}
