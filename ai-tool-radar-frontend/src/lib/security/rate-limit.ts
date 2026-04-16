type LimitEntry = {
  firstAtMs: number;
  count: number;
};

const rootGlobal = globalThis as typeof globalThis & {
  __radarRateLimitStore?: Map<string, LimitEntry>;
};

const store = rootGlobal.__radarRateLimitStore ?? new Map<string, LimitEntry>();
rootGlobal.__radarRateLimitStore = store;

function cleanup(nowMs: number): void {
  for (const [key, entry] of store.entries()) {
    if (nowMs - entry.firstAtMs > 24 * 60 * 60 * 1000) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
} {
  const now = Date.now();
  cleanup(now);
  const existing = store.get(input.key);
  if (!existing || now - existing.firstAtMs > input.windowMs) {
    store.set(input.key, { firstAtMs: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, input.limit - 1) };
  }
  if (existing.count >= input.limit) {
    const retryAfterSeconds = Math.ceil((input.windowMs - (now - existing.firstAtMs)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds), remaining: 0 };
  }
  existing.count += 1;
  store.set(input.key, existing);
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, input.limit - existing.count) };
}
