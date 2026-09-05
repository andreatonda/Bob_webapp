import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCityBySlug,
  getServices,
  getProfessionals,
} from "@/lib/data";
import { ProfessionalCardItem, EmptyState } from "@/components/ui";
import { ComeOrdiniamo } from "@/components/ComeOrdiniamo";
import { CityWaitlistForm } from "@/components/CityWaitlistForm";
import { Hammer, MapPin } from "lucide-react";
import { ServiceIcon } from "@/lib/serviceIcons";
import { JsonLd } from "@/components/JsonLd";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.meetonda.com";

export const revalidate = 180;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const city = await getCityBySlug(params.slug);
  if (!city) return { title: "Città non trovata" };
  const meta: Metadata = {
    title: `Idraulico, elettricista e altri professionisti a ${city.name} — prezzi chiari`,
    description: `Cerchi un idraulico, un elettricista o un'impresa di pulizie a ${city.name}? Su BOB trovi professionisti verificati con fasce di prezzo trasparenti e recensioni vere.`,
    alternates: { canonical: `/citta/${params.slug}` },
  };
  // Città non attive: noindex (thin content) ma follow per passare link juice.
  if (city.status !== "active") {
    meta.title = `BOB sta arrivando a ${city.name}`;
    meta.robots = { index: false, follow: true };
  }
  return meta;
}

export default async function CityPage({
  params,
}: {
  params: { slug: string };
}) {
  const city = await getCityBySlug(params.slug);
  if (!city) notFound();

  // Città non ancora attiva: pagina "in arrivo".
  if (city.status !== "active") {
    return (
      <div className="container-bob py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bob-indigo-50 text-bob-indigo">
            <Hammer className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-bob-ink">
            BOB sta arrivando a {city.name}
          </h1>
          <p className="mt-2 text-sm text-bob-ink/60">
            Stiamo verificando i professionisti della zona uno a uno. Lascia la
            tua email: ti avvisiamo appena apriamo.
          </p>

          {/* L'homepage promette "lascia il tuo interesse": qui la promessa
              viene mantenuta. Le email alimentano la lista di lancio. */}
          <div className="mt-6">
            <CityWaitlistForm citySlug={city.slug} cityName={city.name} />
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-black/5 pt-5 sm:flex-row sm:justify-center">
            <Link href="/citta/milano" className="btn-secondary px-5 py-2.5">
              Vai a Milano
            </Link>
            <Link href="/#bob" className="btn-ghost px-5 py-2.5">
              Parla con Bob
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [services, pros] = await Promise.all([
    getServices(),
    getProfessionals({ citySlug: city.slug }),
  ]);

  // Servizi effettivamente coperti in questa città.
  const coveredSlugs = new Set(pros.map((p) => p.serviceSlug).filter(Boolean));
  const coveredServices = services.filter((s) => coveredSlugs.has(s.slug));

  return (
    <div className="container-bob py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Città",
              item: `${siteUrl}/citta`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: city.name,
              item: `${siteUrl}/citta/${city.slug}`,
            },
          ],
        }}
      />
      <nav className="mb-4 text-sm text-bob-ink/50" aria-label="breadcrumb">
        <Link href="/citta" className="hover:text-bob-indigo">
          Città
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-bob-ink/70">{city.name}</span>
      </nav>

      <header className="mb-7">
        <span className="section-eyebrow inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {city.name}
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-bob-ink sm:text-3xl">
          Professionisti a {city.name}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-bob-ink/60">
          {pros.length} professionist{pros.length === 1 ? "a" : "i"} con prezzi e
          rating in chiaro. Scegli un servizio o lascia che Bob ti aiuti a capire
          chi contattare.
        </p>
      </header>

      {coveredServices.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-bob-ink/55">
            Servizi disponibili
          </h2>
          <div className="flex flex-wrap gap-2">
            {/* Punta alla pagina servizio × città, non a quella nazionale:
                chi è già su Milano non deve tornare a scegliere la città. */}
            {coveredServices.map((s) => (
              <Link
                key={s.id}
                href={`/servizi/${s.slug}/${city.slug}`}
                className="chip border-black/10 bg-white hover:border-bob-indigo/30 hover:bg-bob-indigo-50"
                data-testid={`chip-service-${s.slug}`}
              >
                <ServiceIcon slug={s.slug} className="mr-1 h-4 w-4 text-bob-indigo" />
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-bob-ink/55">
          Tutti i professionisti
        </h2>
        {pros.length > 0 && (
          <p className="mb-3">
            <ComeOrdiniamo />
          </p>
        )}
        {pros.length === 0 ? (
          <EmptyState
            title="Ancora nessun professionista qui"
            description="Stiamo aggiungendo professionisti in questa città. Torna presto o parla con Bob."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pros.map((p) => (
              <ProfessionalCardItem key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
