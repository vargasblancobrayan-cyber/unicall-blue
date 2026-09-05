import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanUsername(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) return json(500, { error: "Supabase no esta configurado." });
  if (!serviceRoleKey) {
    return json(500, {
      code: "missing_service_role",
      error: "Falta SUPABASE_SERVICE_ROLE_KEY para crear cuentas sin depender del correo de confirmacion."
    });
  }

  const body = await request.json().catch(() => null) as {
    fullName?: string;
    email?: string;
    username?: string;
    password?: string;
    token?: string;
  } | null;

  const fullName = body?.fullName?.trim() || "";
  const email = body?.email?.trim().toLowerCase() || "";
  const username = cleanUsername(body?.username || "");
  const password = body?.password || "";
  const token = body?.token?.trim() || "";

  if (!fullName || !email || !username || password.length < 8) {
    return json(400, { error: "Completa usuario, nombre, correo y una contrasena de minimo 8 caracteres." });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (token) {
    const { data: invitation, error: invitationError } = await admin
      .from("operator_invitations")
      .select("id, email, username, status")
      .eq("token", token)
      .maybeSingle();

    if (invitationError) return json(400, { error: invitationError.message });
    if (!invitation) return json(404, { error: "El enlace de registro no existe o fue reemplazado por Staff." });
    if (invitation.status === "blocked") return json(403, { error: "Este usuario esta bloqueado. Comunicate con tu supervisor." });
    if (invitation.email.toLowerCase() !== email || cleanUsername(invitation.username) !== username) {
      return json(409, { error: "El correo o usuario no coincide con el enlace asignado por Staff." });
    }
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, email, username, status")
    .or(`email.eq.${email},username.eq.${username}`)
    .maybeSingle();

  if (existingProfile) {
    return json(409, { error: "Ese correo o usuario ya tiene cuenta. Entra al inicio de sesion o usa recuperar contrasena." });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName }
  });

  if (createError || !created.user) {
    return json(400, { error: createError?.message || "No fue posible crear la cuenta en Supabase." });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: created.user.id,
      username,
      full_name: fullName,
      email,
      role: "operator",
      status: "active",
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json(400, { error: profileError.message });
  }

  if (token) {
    await admin
      .from("operator_invitations")
      .update({ status: "registered" })
      .eq("token", token);
  } else {
    await admin
      .from("operator_invitations")
      .delete()
      .or(`email.eq.${email},username.eq.${username}`);
  }

  return json(200, {
    id: created.user.id,
    email,
    username,
    fullName,
    status: "active"
  });
}
