import type { CoachTurn } from "../../shared/coach";
import { readServerEvents } from "../../shared/sse";
import { apiRequest, ApiError } from "./api";

const interrupted = () =>
  new ApiError("Sleep coach reply was interrupted. Send again to retry.", 502);

function isCoachTurn(value: unknown): value is CoachTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return (
    ["id", "question", "answer", "contextAt", "createdAt"].every(
      (field) => typeof turn[field] === "string",
    ) &&
    typeof turn.answer === "string" &&
    !!turn.answer.trim()
  );
}

export async function streamCoachReply(
  childId: string,
  question: { id: string; question: string },
  signal: AbortSignal,
  onDelta: (text: string) => void,
  request = apiRequest,
): Promise<CoachTurn> {
  const response = await request(`/children/${childId}/coach`, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: JSON.stringify(question),
    signal,
  });
  if (
    !response.ok ||
    !response.headers.get("Content-Type")?.includes("text/event-stream")
  ) {
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        data?.error || "Sleep coach is unavailable. Try again.",
        response.status,
      );
    if (!isCoachTurn(data) || data.id !== question.id) throw interrupted();
    return data;
  }
  if (!response.body) throw interrupted();
  try {
    for await (const event of readServerEvents(response.body)) {
      if (!["delta", "complete", "error"].includes(event.event)) continue;
      const data = JSON.parse(event.data);
      if (event.event === "error")
        throw new ApiError(
          typeof data?.error === "string" ? data.error : interrupted().message,
          503,
        );
      if (event.event === "delta") {
        if (typeof data?.text !== "string") throw interrupted();
        onDelta(data.text);
      }
      if (event.event === "complete") {
        if (!isCoachTurn(data) || data.id !== question.id) throw interrupted();
        return data;
      }
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof ApiError) throw error;
    throw interrupted();
  }
  throw interrupted();
}
