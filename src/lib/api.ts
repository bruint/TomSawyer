export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-TomSawyer": "1",
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The server did not respond as expected." }));
  if (!response.ok)
    throw new ApiError(data.error || "Request failed", response.status);
  return data as T;
}
export const post = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const put = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const remove = (path: string, body: unknown = {}) =>
  api(path, { method: "DELETE", body: JSON.stringify(body) });
