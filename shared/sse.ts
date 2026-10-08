export interface ServerEvent {
  event: string;
  data: string;
}

function parseEvent(frame: string): ServerEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value || "message";
    if (field === "data") data.push(value);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

// HTTP chunks can split an event, a CRLF separator, or a UTF-8 character.
export async function* readServerEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        if (frame.length > 128000) throw new Error("Stream event is too large");
        const event = parseEvent(frame);
        if (event) yield event;
      }
      if (buffer.length > 128000) throw new Error("Stream event is too large");
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
