import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

const deviceStorageKey = "unicall-blue-device-id";

export function getOperatorDeviceId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(deviceStorageKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(deviceStorageKey, next);
  return next;
}

export async function claimOperatorDeviceSession() {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return true;
  const deviceValue = getOperatorDeviceId();
  const { data, error } = await supabase.rpc("claim_operator_device_session", { device_value: deviceValue });
  if (error) return true;
  return Boolean(data);
}

export async function touchOperatorDeviceSession() {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return true;
  const deviceValue = getOperatorDeviceId();
  const { data, error } = await supabase.rpc("touch_operator_device_session", { device_value: deviceValue });
  if (error) return true;
  return Boolean(data);
}
