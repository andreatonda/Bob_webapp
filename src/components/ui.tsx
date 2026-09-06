import Link from "next/link";
import { Search } from "lucide-react";
import type { VerificationStatus, ProfessionalCard } from "@/lib/supabase/types";
import {
  VERIFICATION_LABEL,
  VERIFICATION_MEANING,
  VERIFICATION_CAVEAT,
  type VerificationLevel,
} from "@/lib/vat";

// ---------- Punto giallo BOB ----------
// Il bullet della casa: sostituisce il pallino generico e il disc di lista
// dovunque un elenco sia decorativo (benefici, feature, claim). NON va usato
// come separatore fra dati ("10:00 · Mario Rossi"): lì il middot serve a
// leggere, il giallo lo trasformerebbe in rumore.
export function BobDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-bob-yellow ${className}`}
    />
  );
}

// Voce di elenco con il punto giallo, allineata alla prima riga di testo.
export function BobBullet({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={`flex items-start gap-2.5 ${className}`}>
      <BobDot className="mt-[0.45rem]" />
      <span>{children}</span>
    </li>
  );
}

// ---------- Rating a stelle ----------
export function Stars({
  value,
  count,
  size = "sm",
}: {
  value: number | null;
  count?: number;
  size?: "sm" | "md";
}) {
  if (value === null) {
    return (
      <span className="text-xs text-bob-ink/40" data-testid="text-no-rating">
        Ancora senza recensioni
      </span>
    );
  }
  const px = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1" data-testid="rating">
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <svg
            key={i}
            className={`${px} ${i <= full ? "text-bob-yellow" : "text-black/15"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.36 4.18a1 1 0 0 0 .95.69h4.4c.97 0 1.37 1.24.59 1.81l-3.56 2.59a1 1 0 0 0-.36 1.12l1.36 4.18c.3.92-.75 1.69-1.54 1.12l-3.56-2.59a1 1 0 0 0-1.18 0l-3.56 2.59c-.78.57-1.83-.2-1.53-1.12l1.36-4.18a1 1 0 0 0-.36-1.12L1.4 9.6c-.78-.57-.38-1.81.59-1.81h4.4a1 1 0 0 0 .95-.69L9.05 2.93Z" />
          </svg>
        ))}
      </span>
      <span className="text-sm font-semibold text-bob-ink">{value.toFixed(1)}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-xs text-bob-ink/50">({count})</span>
      )}
    </span>
  );
}

// ---------- Badge di verifica ----------
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
        data-testid="badge-verified"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.58l-1.3-1.3a1 1 0 0 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l4-4Z"
            clipRule="evenodd"
          />
        </svg>
        Verificato
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        Verifica in corso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-bob-ink/60">
      Non ancora verificato
    </span>
  );
}

// ---------- Badge del livello di verifica (blocco 10) ----------
//
// Il livello da solo non è un'informazione onesta: mostriamo sempre la DATA del
// riscontro, e nel tooltip cosa attesta e cosa NON attesta (ToS §3.2).
// Nelle card usiamo `compact`: nessun popup, solo il title del browser, per non
// annidare elementi interattivi dentro il link della card.
// Fuso esplicito: questo componente rende sia sul server (Vercel, UTC) sia nel
// browser del professionista. Senza timeZone la stessa verifica risulterebbe
// fatta in due giorni diversi a seconda di chi guarda.
function fmtVerifiedDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/Rome",
    });
  } catch {
    return null;
  }
}

const LEVEL_STYLE: Record<VerificationLevel, string> = {
  none: "bg-black/5 text-bob-ink/60",
  vat_verified: "bg-bob-indigo-50 text-bob-indigo",
  documents_verified: "bg-emerald-50 text-emerald-700",
};

