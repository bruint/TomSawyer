import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
export const param = (req: Request, key: string) => String(req.params[key]);
export const nowIso = () => new Date().toISOString();
export const handleError: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: error.issues
        .map((i) => i.message)
        .slice(0, 4)
        .join(". "),
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid request data." });
    return;
  }
  console.error(
    "Request failed",
    error instanceof Error ? error.message : "Unknown error",
  );
  res.status(500).json({ error: "Something went wrong. Please try again." });
};
