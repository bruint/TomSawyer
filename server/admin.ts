import { openDatabase } from "./db.js";
import { hashPassword } from "./auth.js";
import { resolve } from "node:path";
import { chmodSync } from "node:fs";

const [command, arg] = process.argv.slice(2);
if (!command || !arg) {
  console.error(
    "Usage: node dist/server/server/admin.js backup /data/backup.db\n       node dist/server/server/admin.js reset-password email@example.com",
  );
  process.exit(1);
}
const db = openDatabase();
if (command === "backup") {
  const destination = resolve(arg);
  db.prepare("VACUUM INTO ?").run(destination);
  chmodSync(destination, 0o600);
  console.log(`Consistent database backup saved to ${destination}`);
} else if (command === "reset-password") {
  const user = db
    .prepare("SELECT id FROM users WHERE email=? AND disabled=0")
    .get(arg.toLowerCase());
  if (!user) {
    console.error("Account not found.");
    process.exit(1);
  }
  process.stdout.write("New password (at least 12 characters; hidden): ");
  const password = await new Promise<string>((resolve, reject) => {
    let value = "";
    const tty = process.stdin.isTTY;
    if (tty) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const finish = () => {
      if (tty) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", read);
      process.stdout.write("\n");
      resolve(value);
    };
    const read = (data: string) => {
      for (const c of data) {
        if (c === "\u0003") {
          if (tty) process.stdin.setRawMode(false);
          reject(new Error("Cancelled"));
          process.stdin.pause();
          return;
        }
        if (c === "\r" || c === "\n") {
          finish();
          return;
        }
        if (c === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += c;
      }
    };
    process.stdin.on("data", read);
    process.stdin.once("end", finish);
  });
  if (password.length < 12 || password.length > 128)
    throw new Error("Password must be 12–128 characters. No change made.");
  const hash = await hashPassword(password);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, user.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  console.log(
    "Password updated. All existing sessions for this account have been revoked.",
  );
} else throw new Error("Unknown command");
db.close();
