"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Headphones,
  Link as LinkIcon,
  MessageSquare,
  Plus,
  Search,
  Target,
  Trash2
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  readStoredTrainingGalleryItems,
  TrainingGalleryCategory,
  TrainingGalleryItem,
  writeStoredTrainingGalleryItems
} from "@/lib/records";

const categories: TrainingGalleryCategory[] = [
  "Ventas exitosas",
  "Rechazos con buen manejo de objeciones",
  "Manejo de pago con tarjeta"
];

const emptyForm = {
  title: "",
  category: "Ventas exitosas" as TrainingGalleryCategory,
  audioUrl: "",
  description: "",
  strategies: "",
  objections: "",
  result: ""
};

const quickGuides: Record<TrainingGalleryCategory, { title: string; strategy: string; objection: string; result: string }> = {
  "Ventas exitosas": {
    title: "Venta cerrada con confianza",
    strategy: "Genera confianza, valida la necesidad y cierra con un beneficio claro.",
    objection: "Precio, duda sobre el producto o tiempo de entrega.",
    result: "Venta confirmada y cliente orientado."
  },
  "Rechazos con buen manejo de objeciones": {
    title: "Objecion atendida profesionalmente",
    strategy: "Escucha, confirma la causa y responde con informacion concreta.",
    objection: "Cliente no acepta inicialmente o expresa desconfianza.",
    result: "Gestion clara, respetuosa y correctamente documentada."
  },
  "Manejo de pago con tarjeta": {
    title: "Pago con tarjeta gestionado",
    strategy: "Explica el proceso, transmite seguridad y confirma el pago paso a paso.",
    objection: "Duda, temor o dificultad al realizar el pago con tarjeta.",
    result: "Pago orientado o confirmado correctamente."
  },
  "Venta exitosa": {
    title: "Venta cerrada con confianza",
    strategy: "Genera confianza, valida necesidad y cierra con beneficio claro.",
    objection: "Precio, duda del producto o pago tarde.",
    result: "Venta confirmada y cliente orientado."
  },
  "Rechazo con buen manejo de objeciones": {
    title: "Rechazo gestionado con buena respuesta",
    strategy: "Escucha activa, confirma motivo y deja evidencia clara.",
    objection: "Cliente no acepta, no reconoce o cambia decision.",
    result: "Gestion documentada para revision."
  },
  "Manejo de pago tarde": {
    title: "Pago tarde recuperado",
    strategy: "Acordar horario, confirmar compromiso y evitar presion innecesaria.",
    objection: "Cliente pide pagar despues o necesita validar dinero.",
    result: "Compromiso claro de pago."
  },
  "Cliente dificil": {
    title: "Cliente dificil controlado",
    strategy: "Mantener tono estable, ordenar la conversacion y responder con calma.",
    objection: "Molestia, desconfianza o rechazo inicial.",
    result: "Gestion terminada sin escalar el conflicto."
  },
  Retencion: {
    title: "Cliente retenido",
    strategy: "Recuperar interes con valor, necesidad y solucion concreta.",
    objection: "No quiere continuar o pierde interes.",
    result: "Cliente acepta continuar la gestion."
  },
  "Seguimiento ejemplar": {
    title: "Seguimiento claro y oportuno",
    strategy: "Registrar contexto, siguiente paso y fecha de contacto.",
    objection: "Cliente no contesta o pide volver a llamar.",
    result: "Caso organizado para cierre posterior."
  }
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

async function getAuthToken() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export function TrainingGalleryBoard({ mode }: { mode: "staff" | "operator" }) {
  const [items, setItems] = useState<TrainingGalleryItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let active = true;
    const loadAndSync = async () => {
      const localItems = readStoredTrainingGalleryItems();
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Sin sesion");
        const response = await fetch("/api/training-gallery", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("No se pudo cargar la base central.");
        const payload = await response.json();
        let nextItems = Array.isArray(payload.items) ? payload.items as TrainingGalleryItem[] : [];

        if (mode === "staff") {
          const pendingLocalItems = localItems.filter((item) => item.id.startsWith("LOCAL-"));
          const syncedItems: TrainingGalleryItem[] = [];
          for (const localItem of pendingLocalItems) {
            const syncResponse = await fetch("/api/training-gallery", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(localItem)
            });
            if (syncResponse.ok) {
              const syncPayload = await syncResponse.json();
              if (syncPayload.item) syncedItems.push(syncPayload.item as TrainingGalleryItem);
            }
          }
          if (syncedItems.length) {
            nextItems = [...syncedItems, ...nextItems];
            setMessage(`${syncedItems.length} audio${syncedItems.length === 1 ? "" : "s"} pendiente${syncedItems.length === 1 ? "" : "s"} publicado${syncedItems.length === 1 ? "" : "s"} para los operadores.`);
          }
        }

        if (!active) return;
        setItems(nextItems);
        writeStoredTrainingGalleryItems(nextItems);
      } catch {
        if (!active) return;
        setItems(localItems);
        setMessage("No fue posible conectar con la galeria central. Intenta nuevamente antes de publicar.");
      }
    };
    loadAndSync();
    return () => {
      active = false;
    };
  }, [mode]);

  const filteredItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = categoryFilter === "Todas" || item.category === categoryFilter;
      const haystack = [
        item.title,
        item.category,
        item.description,
        item.strategies,
        item.objections,
        item.result,
        item.createdBy
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!text || haystack.includes(text));
    });
  }, [categoryFilter, items, query]);

  const stats = useMemo(() => {
    const objections = items.filter((item) => item.category.includes("objeciones") || item.objections).length;
    const sales = items.filter((item) => item.category.includes("Venta") || item.category.includes("pago")).length;
    const recent = items.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
    return { total: items.length, sales, objections, recent };
  }, [items]);

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyQuickGuide(category: TrainingGalleryCategory) {
    const guide = quickGuides[category];
    setForm((current) => ({
      ...current,
      category,
      title: current.title || guide.title,
      strategies: current.strategies || guide.strategy,
      objections: current.objections || guide.objection,
      result: current.result || guide.result
    }));
  }

  async function submitGalleryItem() {
    if (!form.title.trim() || !form.audioUrl.trim()) {
      setMessage("Escribe titulo y enlace del audio.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/training-gallery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo publicar el audio.");
      const nextItems = [payload.item as TrainingGalleryItem, ...items];
      setItems(nextItems);
      writeStoredTrainingGalleryItems(nextItems);
      setForm(emptyForm);
      setMessage("Audio publicado. El operador ya puede escucharlo en la galeria.");
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message} No fue publicado; corrige los datos e intenta nuevamente.` : "No fue posible publicar el audio.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGalleryItem(item: TrainingGalleryItem) {
    setDeletingId(item.id);
    setMessage("");
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/training-gallery", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: item.id, action: "delete" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo ocultar el audio.");
      const nextItems = items.filter((entry) => entry.id !== item.id);
      setItems(nextItems);
      writeStoredTrainingGalleryItems(nextItems);
      setMessage("Audio ocultado de la galeria.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo ocultar el audio.");
    } finally {
      setDeletingId("");
    }
  }

  async function copyLink(item: TrainingGalleryItem) {
    await navigator.clipboard?.writeText(item.audioUrl).catch(() => undefined);
    setMessage(`Enlace copiado: ${item.title}`);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-brand-50 p-3 text-brand-700">
              <Headphones size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-brand-700">Capacitacion continua</p>
              <h2 className="text-2xl font-black text-ink">Galeria de gestiones exitosas</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">
                Audios reales con estrategia, objecion superada y resultado. El audio solo carga cuando se reproduce.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
            <div className="rounded-md border border-line bg-soft p-3">
              <p className="text-xs font-bold uppercase text-muted">Audios</p>
              <p className="text-2xl font-black text-ink">{stats.total}</p>
            </div>
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-bold uppercase text-emerald-700">Ventas</p>
              <p className="text-2xl font-black text-emerald-700">{stats.sales}</p>
            </div>
            <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase text-amber-700">Objeciones</p>
              <p className="text-2xl font-black text-amber-700">{stats.objections}</p>
            </div>
            <div className="rounded-md border border-sky-100 bg-sky-50 p-3">
              <p className="text-xs font-bold uppercase text-sky-700">Recientes</p>
              <p className="text-2xl font-black text-sky-700">{stats.recent}</p>
            </div>
          </div>
        </div>
      </section>

      {mode === "staff" ? (
        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-line bg-gradient-to-r from-slate-50 via-white to-emerald-50 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Headphones size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-ink">Publicar audio de gestion</h3>
                <p className="text-sm text-muted">Pega un enlace, resume el caso y deja 3 aprendizajes claros.</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              <div className="rounded-lg border border-line bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brand-700">
                  <LinkIcon size={15} />
                  Datos del audio
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-ink">Titulo del audio</span>
                    <input
                      className="input-base min-h-12 bg-white text-base"
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      placeholder="Ejemplo: Venta cerrada con confianza"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-ink">Categoria</span>
                    <select
                      className="input-base min-h-12 bg-white text-base"
                      value={form.category}
                      onChange={(event) => applyQuickGuide(event.target.value as TrainingGalleryCategory)}
                    >
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm font-bold text-ink">Enlace del audio</span>
                  <input
                    className="input-base min-h-12 bg-white font-medium text-brand-700"
                    value={form.audioUrl}
                    onChange={(event) => updateForm("audioUrl", event.target.value)}
                    placeholder="Pega aqui el enlace https://.../audio.mp3"
                    inputMode="url"
                    autoComplete="off"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-line p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brand-700">
                  <BookOpen size={15} />
                  Resumen para capacitacion
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-ink">¿Por que este audio ayuda al equipo?</span>
                  <textarea
                    className="input-base min-h-[120px] resize-y bg-white text-base leading-6"
                    value={form.description}
                    onChange={(event) => updateForm("description", event.target.value)}
                    placeholder="Resume que ocurrio, que hizo bien el operador y que puede aprender el equipo."
                  />
                </label>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-line bg-soft px-4 py-3 text-left"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                <span>
                  <strong className="block text-sm text-ink">Aprendizajes del audio</strong>
                  <span className="text-xs text-muted">Opcional: estrategia, objecion y resultado.</span>
                </span>
                <ChevronDown size={18} className={`text-muted transition ${showAdvanced ? "rotate-180" : ""}`} />
              </button>

              {showAdvanced ? <div className="grid gap-3 lg:grid-cols-3">
                {[
                  ["strategies", "Estrategia usada", Target],
                  ["objections", "Objecion superada", MessageSquare],
                  ["result", "Resultado obtenido", CheckCircle2]
                ].map(([field, placeholder, Icon]) => (
                  <label key={field as string} className="rounded-lg border border-line bg-white p-3">
                    <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-muted">
                      <Icon size={14} />
                      {placeholder as string}
                    </span>
                    <textarea
                      className="min-h-[88px] w-full resize-none border-0 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-muted"
                      value={form[field as keyof typeof form]}
                      onChange={(event) => updateForm(field as keyof typeof form, event.target.value)}
                      placeholder={quickGuides[form.category][field === "strategies" ? "strategy" : field === "objections" ? "objection" : "result"]}
                    />
                  </label>
                ))}
              </div> : null}

              <button className="btn-primary w-full justify-center" onClick={submitGalleryItem} disabled={busy}>
                <LinkIcon size={16} />
                {busy ? "Publicando..." : "Publicar enlace"}
              </button>
            </div>

            <aside className="hidden rounded-lg border border-line bg-soft p-4">
              <p className="text-xs font-black uppercase text-brand-700">Vista rapida</p>
              <h4 className="mt-2 text-base font-black text-ink">{form.title || quickGuides[form.category].title}</h4>
              <p className="mt-1 w-fit rounded-full bg-white px-2 py-1 text-xs font-black text-muted">{form.category}</p>
              <div className="mt-4 space-y-2">
                {[
                  ["Estrategia", form.strategies || quickGuides[form.category].strategy],
                  ["Objecion", form.objections || quickGuides[form.category].objection],
                  ["Resultado", form.result || quickGuides[form.category].result]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-line bg-white p-3">
                    <p className="text-xs font-black uppercase text-brand-700">{label}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-md border border-dashed border-line bg-white p-3 text-xs font-semibold text-muted">
                {form.audioUrl ? "El operador podra reproducir este enlace sin descargar el archivo." : "Pega el enlace del audio para activar la publicacion."}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="border-b border-line p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                className="input pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por titulo, objecion, estrategia o resultado"
              />
            </div>
            <select className="input lg:w-80" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option>Todas</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          {message ? <div className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-sm font-semibold text-brand-700">{message}</div> : null}
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-2">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-md border border-line bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-black uppercase text-brand-700">{item.category}</span>
                  <h3 className="mt-3 text-lg font-black text-ink">{item.title}</h3>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {item.createdBy ? `Publicado por ${item.createdBy} - ` : ""}
                    {formatDate(item.createdAt)}
                  </p>
                </div>
                {mode === "staff" ? (
                  <button
                    className="rounded-md border border-red-100 bg-red-50 p-2 text-red-600 hover:bg-red-100"
                    onClick={() => deleteGalleryItem(item)}
                    disabled={deletingId === item.id}
                    title="Ocultar audio"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>

              <div className="mt-4 rounded-md border border-line bg-soft p-3">
                <audio className="w-full" controls preload="none" src={item.audioUrl}>
                  Tu navegador no puede reproducir este audio.
                </audio>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-secondary px-3 py-2 text-xs" onClick={() => copyLink(item)}>
                    <Copy size={14} />
                    Copiar enlace
                  </button>
                  <a className="btn-secondary px-3 py-2 text-xs" href={item.audioUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    Abrir audio
                  </a>
                </div>
              </div>

              {item.description ? <p className="mt-4 text-sm text-muted">{item.description}</p> : null}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-700">
                    <Target size={14} />
                    Estrategia
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{item.strategies || "Sin detalle"}</p>
                </div>
                <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-700">
                    <MessageSquare size={14} />
                    Objecion
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{item.objections || "Sin detalle"}</p>
                </div>
                <div className="rounded-md border border-sky-100 bg-sky-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-sky-700">
                    <BookOpen size={14} />
                    Resultado
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{item.result || "Sin detalle"}</p>
                </div>
              </div>
            </article>
          ))}
          {!filteredItems.length ? (
            <div className="rounded-md border border-dashed border-line bg-soft p-8 text-center xl:col-span-2">
              <Headphones className="mx-auto text-brand-600" size={28} />
              <p className="mt-3 font-black text-ink">Aun no hay audios publicados.</p>
              <p className="mt-1 text-sm text-muted">
                {mode === "staff"
                  ? "Publica el primer enlace para empezar la biblioteca de buenas practicas."
                  : "Cuando Staff publique audios de referencia apareceran aqui."}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
