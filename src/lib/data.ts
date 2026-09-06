import { createClient } from "@/lib/supabase/server";
import {
  gettoniRichiesta,
  rangoCopertura,
  trovaPerRichiesta,
} from "@/lib/copertura";
import { publicVerificationLevel, type VerificationLevel } from "@/lib/vat";
import type {
  City,
  Service,
  Subservice,
  ProfessionalCard,
  ProfessionalOffer,
  PortfolioItem,
  VerificationStatus,
} from "@/lib/supabase/types";
import { withArticle, afterDi } from "@/lib/italian";

// ---------- Catalogo (lettura pubblica via RLS) ----------

export async function getCities(): Promise<City[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cities")
    .select("*")
    .order("status", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as City[];
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as City) ?? null;
}

export async function getServices(): Promise<Service[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .order("name", { ascending: true });
  return (data ?? []) as Service[];
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Service) ?? null;
}

export async function getSubservices(serviceId: string): Promise<Subservice[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("subservices")
    .select("*")
    .eq("service_id", serviceId)
    .order("name", { ascending: true });
  return (data ?? []) as Subservice[];
}

// Tutti i sottoservizi con lo slug del servizio padre (per il brief di Bob).
export async function getAllSubservices(): Promise<
  { serviceSlug: string; slug: string; name: string }[]
> {
  const supabase = createClient();
  const { data } = await supabase
    .from("subservices")
    .select("slug, name, services(slug)")
    .order("name", { ascending: true });
  return (data ?? [])
    .map((row) => {
      const svc = row.services as { slug: string } | { slug: string }[] | null;
      const serviceSlug = Array.isArray(svc) ? svc[0]?.slug : svc?.slug;
      return serviceSlug
        ? { serviceSlug, slug: row.slug as string, name: row.name as string }
        : null;
    })
    .filter((x): x is { serviceSlug: string; slug: string; name: string } =>
      Boolean(x)
    );
}

// Comodità: sottocategorie a partire dallo slug del servizio.
export async function getSubservicesByServiceSlug(
  slug: string
): Promise<Subservice[]> {
  const service = await getServiceBySlug(slug);
  if (!service) return [];
  return getSubservices(service.id);
}

// Numero di professionisti che offrono ciascun servizio (per badge nelle liste).
export async function getServiceCounts(): Promise<Record<string, number>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("professional_services")
    .select("service_id");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { service_id: string }[]) {
    counts[row.service_id] = (counts[row.service_id] ?? 0) + 1;
  }
  return counts;
}

// ---------- Professionisti (aggregati per la UI) ----------

type RawProfessionalRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  verification_status: VerificationStatus;
  verification_level: VerificationLevel | null;
  verification_level_at: string | null;
  response_time_label: string | null;
  cities: { name: string; slug: string } | null;
  professional_services: {
    min_price: number | null;
    max_price: number | null;
    price_note: string | null;
    service_id: string;
    subservice_id: string | null;
    services: {
      name: string;
      slug: string;
      gender: string | null;
      is_plural: boolean | null;
      takes_article: boolean | null;
    } | null;
    subservices: { name: string; slug: string } | null;
  }[];
  ratings: { score: number }[];
};

// professionals -> profiles non ha FK diretta (passa da users), quindi
// il nome viene risolto a parte tramite una mappa user_id -> full_name.
const PROFESSIONAL_SELECT = `
  id,
  user_id,
  business_name,
  headline,
  bio,
  years_experience,
  verification_status,
  verification_level,
  verification_level_at,
  response_time_label,
  city_id,
  cities ( name, slug ),
  professional_services ( min_price, max_price, price_note, service_id, subservice_id, services ( name, slug, gender, is_plural, takes_article ), subservices ( name, slug ) ),
  ratings ( score )
`;

/**
 * I gettoni di copertura dei professionisti elencati.
 *
 * PERCHE' UNA QUERY A PARTE E NON UN EMBED. Un embed
 * (`professional_coverage_public ( ... )`) dipende da come PostgREST risolve la
 * relazione, e un errore lì non svuota una colonna: svuota l'INTERO elenco dei
 * professionisti. Una query separata su una tabella minuscola costa un giro di
 * rete e non può far sparire nessuno. Se fallisce, si ricade sulla regola di
 * compatibilità (nessuna area dichiarata = la città di iscrizione), che è il
 * comportamento di prima della 057.
 */
