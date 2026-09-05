"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Edit3, KeyRound, Link2, Lock, Mail, Search, Share2, ShieldAlert, Trash2, Unlock, UserPlus, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Modal } from "@/components/Modal";
import {
  loadOperatorUsers,
  OperatorUser,
  readLocalOperatorUsers,
  removeOperatorUser,
  saveOperatorUser,
  setOperatorUserStatus,
  writeLocalOperatorUsers
} from "@/lib/operator-users";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

const emptyForm = { fullName: "", email: "", username: "" };
const pageSize = 25;
const operatorMetricCards = [
  { label: "Usuarios creados", icon: Users, tone: "bg-brand-50 text-brand-700", helper: "Total administrado", valueKey: "total" },
  { label: "Registrados", icon: Mail, tone: "bg-emerald-50 text-emerald-700", helper: "Ya pueden entrar", valueKey: "registered" },
  { label: "Bloqueados", icon: ShieldAlert, tone: "bg-red-50 text-red-700", helper: "Acceso detenido", valueKey: "blocked" },
  { label: "Pendientes", icon: CheckCircle2, tone: "bg-amber-50 text-amber-700", helper: "Falta completar enlace", valueKey: "pending" }
] as const;

export default function StaffOperatorsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<OperatorUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [accessModalUser, setAccessModalUser] = useState<OperatorUser | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);

  useEffect(() => {
    loadOperatorUsers()
      .then((storedUsers) => {
        setUsers(storedUsers);
        if (!isSupabaseConfigured) writeLocalOperatorUsers(storedUsers);
      })
      .catch(() => {
        setUsers(readLocalOperatorUsers());
        setMessage("No se pudo consultar la base central. Se mostro el respaldo local.");
      });
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        [user.username, user.fullName, user.email].join(" ").toLowerCase().includes(query.toLowerCase()) &&
        (statusFilter === "Todos" || (user.status || "Pendiente") === statusFilter)
      ),
    [query, statusFilter, users]
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisible = filteredUsers.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(currentPage * pageSize, filteredUsers.length);

  const pendingUsers = users.filter((user) => user.status === "Pendiente").length;
  const blockedUsers = users.filter((user) => user.status === "Bloqueado").length;

  function registrationLink(user: OperatorUser) {
    const baseUrl = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    const params = new URLSearchParams({ usuario: user.username });
    if (user.token) params.set("token", user.token);
    return `${baseUrl}/operator-register?${params.toString()}`;
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
    setModalOpen(true);
  }

  function openEditModal(user: OperatorUser) {
    setEditingId(user.id);
    setForm({ fullName: user.fullName, email: user.email, username: user.username });
    setMessage("");
    setModalOpen(true);
  }

  function generateTempPassword(user: OperatorUser) {
    const base = user.username.replace(/[^a-z0-9]/gi, "").slice(0, 6) || "Blue";
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}${suffix}.`;
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveUser() {
    if (!form.fullName.trim() || !form.email.trim() || !form.username.trim()) {
      setMessage("Completa nombre completo, correo y usuario.");
      return;
    }
    const normalizedUsername = form.username.trim();
    const userExists = users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase() && user.id !== editingId);
    if (userExists) {
      setMessage("Ese usuario ya existe. Usa uno diferente.");
      return;
    }

    const nextUser: OperatorUser = {
      id: editingId || `OPUSER-${Date.now().toString(36).toUpperCase()}`,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      username: normalizedUsername,
      status: users.find((user) => user.id === editingId)?.status || "Pendiente"
    };

    try {
      await saveOperatorUser(nextUser);
      if (isSupabaseConfigured) {
        setUsers(await loadOperatorUsers());
      } else {
        const nextUsers = editingId
          ? users.map((user) => (user.id === editingId ? nextUser : user))
          : [nextUser, ...users];
        setUsers(nextUsers);
        writeLocalOperatorUsers(nextUsers);
      }
      setModalOpen(false);
      setMessage(editingId ? `${nextUser.username} actualizado.` : `${nextUser.username} preasignado. Copia el enlace para que cree su contrasena y confirme el correo en Supabase.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "No fue posible guardar el usuario.";
      setMessage(text);
    }
  }

  async function copyRegistrationLink(user: OperatorUser) {
    const link = registrationLink(user);
    await navigator.clipboard.writeText(link);
    setMessage(`Link copiado para ${user.username}. El operador debe abrirlo, crear contraseña y luego ingresar.`);
  }

  function sendRegistrationEmail(user: OperatorUser) {
    const link = registrationLink(user);
    const subject = encodeURIComponent("Registro de acceso Unicall Blue");
    const body = encodeURIComponent(
      `Hola ${user.fullName},\n\nAbre este enlace para crear tu usuario y contrasena de Unicall Blue:\n\n${link}\n\nDespues de registrarte, ingresa en ${window.location.origin} con tu usuario ${user.username}.\n\nSi ya te registraste, usa recuperar contrasena desde el inicio de sesion.`
    );
    window.location.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
    setMessage(`Correo preparado para ${user.username}. Solo revisa y envialo desde tu correo.`);
  }

  async function copyGeneralRegistrationLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/operator-register`);
    setMessage("Enlace general de registro copiado.");
  }

  function helpWithAccess(user: OperatorUser) {
    setAccessModalUser(user);
    setTempPassword(generateTempPassword(user));
    setMessage("");
  }

  async function sendResetLink(user: OperatorUser) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("La recuperacion requiere la base central.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setMessage(error ? "No se pudo enviar la recuperacion. Intenta nuevamente." : `Recuperacion enviada a ${user.email}.`);
  }

  async function copyTempPassword() {
    await navigator.clipboard.writeText(tempPassword);
    setMessage("Contrasena temporal copiada.");
  }

  async function applyTempPassword() {
    if (!accessModalUser) return;
    if (tempPassword.length < 8) {
      setMessage("La contrasena temporal debe tener minimo 8 caracteres.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("La recuperacion requiere la base central.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setMessage("Sesion de staff no encontrada.");
      return;
    }

    setAccessLoading(true);
    const response = await fetch("/api/staff/operators", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: "reset-password",
        email: accessModalUser.email,
        username: accessModalUser.username,
        password: tempPassword
      })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    setAccessLoading(false);

    if (!response.ok) {
      setMessage(result?.error || "No fue posible cambiar la contrasena.");
      return;
    }

    setMessage(`Contrasena temporal lista para ${accessModalUser.username}. Copiala y compartela con el operador.`);
  }

  function updateSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  async function toggleBlockUser(user: OperatorUser) {
    const nextStatus: OperatorUser["status"] = user.status === "Bloqueado" ? (user.profileId ? "Registrado" : "Pendiente") : "Bloqueado";
    try {
      await setOperatorUserStatus(user, nextStatus);
      const nextUsers = users.map((item) => (item.id === user.id ? { ...item, status: nextStatus } : item));
      setUsers(nextUsers);
      if (!isSupabaseConfigured) writeLocalOperatorUsers(nextUsers);
      setMessage(`${user.username} ${nextStatus === "Bloqueado" ? "bloqueado" : "activado"}.`);
    } catch {
      setMessage("No se pudo cambiar el estado del operador.");
    }
  }

  async function deleteUser(user: OperatorUser) {
    const confirmed = window.confirm(`Eliminar totalmente a ${user.username}? Se borraran su acceso y sus registros asociados. Esta accion no se puede deshacer.`);
    if (!confirmed) return;

    setMessage("");
    try {
      await removeOperatorUser(user);
      const nextUsers = isSupabaseConfigured ? await loadOperatorUsers() : users.filter((item) => item.id !== user.id);
      setUsers(nextUsers);
      if (!isSupabaseConfigured) writeLocalOperatorUsers(nextUsers);
      setMessage(`${user.username} fue eliminado totalmente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar el operador. Intenta actualizar la pagina.");
    }
  }

  return (
    <AppLayout role="staff" title="Gestion de usuarios">
      <div className="grid gap-3 md:grid-cols-4">
        {operatorMetricCards.map((metric) => {
          const Icon = metric.icon;
          const value =
            metric.valueKey === "total" ? users.length :
            metric.valueKey === "registered" ? users.filter((user) => user.status === "Registrado").length :
            metric.valueKey === "blocked" ? blockedUsers :
            pendingUsers;
          return (
          <div className="rounded-md border border-line bg-white p-4 shadow-sm" key={metric.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-muted">{metric.label}</p>
                <p className="mt-2 text-3xl font-black text-ink">{value}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{metric.helper}</p>
              </div>
              <span className={`grid h-10 w-10 place-items-center rounded-md ${metric.tone}`}>
                <Icon size={20} />
              </span>
            </div>
          </div>
        )})}
      </div>

      <section className="mt-6 card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line bg-white p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-brand-700">Administracion de accesos</p>
            <h2 className="mt-1 text-xl font-black text-ink">Usuarios de operadores</h2>
            <p className="mt-1 text-sm text-muted">Crea el usuario, copia el enlace y el operador completa su contrasena. Registrado significa que ya puede ingresar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={copyGeneralRegistrationLink}>
              <Share2 size={16} />
              Copiar enlace general
            </button>
            <button className="btn-primary" onClick={openCreateModal}>
              <UserPlus size={16} />
              Preasignar usuario
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-line bg-soft/60 p-5 lg:grid-cols-[1fr_180px_auto] lg:items-center">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              className="input-base pl-9"
              placeholder="Buscar por usuario, nombre o correo"
              value={query}
              onChange={(event) => updateSearch(event.target.value)}
            />
          </label>
          <select className="input-base" value={statusFilter} onChange={(event) => updateStatusFilter(event.target.value)}>
            <option>Todos</option>
            <option>Pendiente</option>
            <option>Bloqueado</option>
            <option>Registrado</option>
          </select>
          <p className="text-sm font-semibold text-muted">
            {firstVisible}-{lastVisible} de {filteredUsers.length}
          </p>
          {message ? <p className="mt-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{message}</p> : null}
        </div>

        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-[1040px]">
            <thead className="bg-slate-100 text-left text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-3 py-2">Usuario</th>
                <th className="border-b border-line px-3 py-2">Nombre completo</th>
                <th className="border-b border-line px-3 py-2">Correo</th>
                <th className="border-b border-line px-3 py-2">Estado</th>
                <th className="border-b border-line px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.length ? (
                pagedUsers.map((user) => (
                  <tr key={user.id} className={`transition hover:bg-brand-50/40 ${user.status === "Bloqueado" ? "bg-red-50" : ""}`}>
                    <td className="border-b border-line px-3 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-9 w-9 place-items-center rounded-md text-xs font-black ${user.status === "Bloqueado" ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-700"}`}>
                          {user.username.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-black text-ink">{user.username}</p>
                          <p className="text-xs text-muted">
                            {user.status === "Bloqueado" ? "Acceso bloqueado" : user.status === "Registrado" ? "Cuenta creada" : "Debe completar enlace"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-line px-3 py-3 text-sm font-semibold text-ink">{user.fullName}</td>
                    <td className="border-b border-line px-3 py-3 text-sm text-muted">{user.email}</td>
                    <td className="border-b border-line px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                        user.status === "Bloqueado" ? "bg-red-100 text-red-700" :
                        user.status === "Registrado" ? "bg-emerald-100 text-emerald-700" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {user.status || "Pendiente"}
                      </span>
                    </td>
                    <td className="border-b border-line px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-brand-700 hover:bg-soft disabled:opacity-40" title={user.status === "Registrado" ? "Ya está registrado" : "Copiar link de registro"} onClick={() => copyRegistrationLink(user)} disabled={user.status === "Bloqueado" || user.status === "Registrado"}>
                          <Link2 size={15} />
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-emerald-700 hover:bg-soft disabled:opacity-40" title="Preparar correo con link" onClick={() => sendRegistrationEmail(user)} disabled={user.status === "Bloqueado" || user.status === "Registrado" || !user.email}>
                          <Mail size={15} />
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-ink hover:bg-soft" title="Editar" onClick={() => openEditModal(user)}>
                          <Edit3 size={15} />
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-brand-700 hover:bg-soft" title="Ayudar con acceso" onClick={() => helpWithAccess(user)}>
                          <KeyRound size={15} />
                        </button>
                        <button className={`grid h-9 w-9 place-items-center rounded-md border border-line hover:bg-soft ${user.status === "Bloqueado" ? "text-emerald-700" : "text-amber-700"}`} title={user.status === "Bloqueado" ? "Desbloquear" : "Bloquear"} onClick={() => toggleBlockUser(user)}>
                          {user.status === "Bloqueado" ? <Unlock size={15} /> : <Lock size={15} />}
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-red-700 hover:bg-red-50" title="Eliminar" onClick={() => deleteUser(user)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-cell text-muted" colSpan={6}>
                    No hay usuarios con ese criterio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-sm text-muted">
            Pagina {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary py-2" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
              Anterior
            </button>
            <button className="btn-secondary py-2" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>
              Siguiente
            </button>
          </div>
        </div>
      </section>

      <Modal title={editingId ? "Editar usuario" : "Preasignar usuario"} open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="grid gap-3">
          <input
            className="input-base"
            placeholder="Nombre completo"
            value={form.fullName}
            onChange={(event) => updateForm("fullName", event.target.value)}
          />
          <input
            className="input-base"
            placeholder="Correo corporativo"
            value={form.email}
            onChange={(event) => updateForm("email", event.target.value)}
          />
          <input
            className="input-base"
            placeholder="Usuario"
            value={form.username}
            onChange={(event) => updateForm("username", event.target.value)}
          />
          <button className="btn-primary justify-center" onClick={saveUser}>
            <Clipboard size={16} />
            {editingId ? "Guardar usuario" : "Guardar preasignacion"}
          </button>
        </div>
      </Modal>

      <Modal title="Ayudar con acceso" open={Boolean(accessModalUser)} onClose={() => setAccessModalUser(null)}>
        {accessModalUser ? (
          <div className="space-y-4">
            <div className="rounded-md bg-soft p-4">
              <p className="text-xs font-bold uppercase text-muted">Operador</p>
              <p className="mt-1 text-lg font-black text-ink">{accessModalUser.fullName}</p>
              <p className="text-sm font-semibold text-brand-700">{accessModalUser.username} - {accessModalUser.email}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Usa esto cuando el correo de recuperacion no llegue o el enlace venza. Staff asigna una contrasena temporal y el operador entra de inmediato.
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Contrasena temporal</span>
              <input className="input-base" value={tempPassword} onChange={(event) => setTempPassword(event.target.value)} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary justify-center" onClick={() => setTempPassword(generateTempPassword(accessModalUser))}>
                Generar otra
              </button>
              <button className="btn-secondary justify-center" onClick={copyTempPassword}>
                <Clipboard size={16} />
                Copiar clave
              </button>
            </div>
            <button className="btn-primary w-full justify-center" onClick={applyTempPassword} disabled={accessLoading}>
              <KeyRound size={16} />
              {accessLoading ? "Guardando..." : "Guardar clave temporal"}
            </button>
            <button className="btn-secondary w-full justify-center" onClick={() => sendResetLink(accessModalUser)}>
              <Mail size={16} />
              Enviar enlace por correo
            </button>
            <p className="text-xs text-muted">
              Despues de guardar, dile al operador que ingrese con su usuario o correo y esta contrasena temporal.
            </p>
          </div>
        ) : null}
      </Modal>
    </AppLayout>
  );
}
