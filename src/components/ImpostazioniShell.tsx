"use client";

// Guscio delle IMPOSTAZIONI: intestazione unica + navigazione per sezioni.
//
// PERCHE' E' SEPARATO DALL'AREA DI LAVORO (deciso il 19/08)
// Nella prima versione tutto stava sotto /dashboard, e la barra laterale
// metteva sulla stessa fila "Oggi" e "Accesso e sicurezza": il lavoro di ogni
// giorno accanto a cose che si aprono due volte l'anno. Sono due bisogni
// diversi. Un professionista che apre Bob vuole le richieste e il calendario a
// portata di mano; un cliente vuole cercare un professionista o guardare i suoi
// appuntamenti. La configurazione del proprio account non c'entra con nessuno
// dei due, e mescolarla costringeva entrambi a passarci davanti ogni volta.
//
// Da qui: /dashboard e' il lavoro, /impostazioni e' la configurazione. La
// separazione sta anche negli indirizzi, non solo nel disegno — perche' un
// indirizzo dice a cosa serve una pagina, e /dashboard/accesso non lo diceva.
//
// La navigazione e' un solo elenco (NAV_PRO / NAV_CLIENTE): per aggiungere una
// sezione si aggiunge una riga qui e una pagina sotto src/app/impostazioni/.

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { GuidaBarra } from "@/components/GuidaBarra";

interface VoceNav {
  href: string;
  label: string;
  /** Riga di aiuto sotto la voce, solo su desktop: dice cosa ci si trova. */
  hint: string;
}

// L'ordine non e' alfabetico: parte da chi sei, poi cosa offri, poi il resto.
const NAV_PRO: VoceNav[] = [
  { href: "/impostazioni/dati", label: "I tuoi dati", hint: "Nome e telefono" },
  { href: "/impostazioni/azienda", label: "La tua azienda", hint: "Profilo pubblico, servizi, tariffe" },
  { href: "/impostazioni/zone", label: "Dove lavori", hint: "Zone, raggio, quanto ti allontani" },
  { href: "/impostazioni/verifica", label: "Verifica", hint: "Partita IVA, documenti, badge" },
  { href: "/impostazioni/orari", label: "Orari", hint: "Disponibilità e prenotazione diretta" },
  { href: "/impostazioni/lavori", label: "Lavori", hint: "Le foto dei tuoi interventi" },
  { href: "/impostazioni/piano", label: "Piano e pagamenti", hint: "Abbonamento e fatture" },
  { href: "/impostazioni/comunicazioni", label: "Comunicazioni", hint: "Cosa ti scriviamo e quando" },
  { href: "/impostazioni/accesso", label: "Accesso e sicurezza", hint: "Email, password, account" },
  { href: "/impostazioni/assistenza", label: "Assistenza", hint: "Le tue richieste e le risposte" },
];

const NAV_CLIENTE: VoceNav[] = [
  { href: "/impostazioni/dati", label: "I tuoi dati", hint: "Nome e informazioni personali" },
  { href: "/impostazioni/indirizzi", label: "Indirizzi", hint: "Dove ti raggiungono i professionisti" },
  { href: "/impostazioni/comunicazioni", label: "Comunicazioni", hint: "Cosa ti scriviamo e quando" },
  { href: "/impostazioni/accesso", label: "Accesso e sicurezza", hint: "Email, password, account" },
  { href: "/impostazioni/assistenza", label: "Assistenza", hint: "Le tue richieste e le risposte" },
];

