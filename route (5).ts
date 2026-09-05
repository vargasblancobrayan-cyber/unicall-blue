import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isUsefulNotification, notificationCategory, usefulNotificationTitleFilter } from "@/lib/notification-policy";
import { staffNotificationLimit } from "@/lib/usage-controls";

type AdminClient = ReturnType<typeof createClient<any>>;
type WorkStatus = "Nueva" | "En gestion" | "Resuelta";

type NotificationRow = {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type AuditRow = {
  action: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function getStaffAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    return { response: json(500, { error: "Supabase no esta configurado para la bandeja compartida." }) };
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: json(401, { error: "Sesion de Staff no encontrada." }) };

  const userClient = createClient(url, publishableKey);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { response: json(401, { error: "Sesion no valida." }) };

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, username, role, status")
    .eq("id", authData.user.id)
    .single();
  if (!profile || profile.role !== "staff" || profile.status !== "active") {
    return { response: json(403, { error: "Solo Staff o apoyos activos pueden gestionar avisos." }) };
  }
  return {
    admin,
    actor: {
      id: profile.id as string,
      name: (profile.full_name || profile.username || "Staff") as string
    }
  };
}

function workflowKey(row: Pick<NotificationRow, "title" | "message" | "created_at">) {
  return createHash("sha256")
    .update(`${row.title}\u0000${row.message}\u0000${row.created_at}`)
    .digest("hex")
    .slice(0, 40);
}

function categoryFor(title: string, message: string) {
  return notificationCategory(title, message) || "Otros";
}

function statusFromAction(action?: string): WorkStatus | null {
  if (action === "notification_claimed") return "En gestion";
  if (action === "notification_resolved") return "Resuelta";
  if (action === "notification_reopened") return "Nueva";
  if (action === "notification_deleted") return "Resuelta";
  return null;
}

export async function GET(request: NextRequest) {
  const staff = await getStaffAdmin(request);
  if (staff.response) return staff.response;
  const admin = staff.admin as AdminClient;
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || "80");
  const limit = staffNotificationLimit(requestedLimit);

  const { data: staffProfiles, error: staffError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "staff")
    .eq("status", "active");
  if (staffError) return json(400, { error: staffError.message });
  const staffIds = ((staffProfiles || []) as Array<{ id: string }>).map((item) => item.id);
  if (!staffIds.length) return json(200, { items: [] });

  const { data: notificationData, error: notificationError } = await admin
    .from("notifications")
    .select("id, recipient_id, title, message, read_at, created_at")
    .in("recipient_id", staffIds)
    .or(usefulNotificationTitleFilter)
    .order("created_at", { ascending: false })
    .limit(limit * Math.max(2, staffIds.length));
  if (notificationError) return json(400, { error: notificationError.message });

  const groups = new Map<string, NotificationRow[]>();
  for (const row of ((notificationData || []) as NotificationRow[]).filter((item) => isUsefulNotification(item.title, item.message))) {
    const key = workflowKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const keys = [...groups.keys()];
  let audits: AuditRow[] = [];
  if (keys.length) {
    const { data, error } = await admin
      .from("audit_logs")
      .select("action, entity_id, details, created_at")
      .eq("entity_type", "notification_workflow")
      .in("entity_id", keys)
      .order("created_at", { ascending: false });
    if (error) return json(400, { error: error.message });
    audits = (data || []) as AuditRow[];
  }

  const latestAudit = new Map<string, AuditRow>();
  audits.forEach((audit) => {
    if (audit.entity_id && !latestAudit.has(audit.entity_id)) latestAudit.set(audit.entity_id, audit);
  });

  const items = [...groups.entries()].slice(0, limit).map(([key, rows]) => {
    const row = rows[0];
    const audit = latestAudit.get(key);
    const inferredStatus: WorkStatus = rows.every((item) => item.read_at) ? "Resuelta" : "Nueva";
    const status = statusFromAction(audit?.action) || inferredStatus;
    return {
      id: row.id,
      notificationIds: rows.map((item) => item.id),
      workflowKey: key,
      title: row.title,
      message: row.message,
      category: categoryFor(row.title, row.message),
      workStatus: status,
      handledBy: typeof audit?.details?.handledBy === "string" ? audit.details.handledBy : null,
      handledAt: audit?.created_at || null,
      readAt: status === "Nueva" ? null : audit?.created_at || row.read_at,
      createdAt: row.created_at
    };
  });

  return json(200, { items });
}

export async function PATCH(request: NextRequest) {
  const staff = await getStaffAdmin(request);
  if (staff.response) return staff.response;
  const admin = staff.admin as AdminClient;
  const body = await request.json().catch(() => null) as {
    workflowKey?: string;
    notificationIds?: string[];
    action?: "claim" | "resolve" | "reopen" | "delete";
    title?: string;
    message?: string;
    category?: string;
  } | null;

  if (!body?.workflowKey || !/^[a-f0-9]{40}$/.test(body.workflowKey) || !body.action) {
    return json(400, { error: "Faltan datos del aviso." });
  }
  const actionMap = {
    claim: "notification_claimed",
    resolve: "notification_resolved",
    reopen: "notification_reopened",
    delete: "notification_deleted"
  } as const;
  const statusMap = {
    claim: "En gestion",
    resolve: "Resuelta",
    reopen: "Nueva",
    delete: "Resuelta"
  } as const;
  const now = new Date().toISOString();

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: staff.actor.id,
    action: actionMap[body.action],
    entity_type: "notification_workflow",
    entity_id: body.workflowKey,
    details: {
      handledBy: staff.actor.name,
      title: body.title || "",
      message: body.message || "",
      category: body.category || "Otros",
      deleted: body.action === "delete"
    }
  });
  if (auditError) return json(400, { error: auditError.message });

  const ids = (body.notificationIds || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length) {
    if (body.action === "delete") {
      const { error: deleteError } = await admin
        .from("notifications")
        .delete()
        .in("id", ids);
      if (deleteError) return json(400, { error: deleteError.message });
    } else {
      const { error: updateError } = await admin
        .from("notifications")
        .update({ read_at: body.action === "reopen" ? null : now })
        .in("id", ids);
      if (updateError) return json(400, { error: updateError.message });
    }
  }

  return json(200, {
    ok: true,
    deleted: body.action === "delete",
    workStatus: statusMap[body.action],
    handledBy: staff.actor.name,
    handledAt: now,
    readAt: body.action === "reopen" ? null : now
  });
}
