"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { operatorUsersStorageKey, OperatorUser } from "@/lib/operator-users";

function OperatorRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedUsername = searchParams.get("usuario") || "";
  const token = searchParams.get("token") || "";
  const isGeneralRegistration = !token && !assignedUsername;
  const [username, setUsername] = useState(assignedUsername);
  const [userStatus, setUserStatus] = useState<"Disponible" | "Bloqueado" | "No encontrado">(isGeneralRegistration ? "Disponible" : "No encontrado");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const [loading, setLoading] = useState(false);

  function authMessage(errorMessage: string) {
    const value = errorMessage.toLowerCase();
    if (value.includes("rate limit") || value.includes("email rate limit")) {
      return "Supabase bloqueo temporalmente el envio de correos por muchos intentos. No sigas reintentando porque el bloqueo puede durar mas. Pide apoyo a Staff para activar el acceso.";
    }
    if (value.includes("already registered") || value.includes("already exists") || value.includes("user already registered")) {
      return "Ese correo ya tiene cuenta. Ve al inicio de sesion o usa recuperar contrasena.";
    }
    return errorMessage;
  }

  useEffect(() => {
    async function loadInvitation() {
      const supabase = getSupabaseBrowserClient();
      if (isSupabaseConfigured && supabase && token) {
        const { data, error } = await supabase.rpc("get_operator_invitation", { invitation_token: token });
        const invitation = data?.[0];
        if (error || !invitation) {
          setUserStatus("No encontrado");
          return;
        }
        setFullName(invitation.full_name);
        setEmail(invitation.email);
        setUserStatus(invitation.status === "blocked" ? "Bloqueado" : invitation.status === "active" ? "Disponible" : "No encontrado");
        return;
      }

      try {
        const raw = window.localStorage.getItem(operatorUsersStorageKey);
        const users = raw ? (JSON.parse(raw) as OperatorUser[]) : [];
        if (isGeneralRegistration) {
          setUserStatus("Disponible");
          return;
        }
        const user = users.find((item) => item.username.toLowerCase() === assignedUsername.toLowerCase());
        setUserStatus(user?.status === "Bloqueado" ? "Bloqueado" : user ? "Disponible" : "No encontrado");
        if (user) {
          setFullName(user.fullName);
          setEmail(user.email);
        }
      } catch {
        setUserStatus("Disponible");
      }
    }
    loadInvitation();
  }, [assignedUsername, isGeneralRegistration, token]);

  async function register() {
    if (!username.trim() || !fullName.trim() || !email.trim() || password.length < 8) {
      setMessage("Completa usuario, nombre y correo. La contrasena debe tener minimo 8 caracteres.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (isSupabaseConfigured && supabase) {
      setLoading(true);
      setRateLimited(false);
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim().replace(/\s+/g, "").toUpperCase();

      const directResponse = await fetch("/api/operator-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: cleanEmail,
          username: cleanUsername,
          password,
          token
        })
      });

      const directResult = await directResponse.json().catch(() => null) as { error?: string; code?: string; id?: string } | null;
      if (!directResponse.ok) {
        setLoading(false);
        setMessage(
          directResult?.code === "missing_service_role"
            ? "Falta configurar SUPABASE_SERVICE_ROLE_KEY. Staff debe agregar esa clave para crear cuentas sin limite de correos."
            : authMessage(directResult?.error || "No fue posible crear la cuenta.")
        );
        return;
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      setLoading(false);
      if (!loginError && loginData.user) {
        window.localStorage.setItem(
          "unicall-blue-current-profile",
          JSON.stringify({
            id: loginData.user.id,
            fullName: fullName.trim(),
            username: cleanUsername,
            role: "operator",
            status: "active"
          })
        );
        router.push("/operator-dashboard");
        return;
      }

      setMessage("Cuenta creada en Supabase, pero no se pudo iniciar automaticamente. Ve al inicio de sesion e ingresa con tu usuario o correo.");
      return;
    }

    setMessage("Acceso preparado en modo local. Activa Supabase para registrar cuentas reales.");
  }

  async function resendConfirmation() {
    if (!registeredEmail) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: registeredEmail,
      options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    setRateLimited(Boolean(error?.message.toLowerCase().includes("rate limit")));
    setMessage(error ? authMessage(error.message) : "Correo reenviado. Revisa Recibidos, Spam y Promociones.");
  }

  if (registeredEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-soft p-4 sm:p-6">
        <section className="w-full max-w-xl card p-6">
          <AppLogo />
          <div className="mt-8 rounded-md border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 shrink-0" size={22} />
              <div>
                <p className="text-sm font-black uppercase">Cuenta creada en Supabase</p>
                <h1 className="mt-1 text-2xl font-black">Confirma tu correo para entrar</h1>
                <p className="mt-2 text-sm font-semibold">
                  Enviamos la confirmacion a <strong>{registeredEmail}</strong>. Abre ese correo y confirma la cuenta.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 rounded-md border border-line bg-white p-4 text-sm text-muted">
            <p><strong className="text-ink">1.</strong> Revisa Recibidos, Spam y Promociones.</p>
            <p><strong className="text-ink">2.</strong> Despues de confirmar, vuelve al inicio e ingresa con tu usuario o correo.</p>
            <p><strong className="text-ink">3.</strong> Si aparece limite de correos, espera antes de reenviar para no bloquear mas envios.</p>
          </div>
          {rateLimited ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-black">Correo de confirmacion bloqueado por Supabase</p>
              <p className="mt-1 font-semibold">
                No reenvies varias veces. Staff debe desactivar temporalmente la confirmacion de correo o configurar SMTP propio en Supabase.
              </p>
            </div>
          ) : null}
          {message ? <p className="mt-4 rounded-md bg-soft p-3 text-sm font-semibold text-muted">{message}</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="btn-secondary justify-center" type="button" onClick={resendConfirmation} disabled={loading}>
              {loading ? "Reenviando..." : "Reenviar correo"}
            </button>
            <Link className="btn-primary justify-center" href="/">
              Ir al inicio de sesion
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-soft p-4 sm:p-6">
      <section className="w-full max-w-xl card p-6">
        <AppLogo />
        <div className="mt-8">
          <p className="text-sm font-semibold uppercase text-brand-600">Registro de operador</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Completar acceso</h1>
          <p className="mt-2 text-sm text-muted">
            {isGeneralRegistration
              ? "Escribe tus datos y crea tu contrasena. La cuenta quedara creada en Supabase y podras entrar al sistema."
              : "Este enlace ya trae el usuario asignado por staff. Crea tu contrasena y entra al sistema."}
          </p>
        </div>

        <div className="mt-6 grid gap-3">
          {userStatus === "Bloqueado" ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              <div className="mb-1 flex items-center gap-2">
                <Lock size={16} />
                Usuario bloqueado
              </div>
              Este acceso fue bloqueado por staff. Contacta a tu supervisor.
            </div>
          ) : null}
          {userStatus === "No encontrado" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
              Este usuario no aparece en la lista de staff. Verifica el link recibido.
            </div>
          ) : null}
          <label>
            <span className="mb-1 block text-sm font-semibold text-ink">{isGeneralRegistration ? "Usuario para ingresar" : "Usuario asignado"}</span>
            <input
              className={`input-base font-bold ${isGeneralRegistration ? "" : "bg-soft"}`}
              value={username}
              readOnly={!isGeneralRegistration}
              placeholder="Ejemplo: B.BLANCO"
              onChange={(event) => setUsername(event.target.value.replace(/\s+/g, "").toUpperCase())}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-ink">Nombre completo</span>
            <input className="input-base" placeholder="Nombre completo del operador" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-ink">Correo corporativo</span>
            <input className="input-base" type="email" placeholder="correo@unicallblue.co" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-ink">Crear contrasena</span>
            <input className="input-base" type="password" placeholder="Minimo 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {rateLimited ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-black">No sigas intentando con este correo</p>
              <p className="mt-1 font-semibold">
                Supabase limito los correos de confirmacion. Avisa a Staff para que active el acceso o configure el correo de Supabase.
              </p>
            </div>
          ) : null}
          {message ? <p className="rounded-md bg-soft p-3 text-sm font-semibold text-muted">{message}</p> : null}
          <button className="btn-primary justify-center" type="button" disabled={userStatus !== "Disponible" || loading} onClick={register}>
            <CheckCircle2 size={16} />
            {loading ? "Creando acceso..." : "Crear cuenta y entrar"}
          </button>
          <Link className="btn-secondary justify-center" href="/">
            Ir al inicio de sesion
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function OperatorRegisterPage() {
  return (
    <Suspense fallback={null}>
      <OperatorRegisterForm />
    </Suspense>
  );
}
