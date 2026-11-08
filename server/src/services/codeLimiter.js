// In-memory per-identity limits for sending login codes. Resets on restart and is
// per server process; move to Redis/Mongo if you run several API instances.
export const LIMITS = [
  { windowMs: 60 * 1000, max: 1, message: 'Wait a minute before requesting another code' },
  { windowMs: 10 * 60 * 1000, max: 3, message: 'Too many codes requested, try again in a few minutes' },
  { windowMs: 24 * 60 * 60 * 1000, max: 10, message: 'Daily code limit reached, try again tomorrow' },
];

export function createCodeLimiter(limits = LIMITS) {
  const hits = new Map(); // key -> timestamps (ms), newest last
  const longest = Math.max(...limits.map((l) => l.windowMs));

  function prune(now) {
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => now - t < longest);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }

  // Records the request if allowed. Otherwise returns how long to wait.
  function attempt(key, now = Date.now()) {
    if (hits.size > 5000) prune(now);
    const times = (hits.get(key) || []).filter((t) => now - t < longest);
    for (const { windowMs, max, message } of limits) {
      const inWindow = times.filter((t) => now - t < windowMs);
      if (inWindow.length >= max) {
        const retryAfterSec = Math.ceil((inWindow[inWindow.length - max] + windowMs - now) / 1000);
        return { ok: false, retryAfterSec, message };
      }
    }
    times.push(now);
    hits.set(key, times);
    return { ok: true };
  }

  return { attempt };
}
