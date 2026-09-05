import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isUsefulNotification, usefulNotificationTitleFilter } from "@/lib/notification-policy";
import { clearClientCache, readClientCache, writeClientCache } from "@/lib/client-cache";
import { clientCacheTtlMs, notificationLimit, staffNotificationLimit } from "@/lib/usage-controls";

export type UserNotification = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  workflowKey?: string;
  notificationIds?: string[];
  category?: string;
  workStatus?: "Nueva" | "En gestion" | "Resuelta";
  handledBy?: string | null;
  handledAt?: string | null;
};

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

function fromRow(row: NotificationRow): UserNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

async function authToken() {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export async function loadNotifications(limit = 20, role: "operator" | "staff" = "operator"): Promise<UserNotification[]> {
  const safeLimit = role === "staff" ? staffNotificationLimit(limit) : notificationLimit(limit);
  const cacheKey = `unicall-blue:notifications:${role}:${safeLimit}`;
  const cached = readClientCache<UserNotification[]>(cacheKey);
  if (cached) return cached;

  if (role === "staff") {
    const token = await authToken();
    if (!token) return [];
    const response = await fetch(`/api/staff/notifications?limit=${safeLimit}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null) as { items?: UserNotification[]; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "No fue posible cargar la bandeja compartida.");
    const items = (payload?.items || []).filter((item) => isUsefulNotification(item.title, item.message)).slice(0, safeLimit);
    writeClientCache(cacheKey, items, clientCacheTtlMs());
    return items;
  }

  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, message, read_at, created_at")
    .eq("recipient_id", authData.user.id)
    .or(usefulNotificationTitleFilter)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  const items = ((data || []) as NotificationRow[])
    .map(fromRow)
    .filter((item) => isUsefulNotification(item.title, item.message))
    .slice(0, safeLimit);
  writeClientCache(cacheKey, items, clientCacheTtlMs());
  return items;
}

export async function updateNotificationWorkStatus(
  item: UserNotification,
  action: "claim" | "resolve" | "reopen" | "delete"
) {
  const token = await authToken();
  if (!token || !item.workflowKey) throw new Error("Sesion de Staff no encontrada.");
  const response = await fetch("/api/staff/notifications", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workflowKey: item.workflowKey,
      notificationIds: item.notificationIds || [item.id],
      action,
      title: item.title,
      message: item.message,
      category: item.category
    })
  });
  const payload = await response.json().catch(() => null) as Partial<UserNotification> & { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "No fue posible actualizar el aviso.");
  clearClientCache("unicall-blue:notifications:");
  return payload;
}

export async function markNotificationRead(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  clearClientCache("unicall-blue:notifications:");
}

export async function markAllNotificationsRead() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", authData.user.id)
    .is("read_at", null);
  if (error) throw error;
  clearClientCache("unicall-blue:notifications:");
}

export async function deleteOperatorNotifications(id?: string) {
  const token = await authToken();
  if (!token) throw new Error("Sesion no encontrada.");
  const response = await fetch("/api/operator/notifications", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(id ? { id } : { allRead: true })
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "No fue posible borrar el aviso.");
  clearClientCache("unicall-blue:notifications:");
}

export function notificationHref(title: string, role: "operator" | "staff") {
  const value = title.toLowerCase();
  if (value.includes("productividad") || value.includes("venta por hora") || value.includes("cheque")) {
    return role === "staff" ? "/staff-performance" : "/operator-dashboard";
  }
  if (value.includes("certificado")) return role === "staff" ? "/staff-certificates" : "/operator-certificates";
  if (value.includes("pago") || value.includes("novedad de pago")) {
    return role === "staff" ? "/staff-payments" : "/operator-payments";
  }
  if (value.includes("rechazo oculto")) {
    return role === "staff" ? "/staff-hidden-rejections" : "/operator-hidden-rejections";
  }
  if (value.includes("cambio de turno")) {
    return role === "staff" ? "/staff-shift-changes" : "/operator-workday";
  }
  if (value.includes("pendiente") || value.includes("vencido")) return role === "staff" ? "/staff-certificates" : "/operator-certificates";
  return role === "staff" ? "/staff-dashboard" : "/operator-dashboard";
}
