import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
if (!process.stdin.isTTY) { console.error("Run this command in an interactive terminal."); process.exit(1); }
process.stdout.write("Operator password: "); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
let password = "";
for await (const key of process.stdin) {
  if (key === "\r" || key === "\n") break;
  if (key === "\u0003") process.exit(130);
  if (key === "\u007f") { if (password) { password = password.slice(0, -1); process.stdout.write("\b \b"); } continue; }
  if (key >= " ") { password += key; process.stdout.write("*"); }
}
process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
if (password.length < 8) { console.error("Use at least 8 characters."); process.exit(1); }
const salt = randomBytes(16); const hash = await derive(password, salt, 64);
console.log(`OPERATOR_PASSWORD_HASH=scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`);
