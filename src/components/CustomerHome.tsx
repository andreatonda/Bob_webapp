"use client";

// Dashboard cliente v2 — organizzata per "cosa richiede attenzione",
// non per data di creazione delle richieste:
//   1. Da fare ora    → risposte non lette, proposte di appuntamento,
//                       lavori da chiudere, recensioni mancanti
//   2. Lavori in corso → richieste aperte con timeline di stato e badge non letti
//   3. Prossimi appuntamenti → proposte da confermare + confermati (migration 021)
//   4. I tuoi professionisti → ricontatto in un tap
//   5. Storico        → richieste concluse, ripiegate

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Calendar, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { ReviewDialog } from "@/components/ReviewDialog";
import { sendMessage } from "@/lib/messages";
import { notifyEvent } from "@/lib/notify";
import { AggiungiAlCalendario } from "@/components/AggiungiAlCalendario";

interface CustomerRequest {
  id: string;
  status: string;
  problem_description: string | null;
  created_at: string | null;
  service: { name: string } | null;
  city: { name: string } | null;
  pros: { id: string; name: string }[];
}

interface Appointment {
  id: string;
  request_id: string | null;
  professional_id: string;
  title: string | null;
  starts_at: string;
  duration_minutes: number;
  status: string;
  proposed_by: "professional" | "customer";
}

const OPEN_STATUSES = ["sent", "quote_request", "matched"];

function fmtDate(d: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function fmtDayParts(d: string) {
  const date = new Date(d);
  return {
    dow: date.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", ""),
    day: date.getDate(),
    time: date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
  };
}

// Timeline di stato: mostra al cliente a che punto è il lavoro.
function StatusTimeline({
  status,
  hasAppointment,
  quoteCount,
}: {
  status: string;
  hasAppointment: boolean;
  quoteCount: number;
}) {
  const isQuote = status === "quote_request";
  const steps = [
    "Inviata",
    ...(isQuote ? [quoteCount > 1 ? `${quoteCount} pro contattati` : "Preventivo chiesto"] : []),
    "In contatto",
    "Appuntamento",
    "Conclusa",
  ];
  const currentIdx =
    status === "closed"
      ? steps.length - 1
      : hasAppointment
      ? steps.indexOf("Appuntamento")
      : status === "matched"
      ? steps.indexOf("In contatto")
      : isQuote
      ? 1
      : 0;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-bob-ink/20">—</span>}
          <span
            className={
              i < currentIdx
                ? "text-emerald-700"
                : i === currentIdx
                ? "rounded-full bg-bob-indigo-50 px-2 py-0.5 font-semibold text-bob-indigo"
                : "text-bob-ink/35"
            }
          >
            {i < currentIdx ? "✓ " : ""}
            {s}
          </span>
        </span>
      ))}
    </div>
  );
}