export function VerificationLevelBadge({
  level,
  verifiedAt,
  compact = false,
}: {
  level: VerificationLevel;
  verifiedAt: string | null;
  compact?: boolean;
}) {
  const label = VERIFICATION_LABEL[level];
  const date = fmtVerifiedDate(verifiedAt);
  const meaning = VERIFICATION_MEANING[level];
  const caveat = VERIFICATION_CAVEAT[level];

  const pill = (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_STYLE[level]}`}
    >
      {level !== "none" && (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.58l-1.3-1.3a1 1 0 0 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l4-4Z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {label}
      {date && <span className="font-normal opacity-70">· {date}</span>}
    </span>
  );

  if (compact) {
    return (
      <span title={`${meaning} ${caveat}`} data-testid={`badge-level-${level}`}>
        {pill}
      </span>
    );
  }

  return (
    <span
      className="group relative inline-flex"
      tabIndex={0}
      data-testid={`badge-level-${level}`}
    >
      {pill}
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-64 rounded-xl bg-bob-ink px-3 py-2 text-xs leading-relaxed text-white shadow-lg group-hover:block group-focus:block">
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block opacity-90">{meaning}</span>
        <span className="mt-1 block opacity-70">{caveat}</span>
      </span>
    </span>
  );
}

// ---------- Prezzo ----------
export function PriceTag({
  min,
  max,
}: {
  min: number | null;
  max: number | null;
}) {
  if (min === null && max === null) {
    return <span className="text-sm text-bob-ink/50">Tariffa su richiesta</span>;
  }
  const fmt = (n: number) => `${Number(n).toLocaleString("it-IT")}€`;
  return (
    <span className="text-sm font-semibold text-bob-ink" data-testid="text-price">
      {min !== null && max !== null
        ? `${fmt(min)}–${fmt(max)}`
        : fmt((min ?? max) as number)}
      <span className="font-normal text-bob-ink/50">/h</span>
    </span>
  );
}

// ---------- Card professionista ----------
/**
 * `intervento` c'e' solo quando si arriva da una ricerca per un lavoro
 * preciso. In quel caso la scheda dice se quel lavoro e' dichiarato oppure no:
 * senza questa riga, un idraulico che non fa quell'intervento sembrerebbe una
 * risposta alla domanda, e non lo e'. Dirlo costa una riga e vale piu' di
 * nascondere il professionista, che con sei iscritti vorrebbe dire mostrare
 * una pagina vuota.
 */
export function ProfessionalCardItem({
  p,
  intervento,
}: {
  p: ProfessionalCard;
  intervento?: { slug: string; nome: string } | null;
}) {
  const dichiarato =
    intervento != null &&
    p.offers.some((o) => o.subserviceSlug === intervento.slug);
  const initials = p.displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/professionisti/${p.id}`}
      className="card group flex flex-col gap-3 p-5 hover:-translate-y-0.5 hover:shadow-card-hover"
      data-testid={`card-professional-${p.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bob-indigo-100 text-sm font-bold text-bob-indigo">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-bob-ink">{p.displayName}</h3>
          </div>
          <p className="truncate text-sm text-bob-ink/60">{p.headline}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {p.serviceName && <span className="chip">{p.serviceName}</span>}
        <span className="chip border-black/10 bg-black/[0.03] text-bob-ink/70">
          {p.city.name}
        </span>
      </div>

      {intervento && (
        <p
          className={`text-xs ${dichiarato ? "font-medium text-bob-ink/75" : "text-bob-ink/45"}`}
          data-testid={dichiarato ? "offre-intervento" : "non-dichiara-intervento"}
        >
          {dichiarato
            ? `Offre ${intervento.nome.toLowerCase()}`
            : "Non ha dichiarato questo intervento"}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-black/5 pt-3">
        <Stars value={p.avgRating} count={p.nRatings} />
        <PriceTag min={p.minPrice} max={p.maxPrice} />
      </div>

      <div className="flex items-center justify-between">
        <VerificationLevelBadge
          level={p.verificationLevel}
          verifiedAt={p.verifiedAt}
          compact
        />
        {p.responseTimeLabel && (
          <span className="text-xs text-bob-ink/50">{p.responseTimeLabel}</span>
        )}
      </div>
    </Link>
  );
}

// ---------- Stato vuoto ----------
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bob-indigo-50 text-bob-indigo">
        <Search className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-bob-ink">{title}</h3>
      <p className="max-w-sm text-sm text-bob-ink/60">{description}</p>
    </div>
  );
}
