import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function DELETE(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) return json(500, { error: "Supabase no esta configurado." });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sesion no encontrada." });

  const userClient = createClient(url, publishableKey);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Sesion no valida." });

  const body = await request.json().catch(() => null) as { id?: string; allRead?: boolean } | null;
  if (!body?.id && !body?.allRead) return json(400, { error: "Selecciona el aviso que deseas borrar." });

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let query = admin.from("notifications").delete().eq("recipient_id", authData.user.id).not("read_at", "is", null);
  if (body.id) query = query.eq("id", body.id);
  const { error } = await query;
  if (error) return json(400, { error: error.message });
  return json(200, { ok: true });
}
