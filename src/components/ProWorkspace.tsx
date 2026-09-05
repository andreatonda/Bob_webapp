"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notifyEvent } from "@/lib/notify";
import { Wrench, Calendar as CalendarIcon } from "lucide-react";
import { Stars, VerificationLevelBadge } from "@/components/ui";
import type { VerificationLevel } from "@/lib/vat";
import { AppointmentDialog } from "@/components/AppointmentDialog";
import { AppointmentDetail } from "@/components/AppointmentDetail";
import { ProCalendar } from "@/components/ProCalendar";
import { DayItinerary } from "@/components/DayItinerary";
import { ProRequestSummary } from "@/components/ProRequestSummary";
import { StatoProfiloCard } from "@/components/StatoProfiloCard";
import { fmtDay, fmtDuration, fmtRange } from "@/lib/calendar";
import {
  getAppointments,
  updateAppointment,
  sendMessage,
  computeStats,
  type ProStats,
} from "@/lib/messages";
import type {
  Appointment,
  SubscriptionTier,
  VerificationStatus,
} from "@/lib/supabase/types";

interface ProProfile {
  id: string;
  user_id: string;
  headline: string | null;
  bio: string | null;
  verification_status: VerificationStatus;
  /** Livello del blocco 10: è quello che vedono i clienti. */
  verification_level: VerificationLevel;
  subscription_tier: SubscriptionTier;
  city: { name: string } | null;
}

