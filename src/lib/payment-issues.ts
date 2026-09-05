import { CurrentProfile } from "@/lib/cloud-shifts";
import { clearClientCache } from "@/lib/client-cache";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const paymentIssueTypes = [
  "No llego el pago",
  "Pago incompleto",
  "Comision/bono faltante",
  "Horas no reconocidas",
  "Descuento no entendido",
  "Otro"
] as const;

export const paymentStatuses = ["Enviado", "En revision", "Falta prueba", "Resuelto", "No procede", "Cerrado"] as const;

export type PaymentIssueStatus = (typeof paymentStatuses)[number];
export type PaymentIssueType = (typeof paymentIssueTypes)[number];

export type PaymentIssue = {
  id: string;
  operatorId: string;
  operatorName: string;
  username: string;
  email?: string;
  periodType: "quincena" | "mes";
  periodValue: string;
  issueType: PaymentIssueType | string;
  expectedAmount?: number | null;
  receivedAmount?: number | null;
  comment: string;
  proofPath?: string | null;
  proofName?: string | null;
  proofType?: string | null;
  proofSize?: number | null;
  status: PaymentIssueStatus;
  staffNote?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
};

type PaymentIssueRow = {
  id: string;
  operator_id: string;
  period_type: "quincena" | "mes";
  period_value: string;
  issue_type: string;
  expected_amount: number | null;
  received_amount: number | null;
  comment: string;
  proof_path: string | null;
  proof_name: string | null;
  proof_type: string | null;
  proof_size: number | null;
  status: PaymentIssueStatus;
  staff_note: string | null;
  staff_id: string | null;
  staff_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

const maxProofBytes = 1024 * 1024;

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNumber - 1, 1));
  const to = new Date(Date.UTC(year, monthNumber, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function isPaymentTableMissing(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() || "";
  return error?.code === "42P01" || message.includes("payment_issues") || message.includes("does not exist");
}

function toIssue(row: PaymentIssueRow, operator?: { full_name: string; username: string; email?: string | null }): PaymentIssue {
  return {
    id: row.id,
    operatorId: row.operator_id,
    operatorName: operator?.full_name || "Operador",
    username: operator?.username || "",
    email: operator?.email || undefined,
    periodType: row.period_type,
    periodValue: row.period_value,
    issueType: row.issue_type,
    expectedAmount: row.expected_amount,
    receivedAmount: row.received_amount,
    comment: row.comment,
    proofPath: row.proof_path,
    proofName: row.proof_name,
    proofType: row.proof_type,
    proofSize: row.proof_size,
    status: row.status,
    staffNote: row.staff_note,
    staffId: row.staff_id,
    staffName: row.staff_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at
  };
}

async function authToken() {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export function displayPaymentStatus(status: PaymentIssueStatus) {
  if (status === "En revision") return "En revisión";
  return status;
}

export async function compressPaymentProof(file: File) {
  if (!file.type.startsWith("image/")) {
    if (file.size > maxProofBytes) throw new Error("Archivo muy pesado, intenta otro pantallazo.");
    return file;
  }
  if (file.size <= 800 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No fue posible comprimir la prueba.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.68));
  if (!blob) throw new Error("No fue posible comprimir la prueba.");
  if (blob.size > maxProofBytes) throw new Error("Archivo muy pesado, intenta otro pantallazo.");
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

export async function loadPaymentIssues(profile: CurrentProfile | null, month: string): Promise<PaymentIssue[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !profile) return [];
  const { from, to } = monthRange(month);
  let query = supabase
    .from("payment_issues")
    .select("id, operator_id, period_type, period_value, issue_type, expected_amount, received_amount, comment, proof_path, proof_name, proof_type, proof_size, status, staff_note, staff_id, staff_name, created_at, updated_at, resolved_at, closed_at")
    .gte("created_at", from)
    .lt("created_at", to)
    .order("updated_at", { ascending: false });

  if (profile.role === "operator") query = query.eq("operator_id", profile.id);

  const { data, error } = await query;
  if (error) {
    if (isPaymentTableMissing(error)) throw new Error("Falta ejecutar la migracion 014 de pagos en Supabase.");
    throw error;
  }

  const rows = (data || []) as PaymentIssueRow[];
  if (!rows.length) return [];
  const profileIds = Array.from(new Set(rows.map((row) => row.operator_id)));
  const profiles = new Map<string, { full_name: string; username: string; email?: string | null }>();
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, username, email")
    .in("id", profileIds);
  ((profileRows || []) as Array<{ id: string; full_name: string; username: string; email?: string | null }>).forEach((item) =>
    profiles.set(item.id, item)
  );
  return rows.map((row) => toIssue(row, profiles.get(row.operator_id)));
}

export async function createPaymentIssue(
  profile: CurrentProfile,
  payload: {
    periodType: "quincena" | "mes";
    periodValue: string;
    issueType: string;
    expectedAmount?: string;
    receivedAmount?: string;
    comment: string;
  }
) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) throw new Error("Base central no disponible.");

  const { data, error } = await supabase
    .from("payment_issues")
    .insert({
      operator_id: profile.id,
      period_type: payload.periodType,
      period_value: payload.periodValue,
      issue_type: payload.issueType,
      expected_amount: payload.expectedAmount ? Number(payload.expectedAmount) : null,
      received_amount: payload.receivedAmount ? Number(payload.receivedAmount) : null,
      comment: payload.comment.trim(),
      status: "Enviado"
    })
    .select("id, operator_id, period_type, period_value, issue_type, expected_amount, received_amount, comment, proof_path, proof_name, proof_type, proof_size, status, staff_note, staff_id, staff_name, created_at, updated_at, resolved_at, closed_at")
    .single();
  if (error) {
    if (isPaymentTableMissing(error)) throw new Error("Falta ejecutar la migracion 014 de pagos en Supabase.");
    throw error;
  }

  const { data: staffRows } = await supabase.from("profiles").select("id").eq("role", "staff").eq("status", "active");
  const staffIds = ((staffRows || []) as Array<{ id: string }>).map((row) => row.id);
  if (staffIds.length) {
    await supabase.from("notifications").insert(
      staffIds.map((recipientId) => ({
        recipient_id: recipientId,
        title: "Nueva novedad de pago",
        message: `${profile.fullName} - ${profile.username} reporto ${payload.issueType} para ${payload.periodValue}.`
      }))
    );
  }
  clearClientCache("unicall-blue:notifications:");
  return toIssue(data as PaymentIssueRow, { full_name: profile.fullName, username: profile.username, email: profile.email });
}

