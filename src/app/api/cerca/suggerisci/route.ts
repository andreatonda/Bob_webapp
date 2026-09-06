import { NextResponse } from "next/server";
import { resolveSearch } from "@/lib/search";

/**
 * I suggerimenti mentre si scrive.
 *
 * Il confronto lo fa search_resolve nel database (068/069): e' la stessa
 * funzione che interpreta la frase quando si preme Invio, quindi il menu a
 * tendina non puo' proporre una cosa e la ricerca farne un'altra. Rifarlo in
 * TypeScript per risparmiare un giro di rete vorrebbe dire due implementazioni
 * della stessa regola, cioe' due regole.
 *
 * NON SI REGISTRA NIENTE QUI. La casella di ricerca raccoglie quello che la
 * gente scrive, e la gente ci scrive indirizzi e numeri di telefono. Il
 * registro delle ricerche a vuoto — con le cifre tolte, senza user_id e con
 * una conservazione dichiarata — e' una cosa da fare di proposito, in una
 * migrazione sua, non un effetto collaterale di questa rotta.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Il tetto a 80 caratteri non e' per la performance: e' per non farsi
  // arrivare mezza email in una casella di ricerca.
  const q = (searchParams.get("q") ?? "").slice(0, 80);

  if (q.trim().length < 2) {
    return NextResponse.json({ matches: [] });
  }

  const r = await resolveSearch(q, 6);

  return NextResponse.json(
    {
      what: r.what,
      city: r.citySlug,
      zone: r.zoneSlug,
      nearMe: r.nearMe,
      matches: r.matches,
    },
    {
      // Dato di catalogo, uguale per tutti: la stessa domanda puo' essere
      // servita dalla cache. Niente `private`, niente cookie di mezzo.
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    }
  );
}
