"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, RotateCcw } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    async function prepareRecoverySession() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage("No hay conexion con la base central.");
        setCheckingLink(false);
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = queryParams.get("code");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (!error) {
          window.history.replaceState(null, "", "/reset-password");
          setHasValidSession(true);
          setCheckingLink(false);
          return;
        }
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          window.history.replaceState(null, "", "/reset-password");
          setHasValidSession(true);
          setCheckingLink(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      setHasValidSession(Boolean(data.session));
      setCheckingLink(false);
    }

    prepareRecoverySession();
  }, []);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("La contrasena debe tener minimo 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Las contrasenas no coinciden.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("No hay conexion con la base central.");
      return;
    }
    if (!hasValidSession) {
      setMessage("El enlace vencio o no es valido. Vuelve al inicio y solicita uno nuevo, o pide a Staff que te asigne una contrasena temporal.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMessage("No fue posible guardar la contrasena. El enlace pudo vencer; solicita uno nuevo o pide apoyo a Staff.");
      return;
    }

    setSuccess(true);
    setMessage("Contrasena actualizada correctamente.");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-soft p-4 sm:p-6">
      <section className="card w-full max-w-md p-6">
        <AppLogo />
        <div className="mt-8">
          <p className="text-sm font-semibold text-brand-600">Recuperar acceso</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Crear nueva contrasena</h1>
          <p className="mt-2 text-sm text-muted">Usa minimo 8 caracteres y guarda la nueva contrasena.</p>
        </div>

        {success ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={18} />
              {message}
            </div>
            <Link className="btn-primary justify-center" href="/">Ir al inicio de sesion</Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={updatePassword}>
            {checkingLink ? (
              <div className="flex items-center gap-2 rounded-md bg-brand-50 p-3 text-sm font-semibold text-brand-700">
                <RotateCcw className="animate-spin" size={16} />
                Validando enlace de recuperacion...
              </div>
            ) : !hasValidSession ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-bold">Este enlace ya no esta activo.</p>
                <p className="mt-1">Vuelve al inicio y pide otro enlace. Si el correo no llega, Staff puede asignarte una contrasena temporal desde Usuarios de operadores.</p>
              </div>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Nueva contrasena</span>
              <div className="relative">
                <input className="input-base pr-10" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" onClick={() => setShowPassword((value) => !value)} aria-label="Ver contrasena">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Confirmar contrasena</span>
              <input className="input-base" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
            {message ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{message}</p> : null}
            <button className="btn-primary w-full justify-center" type="submit" disabled={loading || checkingLink || !hasValidSession}>{loading ? "Guardando..." : "Guardar nueva contrasena"}</button>
            <Link className="btn-secondary w-full justify-center" href="/">Volver al inicio</Link>
          </form>
        )}
      </section>
    </main>
  );
}
