"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { CurrentProfile } from "@/lib/cloud-shifts";
import { isPrimaryStaffIdentity } from "@/lib/primary-staff";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AppTheme = "light" | "gray" | "dark";

const storageKey = "unicall-blue-global-theme";
const settingKey = "global_theme";

const themes: Array<{
  value: AppTheme;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "gray", label: "Gris", icon: Monitor },
  { value: "dark", label: "Oscuro", icon: Moon }
];

function isTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "gray" || value === "dark";
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.appTheme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(storageKey);
  return isTheme(stored) ? stored : "light";
}

export function AppThemeControl({
  role,
  profile
}: {
  role: "operator" | "staff";
  profile: CurrentProfile | null;
}) {
  const [theme, setTheme] = useState<AppTheme>(() => readStoredTheme());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const canManage = useMemo(
    () => role === "staff" && isPrimaryStaffIdentity(profile || undefined),
    [profile, role]
  );

  useEffect(() => {
    const localTheme = readStoredTheme();
    applyTheme(localTheme);
    setTheme(localTheme);

    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", settingKey)
      .maybeSingle()
      .then((result: { data?: { value?: unknown } | null }) => {
        const data = result.data;
        const remoteTheme = data?.value && typeof data.value === "object" ? (data.value as { theme?: unknown }).theme : null;
        if (!active || !isTheme(remoteTheme)) return;
        window.localStorage.setItem(storageKey, remoteTheme);
        applyTheme(remoteTheme);
        setTheme(remoteTheme);
      });

    return () => {
      active = false;
    };
  }, []);

  async function publishTheme(nextTheme: AppTheme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);

    if (!canManage) return;
    if (!isSupabaseConfigured) {
      setMessage("Tema aplicado en este equipo.");
      window.setTimeout(() => setMessage(""), 2200);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("app_settings").upsert({
      key: settingKey,
      value: { theme: nextTheme },
      updated_at: new Date().toISOString(),
      updated_by: profile?.id || null
    });
    setSaving(false);
    setMessage(error ? "No se pudo publicar el tema." : "Tema publicado para todos.");
    window.setTimeout(() => setMessage(""), 2600);
  }

  if (!canManage) return null;

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-md border border-line bg-white p-1 shadow-sm">
        <span className="hidden items-center gap-1 px-2 text-xs font-bold uppercase text-muted sm:flex">
          <Palette size={14} />
          Tema
        </span>
        {themes.map((item) => {
          const Icon = item.icon;
          const active = theme === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => publishTheme(item.value)}
              disabled={saving}
              className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold transition ${
                active ? "bg-brand-600 text-white shadow-sm" : "text-muted hover:bg-soft hover:text-ink"
              }`}
              title={`Cambiar a modo ${item.label.toLowerCase()}`}
            >
              <Icon size={14} />
              <span className="hidden xl:inline">{item.label}</span>
              {active ? <Check size={13} /> : null}
            </button>
          );
        })}
      </div>
      {message ? (
        <div className="absolute right-0 top-11 z-20 min-w-52 rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold text-ink shadow-lg">
          {message}
        </div>
      ) : null}
    </div>
  );
}