async function coveragesByProfessionalId(
  ids: string[]
): Promise<Record<string, { keys: string[]; bestScope: string | null }>> {
  if (ids.length === 0) return {};
  const supabase = createClient();
  const { data, error } = await supabase
    .from("professional_coverage_public")
    .select("professional_id, coverage_keys, best_scope")
    .in("professional_id", ids);
  if (error) return {};
  const mappa: Record<string, { keys: string[]; bestScope: string | null }> = {};
  for (const r of (data ?? []) as {
    professional_id: string;
    coverage_keys: string[] | null;
    best_scope: string | null;
  }[]) {
    mappa[r.professional_id] = {
      keys: r.coverage_keys ?? [],
      bestScope: r.best_scope,
    };
  }
  return mappa;
}

async function namesByUserId(
  userIds: string[]
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", userIds);
  const map: Record<string, string> = {};
  for (const p of (data ?? []) as { user_id: string; full_name: string | null }[]) {
    if (p.full_name) map[p.user_id] = p.full_name;
  }
  return map;
}

function toCard(
  row: RawProfessionalRow,
  names: Record<string, string>,
  coperture: Record<string, { keys: string[]; bestScope: string | null }> = {}
): ProfessionalCard {
  const ratings = row.ratings ?? [];
  const nRatings = ratings.length;
  const avgRating =
    nRatings > 0
      ? Math.round((ratings.reduce((s, r) => s + r.score, 0) / nRatings) * 10) /
        10
      : null;

  // LE OFFERTE, AL PLURALE.
  //
  // Fino alla 070 un professionista aveva una riga sola in
  // professional_services, e qui si leggeva la [0] con un commento che diceva
  // «1 servizio per professionista nel pilota». Dalla 070 le righe sono una
  // per intervento offerto, e la [0] e' quella che capita: per Milano Clean
  // Squad e' «pulizie ordinarie ricorrenti», che non ha prezzo, mentre
  // «pulizie appartamenti» dello stesso professionista dichiara 20-28 euro.
  // Risultato: la scheda diceva «Tariffa su richiesta» a chi una tariffa ce
  // l'ha, e l'ordinamento per prezzo lo trattava come 9999, mandandolo in
  // fondo. Non e' un difetto nato con la 070 — c'era gia' con quattro righe —
  // ma la 070 lo ha reso normale.
  const righe = row.professional_services ?? [];

  const offers: ProfessionalOffer[] = righe.map((r) => ({
    serviceSlug: r.services?.slug ?? null,
    serviceName: r.services?.name ?? null,
    subserviceSlug: r.subservices?.slug ?? null,
    subserviceName: r.subservices?.name ?? null,
    minPrice: r.min_price,
    maxPrice: r.max_price,
    priceNote: r.price_note,
  }));

  // IL MESTIERE e' quello che compare su piu' righe. Nel pilota ogni
  // professionista ne ha uno solo, ma niente lo impone, e «la prima riga» non
  // e' una risposta. A pari conteggio decide lo slug in ordine alfabetico:
  // serve che la scheda sia la stessa a ogni caricamento, non che sia bella.
  const conteggio = new Map<string, number>();
  for (const r of righe) {
    const slug = r.services?.slug;
    if (slug) conteggio.set(slug, (conteggio.get(slug) ?? 0) + 1);
  }
  const slugMestiere =
    [...conteggio.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0]?.[0] ?? null;

  const servizio =
    righe.find((r) => r.services?.slug === slugMestiere)?.services ?? null;

  // La fascia di prezzo si legge su tutte le righe DEL MESTIERE: il minimo
  // piu' basso e il massimo piu' alto fra quelli dichiarati. Le due estremita'
  // possono venire da interventi diversi, ed e' giusto: la scheda dice «da
  // quanto a quanto lavora questa persona», non il prezzo di un lavoro solo.
  const righeMestiere = slugMestiere
    ? righe.filter((r) => r.services?.slug === slugMestiere)
    : righe;
  const minimi = righeMestiere
    .map((r) => r.min_price)
    .filter((n): n is number => n !== null);
  const massimi = righeMestiere
    .map((r) => r.max_price)
    .filter((n): n is number => n !== null);
  const minPrice = minimi.length > 0 ? Math.min(...minimi) : null;
  const maxPrice = massimi.length > 0 ? Math.max(...massimi) : null;
  const priceNote = righeMestiere.find((r) => r.price_note)?.price_note ?? null;

  const cop = coperture[row.id];

  // IL NOME CHE VEDE IL CLIENTE (065). Il titolo della scheda e' il nome
  // dell'attivita'; il nome del titolare e' un dato che serve a noi e non ha
  // motivo di stare su una pagina pubblica. Finche' esistono profili nati
  // prima della 065 il fallback resta il nome della persona: meglio una scheda
  // con il nome giusto di ieri che una scheda senza titolo.
  const fullName = names[row.user_id] ?? "Professionista";
  const businessName = row.business_name?.trim() || null;

  return {
    id: row.id,
    fullName,
    businessName,
    displayName: businessName ?? fullName,
    headline: row.headline,
    bio: row.bio,
    yearsExperience: row.years_experience,
    verificationStatus: row.verification_status,
    // "Pro+" si mostra solo se anche lo staff ha approvato il profilo: la
    // regola sta in publicVerificationLevel, qui non si decide nulla.
    verificationLevel: publicVerificationLevel(
      row.verification_level ?? "none",
      row.verification_status
    ),
    verifiedAt: row.verification_level_at,
    responseTimeLabel: row.response_time_label,
    coverageKeys: cop?.keys ?? [],
    bestScope: cop?.bestScope ?? null,
    city: { name: row.cities?.name ?? "", slug: row.cities?.slug ?? "" },
    serviceName: servizio?.name ?? null,
    serviceSlug: servizio?.slug ?? null,
    // Nome già articolato, calcolato qui una volta così i componenti non devono
    // conoscere il genere grammaticale. Due forme perché il contesto cambia:
    // "cercavi delle pulizie" ma "ho bisogno di pulizie".
    serviceWithArticle: servizio ? withArticle(servizio) : null,
    serviceNeedPhrase: servizio ? afterDi(servizio) : null,
    offers,
    minPrice,
    maxPrice,
    priceNote,
    avgRating,
    nRatings,
  };
}

