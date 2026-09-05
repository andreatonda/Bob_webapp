import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Search, Star, type LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Come funziona",
  description:
    "BOB ti aiuta a trovare il professionista giusto in pochi passi: racconti il problema, ricevi profili adatti con prezzi e rating, e contatti chi vuoi.",
};

const STEPS: { n: string; icon: LucideIcon; title: string; text: string }[] = [
  {
    n: "1",
    icon: MessageCircle,
    title: "Racconta a Bob cosa ti serve",
    text: "Descrivi il problema con parole tue. Bob ti fa qualche domanda su servizio, città, urgenza e budget — niente moduli complicati.",
  },
  {
    n: "2",
    icon: Search,
    title: "Bob filtra i professionisti adatti",
    text: "In base a quello che gli dici, Bob seleziona i professionisti più rilevanti. Usa il prezzo per ordinarli, ma il dettaglio lo trovi sempre nella scheda.",
  },
  {
    n: "3",
    icon: Star,
    title: "Confronti prezzo, rating e disponibilità",
    text: "Vedi subito chi è verificato, quanto costa e cosa dicono gli altri clienti. La scelta resta sempre tua.",
  },
  {
    n: "4",
    icon: Mail,
    title: "Contatti chi preferisci",
    text: "Bob prepara il primo messaggio, tu lo personalizzi e lo invii. Puoi contattare uno o più professionisti e seguire tutto dalla tua area personale.",
  },
];

export default function ComeFunzionaPage() {
  return (
    <div className="container-bob py-12">
      <header className="mx-auto max-w-2xl text-center">
        <span className="section-eyebrow">Come funziona</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-bob-ink sm:text-4xl">
          Trovare un professionista, senza il solito caos
        </h1>
        <p className="mt-3 text-base text-bob-ink/65">
          Raccontami il problema e ti aiuto a capire chi contattare, con più
          chiarezza su prezzo, disponibilità e qualità.
        </p>
      </header>

      <div className="mx-auto mt-10 grid grid-cols-1 max-w-4xl gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="card flex gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bob-indigo-50 text-bob-indigo">
              <s.icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-bob-indigo">
                  PASSO {s.n}
                </span>
              </div>
              <h2 className="mt-0.5 font-semibold text-bob-ink">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-bob-ink/65">
                {s.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Modello: niente lead a pagamento */}
      <section className="mx-auto mt-10 max-w-3xl rounded-2xl bg-bob-indigo-50 p-7 text-center">
        <h2 className="text-lg font-semibold text-bob-ink">
          Gratis per te, equo per i professionisti
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-bob-ink/65">
          Per chi cerca un servizio, BOB è gratis. Non vendiamo contatti: i
          professionisti pagano una fee solo a lavoro concluso. Così tutti hanno
          interesse a far andare bene le cose.
        </p>
      </section>

      {/* I PARAMETRI DI POSIZIONAMENTO — la sezione che i link
          «Come ordiniamo i risultati» raggiungono da ogni elenco.
          È la «sezione specifica dell'interfaccia, direttamente e facilmente
          accessibile dalla pagina in cui sono presentati i risultati» che
          chiede l'art. 22 comma 4-bis del Codice del Consumo.

          DEVE DESCRIVERE COME ORDINA IL CODICE OGGI, non come vorremmo che
          ordinasse: i criteri qui sotto sono quelli di getProfessionals() in
          src/lib/data.ts, nell'ordine in cui li applica. Quando il ranking
          passa in SQL coi pesi di docs/RICERCA.md §4, questa sezione si
          aggiorna NELLO STESSO commit — una pagina rimasta indietro qui
          dichiara il falso.

          L'ultima riga è vera oggi. Il giorno del primo slot sponsorizzato va
          sostituita, non tolta, e la scheda sponsorizzata va etichettata:
          l'allegato I punto 11-bis della 2005/29 vuole quella dichiarazione
          dentro i risultati, dove un link non arriva. */}
      <section
        id="ordine"
        className="mx-auto mt-10 max-w-3xl scroll-mt-24 rounded-2xl border border-black/5 p-7"
      >
        <h2 className="text-lg font-semibold text-bob-ink">
          Come ordiniamo i risultati
        </h2>
        <p className="mt-2 text-sm text-bob-ink/65">
          Quando vedi un elenco di professionisti, l&apos;ordine non è casuale e
          non è alfabetico. Contano queste cose, in quest&apos;ordine:
        </p>
        <ol className="mt-4 space-y-3 text-sm text-bob-ink/70">
          <li>
            <strong className="text-bob-ink">Chi lavora dove servi tu.</strong>{" "}
            Prima chi ha dichiarato proprio la tua zona, poi chi copre la città,
            poi chi arriva da più lontano. Chi lavora in tutta Italia compare
            comunque, ma non davanti a chi è nel tuo quartiere.
          </li>
          <li>
            <strong className="text-bob-ink">Chi è verificato.</strong> Un
            profilo con la partita IVA controllata viene prima di uno ancora da
            controllare.
          </li>
          <li>
            <strong className="text-bob-ink">La valutazione.</strong> La media
            dei voti ricevuti, pesata sul numero di recensioni: cinque stelle su
            due giudizi contano meno di quattro stelle e mezzo su venti.
          </li>
          <li>
            <strong className="text-bob-ink">La tariffa.</strong> A parità di
            tutto il resto, prima chi costa meno. È l&apos;ultimo criterio, non
            il primo: il più economico non è automaticamente il più adatto.
          </li>
        </ol>
        <p className="mt-4 text-sm font-medium text-bob-ink">
          Nessuna posizione è a pagamento.
        </p>
        <p className="mt-1 text-sm text-bob-ink/65">
          Nessun professionista può pagare per stare più in alto. Se un giorno
          introdurremo spazi a pagamento, li troverai marcati
          «Sponsorizzato» sulla scheda e questa pagina lo dirà: non cambieranno
          l&apos;ordine degli altri.
        </p>
      </section>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Link href="/#bob" className="btn-primary px-6 py-3" data-testid="cta-parla-con-bob">
          Parla con Bob
        </Link>
        <Link
          href="/professionisti"
          className="text-sm font-medium text-bob-indigo hover:underline"
        >
          oppure sfoglia i professionisti
        </Link>
      </div>
    </div>
  );
}
