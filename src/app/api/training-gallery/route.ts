import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { TrainingGalleryCategory, TrainingGalleryItem } from "@/lib/records";

type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

const categories: TrainingGalleryCategory[] = [
  "Ventas exitosas",
  "Rechazos con buen manejo de objeciones",
  "Manejo de pago con tarjeta",
  "Venta exitosa",
  "Rechazo con buen manejo de objeciones",
  "Manejo de pago tarde",
  "Cliente dificil",
  "Retencion",
  "Seguimiento ejemplar"
];

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength = 600) {
  return String(value || "").trim().slice(0, maxLength);
}

function validateAudioUrl(value: unknown) {
  const audioUrl = cleanText(value, 1000);
  try {
    const parsed = new URL(audioUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return audioUrl;
  } catch {
    return "";
  }
}

function isGalleryCategory(value: string): value is TrainingGalleryCategory {
  return categories.includes(value as TrainingGalleryCategory);
}

function itemFromAudit(row: any): TrainingGalleryItem | null {
  const details = row?.details || {};
  const category = cleanText(details.category, 120);
  if (!row?.entity_id || !isGalleryCategory(category)) return null;
  return {
    id: String(row.entity_id),
    title: cleanText(details.title, 140),
    category,
    audioUrl: cleanText(details.audioUrl, 1000),
    description: cleanText(details.description, 800),
    strategies: cleanText(details.strategies, 800),
    objections: cleanText(details.objections, 800),
    result: cleanText(details.result, 800),
    createdBy: cleanText(details.createdByName || details.createdBy, 160),
    createdAt: row.created_at || details.createdAt || new Date().toISOString()
  };
}

async function getAdmin(request: NextRequest, requireStaff = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    return { response: json(500, { error: "Supabase no esta configurado para la galeria." }) };
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
    .select("id, role, status, full_name, username")
    .eq("id", authData.user.id)
    .single();

  if (!profile || profile.status !== "active") {
    return { response: json(403, { error: "Usuario inactivo o bloqueado." }) };
  }

  if (requireStaff && profile.role !== "staff") {
    return { response: json(403, { error: "Solo Staff puede publicar audios." }) };
  }

  return { admin, profile };
}

async function loadGallery(admin: SupabaseAdminClient) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("action, entity_id, details, created_at")
    .eq("entity_type", "training_gallery_item")
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) throw error;

  const latestById = new Map<string, any>();
  (data || []).forEach((row) => {
    if (!row.entity_id || latestById.has(row.entity_id)) return;
    latestById.set(row.entity_id, row);
  });

  return Array.from(latestById.values())
    .filter((row) => row.action !== "training_gallery_deleted" && row.details?.active !== false)
    .map(itemFromAudit)
    .filter(Boolean) as TrainingGalleryItem[];
}

export async function GET(request: NextRequest) {
  const auth = await getAdmin(request);
  if (auth.response) return auth.response;

  try {
    const items = await loadGallery(auth.admin);
    return json(200, { items });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "No se pudo cargar la galeria." });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAdmin(request, true);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = cleanText(body?.title, 140);
  const categoryValue = cleanText(body?.category, 120);
  const audioUrl = validateAudioUrl(body?.audioUrl);
  const description = cleanText(body?.description, 800);
  const strategies = cleanText(body?.strategies, 800);
  const objections = cleanText(body?.objections, 800);
  const result = cleanText(body?.result, 800);

  if (!title || !audioUrl || !isGalleryCategory(categoryValue)) {
    return json(400, { error: "Completa titulo, categoria y enlace de audio valido." });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const createdByName = auth.profile.full_name || auth.profile.username || "Staff";

  const { error } = await auth.admin.from("audit_logs").insert({
    actor_id: auth.profile.id,
    action: "training_gallery_created",
    entity_type: "training_gallery_item",
    entity_id: id,
    details: {
      active: true,
      title,
      category: categoryValue,
      audioUrl,
      description,
      strategies,
      objections,
      result,
      createdByName,
      createdAt: now
    }
  });

  if (error) return json(500, { error: error.message });

  return json(200, {
    item: {
      id,
      title,
      category: categoryValue,
      audioUrl,
      description,
      strategies,
      objections,
      result,
      createdBy: createdByName,
      createdAt: now
    }
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAdmin(request, true);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null) as { id?: string; action?: string } | null;
  const id = cleanText(body?.id, 80);
  if (!id || body?.action !== "delete") return json(400, { error: "Accion no valida." });

  const { error } = await auth.admin.from("audit_logs").insert({
    actor_id: auth.profile.id,
    action: "training_gallery_deleted",
    entity_type: "training_gallery_item",
    entity_id: id,
    details: {
      active: false,
      deletedByName: auth.profile.full_name || auth.profile.username || "Staff",
      deletedAt: new Date().toISOString()
    }
  });

  if (error) return json(500, { error: error.message });
  return json(200, { ok: true });
}
