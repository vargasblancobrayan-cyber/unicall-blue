const minute = 60 * 1000;

function browserEmergencyFlag() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("unicall-blue:emergency-mode") === "1";
  } catch {
    return false;
  }
}

export function isEmergencyModeEnabled() {
  return process.env.NEXT_PUBLIC_UNICALL_EMERGENCY_MODE === "1" || browserEmergencyFlag();
}

export function clientCacheTtlMs() {
  return isEmergencyModeEnabled() ? 45 * minute : 20 * minute;
}

export function performanceCacheTtlMs() {
  return isEmergencyModeEnabled() ? 30 * minute : 15 * minute;
}

export function notificationPollMs() {
  return isEmergencyModeEnabled() ? 15 * minute : 8 * minute;
}

export function focusRefreshThrottleMs() {
  return isEmergencyModeEnabled() ? 15 * minute : 8 * minute;
}

export function notificationLimit(requested = 20) {
  const cap = isEmergencyModeEnabled() ? 15 : 30;
  return Math.min(cap, Math.max(1, Math.floor(requested)));
}

export function staffNotificationLimit(requested = 80) {
  const cap = isEmergencyModeEnabled() ? 40 : 70;
  return Math.min(cap, Math.max(15, Math.floor(requested)));
}

export function listLimit(requested = 120, cap = 180) {
  const effectiveCap = isEmergencyModeEnabled() ? Math.min(cap, 80) : Math.min(cap, 160);
  return Math.min(effectiveCap, Math.max(1, Math.floor(requested)));
}
