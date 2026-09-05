"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Headphones,
  Home,
  LogOut,
  Menu,
  PackageCheck,
  ShieldCheck,
  UserCog,
  Users,
  X
} from "lucide-react";
import { AppLogo } from "./AppLogo";
import { AppThemeControl } from "./AppThemeControl";
import { NotificationCenter } from "./NotificationCenter";
import { touchOperatorDeviceSession } from "@/lib/operator-device-session";
import { CurrentProfile, loadCurrentProfile } from "@/lib/cloud-shifts";
import { isPrimaryStaffIdentity } from "@/lib/primary-staff";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isPageVisible, shouldRefreshNow } from "@/lib/client-cache";
import { focusRefreshThrottleMs, notificationPollMs } from "@/lib/usage-controls";

const nav = {
  operator: [
    { label: "Panel", href: "/operator-dashboard", icon: Home },
    { label: "Galeria", href: "/operator-gallery", icon: Headphones },
    { label: "Mis pedidos", href: "/operator-orders", icon: PackageCheck },
    { label: "Pagos", href: "/operator-payments", icon: CreditCard },
    { label: "Certificados", href: "/operator-certificates", icon: FileText },
    { label: "Jornada", href: "/operator-workday", icon: Clock3 },
    { label: "Notificaciones", href: "/operator-notifications", icon: Bell }
  ],
  staff: [
    { label: "Panel operativo", href: "/staff-dashboard", icon: Home },
    { label: "Operadores", href: "/staff-operators", icon: Users },
    { label: "Staff", href: "/staff-users", icon: UserCog },
    { label: "Galeria", href: "/staff-gallery", icon: Headphones },
    { label: "Seguimiento", href: "/staff-sales", icon: CheckCircle2 },
    { label: "Rechazos ocultos", href: "/staff-hidden-rejections", icon: ShieldCheck },
    { label: "Pagos", href: "/staff-payments", icon: CreditCard },
    { label: "Certificados", href: "/staff-certificates", icon: FileText },
    { label: "Breaks y almuerzos", href: "/staff-schedules", icon: Clock3 },
    { label: "Cambios de turno", href: "/staff-shift-changes", icon: ArrowLeftRight },
    { label: "Avisos", href: "/staff-notifications", icon: Bell }
  ]
};

const staffPanelTabs = [
  { label: "Panel", href: "/staff-dashboard" },
  { label: "Estadisticas", href: "/staff-performance" },
  { label: "Reportes", href: "/staff-reports" }
];

const staffScheduleTabs = [
  { label: "Breaks y almuerzos", href: "/staff-schedules" }
];

const profileCacheKey = "unicall-blue-current-profile";

function readCachedProfile() {
  if (typeof window === "undefined") return null;
  try {
    const rawProfile = window.localStorage.getItem(profileCacheKey);
    return rawProfile ? (JSON.parse(rawProfile) as CurrentProfile) : null;
  } catch {
    return null;
  }
}

