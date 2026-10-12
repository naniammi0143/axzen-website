const memory = new Map();

function redisConfig() {
  return {
    url: String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, ""),
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}

function memoryGet(key) {
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

async function getJson(key) {
  const local = memoryGet(key);
  if (local !== null) return local;
  const config = redisConfig();
  if (!config.url || !config.token) return null;
  try {
    const response = await fetch(`${config.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(1200),
    });
    const payload = await response.json();
    if (!response.ok || !payload.result) return null;
    const value = JSON.parse(payload.result);
    memory.set(key, { value, expiresAt: Date.now() + 15_000 });
    return value;
  } catch {
    return null;
  }
}

async function setJson(key, value, ttlSeconds = 60) {
  memory.set(key, { value, expiresAt: Date.now() + Math.min(ttlSeconds, 20) * 1000 });
  const config = redisConfig();
  if (!config.url || !config.token) return;
  try {
    await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, JSON.stringify(value), "EX", ttlSeconds]),
      signal: AbortSignal.timeout(1200),
    });
  } catch {
    // The in-process cache remains available when the shared cache is offline.
  }
}

function deletePrefix(prefix) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

module.exports = { getJson, setJson, deletePrefix };
