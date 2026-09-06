"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * La casella di ricerca.
 *
 * COSA FA E COSA NON FA. Non interpreta niente da sola: chiede a
 * /api/cerca/suggerisci, che chiama search_resolve nel database. Alla pressione
 * di Invio manda semplicemente la frase a /professionisti?q=..., e a capirla
 * ci pensa il server. Cosi' la stessa frase, scritta qui o incollata
 * nell'indirizzo o arrivata da un link condiviso, produce lo stesso risultato:
 * l'interpretazione sta in un posto solo.
 *
 * LA PAUSA DI 150 MILLISECONDI non e' per risparmiare: e' perche' chi scrive
 * "idraulico" produce nove richieste, e le prime otto sono risposte che nessuno
 * leggera' mai. Ogni richiesta nuova annulla la precedente (AbortController),
 * altrimenti la risposta lenta di due lettere fa puo' arrivare dopo quella
 * veloce di adesso e sovrascriverla con suggerimenti vecchi.
 *
 * SCEGLIENDO UN SUGGERIMENTO si cerca il NOME UFFICIALE, non quello che si era
 * battuto: chi scrive «rubinetto che perde» e sceglie «Perdita rubinetto o
 * sifone» ottiene un indirizzo pulito, condivisibile, e una corrispondenza
 * esatta invece che per somiglianza. Ed e' anche il modo in cui si impara come
 * si chiamano le cose qui dentro.
 */

type Suggerimento = {
  kind: "service" | "subservice";
  service: string;
  subservice: string | null;
  display: string;
  score: number;
  how: string;
};

export function RicercaBox({ valoreIniziale = "" }: { valoreIniziale?: string }) {
  const router = useRouter();
  const [testo, setTesto] = useState(valoreIniziale);
  const [sugg, setSugg] = useState<Suggerimento[]>([]);
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(-1);
  const contenitore = useRef<HTMLDivElement>(null);

  // Il menu si chiude cliccando fuori. Senza, resta aperto sopra i risultati
  // e copre la prima scheda proprio mentre la si vuole leggere.
  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (!contenitore.current?.contains(e.target as Node)) setAperto(false);
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  useEffect(() => {
    const frase = testo.trim();
    if (frase.length < 2) {
      setSugg([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/cerca/suggerisci?q=${encodeURIComponent(frase)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return;
        const dati = (await res.json()) as { matches?: Suggerimento[] };
        setSugg(dati.matches ?? []);
        setEvidenziato(-1);
      } catch {
        // Richiesta annullata o rete assente: si resta con i suggerimenti di
        // prima. Una ricerca che non suggerisce funziona lo stesso, basta
        // premere Invio.
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [testo]);

  function cerca(frase: string) {
    const f = frase.trim();
    setAperto(false);
    router.push(f ? `/professionisti?q=${encodeURIComponent(f)}` : "/professionisti");
  }

  function tasti(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && sugg.length > 0) {
      e.preventDefault();
      setAperto(true);
      setEvidenziato((i) => (i + 1) % sugg.length);
    } else if (e.key === "ArrowUp" && sugg.length > 0) {
      e.preventDefault();
      setEvidenziato((i) => (i <= 0 ? sugg.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      cerca(evidenziato >= 0 && sugg[evidenziato] ? sugg[evidenziato].display : testo);
    } else if (e.key === "Escape") {
      setAperto(false);
    }
  }

  return (
    <div ref={contenitore} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bob-ink/35"
          aria-hidden="true"
        />
        <input
          type="search"
          value={testo}
          onChange={(e) => {
            setTesto(e.target.value);
            setAperto(true);
          }}
          onFocus={() => setAperto(true)}
          onKeyDown={tasti}
          placeholder="Che lavoro ti serve? Es. rubinetto che perde"
          aria-label="Cerca un servizio o un intervento"
          autoComplete="off"
          className="input-bob py-2.5 pl-9"
          data-testid="input-ricerca"
        />
      </div>

      {aperto && sugg.length > 0 && (
        <ul
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-black/5 bg-white shadow-card-hover"
          data-testid="lista-suggerimenti"
        >
          {sugg.map((s, i) => (
            <li key={`${s.service}-${s.subservice ?? "srv"}`}>
              <button
                type="button"
                onMouseEnter={() => setEvidenziato(i)}
                onClick={() => cerca(s.display)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                  i === evidenziato ? "bg-bob-indigo-50" : "bg-white"
                }`}
              >
                <span className="text-bob-ink">{s.display}</span>
                {s.subservice && (
                  <span className="shrink-0 text-xs text-bob-ink/45">
                    {s.service}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