export function ProWorkspace({
  profile,
  rating,
  name,
}: {
  profile: ProProfile | null;
  rating: { avg: number | null; n: number };
  name: string;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
  // Appuntamento aperto nel pannello di dettaglio: teniamo l'id e non
  // l'oggetto, così dopo un salvataggio il pannello mostra i dati freschi.
  const [detailId, setDetailId] = useState<string | null>(null);
  // Giornata a fuoco nel calendario: alimenta il giro del giorno.
  const [focusDay, setFocusDay] = useState<Date>(() => new Date());
  const handleFocusDay = useCallback((d: Date) => setFocusDay(d), []);

  const proId = profile?.id ?? null;

  async function reload() {
    if (!proId) return;
    setLoading(true);
    const data = await getAppointments(proId);
    setAppointments(data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proId]);

  const stats: ProStats = useMemo(
    () => computeStats(appointments),
    [appointments]
  );

  const detail = useMemo(
    () => appointments.find((a) => a.id === detailId) ?? null,
    [appointments, detailId]
  );

  const upcoming = useMemo(() => {
    const now = new Date();
    return appointments
      .filter(
        (a) =>
          new Date(a.starts_at) >= now &&
          a.status !== "cancelled" &&
          a.status !== "declined"
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 6);
  }, [appointments]);

  // Contro-proposte del cliente in attesa della conferma del pro.
  const pendingFromCustomers = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            a.status === "proposed" &&
            a.proposed_by === "customer" &&
            new Date(a.starts_at) >= new Date()
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [appointments]
  );

  async function respondToCustomerProposal(a: Appointment, ok: boolean) {
    await updateAppointment(a.id, {
      status: ok ? "confirmed" : "cancelled",
    });
    if (a.request_id && profile?.user_id && proId) {
      const label = new Date(a.starts_at).toLocaleString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      await sendMessage(
        a.request_id,
        proId,
        profile.user_id,
        "professional",
        ok
          ? `Confermo l'appuntamento di ${label}. A presto!`
          : `Purtroppo ${label} non riesco: scrivimi e troviamo un altro orario.`
      );
      notifyEvent(ok ? "appointment_confirmed" : "appointment_declined", {
        requestId: a.request_id,
        professionalId: proId,
      });
    }
    await reload();
  }

  if (!profile) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bob-indigo-50 text-bob-indigo">
          <Wrench className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-semibold text-bob-ink">
          Completa l&apos;iscrizione per iniziare
        </h3>
        <p className="max-w-sm text-sm text-bob-ink/60">
          Scegli il piano e racconta cosa offri, in che città lavori e le tue
          tariffe: bastano due minuti. La verifica della partita IVA, se il tuo
          piano la include, la fai da solo subito dopo.
        </p>
        <Link
          href="/onboarding/piano"
          className="btn-primary mt-1 px-5 py-2.5"
          data-testid="link-create-profile"
        >
          Completa l&apos;iscrizione →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Riassunto richieste AI — primo blocco visibile.
          data-tour: la guida del primo accesso illumina questo riquadro vero,
          non un suo disegno. Se sparisce l'attributo, il passo 1 della guida
          resta senza ancora e si degrada a pannello centrale. */}
      {proId && (
        <div data-tour="richieste">
          <ProRequestSummary />
        </div>
      )}

      {/* Contro-proposte dei clienti: un tap per confermare */}
      {pendingFromCustomers.length > 0 && (
        <section
          className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
          data-testid="pending-proposals"
        >
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Orari proposti dai clienti
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {pendingFromCustomers.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-2.5 shadow-sm"
              >
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-bob-ink">
                    {a.customer_name}
                  </span>
                  <span className="text-bob-ink/55">
                    {" "}
                    · {a.title ?? "Appuntamento"} ·{" "}
                    {new Date(a.starts_at).toLocaleString("it-IT", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    onClick={() => respondToCustomerProposal(a, true)}
                    className="text-sm font-semibold text-emerald-700 hover:underline"
                    data-testid={`pro-appt-confirm-${a.id}`}
                  >
                    Conferma
                  </button>
                  <button
                    onClick={() => respondToCustomerProposal(a, false)}
                    className="text-sm font-medium text-bob-ink/50 hover:text-red-600 hover:underline"
                  >
                    Rifiuta
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Guadagni questo mese"
          value={`€ ${stats.earningsMonth.toLocaleString("it-IT")}`}
          accent
        />
        <KpiCard
          label="Ore lavorate (mese)"
          value={`${stats.hoursMonth} h`}
        />
        <KpiCard
          label="Ore prenotate"
          value={`${stats.hoursBooked} h`}
          hint={`${stats.upcomingCount} appuntamenti`}
        />
        <KpiCard
          label="Guadagni totali"
          value={`€ ${stats.earningsTotal.toLocaleString("it-IT")}`}
          hint={`${stats.completedCount} lavori conclusi`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Calendario con asse delle ore, stile Google Calendar */}
        <div className="card p-4 sm:p-5" data-tour="calendario">
          <ProCalendar
            appointments={appointments}
            loading={loading}
            onCreateAt={(start) => {
              setEditing(null);
              setDefaultDate(start);
              setDialogOpen(true);
            }}
            onSelect={(a) => setDetailId(a.id)}
            onFocusDayChange={handleFocusDay}
            selectedId={detailId}
          />

          <button
            onClick={() => {
              setEditing(null);
              setDefaultDate(undefined);
              setDialogOpen(true);
            }}
            className="btn-primary mt-4 w-full py-2.5"
            data-testid="button-new-appointment"
          >
            + Nuovo appuntamento
          </button>
        </div>

        {/* Colonna laterale: stato del profilo, giro del giorno, prossimi.
            Lo stato sta in cima perche' e' l'unica cosa della colonna che puo'
            impedire al lavoro di arrivare: gli appuntamenti di oggi non
            servono a chi non compare in nessuna ricerca. */}
        <div className="space-y-4">
          <StatoProfiloCard
            professionalId={profile.id}
            userId={profile.user_id}
          />

          <DayItinerary
            day={focusDay}
            appointments={appointments}
            onSelect={(a) => setDetailId(a.id)}
          />

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-bob-ink">
              Prossimi appuntamenti
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-bob-ink/50">
                Nessun appuntamento in programma.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((a) => (
                  <li
                    key={a.id}
                    className="border-b border-black/5 pb-2.5 last:border-0 last:pb-0"
                  >
                    <button
                      onClick={() => setDetailId(a.id)}
                      className="flex w-full items-start justify-between gap-2 text-left"
                      data-testid={`appt-upcoming-${a.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-bob-ink">
                          {a.customer_name}
                        </p>
                        <p className="truncate text-xs text-bob-ink/55">
                          {a.title ?? "Appuntamento"}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-bob-indigo">
                          {fmtDay(new Date(a.starts_at))} · {fmtRange(a)}
                        </p>
                        <p className="text-[11px] text-bob-ink/45">
                          {fmtDuration(a.duration_minutes)}
                        </p>
                      </div>
                      {a.price != null && (
                        <span className="shrink-0 text-sm font-semibold text-bob-ink">
                          € {a.price}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-bob-ink">{name}</h3>
                {profile.headline && (
                  <p className="truncate text-xs text-bob-ink/60">
                    {profile.headline}
                  </p>
                )}
              </div>
              {/* Qui il pro deve vedere la stessa etichetta che vedono i
                  clienti, non lo stato interno dell'approvazione staff. */}
              <VerificationLevelBadge
                level={profile.verification_level}
                verifiedAt={null}
                compact
              />
            </div>
            <div className="mt-3 border-t border-black/5 pt-3">
              <Stars value={rating.avg} count={rating.n} />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/impostazioni/azienda"
                className="btn-secondary py-2 text-center text-sm"
                data-testid="link-edit-profile"
              >
                Modifica profilo
              </Link>
              {/* «VAI AI MESSAGGI» NON E' PIU' QUI (05/09). Il link e' del
                  03/06; la bolla flottante dei messaggi e' del 17/07 e sta su
                  ogni pagina tranne /messaggi e /admin, quindi anche su questa,
                  in basso a destra, col conteggio dei non letti che questo
                  link non aveva. E' la rimozione che quel cambio non ha fatto:
                  due strade per lo stesso posto, e quella che restava indietro
                  era questa. */}
              <Link
                href={`/professionisti/${profile.id}`}
                className="btn-ghost justify-center text-sm"
              >
                Vedi profilo pubblico
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Il portfolio e' uscito da qui: e' un blocco che si aggiorna una volta
          al mese e stava sotto il calendario, che si guarda ogni mattina.
          Adesso vive in /impostazioni/lavori. */}

      {/* Dettaglio: si apre al click su un blocco del calendario */}
      {detail && !dialogOpen && (
        <AppointmentDetail
          appt={detail}
          onClose={() => setDetailId(null)}
          onEdit={(a) => {
            setEditing(a);
            setDefaultDate(undefined);
            setDialogOpen(true);
          }}
          onChanged={reload}
        />
      )}

      {dialogOpen && proId && (
        <AppointmentDialog
          professionalId={proId}
          existing={editing}
          defaultDate={defaultDate}
          onClose={() => {
            setDialogOpen(false);
            setDetailId(null);
          }}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`card p-4 ${
        accent ? "bg-bob-indigo text-white" : ""
      }`}
    >
      <p
        className={`text-xs font-medium ${
          accent ? "text-white/70" : "text-bob-ink/55"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${
          accent ? "text-white" : "text-bob-ink"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p
          className={`mt-0.5 text-[11px] ${
            accent ? "text-white/60" : "text-bob-ink/45"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
