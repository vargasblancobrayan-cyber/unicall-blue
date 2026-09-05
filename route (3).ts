import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    return json(500, { error: "Falta configuracion privada para abrir pruebas." });
  }

  const issueId = request.nextUrl.searchParams.get("id") || "";
  if (!issueId) return json(400, { error: "Falta caso." });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sesion no encontrada." });

  const userClient = createClient(url, publishableKey);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Sesion no valida." });

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", authData.user.id)
    .single();
  if (!profile || profile.status !== "active") return json(403, { error: "Usuario no activo." });

  const { data: issue, error: issueError } = await admin
    .from("payment_issues")
    .select("id, operator_id, proof_path")
    .eq("id", issueId)
    .single();
  if (issueError || !issue) return json(404, { error: "Novedad no encontrada." });
  if (!issue.proof_path) return json(404, { error: "Esta novedad no tiene prueba." });

  const canOpen = profile.role === "staff" || issue.operator_id === authData.user.id;
  if (!canOpen) return json(403, { error: "No puedes abrir esta prueba." });

  const { data, error } = await admin.storage.from("payment-proofs").createSignedUrl(issue.proof_path, 600);
  if (error || !data?.signedUrl) return json(400, { error: error?.message || "No fue posible abrir la prueba." });
  return json(200, { url: data.signedUrl });
}
