import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCities,
  getServices,
  getProfessionals,
  offreIntervento,
} from "@/lib/data";
import { resolveSearch, SOGLIA_CERTEZZA } from "@/lib/search";
import { ProfessionalFilters } from "@/components/ProfessionalFilters";
import { RicercaBox } from "@/components/RicercaBox";
import { ProfessionalCardItem, EmptyState } from "@/components/ui";
import { ComeOrdiniamo } from "@/components/ComeOrdiniamo";
import type { ProfessionalCard } from "@/lib/supabase/types";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Professionisti",
  description:
    "Cerca il lavoro che ti serve e trova i professionisti verificati di BOB: idraulici, elettricisti, pulizie e altri servizi a Milano, con rating e tariffe trasparenti.",
};

/**
 * Il riordino esplicito del cliente («rating piu' alto», «prezzo piu' basso»)
 * agisce DENTRO i due gruppi, non sopra: chi ha dichiarato l'intervento
 * cercato resta davanti a chi non l'ha dichiarato. Altrimenti scegliere
 * «prezzo piu' basso» rimescolerebbe insieme chi fa quel lavoro e chi no, e la
 * ricerca per intervento si perderebbe al primo tocco di una tendina.
 */
function sortPros(
  pros: ProfessionalCard[],
  sort: string,
  subserviceSlug?: string
) {
  const copy = [...pros];
  const criterio =
    sort === "rating"
      ? (a: ProfessionalCard, b: ProfessionalCard) =>
          (b.avgRating ?? 0) - (a.avgRating ?? 0)
      : sort === "prezzo"
        ? (a: ProfessionalCard, b: ProfessionalCard) =>
            (a.minPrice ?? 9999) - (b.minPrice ?? 9999)
        : null;
  if (!criterio) return copy;
  copy.sort((a, b) => {
    if (subserviceSlug) {
      const ia = offreIntervento(a, subserviceSlug) ? 1 : 0;
      const ib = offreIntervento(b, subserviceSlug) ? 1 : 0;
      if (ia !== ib) return ib - ia;
    }
    return criterio(a, b);
  });
  return copy;
}

export default async function ProfessionalsPage({
  searchParams,
}: {
  searchParams: { city?: string; service?: string; sort?: string; q?: string };
}) {
  const frase = (searchParams.q ?? "").trim().slice(0, 120);

  // La frase la interpreta il SERVER, sempre: cosi' l'indirizzo scritto a mano,
  // il link condiviso e il tasto Invio danno lo stesso risultato. La casella di
  // ricerca non decide niente da sola.
  const ricerca = frase ? await resolveSearch(frase) : null;
  const capito = ricerca?.matches[0] ?? null;

  // L'INDIRIZZO E' L'UNICA VERITA'. Se la frase ha dedotto un mestiere o una
  // citta' che non sono nell'indirizzo, ce li mettiamo e ricarichiamo. Senza
  // questo passaggio le tendine direbbero «Tutti» mentre l'elenco e' filtrato —
  // e peggio: toccando un'altra tendina il filtro dedotto sparirebbe in
  // silenzio, perche' quel componente ricostruisce i parametri da quelli che
  // vede nell'indirizzo.
  if (ricerca) {
    const servizioDedotto = capito?.service ?? null;
    const cittaDedotta = ricerca.citySlug ?? null;
    if (
      (servizioDedotto && !searchParams.service) ||
      (cittaDedotta && !searchParams.city)
    ) {
      const p = new URLSearchParams();
      p.set("q", frase);
      const servizio = searchParams.service ?? servizioDedotto;
      const citta = searchParams.city ?? cittaDedotta;
      if (servizio) p.set("service", servizio);
      if (citta) p.set("city", citta);
      if (searchParams.sort) p.set("sort", searchParams.sort);
      redirect(`/professionisti?${p.toString()}`);
    }
  }

  // L'intervento su cui ordinare e da etichettare sulle schede. Solo se la
  // corrispondenza e' un intervento (non un mestiere) e solo sopra la soglia:
  // a 0.45 il risolutore non sa, e non si riordina l'elenco su un forse.
  const interventoCercato =
    capito?.subservice && (capito.score ?? 0) >= SOGLIA_CERTEZZA
      ? { slug: capito.subservice, nome: capito.display }
      : null;

  const [cities, services, pros] = await Promise.all([
    getCities(),
    getServices(),
    getProfessionals({
      citySlug: searchParams.city,
      serviceSlug: searchParams.service,
      subserviceSlug: interventoCercato?.slug,
    }),
  ]);

  const sorted = sortPros(
    pros,
    searchParams.sort ?? "consigliati",
    interventoCercato?.slug
  );

  // Sopra la soglia la risposta e' una risposta. Sotto e' un «forse cercavi», e
  // va detto: a 0.45 il risolutore, onestamente, non sa (docs/RICERCA.md §3).
  const sicuro = (capito?.score ?? 0) >= SOGLIA_CERTEZZA;
  const alternative = (ricerca?.matches ?? []).slice(1, 3);

  return (
    <div className="container-bob py-10">
      <header className="mb-6">
        <span className="section-eyebrow">Professionisti</span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-bob-ink sm:text-3xl">
          Trova il professionista giusto
        </h1>
        <p className="mt-2 max-w-xl text-sm text-bob-ink/60">
          Scrivi il lavoro che ti serve con parole tue, oppure filtra per città
          e servizio.
        </p>
      </header>

      <div className="mb-3">
        <RicercaBox valoreIniziale={frase} />
      </div>

      {ricerca && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 text-sm"
          data-testid="interpretazione-ricerca"
        >
          {capito ? (
            <>
              <span className="text-bob-ink/60">
                {sicuro ? "Stai cercando" : "Forse cercavi"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-bob-indigo-50 px-3 py-1 text-bob-ink">
                {capito.display}
                <Link
                  href="/professionisti"
                  aria-label="Azzera la ricerca"
                  className="text-bob-ink/45 hover:text-bob-ink"
                  data-testid="azzera-ricerca"
                >
                  ✕
                </Link>
              </span>
              {!sicuro &&
                alternative.map((a) => (
                  <Link
                    key={`${a.service}-${a.subservice ?? "srv"}`}
                    href={`/professionisti?q=${encodeURIComponent(a.display)}`}
                    className="rounded-full border border-black/10 px-3 py-1 text-bob-ink/70 hover:border-black/20"
                  >
                    {a.display}
                  </Link>
                ))}
            </>
          ) : (
            <span className="text-bob-ink/60">
              Non ho capito «{frase}». Prova con altre parole, o{" "}
              <Link href="/" className="text-bob-indigo hover:underline">
                raccontalo a Bob
              </Link>
              .
            </span>
          )}
        </div>
      )}

      <ProfessionalFilters cities={cities} services={services} />

      <div className="mb-4 mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-bob-ink/55" data-testid="text-results-count">
          {sorted.length} professionist{sorted.length === 1 ? "a" : "i"}
        </p>
        {sorted.length > 0 && <ComeOrdiniamo />}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title={
            capito
              ? `Nessuno per «${capito.display}», ancora`
              : "Nessun professionista con questi filtri"
          }
          description="Prova ad allargare la ricerca o parla con Bob: ti avvisa appena ne arriva uno adatto."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => (
            <ProfessionalCardItem key={p.id} p={p} intervento={interventoCercato} />
          ))}
        </div>
      )}
    </div>
  );
}
