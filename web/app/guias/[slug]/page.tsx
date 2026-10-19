import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { GUIDES, getGuide } from "../../content/guides";
import { getAudience } from "../../content/audiences";
import { SITE_URL } from "../../content/site";
import { SiteFooter, SiteHeader, GooglePlayBadge } from "../../components/site-chrome";
import { JsonLd } from "../../components/json-ld";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guias/${guide.slug}` },
    openGraph: { type: "article", title: guide.title, description: guide.description, publishedTime: guide.published },
  };
}

function formatDate(iso: string) {
  // Mediodía UTC: la fecha no se corre de día en ninguna zona horaria.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

export default async function GuidePage({ params }: Props) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const related = getAudience(guide.related);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description,
          datePublished: guide.published,
          inLanguage: "es",
          mainEntityOfPage: `${SITE_URL}/guias/${guide.slug}`,
          publisher: { "@type": "Organization", name: "MedicAI", url: SITE_URL },
        }}
      />
      <SiteHeader />

      <main className="flex-1">
        <article className="guide">
          <Link href="/guias" className="guide-back">← Guías</Link>
          <h1 className="font-display">{guide.title}</h1>
          <p className="guide-meta">
            {formatDate(guide.published)} · <Clock size={14} aria-hidden /> {guide.readingMinutes} min de lectura
          </p>
          <p className="guide-intro">{guide.intro}</p>

          {guide.sections.map((section) => (
            <section key={section.title} className="guide-section">
              <h2 className="font-display">{section.title}</h2>
              {section.blocks.map((block, i) =>
                typeof block === "string" ? (
                  <p key={i}>{block}</p>
                ) : (
                  <ul key={i}>
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )
              )}
            </section>
          ))}

          <p className="guide-disclaimer">
            Esta guía es informativa y no reemplaza la consulta con un profesional de la salud.
            Ante una emergencia, llama a los servicios de emergencia de tu país.
          </p>

          <aside className="guide-cta">
            <strong className="font-display">MedicAI lo hace por ti</strong>
            <p>Alarmas con nombre y dosis, registro de tomas, aviso de pastillas por acabarse y tu familia al tanto.</p>
            <GooglePlayBadge />
            {related && (
              <Link href={`/para/${related.slug}`} className="audience-card-link">
                {related.eyebrow} <ArrowRight size={16} aria-hidden />
              </Link>
            )}
          </aside>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
