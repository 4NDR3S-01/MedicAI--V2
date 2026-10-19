import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { GUIDES } from "../content/guides";
import { SiteFooter, SiteHeader } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "Guías para cuidar mejor",
  description:
    "Consejos prácticos para no olvidar los medicamentos, organizar los de un adulto mayor y coordinar el cuidado en familia.",
  alternates: { canonical: "/guias" },
};

export default function GuidesIndexPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Guías</div>
              <h1 className="font-display guide-index-title">Guías para cuidar mejor</h1>
              <p>
                Consejos prácticos de organización. No reemplazan la indicación de tu
                médico o farmacéutico.
              </p>
            </div>
            <div className="audience-grid">
              {GUIDES.map((g) => (
                <Link key={g.slug} href={`/guias/${g.slug}`} className="audience-card">
                  <span className="audience-card-eyebrow">
                    <Clock size={14} aria-hidden /> {g.readingMinutes} min de lectura
                  </span>
                  <strong className="font-display">{g.title}</strong>
                  <span className="audience-card-desc">{g.description}</span>
                  <span className="audience-card-link">
                    Leer <ArrowRight size={16} aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