export function CustomerHome() {
  const supabase = createClient();
  const { user } = useAuth();

  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [unreadByReq, setUnreadByReq] = useState<Map<string, number>>(new Map());
  // (022) non letti per singolo thread richiesta:pro (confronto preventivi)
  const [unreadByPair, setUnreadByPair] = useState<Map<string, number>>(
    new Map()
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [reviewFor, setReviewFor] = useState<CustomerRequest | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [respondingAppt, setRespondingAppt] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Contro-proposta: slot liberi del pro (mai il suo calendario completo).
  const [slotPickerFor, setSlotPickerFor] = useState<Appointment | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  /** false = il pro non ha ancora confermato i suoi orari (05/09). */
  const [orariConfermati, setOrariConfermati] = useState(true);
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotErr, setSlotErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("requests")
      .select(
        "id, status, problem_description, created_at, services ( name ), cities ( name ), request_professionals ( professional_id, professionals ( id, user_id ) )"
      )
      .eq("customer_id", user.id)
      // «draft» = mai partita. Ci finiscono le richieste declassate quando la
      // consegna al professionista fallisce (RequestDialog): esistono come
      // riga, ma nessuno le ha ricevute. Fra i lavori in corso non ci vanno —
      // nell'export dei dati sì, perché restano dati della persona.
      .neq("status", "draft")
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as Record<string, unknown>[];

    // Nomi dei professionisti coinvolti.
    const proUserIds = new Set<string>();
    for (const r of rows) {
      for (const rp of (r.request_professionals ?? []) as Record<string, unknown>[]) {
        const prof = rp.professionals as { user_id?: string } | null;
        if (prof?.user_id) proUserIds.add(prof.user_id);
      }
    }
    const nameByUser = new Map<string, string>();
    if (proUserIds.size) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", Array.from(proUserIds));
      for (const p of (profs ?? []) as { user_id: string; full_name: string | null }[]) {
        if (p.full_name) nameByUser.set(p.user_id, p.full_name);
      }
    }

    const reqs: CustomerRequest[] = rows.map((r) => {
      const rps = (r.request_professionals ?? []) as Record<string, unknown>[];
      const pros = rps
        .map((rp) => {
          const prof = rp.professionals as { id: string; user_id: string | null } | null;
          if (!prof) return null;
          return {
            id: prof.id,
            name: (prof.user_id && nameByUser.get(prof.user_id)) || "Professionista",
          };
        })
        .filter(Boolean) as { id: string; name: string }[];
      return {
        id: r.id as string,
        status: r.status as string,
        problem_description: (r.problem_description as string) ?? null,
        created_at: (r.created_at as string) ?? null,
        service: r.services as { name: string } | null,
        city: r.cities as { name: string } | null,
        pros,
      };
    });
    setRequests(reqs);

    const ids = reqs.map((r) => r.id);
    if (ids.length) {
      // Non letti per conversazione (risposte dei pro).
      const { data: unreadRows } = await supabase
        .from("request_messages")
        .select("request_id, professional_id")
        .in("request_id", ids)
        .eq("sender_type", "professional")
        .is("read_at", null);
      const m = new Map<string, number>();
      const mp = new Map<string, number>();
      for (const u of (unreadRows ?? []) as {
        request_id: string;
        professional_id: string | null;
      }[]) {
        m.set(u.request_id, (m.get(u.request_id) ?? 0) + 1);
        const k = `${u.request_id}:${u.professional_id ?? ""}`;
        mp.set(k, (mp.get(k) ?? 0) + 1);
      }
      setUnreadByReq(m);
      setUnreadByPair(mp);

      // Appuntamenti futuri (proposti o confermati) sulle mie richieste.
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, request_id, professional_id, title, starts_at, duration_minutes, status, proposed_by")
        .in("request_id", ids)
        .in("status", ["proposed", "confirmed"])
        .gte("starts_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(6);
      setAppointments((appts as Appointment[]) ?? []);

      const { data: myRatings } = await supabase
        .from("ratings")
        .select("request_id, professional_id")
        .eq("customer_id", user.id);
      setReviewed(
        new Set(
          ((myRatings ?? []) as { request_id: string | null; professional_id: string }[])
            .filter((x) => x.request_id)
            .map((x) => `${x.request_id}:${x.professional_id}`)
        )
      );
    } else {
      setUnreadByReq(new Map());
      setAppointments([]);
    }
    setLoadingData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function markClosed(id: string) {
    const { error } = await supabase
      .from("requests")
      .update({ status: "closed" })
      .eq("id", id);
    if (!error) {
      setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: "closed" } : r)));
    }
  }

  async function respondToAppointment(a: Appointment, ok: boolean) {
    if (!user) return;
    setRespondingAppt(a.id);
    const { error } = await supabase
      .from("appointments")
      .update({ status: ok ? "confirmed" : "declined" })
      .eq("id", a.id);
    if (!error && a.request_id) {
      const { dow, day, time } = fmtDayParts(a.starts_at);
      await sendMessage(
        a.request_id,
        a.professional_id,
        user.id,
        "customer",
        ok
          ? `Ho confermato l'appuntamento di ${dow} ${day} alle ${time}.`
          : `Non posso ${dow} ${day} alle ${time}: proponi un altro orario?`
      );
      notifyEvent(ok ? "appointment_confirmed" : "appointment_declined", {
        requestId: a.request_id,
        professionalId: a.professional_id,
      });
      await load();
    }
    setRespondingAppt(null);
  }

  async function openSlotPicker(a: Appointment) {
    setSlotPickerFor(a);
    setSlots([]);
    setSlotErr(null);
    setOrariConfermati(true);
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/pro/slots?professionalId=${a.professional_id}&duration=${a.duration_minutes}`
      );
      const d = await res.json();
      setSlots((d.slots as string[]) ?? []);
      setOrariConfermati(d.orariConfermati !== false);
    } catch {
      setSlots([]);
    }
    setSlotsLoading(false);
  }

  async function counterPropose(slotIso: string) {
    if (!slotPickerFor || slotSaving) return;
    setSlotSaving(true);
    setSlotErr(null);
    try {
      const res = await fetch("/api/appointments/counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: slotPickerFor.id,
          startsAt: slotIso,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setSlotErr(d.error ?? "Qualcosa è andato storto. Riprova.");
        setSlotSaving(false);
        return;
      }
      setSlotPickerFor(null);
      await load();
    } catch {
      setSlotErr("Qualcosa è andato storto. Riprova.");
    }
    setSlotSaving(false);
  }

  const proName = (professionalId: string) => {
    for (const r of requests) {
      const p = r.pros.find((x) => x.id === professionalId);
      if (p) return p.name;
    }
    return "Professionista";
  };
  const requestById = (id: string | null) => requests.find((r) => r.id === id);

  const openRequests = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const closedRequests = requests.filter((r) => r.status === "closed");
  const apptByRequest = new Set(
    appointments.filter((a) => a.status === "confirmed").map((a) => a.request_id)
  );

  // ---- Da fare ora ----
  type Todo = { key: string; text: string; sub: string; node: React.ReactNode };
  const todos: Todo[] = [];
  for (const r of openRequests) {
    for (const p of r.pros) {
      const n = unreadByPair.get(`${r.id}:${p.id}`) ?? 0;
      if (n > 0) {
        todos.push({
          key: `unread-${r.id}-${p.id}`,
          text: `${p.name} ti ha risposto`,
          sub: `${r.service?.name ?? "Richiesta"}${
            n > 1 ? ` · ${n} messaggi` : ""
          }`,
          node: (
            <Link
              href={`/messaggi?r=${r.id}&p=${p.id}`}
              className="shrink-0 text-sm font-semibold text-bob-indigo hover:underline"
            >
              Rispondi →
            </Link>
          ),
        });
      }
    }
  }
  for (const a of appointments.filter((x) => x.status === "proposed")) {
    const { dow, day, time } = fmtDayParts(a.starts_at);
    if (a.proposed_by === "customer") {
      todos.push({
        key: `appt-${a.id}`,
        text: "Hai proposto un nuovo orario",
        sub: `${dow} ${day} alle ${time} · in attesa di ${proName(a.professional_id)}`,
        node: (
          <span className="shrink-0 text-sm text-bob-ink/45">In attesa ⏳</span>
        ),
      });
      continue;
    }
    todos.push({
      key: `appt-${a.id}`,
      text: `${proName(a.professional_id)} propone un appuntamento`,
      sub: `${dow} ${day} alle ${time}${a.title ? ` · ${a.title}` : ""}`,
      node: (
        <span className="flex shrink-0 flex-wrap gap-x-2.5 gap-y-1">
          <button
            onClick={() => respondToAppointment(a, true)}
            disabled={respondingAppt === a.id}
            className="text-sm font-semibold text-emerald-700 hover:underline"
            data-testid={`appt-confirm-${a.id}`}
          >
            Conferma
          </button>
          <button
            onClick={() => openSlotPicker(a)}
            disabled={respondingAppt === a.id}
            className="text-sm font-medium text-bob-indigo hover:underline"
            data-testid={`appt-counter-${a.id}`}
          >
            Altro orario
          </button>
          <button
            onClick={() => respondToAppointment(a, false)}
            disabled={respondingAppt === a.id}
            className="text-sm font-medium text-bob-ink/50 hover:text-red-600 hover:underline"
            data-testid={`appt-decline-${a.id}`}
          >
            Rifiuta
          </button>
        </span>
      ),
    });
  }
  for (const r of openRequests) {
    const n = unreadByReq.get(r.id) ?? 0;
    const ageDays = r.created_at
      ? (Date.now() - new Date(r.created_at).getTime()) / 86400000
      : 0;
    if (n === 0 && r.status === "matched" && ageDays > 10) {
      todos.push({
        key: `close-${r.id}`,
        text: "È andato tutto bene?",
        sub: `${r.service?.name ?? "Richiesta"} · in corso dal ${fmtDate(r.created_at)}`,
        node: (
          <button
            onClick={() => setConfirmClose(r.id)}
            className="shrink-0 text-sm font-semibold text-bob-indigo hover:underline"
          >
            Chiudi e recensisci →
          </button>
        ),
      });
    }
  }
  for (const r of closedRequests) {
    if (r.pros.length > 0 && r.pros.some((p) => !reviewed.has(`${r.id}:${p.id}`))) {
      todos.push({
        key: `review-${r.id}`,
        text: `Com'è andata con ${r.pros[0]?.name}?`,
        sub: `${r.service?.name ?? "Lavoro"} concluso · la tua recensione aiuta gli altri`,
        node: (
          <button
            onClick={() => setReviewFor(r)}
            className="shrink-0 text-sm font-semibold text-bob-indigo hover:underline"
          >
            ★ Recensisci →
          </button>
        ),
      });
    }
  }

  // ---- I tuoi professionisti (dedup, con conversazione più recente) ----
  const trustedPros: { id: string; name: string; requestId: string }[] = [];
  for (const r of requests) {
    for (const p of r.pros) {
      if (!trustedPros.some((t) => t.id === p.id)) {
        trustedPros.push({ id: p.id, name: p.name, requestId: r.id });
      }
    }
  }

  if (loadingData) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-28 animate-pulse bg-black/[0.03]" />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bob-indigo-50 text-bob-indigo">
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-semibold text-bob-ink">Nessuna richiesta ancora</h3>
        <p className="max-w-sm text-sm text-bob-ink/60">
          Racconta a Bob il tuo problema: capisce di cosa hai bisogno e ti
          mette in contatto con i professionisti giusti.
        </p>
        <Link href="/#bob" className="btn-primary mt-1 px-5 py-2.5">
          Parla con Bob
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---- 1. Da fare ora ---- */}
      {todos.length > 0 && (
        <section
          className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
          data-testid="todo-strip"
        >
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            Da fare ora
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {todos.slice(0, 4).map((t) => (
              <li
                key={t.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-2.5 shadow-sm"
              >
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-bob-ink">{t.text}</span>
                  <span className="text-bob-ink/55"> · {t.sub}</span>
                </span>
                {t.node}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ---- 2. Lavori in corso ---- */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-bob-ink/55">
            Lavori in corso
          </h2>
          {openRequests.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-bob-indigo/25 bg-bob-indigo-50/40 p-4 text-center">
              <p className="text-sm text-bob-ink/60">
                Nessun lavoro in corso.{" "}
                <Link href="/#bob" className="font-medium text-bob-indigo hover:underline">
                  Parla con Bob
                </Link>{" "}
                per iniziarne uno.
              </p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {openRequests.map((r) => {
                const n = unreadByReq.get(r.id) ?? 0;
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-black/5 p-3.5"
                    data-testid={`request-${r.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bob-ink">
                          {r.service?.name ?? "Richiesta"}
                          {r.city?.name ? (
                            <span className="font-normal text-bob-ink/50">
                              {" "}
                              · {r.city.name}
                            </span>
                          ) : null}
                        </p>
                        {r.problem_description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-bob-ink/55">
                            {r.problem_description}
                          </p>
                        )}
                      </div>
                      {n > 0 && (
                        <span className="shrink-0 rounded-full bg-bob-indigo px-2 py-0.5 text-[11px] font-bold text-white">
                          {n > 9 ? "9+" : n} nuov{n === 1 ? "o" : "i"}
                        </span>
                      )}
                    </div>
                    <StatusTimeline
                      status={r.status}
                      hasAppointment={apptByRequest.has(r.id)}
                      quoteCount={r.pros.length}
                    />
                    {r.pros.length > 1 ? (
                      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-black/5 pt-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-bob-ink/40">
                          Confronta le risposte
                        </p>
                        {r.pros.map((p) => {
                          const un = unreadByPair.get(`${r.id}:${p.id}`) ?? 0;
                          return (
                            <div
                              key={p.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 truncate text-xs font-medium text-bob-ink">
                                {p.name}
                                {un > 0 && (
                                  <span className="ml-2 rounded-full bg-bob-indigo px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {un}
                                  </span>
                                )}
                              </span>
                              <Link
                                href={`/messaggi?r=${r.id}&p=${p.id}`}
                                className="shrink-0 text-xs font-medium text-bob-indigo hover:underline"
                              >
                                Apri →
                              </Link>
                            </div>
                          );
                        })}
                        <button
                          onClick={() => setConfirmClose(r.id)}
                          disabled={closing === r.id}
                          className="mt-1 self-start text-xs font-medium text-bob-ink/50 hover:text-bob-indigo hover:underline"
                        >
                          {closing === r.id ? "Salvo…" : "Segna come concluso ✓"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-black/5 pt-2.5">
                        <Link
                          href={`/messaggi?r=${r.id}${
                            r.pros[0] ? `&p=${r.pros[0].id}` : ""
                          }`}
                          className="text-xs font-medium text-bob-indigo hover:underline"
                        >
                          Apri la conversazione →
                        </Link>
                        <button
                          onClick={() => setConfirmClose(r.id)}
                          disabled={closing === r.id}
                          className="text-xs font-medium text-bob-ink/50 hover:text-bob-indigo hover:underline"
                        >
                          {closing === r.id ? "Salvo…" : "Segna come concluso ✓"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- 3. Prossimi appuntamenti ---- */}
        <section className="card p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-bob-ink/55">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            Prossimi appuntamenti
          </h2>
          {appointments.length === 0 ? (
            <p className="mt-4 text-sm text-bob-ink/50">
              Nessun appuntamento in programma. Quando un professionista te ne
              propone uno, lo trovi qui.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {appointments.map((a) => {
                const { dow, day, time } = fmtDayParts(a.starts_at);
                const req = requestById(a.request_id);
                const proposed = a.status === "proposed";
                return (
                  <li key={a.id} className="flex items-center gap-3" data-testid={`appt-${a.id}`}>
                    {/* LA DATA E' CLICCABILE (05/09): apre «lo metto nel tuo
                        calendario?». Prima era testo da ricopiare a mano. */}
                    <AggiungiAlCalendario
                      appuntamento={a}
                      titoloVisibile={a.title || requestById(a.request_id)?.service?.name || undefined}
                      className="no-underline"
                    >
                      <span
                        className={`block min-w-[46px] rounded-xl px-2 py-1.5 text-center ${
                          proposed ? "bg-amber-50" : "bg-bob-indigo-50"
                        }`}
                      >
                        <span
                          className={`block text-[10px] font-medium ${
                            proposed ? "text-amber-700" : "text-bob-indigo"
                          }`}
                        >
                          {dow}
                        </span>
                        <span
                          className={`block text-base font-bold leading-tight ${
                            proposed ? "text-amber-800" : "text-bob-indigo"
                          }`}
                        >
                          {day}
                        </span>
                      </span>
                    </AggiungiAlCalendario>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-bob-ink">
                        {a.title || req?.service?.name || "Appuntamento"}
                      </p>
                      <p className="truncate text-xs text-bob-ink/55">
                        {time} · {proName(a.professional_id)}
                        {proposed ? " · da confermare" : ""}
                      </p>
                    </div>
                    {proposed &&
                      (a.proposed_by === "customer" ? (
                        <span className="shrink-0 text-[11px] text-bob-ink/40">
                          In attesa ⏳
                        </span>
                      ) : (
                        <button
                          onClick={() => respondToAppointment(a, true)}
                          disabled={respondingAppt === a.id}
                          className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Conferma
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}

          {/* ---- 4. I tuoi professionisti ---- */}
          {trustedPros.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-bob-ink/55">
                I tuoi professionisti
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {trustedPros.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bob-indigo-50 text-[11px] font-bold text-bob-indigo">
                      {p.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <Link
                      href={`/professionisti/${p.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-bob-ink hover:text-bob-indigo"
                    >
                      {p.name}
                    </Link>
                    <Link
                      href={`/messaggi?r=${p.requestId}&p=${p.id}`}
                      className="shrink-0 text-xs font-medium text-bob-indigo hover:underline"
                    >
                      Scrivi →
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* ---- 5. Storico ---- */}
      {closedRequests.length > 0 && (
        <section className="card p-5">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex w-full items-center justify-between text-left"
            data-testid="toggle-history"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-bob-ink/55">
              Storico · {closedRequests.length} lavor
              {closedRequests.length === 1 ? "o" : "i"} conclus
              {closedRequests.length === 1 ? "o" : "i"}
            </h2>
            <span className="text-bob-ink/40">{showHistory ? "▲" : "▼"}</span>
          </button>
          {showHistory && (
            <ul className="mt-3 flex flex-col divide-y divide-black/5">
              {closedRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-bob-ink">
                      {r.service?.name ?? "Richiesta"}
                      {r.pros[0] ? (
                        <span className="font-normal text-bob-ink/50">
                          {" "}
                          · {r.pros[0].name}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-bob-ink/45">{fmtDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/messaggi?r=${r.id}${
                        r.pros[0] ? `&p=${r.pros[0].id}` : ""
                      }`}
                      className="text-xs font-medium text-bob-indigo hover:underline"
                    >
                      Conversazione
                    </Link>
                    {r.pros.length > 0 &&
                      (r.pros.some((p) => !reviewed.has(`${r.id}:${p.id}`)) ? (
                        <button
                          onClick={() => setReviewFor(r)}
                          className="text-xs font-semibold text-bob-indigo hover:underline"
                        >
                          ★ Recensisci
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-700">✓ Recensito</span>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- dialogs ---- */}
      {slotPickerFor && (
        <div
          className="fixed inset-0 z-50 flex h-[100dvh] items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSlotPickerFor(null)}
        >
          <div
            className="card max-h-[80dvh] w-full max-w-md overflow-y-auto overscroll-contain p-6"
            onClick={(e) => e.stopPropagation()}
            data-testid="dialog-slot-picker"
          >
            <h3 className="text-lg font-bold text-bob-ink">
              Proponi un altro orario
            </h3>
            <p className="mt-1 text-sm text-bob-ink/60">
              Questi sono gli orari liberi di{" "}
              {proName(slotPickerFor.professional_id)} nei prossimi giorni:
              scegline uno e glielo propongo io.
            </p>
            {slotsLoading ? (
              <p className="mt-5 text-sm text-bob-ink/50">
                Controllo le disponibilità…
              </p>
            ) : !orariConfermati ? (
              /* Vedi /api/pro/slots: «nessuno slot» e «orari mai dichiarati»
                 sono due cose diverse e al cliente vanno dette diverse. */
              <p
                className="mt-5 text-sm text-bob-ink/60"
                data-testid="slot-orari-mancanti"
              >
                {proName(slotPickerFor.professional_id)} non ha ancora indicato
                i suoi orari, quindi non posso mostrarti quando è libero:
                scrivi in chat e proponi tu quando ti andrebbe bene.
              </p>
            ) : slots.length === 0 ? (
              <p className="mt-5 text-sm text-bob-ink/60">
                Non ci sono slot liberi nei prossimi 7 giorni: scrivigli in
                chat e trovate un orario insieme.
              </p>
            ) : (
              (() => {
                const byDay = new Map<string, string[]>();
                for (const s of slots) {
                  const d = new Date(s);
                  const key = d.toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  });
                  byDay.set(key, [...(byDay.get(key) ?? []), s]);
                }
                return (
                  <div className="mt-4 flex flex-col gap-3">
                    {Array.from(byDay.entries()).map(([day, daySlots]) => (
                      <div key={day}>
                        <p className="text-xs font-semibold capitalize text-bob-ink/55">
                          {day}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {daySlots.map((s) => (
                            <button
                              key={s}
                              onClick={() => counterPropose(s)}
                              disabled={slotSaving}
                              className="chip hover:bg-bob-indigo-100 disabled:opacity-50"
                              data-testid={`slot-${s}`}
                            >
                              {new Date(s).toLocaleTimeString("it-IT", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
            {slotErr && <p className="mt-3 text-xs text-red-600">{slotErr}</p>}
            <button
              onClick={() => setSlotPickerFor(null)}
              className="btn-secondary mt-5 w-full py-2.5"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {confirmClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmClose(null)}
        >
          <div
            className="card w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
            data-testid="dialog-close-request"
          >
            <h3 className="text-lg font-bold text-bob-ink">Lavoro concluso?</h3>
            <p className="mt-2 text-sm text-bob-ink/65">
              Confermi che il lavoro è stato concluso? Dopo potrai lasciare una
              recensione al professionista.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmClose(null)}
                className="btn-secondary flex-1 py-2.5"
                data-testid="button-close-cancel"
              >
                Non ancora
              </button>
              <button
                onClick={async () => {
                  const id = confirmClose;
                  setConfirmClose(null);
                  setClosing(id);
                  await markClosed(id);
                  setClosing(null);
                }}
                className="btn-primary flex-1 py-2.5"
                data-testid="button-close-confirm"
              >
                Sì, concluso ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewFor && (
        <ReviewDialog
          requestId={reviewFor.id}
          professionals={reviewFor.pros.filter(
            (p) => !reviewed.has(`${reviewFor.id}:${p.id}`)
          )}
          onClose={() => setReviewFor(null)}
          onSubmitted={(proId) =>
            setReviewed((prev) => new Set([...prev, `${reviewFor.id}:${proId}`]))
          }
        />
      )}
    </div>
  );
}
