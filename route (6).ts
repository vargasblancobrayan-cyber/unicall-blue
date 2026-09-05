import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanUsername(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

const ignoredSupabaseDeleteCodes = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

async function getStaffAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey) {
    return { response: json(500, { error: "Supabase no esta configurado." }) };
  }

  if (!serviceRoleKey) {
    return {
      response: json(500, {
        code: "missing_service_role",
        error: "Falta SUPABASE_SERVICE_ROLE_KEY para administrar operadores."
      })
    };
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
    return { response: json(403, { error: "Solo staff activo puede administrar operadores." }) };
  }

  return { admin };
}

async function deleteOperator(admin: SupabaseAdminClient, body: { email?: string; username?: string } | null) {
  const email = body?.email?.trim().toLowerCase() || "";
  const username = cleanUsername(body?.username || "");
  if (!email && !username) return json(400, { error: "Falta correo o usuario del operador." });

  let targetProfile: { id: string; email: string; username: string; role: string } | null = null;
  if (email) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, username, role")
      .eq("role", "operator")
      .eq("email", email)
      .maybeSingle();
    if (error) return json(400, { error: error.message });
    targetProfile = data;
  }
  if (!targetProfile && username) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, username, role")
      .eq("role", "operator")
      .eq("username", username)
      .maybeSingle();
    if (error) return json(400, { error: error.message });
    targetProfile = data;
  }

  async function runDelete(table: string, column: string, value: string) {
    const { error } = await admin.from(table).delete().eq(column, value);
    if (error && !ignoredSupabaseDeleteCodes.has(error.code || "")) throw error;
  }

  async function runUpdate(table: string, payload: Record<string, unknown>, column: string, value: string) {
    const { error } = await admin.from(table).update(payload).eq(column, value);
    if (error && !ignoredSupabaseDeleteCodes.has(error.code || "")) throw error;
  }

  try {
    if (targetProfile?.id) {
      const operatorId = targetProfile.id;
      await runDelete("notifications", "recipient_id", operatorId);
      await runDelete("operator_device_sessions", "operator_id", operatorId);
      await runUpdate("operator_performance", { updated_by: null }, "updated_by", operatorId);
      await runDelete("operator_performance", "operator_id", operatorId);
      await runDelete("failure_records", "operator_id", operatorId);
      await runDelete("certificate_requests", "operator_id", operatorId);
      await runDelete("break_schedules", "operator_id", operatorId);
      await runDelete("shift_assignments", "operator_id", operatorId);
      await runDelete("shift_records", "operator_id", operatorId);
      await runUpdate("commercial_records", { reviewed_by: null }, "reviewed_by", operatorId);
      await runDelete("commercial_records", "operator_id", operatorId);
      await runDelete("audit_logs", "actor_id", operatorId);
      await runUpdate("operator_invitations", { created_by: null }, "created_by", operatorId);

      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(operatorId);
      if (deleteAuthError && !deleteAuthError.message.toLowerCase().includes("not found")) {
        return json(400, { error: deleteAuthError.message });
      }
      await runDelete("profiles", "id", operatorId);
    }

    if (email) {
      const { error } = await admin.from("operator_invitations").delete().eq("email", email);
      if (error && !ignoredSupabaseDeleteCodes.has(error.code || "")) return json(400, { error: error.message });
    }
    if (username) {
      const { error } = await admin.from("operator_invitations").delete().eq("username", username);
      if (error && !ignoredSupabaseDeleteCodes.has(error.code || "")) return json(400, { error: error.message });
    }
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "No fue posible eliminar el operador." });
  }

  return json(200, { ok: true });
}

async function resetOperatorPassword(admin: SupabaseAdminClient, body: { email?: string; username?: string; password?: string } | null) {
  const email = body?.email?.trim().toLowerCase() || "";
  const username = cleanUsername(body?.username || "");
  const password = body?.password || "";
  if ((!email && !username) || password.length < 8) {
    return json(400, { error: "Falta operador o la contrasena temporal debe tener minimo 8 caracteres." });
  }

  let query = admin
    .from("profiles")
    .select("id, email, username, role, status")
    .eq("role", "operator");

  if (email) query = query.eq("email", email);
  else query = query.eq("username", username);

  const { data: profile, error } = await query.maybeSingle();
  if (error) return json(400, { error: error.message });
  if (!profile?.id) return json(404, { error: "No encontramos una cuenta registrada para ese operador." });
  if (profile.status === "blocked") return json(400, { error: "El operador esta bloqueado. Desbloquealo antes de cambiar la contrasena." });

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password,
    email_confirm: true
  });

  if (updateError) return json(400, { error: updateError.message });

  return json(200, {
    ok: true,
    email: profile.email,
    username: profile.username
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    action?: string;
    fullName?: string;
    email?: string;
    username?: string;
    password?: string;
  } | null;

  const staff = await getStaffAdmin(request);
  if (staff.response) return staff.response;
  const admin = staff.admin;

  if (body?.action === "delete") {
    return deleteOperator(admin, body);
  }

  if (body?.action === "reset-password") {
    return resetOperatorPassword(admin, body);
  }

  const fullName = body?.fullName?.trim() || "";
  const email = body?.email?.trim().toLowerCase() || "";
  const username = cleanUsername(body?.username || "");
  const password = body?.password || "";

  if (!fullName || !email || !username || password.length < 8) {
    return json(400, { error: "Completa nombre, correo, usuario y una contrasena de minimo 8 caracteres." });
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, email, username, status")
    .or(`email.eq.${email},username.eq.${username}`)
    .maybeSingle();

  if (existingProfile) {
    return json(409, { error: "Ese correo o usuario ya existe. Usa recuperar acceso o edita el operador existente." });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName }
  });

  if (createError || !created.user) {
    return json(400, { error: createError?.message || "No fue posible crear el acceso." });
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

  await admin
    .from("operator_invitations")
    .delete()
    .or(`email.eq.${email},username.eq.${username}`);

  return json(200, {
    id: created.user.id,
    fullName,
    email,
    username,
    status: "Registrado"
  });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    email?: string;
    username?: string;
  } | null;

  const staff = await getStaffAdmin(request);
  if (staff.response) return staff.response;
  return deleteOperator(staff.admin, body);
}
