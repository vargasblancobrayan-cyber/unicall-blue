import { operators } from "@/lib/data";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type OperatorUser = {
  id: string;
  fullName: string;
  email: string;
  username: string;
  status: "Pendiente" | "Bloqueado" | "Registrado";
  token?: string;
  profileId?: string;
};

type OperatorInvitationRow = {
  id: string;
  full_name: string;
  email: string;
  username: string;
  status: "active" | "blocked" | "registered";
  token: string;
};

export const operatorUsersStorageKey = "unicall-blue-operator-users";

function usernameFromName(name: string) {
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0] || "Operador";
  const last = parts[1] || parts[parts.length - 1] || "";
  return `${first[0] || "O"}.${last || first}`.replace(/\s+/g, "").toUpperCase();
}

export function defaultOperatorUsers(): OperatorUser[] {
  return operators.map((operator) => ({
    id: operator.id,
    fullName: operator.name,
    email: operator.email,
    username: usernameFromName(operator.name),
    status: "Pendiente"
  }));
}

export function readLocalOperatorUsers() {
  if (typeof window === "undefined") return defaultOperatorUsers();
  try {
    const raw = window.localStorage.getItem(operatorUsersStorageKey);
    const users = raw ? (JSON.parse(raw) as OperatorUser[]) : defaultOperatorUsers();
    return users.map((user) => {
      const legacyStatus = String(user.status || "Pendiente");
      return { ...user, status: legacyStatus === "Activo" ? "Pendiente" : (legacyStatus as OperatorUser["status"]) };
    });
  } catch {
    return defaultOperatorUsers();
  }
}

export function writeLocalOperatorUsers(users: OperatorUser[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(operatorUsersStorageKey, JSON.stringify(users));
  }
}

export async function loadOperatorUsers(): Promise<OperatorUser[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return readLocalOperatorUsers();

  const [{ data, error }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("operator_invitations").select("id, full_name, email, username, status, token").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, username, status").eq("role", "operator").order("created_at", { ascending: false })
  ]);

  if (error || profilesError) throw error || profilesError;
  const invitationUsers: OperatorUser[] = ((data || []) as OperatorInvitationRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    status: row.status === "blocked" ? "Bloqueado" : row.status === "registered" ? "Registrado" : "Pendiente",
    token: row.token
  }));
  const profileRows = (profiles || []) as Array<{ id: string; full_name: string; email: string; username: string; status: "active" | "blocked" }>;
  const mergedInvitations = invitationUsers.map((user) => {
    const profile = profileRows.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
    return profile
      ? { ...user, profileId: profile.id, status: profile.status === "blocked" ? "Bloqueado" as const : "Registrado" as const }
      : user;
  });
  const generalRegistrations: OperatorUser[] = profileRows
    .filter((profile) => !invitationUsers.some((user) => user.email.toLowerCase() === profile.email.toLowerCase()))
    .map((profile) => ({
      id: profile.id,
      profileId: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      username: profile.username,
      status: profile.status === "blocked" ? "Bloqueado" : "Registrado"
    }));
  return [...generalRegistrations, ...mergedInvitations];
}

export async function saveOperatorUser(user: OperatorUser) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return;

  if (user.profileId) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: user.fullName, email: user.email, username: user.username })
      .eq("id", user.profileId);
    if (profileError) throw profileError;
  }

  const payload = {
    id: user.id.startsWith("OPUSER-") || user.id.startsWith("OP-") ? undefined : user.id,
    full_name: user.fullName,
    email: user.email,
    username: user.username,
    status: user.status === "Bloqueado" ? "blocked" : user.status === "Registrado" ? "registered" : "active"
  };

  const { error } = user.profileId && user.id === user.profileId
    ? { error: null }
    : payload.id
    ? await supabase.from("operator_invitations").update(payload).eq("id", payload.id)
    : await supabase.from("operator_invitations").insert(payload);
  if (error) throw error;
}

export async function setOperatorUserStatus(user: OperatorUser, status: OperatorUser["status"]) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return;
  if (user.profileId) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: status === "Bloqueado" ? "blocked" : "active" })
      .eq("id", user.profileId);
    if (error) throw error;
  }
  if (user.id !== user.profileId) {
    const { error } = await supabase
      .from("operator_invitations")
      .update({ status: status === "Bloqueado" ? "blocked" : status === "Registrado" ? "registered" : "active" })
      .eq("id", user.id);
    if (error) throw error;
  }
}

export async function removeOperatorUser(user: OperatorUser) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sesion de staff no encontrada.");

  const response = await fetch("/api/staff/operators", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      action: "delete",
      email: user.email,
      username: user.username
    })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "No fue posible eliminar el operador.");
}
