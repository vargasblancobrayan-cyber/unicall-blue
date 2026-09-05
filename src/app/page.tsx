"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Eye, EyeOff, PhoneCall, ShieldCheck, TrendingUp } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { credentials, Role } from "@/lib/data";
import { claimOperatorDeviceSession } from "@/lib/operator-device-session";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("operator");
  const [login, setLogin] = useState(isSupabaseConfigured ? "" : credentials.operator.email);
  const [password, setPassword] = useState(isSupabaseConfigured ? "" : credentials.operator.password);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [blockedNotice, setBlockedNotice] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedCredentials = useMemo(() => credentials[role], [role]);

  useEffect(() => {
    if (window.location.search.includes("blocked=1") || window.sessionStorage.getItem("unicall-blue-access-blocked") === "1") {
      setBlockedNotice(true);
      setError("Tu usuario fue bloqueado. Comunicate con tu coordinador o supervisor para revisar el acceso.");
    }
  }, []);

  function changeRole(nextRole: Role) {
    setRole(nextRole);
    setLogin(isSupabaseConfigured ? "" : credentials[nextRole].email);
    setPassword(isSupabaseConfigured ? "" : credentials[nextRole].password);
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const supabase = getSupabaseBrowserClient();
    if (isSupabaseConfigured && supabase) {
      setLoading(true);
      const loginValue = login.trim();
      let accountEmail = loginValue;
      if (!loginValue.includes("@")) {
        const { data: resolvedEmail, error: resolveError } = await supabase.rpc("resolve_login_email", {
          login_value: loginValue
        });
        if (resolveError || !resolvedEmail) {
          setError("Ese usuario todavia no tiene cuenta creada. Primero debe abrir el enlace de registro, crear su contrasena y luego ingresar.");
          setLoading(false);
          return;
        }
        accountEmail = resolvedEmail;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: accountEmail, password });
      if (signInError || !data.user) {
        const message = signInError?.message?.toLowerCase() || "";
        setError(
          message.includes("email not confirmed")
            ? "La cuenta fue creada, pero Supabase esta pidiendo confirmar el correo antes de entrar."
            : "Correo, usuario o contrasena incorrectos. Si es nuevo, primero debe registrarse con el enlace."
        );
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, username, role, status")
        .eq("id", data.user.id)
        .single();

      if (!profile || profile.status === "blocked") {
        await supabase.auth.signOut();
        window.sessionStorage.setItem("unicall-blue-access-blocked", "1");
        setBlockedNotice(true);
        setError("Tu usuario fue bloqueado. Comunicate con tu coordinador o supervisor para revisar el acceso.");
        setLoading(false);
        return;
      }

      if (profile.role !== role) {
        await supabase.auth.signOut();
        setError(`Este usuario esta registrado como ${profile.role === "staff" ? "Staff" : "Operador"}.`);
        setLoading(false);
        return;
      }

      if (profile.role === "operator") {
        const sessionAllowed = await claimOperatorDeviceSession();
        if (!sessionAllowed) {
          await supabase.auth.signOut();
          setError("Este operador ya tiene una sesion activa en otro dispositivo.");
          setLoading(false);
          return;
        }
      }

      window.sessionStorage.removeItem("unicall-blue-access-blocked");
      setBlockedNotice(false);

      window.localStorage.setItem(
        "unicall-blue-current-profile",
        JSON.stringify({
          id: data.user.id,
          fullName: profile.full_name,
          username: profile.username,
          role: profile.role,
          status: profile.status
        })
      );

      router.push(profile.role === "staff" ? "/staff-dashboard" : "/operator-dashboard");
      return;
    }

    if (login !== selectedCredentials.email || password !== selectedCredentials.password) {
      setError("Credenciales invalidas para el rol seleccionado.");
      return;
    }
    router.push(role === "staff" ? "/staff-dashboard" : "/operator-dashboard");
  }

  async function requestPasswordReset() {
    setError("");
    setNotice("");
    if (!login.trim()) {
      setError("Escribe primero el correo o usuario de la cuenta.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("La recuperacion requiere la base central.");
      return;
    }

    setLoading(true);
    let accountEmail = login.trim();
    if (!accountEmail.includes("@")) {
      const { data: resolvedEmail } = await supabase.rpc("resolve_login_email", { login_value: accountEmail });
      if (!resolvedEmail) {
        setError("No encontramos ese usuario activo.");
        setLoading(false);
        return;
      }
      accountEmail = resolvedEmail;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(accountEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setLoading(false);
    if (resetError) {
      setError("No fue posible enviar el enlace. Intenta nuevamente en unos minutos.");
      return;
    }
    setNotice("Enlace enviado. Revisa Recibidos, Spam y Promociones.");
  }

  return (
    <main className="flex min-h-dvh">
      <section className="relative hidden w-5/12 flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-brand-700 to-cyan-600 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative z-10">
          <div className="[&_*]:text-white">
            <AppLogo />
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Plataforma operativa
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight">
            Gestion operativa para tu equipo de ventas
          </h1>
          <p className="mt-4 text-white/75">
            Centraliza ventas, rechazos y jornadas. Tu equipo mas eficiente, tu
            supervision mas clara.
          </p>
          <div className="mt-8 space-y-4 text-sm font-medium text-white/90">
            {[
              [TrendingUp, "Registro de ventas en tiempo real"],
              [PhoneCall, "Seguimiento operativo en tiempo real"],
              [Clock, "Control de jornada y desconexiones"],
              [ShieldCheck, "Validacion de rechazos y multas"]
            ].map(([Icon, text]) => (
              <div key={text as string} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/10 backdrop-blur">
                  <Icon size={19} />
                </span>
                {text as string}
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-white/50">
          2026 Unicall Blue - Todos los derechos reservados
        </p>
      </section>

      <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-soft p-4 sm:p-6">
        <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-brand-100/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-cyan-100/40 blur-3xl" />
        <div className="relative w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <AppLogo />
          </div>
          <div className="card p-6 shadow-panel-lg sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold text-brand-600">Iniciar sesion</p>
              <h2 className="mt-1 text-2xl font-bold text-ink">Bienvenido de nuevo</h2>
              <p className="mt-1 text-sm text-muted">Ingresa tus credenciales para continuar</p>
            </div>
            <div className="mb-5">
              <p className="mb-2 text-sm font-semibold text-ink">Rol de acceso</p>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-soft p-1">
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    role === "operator" ? "bg-white text-brand-700 shadow-sm" : "text-muted"
                  }`}
                  onClick={() => changeRole("operator")}
                >
                  Operador
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    role === "staff" ? "bg-white text-brand-700 shadow-sm" : "text-muted"
                  }`}
                  onClick={() => changeRole("staff")}
                >
                  Staff
                </button>
              </div>
            </div>
            {blockedNotice ? <div className="mb-5 rounded-md border border-red-300 bg-red-50 p-4 text-red-800"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0" size={20} /><div><p className="font-bold">Acceso bloqueado</p><p className="mt-1 text-sm">Tu usuario fue bloqueado. Comunícate con tu apoyo, coordinador o supervisor para revisar el acceso.</p></div></div></div> : null}
            <form className="space-y-4" onSubmit={submit}>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">Correo o usuario</span>
                <input className="input-base" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">Contrasena</span>
                <div className="relative">
                  <input
                    className="input-base pr-10"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label="Ver contrasena"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <label className="flex items-center gap-2 text-muted">
                  <input type="checkbox" className="h-4 w-4 rounded border-line" />
                  Recordar sesion por 30 dias</label>
                <button type="button" className="font-semibold text-brand-600" onClick={requestPasswordReset} disabled={loading}>
                  Olvidaste tu contrasena?
                </button>
              </div>
              {notice ? <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">{notice}</p> : null}
              {error ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
              <button className="btn-primary w-full justify-center" type="submit" disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar al sistema"}
              </button>
              {role === "operator" ? (
                <button className="btn-secondary w-full justify-center" type="button" onClick={() => router.push("/operator-register")}>
                  Crear cuenta de operador
                </button>
              ) : null}
            </form>
            {!isSupabaseConfigured ? <div className="mt-6 rounded-lg bg-soft p-4 text-xs text-muted">
              <p className="mb-2 font-bold">Credenciales de prueba:</p>
              <p>Operador: operador@unicallblue.co / ops123</p>
              <p>Staff: staff@unicallblue.co / staff123</p>
            </div> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