export function AppLayout({
  role,
  title,
  children
}: {
  role: "operator" | "staff";
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<CurrentProfile | null>(() => readCachedProfile());
  const [accessVerified, setAccessVerified] = useState(role !== "operator" || !isSupabaseConfigured);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleNav = useMemo(
    () =>
      nav[role].filter((item) =>
        role !== "staff" ||
        !["/staff-users", "/staff-operators"].includes(item.href) ||
        isPrimaryStaffIdentity(profile || undefined)
      ),
    [profile, role]
  );
  const showStaffPanelTabs =
    role === "staff" && staffPanelTabs.some((item) => pathname === item.href);
  const showStaffScheduleTabs =
    role === "staff" && staffScheduleTabs.some((item) => pathname === item.href);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    loadCurrentProfile()
      .then((loadedProfile) => {
        if (!active) return;
        if (role === "operator" && isSupabaseConfigured && !loadedProfile) {
          window.localStorage.removeItem(profileCacheKey);
          const supabase = getSupabaseBrowserClient();
          supabase?.auth.signOut().finally(() => {
            window.location.href = "/";
          });
          return;
        }
        if (role === "operator" && loadedProfile?.status === "blocked") {
          window.localStorage.removeItem(profileCacheKey);
          window.sessionStorage.setItem("unicall-blue-access-blocked", "1");
          const supabase = getSupabaseBrowserClient();
          supabase?.auth.signOut().finally(() => {
            window.location.href = "/?blocked=1";
          });
          return;
        }
        setProfile(loadedProfile);
        if (loadedProfile) {
          window.localStorage.setItem(profileCacheKey, JSON.stringify(loadedProfile));
        } else {
          window.localStorage.removeItem(profileCacheKey);
        }
        setAccessVerified(true);
      })
      .catch(() => {
        if (!active) return;
        setProfile(readCachedProfile());
        setAccessVerified(role !== "operator" || !isSupabaseConfigured);
      });
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
      const routes = [
      ...visibleNav.map((item) => item.href),
      ...(role === "staff" ? ["/staff-notification-history"] : []),
      ...(role === "staff" ? staffPanelTabs.map((item) => item.href) : ["/operator-hidden-rejections"]),
      ...(role === "staff" ? staffScheduleTabs.map((item) => item.href) : [])
    ];
    routes.forEach((route) => router.prefetch(route));
  }, [role, router, visibleNav]);

  useEffect(() => {
    if (role !== "operator") return;
    let active = true;

    async function verifyDevice() {
      const latestProfile = await loadCurrentProfile(true).catch(() => null);
      if (!active) return;
      if (latestProfile?.status === "blocked") {
        window.localStorage.removeItem(profileCacheKey);
        window.sessionStorage.setItem("unicall-blue-access-blocked", "1");
        const supabase = getSupabaseBrowserClient();
        if (supabase) await supabase.auth.signOut();
        window.location.href = "/?blocked=1";
        return;
      }
      const allowed = await touchOperatorDeviceSession();
      if (!active || allowed) return;
      const supabase = getSupabaseBrowserClient();
      if (supabase) await supabase.auth.signOut();
      window.location.href = "/?session=closed";
    }

    verifyDevice();
    const timer = window.setInterval(() => {
      if (isPageVisible()) verifyDevice();
    }, notificationPollMs());
    const onFocus = () => {
      if (isPageVisible() && shouldRefreshNow("unicall-blue:device-focus", focusRefreshThrottleMs())) verifyDevice();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [role]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    window.localStorage.removeItem(profileCacheKey);
    if (supabase) await supabase.auth.signOut();
  }

  if (!accessVerified) {
    return (
      <main className="grid min-h-screen place-items-center bg-soft p-6">
        <section className="w-full max-w-sm rounded-md border border-line bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 w-fit"><AppLogo /></div>
          <ShieldCheck className="mx-auto animate-pulse text-brand-600" size={30} />
          <p className="mt-3 font-bold text-ink">Verificando acceso</p>
          <p className="mt-1 text-sm text-muted">Confirmando que tu operador se encuentra activo.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-soft">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-white p-4 lg:block">
        <AppLogo />
        {role === "operator" && profile ? (
          <div className="mt-5 rounded-md border border-brand-100 bg-brand-50 p-3">
            <p className="text-xs font-bold uppercase text-brand-700">Operador conectado</p>
            <p className="mt-1 truncate text-sm font-bold text-ink">{profile.fullName}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-muted">{profile.username}</p>
          </div>
        ) : null}
        <nav className="mt-8 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const baseHref = item.href.split("#")[0];
            const active =
              pathname === baseHref ||
              (role === "staff" && baseHref === "/staff-notifications" && pathname === "/staff-notification-history") ||
              (role === "staff" &&
                baseHref === "/staff-dashboard" &&
                ["/staff-performance", "/staff-reports"].includes(pathname)) ||
              (role === "staff" &&
                baseHref === "/staff-schedules" &&
                staffScheduleTabs.some((tab) => tab.href === pathname));
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-soft hover:text-ink"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/" onClick={signOut} className="absolute bottom-4 left-4 right-4 btn-secondary justify-center">
          <LogOut size={16} />
          Salir
        </Link>
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <AppLogo />
              <button
                type="button"
                aria-label="Cerrar menu"
                onClick={() => setMobileMenuOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-soft hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>
            {role === "operator" && profile ? (
              <div className="mt-4 rounded-md border border-brand-100 bg-brand-50 p-3">
                <p className="text-xs font-bold uppercase text-brand-700">Operador conectado</p>
                <p className="mt-1 truncate text-sm font-bold text-ink">{profile.fullName}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-muted">{profile.username}</p>
              </div>
            ) : null}
            <nav className="mt-5 flex-1 space-y-1 pb-6">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const baseHref = item.href.split("#")[0];
                const active =
                  pathname === baseHref ||
                  (role === "staff" && baseHref === "/staff-notifications" && pathname === "/staff-notification-history") ||
                  (role === "staff" &&
                    baseHref === "/staff-dashboard" &&
                    ["/staff-performance", "/staff-reports"].includes(pathname)) ||
                  (role === "staff" &&
                    baseHref === "/staff-schedules" &&
                    staffScheduleTabs.some((tab) => tab.href === pathname));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                      active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-soft hover:text-ink"
                    }`}
                  >
                    <Icon size={19} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <Link href="/" onClick={signOut} className="btn-secondary w-full justify-center">
              <LogOut size={16} />
              Salir
            </Link>
          </aside>
        </div>
      ) : null}

      <main className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-line bg-white/95 px-3 backdrop-blur sm:px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileMenuOpen(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-white text-ink lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase text-muted">
                {role === "staff" ? "Vista Staff" : "Vista Operador"}
              </p>
              <h1 className="truncate text-lg font-bold text-ink sm:text-xl">{title}</h1>
              {role === "operator" && profile ? (
                <p className="mt-0.5 truncate text-xs font-semibold text-brand-700">
                  Operador: {profile.fullName} · {profile.username}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 text-sm text-muted md:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {isSupabaseConfigured ? "Base central conectada" : "Modo local de respaldo"}
            </div>
            <AppThemeControl role={role} profile={profile} />
            <NotificationCenter role={role} />
          </div>
        </header>
        <div className="p-3 pb-20 sm:p-4 lg:p-8 lg:pb-8">
          {showStaffPanelTabs ? (
            <div className="mb-5 rounded-md border border-line bg-white p-2">
              <div className="flex flex-wrap gap-2">
                {staffPanelTabs.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-md px-4 py-2 text-sm font-bold ${
                        active ? "bg-brand-600 text-white" : "bg-soft text-muted hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          {showStaffScheduleTabs ? (
            <div className="mb-5 rounded-md border border-line bg-white p-2">
              <div className="flex flex-wrap gap-2">
                {staffScheduleTabs.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-md px-4 py-2 text-sm font-bold ${
                        active ? "bg-brand-600 text-white" : "bg-soft text-muted hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden">
        <div className="flex overflow-x-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const baseHref = item.href.split("#")[0];
            const active = pathname === baseHref;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-w-[72px] flex-1 flex-col items-center gap-1 px-2 py-2 text-[10px] font-semibold ${
                  active ? "text-brand-700" : "text-muted"
                }`}
              >
                <Icon size={20} />
                <span className="truncate w-full text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
