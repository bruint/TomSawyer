import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { startPushWorker } from "./push.js";

const db = openDatabase();
const app = createApp(db);
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.log(`TomSawyer is listening on port ${port}`),
);
const stopWorker = startPushWorker(db);
function shutdown() {
  stopWorker();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
