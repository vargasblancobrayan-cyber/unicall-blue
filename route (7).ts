import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isPrimaryStaffIdentity } from "@/lib/primary-staff";

type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

const ignoredCodes = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanUsername(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

async function getStaffAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey) return { response: json(500, { error: "Supabase no esta configurado." }) };
  if (!serviceRoleKey) return { response: json(500, { error: "Falta la clave privada para administrar staff." }) };

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: json(401, { error: "Sesion de staff no encontrada." }) };

  const userClient = createClient(url, publishableKey);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { response: json(401, { error: "Sesion no valida." }) };

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, username, role, status")
    .eq("id", authData.user.id)
    .single();

  if (!profile || profile.role !== "staff" || profile.status !== "active") {
    return { response: json(403, { error: "Solo staff activo puede administrar staff." }) };
  }

  if (!isPrimaryStaffIdentity(profile)) {
    return { response: json(403, { error: "Solo el usuario principal puede administrar usuarios staff." }) };
  }

  return { admin, currentUserId: authData.user.id };
}

async function runDelete(admin: SupabaseAdminClient, table: string, column: string, value: string) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error && !ignoredCodes.has(error.code || "")) throw error;
}

async function runUpdate(
  admin: SupabaseAdminClient,
  table: string,
  payload: Record<string, unknown>,
  column: string,
  value: string
) {
  const { error } = await admin.from(table).update(payload).eq(column, value);
  if (error && !ignoredCodes.has(error.code || "")) throw error;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    action?: "create" | "update" | "status" | "delete" | "reset-password";
    id?: string;
    fullName?: string;
    email?: string;
    username?: string;
    password?: string;
    status?: "active" | "blocked";
  } | null;

  const staff = await getStaffAdmin(request);
  if (staff.response) return staff.response;
  const admin = staff.admin;

  if (body?.action === "create") {
    const fullName = body.fullName?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const username = cleanUsername(body.username || "");
    const password = body.password || "";

    if (!fullName || !email || !username || password.length < 8) {
      return json(400, { error: "Completa nombre, correo, usuario y una contrasena de minimo 8 caracteres." });
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();

    if (existingProfile) {
      return json(409, { error: "Ese correo o usuario ya existe." });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName }
    });

    if (createError || !created.user) {
      return json(400, { error: createError?.message || "No fue posible crear el staff." });
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: created.user.id,
        username,
        full_name: fullName,
        email,
        role: "staff",
        status: "active",
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(400, { error: profileError.message });
    }

    return json(200, { ok: true });
  }

  if (body?.action === "update") {
    const id = body.id || "";
    const fullName = body.fullName?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const username = cleanUsername(body.username || "");

    if (!id || !fullName || !email || !username) {
      return json(400, { error: "Completa nombre, correo y usuario." });
    }

    const { data: duplicate } = await admin
      .from("profiles")
      .select("id")
      .or(`email.eq.${email},username.eq.${username}`)
      .neq("id", id)
      .maybeSingle();

    if (duplicate) {
      return json(409, { error: "Ese correo o usuario ya existe en otra cuenta." });
    }

    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      email,
      user_metadata: { username, full_name: fullName }
    });
    if (authError) return json(400, { error: authError.message });

    const { error } = await admin
      .from("profiles")
      .update({ full_name: fullName, email, username, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("role", "staff");

    if (error) return json(400, { error: error.message });
    return json(200, { ok: true });
  }

  if (body?.action === "status") {
    const id = body.id || "";
    if (!id) return json(400, { error: "Falta el staff." });
    if (id === staff.currentUserId && body.status === "blocked") {
      return json(400, { error: "No puedes bloquear tu propio usuario mientras estas conectado." });
    }

    const { error } = await admin
      .from("profiles")
      .update({ status: body.status === "blocked" ? "blocked" : "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("role", "staff");

    if (error) return json(400, { error: error.message });
    return json(200, { ok: true });
  }

  if (body?.action === "reset-password") {
    const id = body.id || "";
    const password = body.password || "";
    if (!id || password.length < 8) {
      return json(400, { error: "Falta el staff o la contrasena temporal debe tener minimo 8 caracteres." });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, role, status")
      .eq("id", id)
      .eq("role", "staff")
      .maybeSingle();

    if (profileError) return json(400, { error: profileError.message });
    if (!profile) return json(404, { error: "No encontramos ese usuario staff." });
    if (profile.status === "blocked") return json(400, { error: "El staff esta bloqueado. Activarlo antes de cambiar la contrasena." });

    const { error } = await admin.auth.admin.updateUserById(id, {
      password,
      email_confirm: true
    });

    if (error) return json(400, { error: error.message });
    return json(200, { ok: true });
  }

  if (body?.action === "delete") {
    const id = body.id || "";
    if (!id) return json(400, { error: "Falta el staff." });
    if (id === staff.currentUserId) return json(400, { error: "No puedes eliminar tu propio usuario conectado." });

    try {
      await runDelete(admin, "notifications", "recipient_id", id);
      await runUpdate(admin, "operator_performance", { updated_by: null }, "updated_by", id);
      await runUpdate(admin, "commercial_records", { reviewed_by: null }, "reviewed_by", id);
      await runUpdate(admin, "operator_invitations", { created_by: null }, "created_by", id);
      await runUpdate(admin, "audit_logs", { actor_id: null }, "actor_id", id);

      const { error: authError } = await admin.auth.admin.deleteUser(id);
      if (authError && !authError.message.toLowerCase().includes("not found")) {
        return json(400, { error: authError.message });
      }
      await runDelete(admin, "profiles", "id", id);
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "No fue posible eliminar el staff." });
    }

    return json(200, { ok: true });
  }

  return json(400, { error: "Accion no valida." });
}
