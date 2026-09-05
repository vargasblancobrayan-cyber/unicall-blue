import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const maxCertificateUploadBytes = 1024 * 1024;
const heavyFileMessage = "Archivo muy pesado, intenta otro pantallazo.";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function getStaffAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    return { response: json(500, { error: "Falta configuracion privada para subir certificados." }) };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { response: json(401, { error: "Sesion de staff no encontrada." }) };

  const userClient = createClient(url, publishableKey);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { response: json(401, { error: "Sesion no valida." }) };

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: staffProfile } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", authData.user.id)
    .single();

  if (!staffProfile || staffProfile.role !== "staff" || staffProfile.status !== "active") {
    return { response: json(403, { error: "Solo staff activo puede entregar certificados." }) };
  }

  return { admin };
}

export async function POST(request: NextRequest) {
  const staff = await getStaffAdmin(request);
  if (staff.response) return staff.response;
  const admin = staff.admin;

  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") || "");
  const note = String(form?.get("staffNote") || "");
  const file = form?.get("file");
  if (!id || !(file instanceof File)) return json(400, { error: "Falta solicitud o documento." });
  if (file.size > maxCertificateUploadBytes) return json(413, { error: heavyFileMessage });

  const { data: certificate, error: certificateError } = await admin
    .from("certificate_requests")
    .select("id, operator_id, certificate_type")
    .eq("id", id)
    .single();
  if (certificateError || !certificate) return json(404, { error: "Solicitud no encontrada." });

  const bucketName = "certificate-documents";
  const bucket = await admin.storage.getBucket(bucketName);
  if (bucket.error) {
    const { error: createBucketError } = await admin.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: maxCertificateUploadBytes
    });
    if (createBucketError) return json(400, { error: createBucketError.message });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${certificate.operator_id}/${certificate.id}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(bucketName)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (uploadError) return json(400, { error: uploadError.message });

  const { error: updateError } = await admin
    .from("certificate_requests")
    .update({
      document_path: path,
      status: "Listo",
      staff_note: note,
      hidden_from_staff: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", certificate.id);
  if (updateError) return json(400, { error: updateError.message });

  await admin.from("notifications").insert({
    recipient_id: certificate.operator_id,
    title: "Certificado enviado",
    message: `Staff envio tu ${certificate.certificate_type}. Ya puedes descargarlo en Certificados.`
  });

  return json(200, { ok: true, path, fileName: safeName });
}
