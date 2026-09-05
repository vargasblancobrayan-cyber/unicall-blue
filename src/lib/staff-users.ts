import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type StaffUser = {
  id: string;
  fullName: string;
  email: string;
  username: string;
  status: "Activo" | "Bloqueado";
};

type StaffProfileRow = {
  id: string;
  full_name: string;
  email: string;
  username: string;
  status: "active" | "blocked";
};

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) throw new Error("Base central no configurada.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesion de staff no encontrada.");
  return token;
}

export async function loadStaffUsers(): Promise<StaffUser[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, username, status")
    .eq("role", "staff")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data || []) as StaffProfileRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    status: row.status === "blocked" ? "Bloqueado" : "Activo"
  }));
}

export async function createStaffUser(payload: {
  fullName: string;
  email: string;
  username: string;
  password: string;
}) {
  const token = await getAccessToken();
  const response = await fetch("/api/staff/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action: "create", ...payload })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "No fue posible crear el staff.");
}

export async function updateStaffUser(user: StaffUser, payload: {
  fullName: string;
  email: string;
  username: string;
}) {
  const token = await getAccessToken();
  const response = await fetch("/api/staff/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action: "update", id: user.id, ...payload })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "No fue posible actualizar el staff.");
}

export async function setStaffUserStatus(user: StaffUser, status: StaffUser["status"]) {
  const token = await getAccessToken();
  const response = await fetch("/api/staff/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      action: "status",
      id: user.id,
      status: status === "Bloqueado" ? "blocked" : "active"
    })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "No fue posible cambiar el estado del staff.");
}

export async function removeStaffUser(user: StaffUser) {
  const token = await getAccessToken();
  const response = await fetch("/api/staff/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      action: "delete",
      id: user.id,
      email: user.email,
      username: user.username
    })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "No fue posible eliminar el staff.");
}

export async function resetStaffPassword(user: StaffUser, password: string) {
  const token = await getAccessToken();
  const response = await fetch("/api/staff/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      action: "reset-password",
      id: user.id,
      password
    })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "No fue posible cambiar la contrasena del staff.");
}
