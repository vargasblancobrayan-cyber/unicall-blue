type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readClientCache<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const entry = JSON.parse(window.sessionStorage.getItem(key) || "null") as CacheEntry<T> | null;
    if (!entry || Date.now() > entry.expiresAt) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(key: string, value: T, ttlMs: number) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
  } catch {
    // Ignore storage pressure; the app can always fetch fresh data.
  }
}

export function clearClientCache(prefix: string) {
  if (!canUseStorage()) return;
  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Best effort only.
  }
}

export function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function shouldRefreshNow(key: string, minGapMs: number) {
  if (!canUseStorage()) return true;
  const now = Date.now();
  const last = Number(window.sessionStorage.getItem(key) || 0);
  if (now - last < minGapMs) return false;
  window.sessionStorage.setItem(key, String(now));
  return true;
}