export interface ProfessionalFilters {
  citySlug?: string;
  serviceSlug?: string;
  maxPrice?: number;
  /** La zona dichiarata dal cliente, se l'ha detta. */
  zoneSlug?: string;
  /**
   * L'intervento esatto che il cliente ha cercato. NON esclude nessuno: chi
   * non lo dichiara resta in elenco, sotto, e la scheda lo dice. Con sei
   * professionisti, escludere vorrebbe dire mostrare una pagina vuota a chi
   * un idraulico in citta' ce l'ha.
   */
  subserviceSlug?: string;
}

/**
 * Questo professionista ha dichiarato proprio questo intervento?
 * Le righe con subserviceSlug null sono «il mestiere, nessun intervento
 * specifico» e non contano come dichiarazione di un lavoro preciso.
 */
export function offreIntervento(
  p: ProfessionalCard,
  subserviceSlug: string | null | undefined
): boolean {
  if (!subserviceSlug) return false;
  return p.offers.some((o) => o.subserviceSlug === subserviceSlug);
}

// ---------- Copertura geografica (migrazioni 057 e 058) ----------

/**
 * I gettoni di una richiesta: quelli della citta' (colonna mantenuta da un
 * trigger, migrazione 058) piu' il gettone di zona, se il cliente l'ha detta.
 * Vengono dal database, non da uno slugify riscritto qui: e' la ragione per cui
 * i due elenchi si incontrano.
 */
export async function getRequestCoverageKeys(
  citySlug: string,
  zoneSlug?: string | null
): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cities")
    .select("slug, coverage_keys")
    .eq("slug", citySlug)
    .maybeSingle();
  if (!data) return [];
  return gettoniRichiesta(
    data as { slug: string; coverage_keys: string[] | null },
    zoneSlug ?? null
  );
}

