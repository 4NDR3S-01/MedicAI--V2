import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AUDIENCES, getAudience } from "../../content/audiences";
import { GUIDES } from "../../content/guides";
import { SiteFooter, SiteHeader, GooglePlayBadge } from "../../components/site-chrome";
import { RevealItem, SectionReveal } from "../../components/reveal";
import { FAQItem, FeatureCard } from "../../components/landing/cards";
import { CircleDemo } from "../../components/landing/circle-demo";
import { ChatDemo } from "../../components/landing/chat-demo";
import { JsonLd } from "../../components/json-ld";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return AUDIENCES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const audience = getAudience((await params).slug);
  if (!audience) return {};
  return {
    title: audience.metaTitle,
    description: audience.metaDescription,
    alternates: { canonical: `/para/${audience.slug}` },
    openGraph: { title: `${audience.metaTitle} | MedicAI`, description: audience.metaDescription },
  };
}

export default async function AudiencePage({ params }: Props) {
  const audience = getAudience((await params).slug);
  if (!audience) notFound();

  const guide = GUIDES.find((g) => g.related === audience.slug);
  const others = AUDIENCES.filter((a) => a.slug !== audience.slug);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: audience.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <SectionReveal />
      <SiteHeader />

      <main className="flex-1">
        <section className="hero audience-hero">
          <div className="container split">
            <div className="split-text">
              <div className="eyebrow">{audience.eyebrow}</div>
              <h1 className="font-display audience-title">
                {audience.title} <span className="gradient-text">{audience.highlight}</span>
              </h1>
              <p>{audience.intro}</p>
              <div className="hero-actions">
                <GooglePlayBadge />
              </div>
              <ul className="check-list">
                {audience.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="split-visual">
              {audience.demo === "circle" ? <CircleDemo /> : <ChatDemo />}
            </div>
          </div>
        </section>

        <section className="section-alt" data-section-reveal>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Cómo te ayuda</div>
              <h2 className="font-display">Lo que cambia con MedicAI</h2>
            </div>
            <div className="feature-grid">
              {audience.benefits.map((b, i) => (
                <RevealItem key={b.title} delay={(i % 3) * 100}>
                  <FeatureCard icon={<b.Icon size={20} />} title={b.title} description={b.text} />
                </RevealItem>
              ))}
            </div>
          </div>
        </section>

        <section data-section-reveal>
          <div className="container faq-container">
            <div className="section-header">
              <div className="eyebrow">Dudas comunes</div>
              <h2 className="font-display">Preguntas frecuentes</h2>
            </div>
            <div className="faq-list">
              {audience.faqs.map((f) => (
                <FAQItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
            {guide && (
              <Link href={`/guias/${guide.slug}`} className="guide-teaser">
                <span className="audience-card-eyebrow">Guía</span>
                <strong className="font-display">{guide.title}</strong>
                <span className="audience-card-link">Leer la guía <ArrowRight size={16} aria-hidden /></span>
              </Link>
            )}
          </div>
        </section>

        <section className="cta-section" data-section-reveal>
          <div className="container">
            <div className="cta-card">
              <h2 className="font-display">Empieza hoy, es gratis</h2>
              <p>Configúrala en minutos y deja que MedicAI se encargue de recordar.</p>
              <div className="cta-actions">
                <GooglePlayBadge />
              </div>
              <p className="cta-note">
                También para:{" "}
                {others.map((o, i) => (
                  <span key={o.slug}>
                    {i > 0 && " · "}
                    <Link href={`/para/${o.slug}`} className="text-link">{o.navLabel.toLowerCase()}</Link>
                  </span>
                ))}
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
