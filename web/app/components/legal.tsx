import Link from "next/link";

// Fuente única de los datos del responsable, compartida por /privacidad y
// /terminos. Completa `legalName` con el nombre legal (persona natural o
// empresa) y su identificación si aplica.
export const CONTROLLER = {
  brand: "MedicAI",
  legalName: "MedicAI",
  email: "soporte@medicai.lat",
  country: "Ecuador",
};

export function LegalHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="logo text-xl" aria-label="MedicAI inicio">
          Medic<span>AI</span>
        </Link>
        <a href={`mailto:${CONTROLLER.email}`} className="text-sm text-text-muted hover:text-accent">
          {CONTROLLER.email}
        </a>
      </div>
    </header>
  );
}

export function LegalToc({ sections }: { sections: readonly { id: string; title: string }[] }) {
  return (
    <nav aria-label="Contenido" className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-subtle">Contenido</h2>
      <ol className="mt-3 grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-text-muted sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} className="hover:text-accent">
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalFooter({ related }: { related: { href: string; label: string } }) {
  return (
    <footer className="mt-16 border-t border-border pt-6 text-sm text-text-subtle">
      <p>
        ¿Dudas? Escríbenos a <Mail />.
      </p>
      <p className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/" className="hover:text-accent">
          ← Volver al inicio
        </Link>
        <Link href={related.href} className="hover:text-accent">
          {related.label}
        </Link>
      </p>
    </footer>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    // paddingBlock en línea: el `section { padding-block }` global de la
    // landing no está en una capa y ganaría a las utilidades de Tailwind.
    <section
      id={id}
      style={{ paddingBlock: 0 }}
      className="mt-12 text-text-muted [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-text [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
    >
      <h2 className="font-display text-2xl font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

export function Mail({ subject }: { subject?: string }) {
  const href = `mailto:${CONTROLLER.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return (
    // color en línea: el `a { color: inherit }` global gana a `text-accent`.
    <a href={href} style={{ color: "var(--accent)" }} className="font-medium underline-offset-4 hover:underline">
      {CONTROLLER.email}
    </a>
  );
}

export function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: "var(--accent)" }} className="font-medium underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