export async function uploadPaymentProof(issueId: string, file: File) {
  const token = await authToken();
  if (!token) throw new Error("Sesion no encontrada.");
  const form = new FormData();
  form.append("id", issueId);
  form.append("file", file);
  const response = await fetch("/api/operator/payments/proof", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "No fue posible subir la prueba.");
}

export async function getPaymentProofUrl(issueId: string) {
  const token = await authToken();
  if (!token) throw new Error("Sesion no encontrada.");
  const response = await fetch(`/api/payments/proof-url?id=${encodeURIComponent(issueId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!response.ok || !payload?.url) throw new Error(payload?.error || "No fue posible abrir la prueba.");
  return payload.url;
}

export async function updatePaymentIssue(issue: PaymentIssue, profile: CurrentProfile, changes: { status: PaymentIssueStatus; staffNote?: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) throw new Error("Base central no disponible.");
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: changes.status,
    staff_note: changes.staffNote || issue.staffNote || "",
    staff_id: profile.id,
    staff_name: profile.username || profile.fullName,
    updated_by: profile.id,
    updated_at: now
  };
  if (["Resuelto", "No procede"].includes(changes.status)) payload.resolved_at = now;
  if (changes.status === "Cerrado") payload.closed_at = now;

  const { error } = await supabase.from("payment_issues").update(payload).eq("id", issue.id);
  if (error) throw error;

  if (["Falta prueba", "Resuelto", "No procede"].includes(changes.status)) {
    const title =
      changes.status === "Falta prueba"
        ? "Pago requiere mas prueba"
        : changes.status === "Resuelto"
          ? "Novedad de pago resuelta"
          : "Novedad de pago no procede";
    await supabase.from("notifications").insert({
      recipient_id: issue.operatorId,
      title,
      message: `${displayPaymentStatus(changes.status)}: ${changes.staffNote || "Revisa la respuesta de Staff en Pagos."}`
    });
  }
  clearClientCache("unicall-blue:notifications:");
}

export async function deletePaymentIssue(issueId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) throw new Error("Base central no disponible.");
  const { error } = await supabase.from("payment_issues").delete().eq("id", issueId);
  if (error) throw error;
}