export async function getProfessionals(
  filters: ProfessionalFilters = {}
): Promise<ProfessionalCard[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("professionals")
    .select(PROFESSIONAL_SELECT)
    // Un profilo spento esce dagli elenchi. Lo spegne la richiesta di
    // cancellazione (mig 056): i sette giorni di ripensamento sono legittimi
    // solo se in quei giorni l'account NON continua a lavorare, altrimenti
    // stiamo rimandando una cancellazione mentre trattiamo ancora i dati.
    .is("deactivated_at", null);

  const rows = (data ?? []) as unknown as RawProfessionalRow[];
  const [names, coperture] = await Promise.all([
    namesByUserId(rows.map((r) => r.user_id)),
    coveragesByProfessionalId(rows.map((r) => r.id)),
  ]);
  let cards = rows.map((r) => toCard(r, names, coperture));

  // COPERTURA GEOGRAFICA (057/058). Fino a oggi «dove lavora» era la citta'
  // scritta sulla riga del professionista. Ora chi ha dichiarato un'area viene
  // confrontato per gettoni: cinque quartieri, la provincia o tutta Italia
  // rispondono alla stessa domanda con la stessa chiave.
  //
  // REGOLA DI COMPATIBILITA', non un dettaglio: un professionista che non ha
  // ancora dichiarato niente vale come «tutta la citta' in cui e' iscritto».
  // Senza questa riga i cinque professionisti in produzione, che non hanno
  // nessuna copertura, sparirebbero da ogni elenco il giorno del deploy.
  let gettoniDellaRichiesta: string[] = [];
  if (filters.citySlug) {
    gettoniDellaRichiesta = await getRequestCoverageKeys(
      filters.citySlug,
      filters.zoneSlug
    );
    const citta = filters.citySlug;
    cards = cards.filter((c) =>
      trovaPerRichiesta(
        { keys: c.coverageKeys, citySlug: c.city.slug },
        gettoniDellaRichiesta,
        citta
      )
    );
  }
  if (filters.serviceSlug) {
    cards = cards.filter((c) => c.serviceSlug === filters.serviceSlug);
  }
  if (typeof filters.maxPrice === "number") {
    cards = cards.filter(
      (c) => c.minPrice === null || c.minPrice <= filters.maxPrice!
    );
  }

  // Ordinamento: prima chi ha dichiarato PROPRIO l'intervento cercato, poi chi
  // e' piu' vicino (il gettone piu' preciso che ha fatto match), poi
  // verificati, poi rating piu' alto, poi prezzo minore.
  //
  // L'intervento esatto viene per primo perche' e' la domanda che il cliente
  // ha fatto: chi scrive «rubinetto che perde» ha detto una cosa piu' precisa
  // di «idraulico», e ignorarla vorrebbe dire buttare via l'informazione in
  // piu'. Ma NON esclude: chi fa l'idraulico e non ha dichiarato quel lavoro
  // resta in elenco, sotto, e la sua scheda lo dice — con sei professionisti,
  // escludere vuol dire mostrare il vuoto a chi un idraulico ce l'ha.
  //
  // La precisione dell'area viene subito dopo, e per lo stesso motivo di
  // prima: chi copre tutta Italia deve comparire per una richiesta di Milano,
  // ma non davanti all'idraulico del quartiere.
  cards.sort((a, b) => {
    if (filters.subserviceSlug) {
      const ia = offreIntervento(a, filters.subserviceSlug) ? 1 : 0;
      const ib = offreIntervento(b, filters.subserviceSlug) ? 1 : 0;
      if (ia !== ib) return ib - ia;
    }
    if (gettoniDellaRichiesta.length > 0) {
      const ra = rangoCopertura(
        { keys: a.coverageKeys, citySlug: a.city.slug },
        gettoniDellaRichiesta
      );
      const rb = rangoCopertura(
        { keys: b.coverageKeys, citySlug: b.city.slug },
        gettoniDellaRichiesta
      );
      if (rb !== ra) return rb - ra;
    }
    const v =
      verifiedWeight(b.verificationStatus) - verifiedWeight(a.verificationStatus);
    if (v !== 0) return v;
    const r = (b.avgRating ?? 0) - (a.avgRating ?? 0);
    if (r !== 0) return r;
    return (a.minPrice ?? 9999) - (b.minPrice ?? 9999);
  });

  return cards;
}

function verifiedWeight(status: VerificationStatus): number {
  if (status === "verified") return 2;
  if (status === "pending") return 1;
  return 0;
}

export async function getProfessionalById(
  id: string
): Promise<ProfessionalCard | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("professionals")
    .select(PROFESSIONAL_SELECT)
    .eq("id", id)
    // Anche il profilo pubblico: spento vuol dire non raggiungibile, non
    // "raggiungibile se hai il link". Chi ci arriva trova una pagina non
    // trovata, che e' la verita'.
    .is("deactivated_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as RawProfessionalRow;
  const [names, coperture] = await Promise.all([
    namesByUserId([row.user_id]),
    coveragesByProfessionalId([row.id]),
  ]);
  return toCard(row, names, coperture);
}

// Foto dei lavori conclusi (galleria pubblica sul profilo).
export async function getPortfolioItems(
  professionalId: string
): Promise<PortfolioItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });
  return (data ?? []) as PortfolioItem[];
}

export interface ProfessionalReview {
  id: string;
  score: number;
  comment: string | null;
  created_at: string | null;
}

export async function getProfessionalReviews(
  id: string
): Promise<ProfessionalReview[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("ratings")
    .select("id, score, comment, created_at")
    .eq("professional_id", id)
    .order("created_at", { ascending: false });
  return (data ?? []) as ProfessionalReview[];
}
