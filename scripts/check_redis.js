const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const contents = fs.readFileSync(file, "utf8");
  const lines = contents.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const cwd = process.cwd();
  const candidates = [path.join(cwd, ".env.local"), path.join(cwd, ".env")];
  for (const c of candidates) {
    const e = loadEnvFile(c);
    if (e.REDIS_URL) return e.REDIS_URL;
  }
  return null;
}

(async () => {
  try {
    const redisUrl = resolveRedisUrl() || "redis://127.0.0.1:6379";
    console.log("Using REDIS_URL =", redisUrl);
    const client = new Redis(redisUrl);

    client.on("connect", () => console.log("ioredis event: connect"));
    client.on("ready", () => console.log("ioredis event: ready"));
    client.on("error", (err) =>
      console.error(
        "ioredis event: error",
        err && err.message ? err.message : err
      )
    );
    client.on("close", () => console.log("ioredis event: close"));

    // try ping
    const pong = await client.ping();
    console.log("PING response:", pong);
    await client.quit();
    process.exit(0);
  } catch (err) {
    console.error(
      "Redis check failed:",
      err && err.message ? err.message : err
    );
    process.exit(2);
  }
})();