export function ImpostazioniShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role, loading } = useAuth();

  // Lo staff non ha impostazioni personali qui (la pagina lo rimanda su
  // /admin): senza questa uscita il guscio disegnerebbe per un istante una
  // navigazione da cliente addosso a un amministratore.
  if (role === "admin" || role === "cs") {
    return <>{children}</>;
  }

  const isPro = role === "professional";
  const nav = isPro ? NAV_PRO : NAV_CLIENTE;
  const attivo = (href: string) => pathname === href;

  return (
    <div className="container-bob py-8 sm:py-10">
      {/* Se il professionista e' arrivato qui dalla guida, la pagina lo dice e
          gli tiene aperta la strada del ritorno. Sta sopra tutto: e' il motivo
          per cui e' su questa pagina. */}
      <GuidaBarra />

      <header className="mb-6">
        {/* Il ritorno al lavoro sta in cima e per primo: da qui si esce piu'
            spesso di quanto si entri, e l'etichetta dice dove si torna.
            SOLO SOTTO md (05/09), esattamente come il link «Impostazioni»
            della dashboard il 29/08. Da md in su l'header mostra gia' un
            bottone con la STESSA etichetta e la STESSA destinazione — «Il mio
            lavoro» / «I miei lavori» verso /dashboard — e su ogni pagina
            /impostazioni/* i due si vedevano insieme. Sotto md quel bottone
            vive dentro un blocco `hidden md:flex` e sparisce nel menu ☰:
            li' questo link e' l'unica strada di ritorno visibile, quindi
            resta. Terzo doppione nato da 58f4ca5, dopo Impostazioni (29/08) e
            «Cerca un professionista» (05/09). */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-bob-ink/55 transition hover:text-bob-indigo md:hidden"
          data-testid="link-torna-al-lavoro"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {loading ? "Indietro" : isPro ? "Il mio lavoro" : "I miei lavori"}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-bob-ink sm:text-3xl">
          Impostazioni
        </h1>
        <p className="mt-1.5 text-sm text-bob-ink/60">
          {isPro
            ? "Il tuo account, il tuo profilo pubblico e come lavori."
            : "Il tuo account e le tue preferenze."}
        </p>
      </header>

      {/* Mobile (fino a lg): fila di sezioni scorrevole. Sborda oltre il
          padding del contenitore di proposito, cosi' a 390px si capisce che
          si scorre invece di sembrare tagliata. */}
      <nav
        aria-label="Sezioni delle impostazioni"
        className="-mx-5 mb-6 overflow-x-auto px-5 lg:hidden"
      >
        <ul className="flex w-max gap-2 pb-1">
          {nav.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                aria-current={attivo(v.href) ? "page" : undefined}
                className={`inline-flex whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  attivo(v.href)
                    ? "bg-bob-indigo text-white shadow-sm"
                    : "border border-black/10 bg-white text-bob-ink/70 hover:border-bob-indigo/30 hover:text-bob-indigo"
                }`}
                data-testid={`nav-${v.href.split("/").pop()}`}
              >
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="lg:grid lg:grid-cols-[228px_1fr] lg:gap-8">
        {/* Desktop: colonna laterale che resta ferma mentre il contenuto scorre. */}
        <nav aria-label="Sezioni delle impostazioni" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1">
            {nav.map((v) => (
              <li key={v.href}>
                <Link
                  href={v.href}
                  aria-current={attivo(v.href) ? "page" : undefined}
                  className={`block rounded-xl px-3.5 py-2.5 transition ${
                    attivo(v.href)
                      ? "bg-bob-indigo-50 text-bob-indigo"
                      : "text-bob-ink/70 hover:bg-black/[0.03] hover:text-bob-ink"
                  }`}
                  data-testid={`nav-desktop-${v.href.split("/").pop()}`}
                >
                  <span className="block text-sm font-semibold">{v.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-bob-ink/45">
                    {v.hint}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

// Intestazione di sezione: la usano tutte le pagine, cosi' il titolo e la
// riga di spiegazione hanno la stessa forma da una sezione all'altra.
export function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-bold tracking-tight text-bob-ink sm:text-xl">
        {title}
      </h2>
      {children && (
        <p className="mt-1.5 text-sm leading-relaxed text-bob-ink/60">
          {children}
        </p>
      )}
    </div>
  );
}
