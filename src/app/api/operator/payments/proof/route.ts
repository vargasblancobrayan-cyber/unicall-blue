import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const maxPaymentProofBytes = 1024 * 1024;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function getOperatorAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    return { response: json(500, { error: "Falta configuracion privada para subir pruebas." }) };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { response: json(401, { error: "Sesion no encontrada." }) };

  const userClient = createClient(url, publishableKey);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { response: json(401, { error: "Sesion no valida." }) };

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", authData.user.id)
    .single();

  if (!profile || profile.role !== "operator" || profile.status !== "active") {
    return { response: json(403, { error: "Solo operadores activos pueden subir pruebas." }) };
  }

  return { admin, userId: authData.user.id };
}

export async function POST(request: NextRequest) {
  const auth = await getOperatorAdmin(request);
  if (auth.response) return auth.response;
  const admin = auth.admin;

  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") || "");
  const file = form?.get("file");
  if (!id || !(file instanceof File)) return json(400, { error: "Falta caso o prueba." });
  if (file.size > maxPaymentProofBytes) return json(413, { error: "Archivo muy pesado, intenta otro pantallazo." });

  const { data: issue, error: issueError } = await admin
    .from("payment_issues")
    .select("id, operator_id")
    .eq("id", id)
    .eq("operator_id", auth.userId)
    .single();
  if (issueError || !issue) return json(404, { error: "Novedad no encontrada." });

  const bucketName = "payment-proofs";
  const bucket = await admin.storage.getBucket(bucketName);
  if (bucket.error) {
    const { error: createError } = await admin.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: maxPaymentProofBytes
    });
    if (createError) return json(400, { error: createError.message });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${auth.userId}/${id}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin
    .storage
    .from(bucketName)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (uploadError) return json(400, { error: uploadError.message });

  const { error: updateError } = await admin
    .from("payment_issues")
    .update({
      proof_path: path,
      proof_name: safeName,
      proof_type: file.type || "application/octet-stream",
      proof_size: file.size,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);
  if (updateError) return json(400, { error: updateError.message });

  return json(200, { ok: true, path, fileName: safeName });
}
