import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function writeMail(config, message) {
  const dir = path.join(config.dataDir, "outbox");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify(message, null, 2));
  return file;
}
