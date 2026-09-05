import { CurrentProfile } from "@/lib/cloud-shifts";
import { CertificateRequest, readStoredCertificateRequests, writeStoredCertificateRequests } from "@/lib/records";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type CertificateRow = {
  id: string;
  operator_id: string;
  certificate_type: string;
  reason: string;
  status: CertificateRequest["status"];
  staff_note: string | null;
  document_path: string | null;
  hidden_from_staff: boolean;
  created_at: string;
  updated_at: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fileNameFromPath(path: string | null) {
  if (!path) return undefined;
  return path.split("/").pop()?.replace(/^\d+-/, "");
}

async function signedDocumentUrl(path: string | null) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !path) return undefined;
  const { data } = await supabase.storage.from("certificate-documents").createSignedUrl(path, 3600);
  return data?.signedUrl;
}

function fromCloud(row: CertificateRow, operator: string): CertificateRequest {
  return {
    id: row.id,
    operatorId: row.operator_id,
    operator,
    certificateType: row.certificate_type,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    staffNote: row.staff_note || "",
    documentName: fileNameFromPath(row.document_path),
    documentPath: row.document_path || undefined,
    hiddenFromStaff: row.hidden_from_staff
  };
}

export async function loadCertificateRequests(profile: CurrentProfile | null) {
  const local = readStoredCertificateRequests();
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !profile) return local;

  let query = supabase
    .from("certificate_requests")
    .select("id, operator_id, certificate_type, reason, status, staff_note, document_path, hidden_from_staff, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (profile.role === "operator") query = query.eq("operator_id", profile.id);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as CertificateRow[];
  const names = new Map<string, string>();
  if (profile.role === "staff" && rows.length) {
    const ids = Array.from(new Set(rows.map((row) => row.operator_id)));
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, username").in("id", ids);
    ((profiles || []) as Array<{ id: string; full_name: string; username: string }>).forEach((item) =>
      names.set(item.id, `${item.full_name} · ${item.username}`)
    );
  }
  const requests = rows.map((row) => fromCloud(row, profile.role === "operator" ? profile.fullName : names.get(row.operator_id) || "Operador"));
  writeStoredCertificateRequests(requests);
  return requests;
}

export async function createCertificateRequest(profile: CurrentProfile, certificateType: string, reason: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) throw new Error("Base central no disponible");
  const { data, error } = await supabase
    .from("certificate_requests")
    .insert({ operator_id: profile.id, certificate_type: certificateType, reason, status: "Solicitado" })
    .select("id, operator_id, certificate_type, reason, status, staff_note, document_path, hidden_from_staff, created_at, updated_at")
    .single();
  if (error) throw error;
  return fromCloud(data as CertificateRow, profile.fullName);
}

export async function getCertificateDocumentUrl(request: CertificateRequest) {
  if (request.documentDataUrl) return request.documentDataUrl;
  return signedDocumentUrl(request.documentPath || null);
}

export async function updateCloudCertificateRequest(id: string, changes: Partial<Pick<CertificateRequest, "status" | "staffNote" | "hiddenFromStaff">>) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !isUuid(id)) return;
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.status !== undefined) payload.status = changes.status;
  if (changes.staffNote !== undefined) payload.staff_note = changes.staffNote;
  if (changes.hiddenFromStaff !== undefined) payload.hidden_from_staff = changes.hiddenFromStaff;
  const { error } = await supabase.from("certificate_requests").update(payload).eq("id", id);
  if (error) throw error;
}

export async function uploadCloudCertificateDocument(request: CertificateRequest, file: File) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !request.operatorId || !isUuid(request.id)) throw new Error("Solicitud no sincronizada");
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (accessToken) {
    const formData = new FormData();
    formData.append("id", request.id);
    formData.append("staffNote", request.staffNote || "");
    formData.append("file", file);
    const response = await fetch("/api/staff/certificates/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(result?.error || "No fue posible subir el documento.");
    return;
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${request.operatorId}/${request.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("certificate-documents").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("certificate_requests").update({ document_path: path, status: "Listo", updated_at: new Date().toISOString() }).eq("id", request.id);
  if (error) throw error;
}

export async function deleteCloudCertificateRequest(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !isUuid(id)) return;
  const { error } = await supabase.from("certificate_requests").delete().eq("id", id);
  if (error) throw error;
}

export async function notifyStaffAboutOverdueCertificates(requests: CertificateRequest[]) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];
  const overdue = requests.filter((request) =>
    ["Solicitado", "En proceso"].includes(request.status) &&
    Date.now() - new Date(request.createdAt).getTime() >= 3 * 86400000
  );
  if (!overdue.length) return [];

  const { data: staffRows, error: staffError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "staff")
    .eq("status", "active");
  if (staffError) throw staffError;
  const staffIds = ((staffRows || []) as Array<{ id: string }>).map((row) => row.id);
  if (!staffIds.length) return [];

  const today = new Date().toISOString().slice(0, 10);
  const created: string[] = [];
  for (const request of overdue) {
    const title = "Certificado pendiente mas de 3 dias";
    const message = `${request.operator} espera gestion de ${request.certificateType}. Solicitud ${request.id.slice(0, 8)} creada el ${new Date(request.createdAt).toLocaleDateString("es-CO")}.`;
    const { data: existing, error: existingError } = await supabase
      .from("notifications")
      .select("id")
      .eq("title", title)
      .ilike("message", `%${request.id.slice(0, 8)}%`)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length) continue;

    const { error: insertError } = await supabase.from("notifications").insert(
      staffIds.map((recipientId) => ({
        recipient_id: recipientId,
        title,
        message
      }))
    );
    if (insertError) throw insertError;
    created.push(message);
  }
  return created;
}
