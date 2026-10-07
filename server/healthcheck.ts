import { env, exit } from "node:process";

const port = env.PORT || "3000";

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  exit(response.ok ? 0 : 1);
} catch {
  exit(1);
}
