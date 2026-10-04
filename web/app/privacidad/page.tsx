import type { Metadata } from "next";
import Link from "next/link";

// Fuente única de los datos del responsable. Completa `legalName` con el
// nombre legal (persona natural o empresa) y su identificación si aplica.
const CONTROLLER = {
  brand: "MedicAI",
  legalName: "MedicAI",
  email: "soporte@medicai.lat",
  country: "Ecuador",
};

const POLICY_VERSION = "2026-10-03";
const LAST_UPDATED = "3 de octubre de 2026";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos trata MedicAI, para qué, con quién se comparten y cómo ejercer tus derechos o eliminar tu cuenta.",
  alternates: { canonical: "/privacidad" },
};

const SECTIONS = [
  { id: "responsable", title: "Quién es responsable" },
  { id: "datos", title: "Qué datos tratamos" },
  { id: "finalidades", title: "Para qué los usamos" },
  { id: "base-legal", title: "Base legal" },
  { id: "ia", title: "Asistente de IA" },
  { id: "terceros", title: "Con quién los compartimos" },
  { id: "conservacion", title: "Cuánto tiempo los guardamos" },
  { id: "seguridad", title: "Cómo los protegemos" },
  { id: "derechos", title: "Tus derechos" },
  { id: "eliminar-cuenta", title: "Eliminar tu cuenta" },
  { id: "menores", title: "Menores de edad" },
  { id: "cambios", title: "Cambios en esta política" },
] as const;

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-bg text-text">
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

      <article className="mx-auto max-w-3xl px-5 pb-24 pt-12 leading-relaxed">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Privacidad</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Política de privacidad
        </h1>
        <p className="mt-3 text-sm text-text-subtle">
          Última actualización: {LAST_UPDATED} · Versión {POLICY_VERSION}
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">En resumen</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-text-muted">
            <li>Usamos tus datos solo para que MedicAI funcione: cuenta, recordatorios, citas y asistente.</li>
            <li>Tus datos de salud son opcionales y nunca los vendemos ni los usamos para publicidad.</li>
            <li>
              El asistente de IA lo presta un proveedor externo. Tu perfil de salud, tus medicamentos y tus
              próximas citas solo se le envían si lo autorizas, y puedes retirar ese permiso cuando quieras.
            </li>
            <li>Puedes consultar, corregir, exportar o eliminar tus datos escribiendo a {CONTROLLER.email}.</li>
            <li>MedicAI te ayuda a organizarte, pero no reemplaza la atención de un profesional de la salud.</li>
          </ul>
        </div>

        <nav aria-label="Contenido" className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-subtle">Contenido</h2>
          <ol className="mt-3 grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-text-muted sm:grid-cols-2">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="hover:text-accent">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="responsable" title="1. Quién es responsable de tus datos">
          <p>
            El responsable del tratamiento es <strong>{CONTROLLER.legalName}</strong>, que ofrece la app y el
            sitio web {CONTROLLER.brand} desde {CONTROLLER.country}. Para cualquier asunto de privacidad
            escríbenos a <Mail />.
          </p>
          <p>
            Tratamos tus datos conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador
            (LOPDP) y a las demás normas que resulten aplicables.
          </p>
        </Section>

        <Section id="datos" title="2. Qué datos tratamos">
          <h3>Datos de tu cuenta</h3>
          <ul>
            <li>Nombre, correo electrónico y fecha de nacimiento.</li>
            <li>Teléfono, si decides agregarlo.</li>
            <li>Tu contraseña, que guardamos únicamente como hash (no podemos leerla).</li>
            <li>El avatar que elijas entre los disponibles en la app.</li>
          </ul>
          <h3>Datos de salud (opcionales)</h3>
          <p>
            Son datos sensibles. Solo los tratamos si tú los registras:
          </p>
          <ul>
            <li>Condiciones de salud diagnosticadas y alergias.</li>
            <li>
              Situaciones especiales: embarazo, lactancia, cirugía reciente, defensas bajas o tratamiento
              anticoagulante.
            </li>
            <li>Medicamentos (nombre, dosis, horarios y notas) y el registro de tomas, omisiones y aplazamientos.</li>
            <li>Citas médicas (motivo, profesional, fecha, lugar, notas y si asististe).</li>
          </ul>
          <h3>Mensajes con el asistente de IA</h3>
          <p>
            Lo que escribes en el chat se envía al proveedor de IA para generar la respuesta. No guardamos
            el historial de conversaciones en nuestros servidores: queda solo en tu teléfono y se borra al
            cerrar sesión o cuando tú lo borras.
          </p>
          <h3>Voz</h3>
          <p>
            Si le hablas al asistente, el micrófono se usa solo mientras lo activas en el chat (nunca en
            segundo plano). El audio se envía al proveedor de IA para convertirlo en texto y no se guarda ni
            en el teléfono ni en nuestros servidores. Las respuestas habladas las genera la voz de tu propio
            teléfono.
          </p>
          <h3>Ubicación</h3>
          <p>
            Solo si usas el mapa para elegir el lugar de una cita y das permiso. Tu ubicación se usa en tu
            dispositivo para centrar el mapa; no la guardamos. Guardamos únicamente el lugar que confirmes
            para la cita.
          </p>
          <h3>Datos técnicos</h3>
          <p>
            Para seguridad y diagnóstico registramos la dirección IP, la fecha y hora y el resultado de cada
            solicitud, junto con un identificador interno de usuario. En tu dispositivo se guardan la
            sesión, tus preferencias y las alarmas de medicación.
          </p>
          <p>No usamos herramientas de publicidad ni de seguimiento de terceros.</p>
        </Section>

        <Section id="finalidades" title="3. Para qué los usamos">
          <ul>
            <li>Crear y proteger tu cuenta, verificar tu correo y permitirte recuperar la contraseña.</li>
            <li>Programar recordatorios y alarmas de medicamentos y citas.</li>
            <li>Advertirte, si lo autorizas, sobre posibles alergias o contraindicaciones en el asistente.</li>
            <li>Prevenir abusos, resolver errores y mantener el servicio funcionando.</li>
            <li>Atender tus consultas y solicitudes.</li>
          </ul>
          <p>
            No vendemos tus datos, no los usamos para publicidad y no tomamos decisiones automatizadas que
            produzcan efectos jurídicos sobre ti.
          </p>
        </Section>

        <Section id="base-legal" title="4. Base legal">
          <ul>
            <li>
              <strong>Ejecución del servicio</strong> que solicitas al crear tu cuenta: datos de cuenta,
              medicamentos, citas y datos técnicos necesarios.
            </li>
            <li>
              <strong>Tu consentimiento explícito</strong> para los datos de salud y para compartir tu perfil
              de salud con el asistente de IA. Puedes retirarlo en cualquier momento sin que afecte a lo
              tratado antes.
            </li>
            <li>
              <strong>Interés legítimo</strong> en la seguridad del servicio (registros técnicos y límites de
              uso).
            </li>
            <li><strong>Obligaciones legales</strong>, cuando una autoridad competente lo requiera.</li>
          </ul>
        </Section>

        <Section id="ia" title="5. Asistente de IA">
          <p>
            El asistente funciona con <strong>Groq</strong>, un proveedor externo ubicado en Estados Unidos.
            Le enviamos tu mensaje y el historial reciente de la conversación para generar la respuesta.
          </p>
          <p>
            <strong>Tu perfil de salud solo se incluye si lo autorizas</strong> (opción desactivada por
            defecto). En ese caso enviamos tu edad, condiciones de salud, alergias, situaciones especiales,
            tus medicamentos activos (nombre, dosis y horarios) y tus citas de los próximos 60 días; nunca tu
            nombre, correo ni teléfono. Puedes activarlo o desactivarlo en <em>Perfil → Privacidad</em>.
          </p>
          <p>
            El asistente puede <strong>preparar</strong> un medicamento o una cita cuando se lo pides, pero
            nunca los guarda solo: siempre los revisas y confirmas tú.
          </p>
          <p>
            Evita escribir en el chat datos que no quieras compartir. Las respuestas son orientativas, pueden
            contener errores y no sustituyen el criterio de un profesional de la salud. Ante una emergencia,
            acude o llama a los servicios de emergencia.
          </p>
        </Section>

        <Section id="terceros" title="6. Con quién los compartimos">
          <p>Solo con proveedores que necesitamos para prestar el servicio, y solo lo imprescindible:</p>
          <ul>
            <li>
              <strong>Groq</strong> (Estados Unidos): procesa los mensajes (y la voz, para convertirla en texto) del asistente de IA y, si lo
              autorizas, tu perfil de salud, medicamentos y próximas citas.
            </li>
            <li>
              <strong>Resend</strong> (Estados Unidos): envía los correos de verificación y recuperación de
              contraseña. Recibe tu correo electrónico y tu nombre.
            </li>
            <li>
              <strong>OpenStreetMap</strong>: proporciona el mapa y el nombre de los lugares cuando usas el
              selector de ubicación. Recibe las coordenadas del punto que consultas y tu dirección IP.
            </li>
          </ul>
          <p>
            Algunos de estos proveedores están fuera de Ecuador, por lo que hay una transferencia
            internacional de datos que realizamos con las garantías que exige la ley. También podemos
            comunicar datos a autoridades cuando una norma o una orden judicial lo exijan.
          </p>
        </Section>

        <Section id="conservacion" title="7. Cuánto tiempo los guardamos">
          <ul>
            <li>Los datos de tu cuenta, de salud, medicamentos y citas: mientras tu cuenta exista.</li>
            <li>
              Las citas que eliminas en la app se ocultan y se borran definitivamente al eliminar tu cuenta.
            </li>
            <li>Los enlaces de verificación caducan en 24 horas y los de recuperación de contraseña en 30 minutos.</li>
            <li>Los registros técnicos se conservan durante un periodo limitado y se rotan periódicamente.</li>
          </ul>
        </Section>

        <Section id="seguridad" title="8. Cómo los protegemos">
          <ul>
            <li>Toda la comunicación entre la app y nuestros servidores viaja cifrada (HTTPS).</li>
            <li>Las contraseñas se guardan con hash (bcrypt) y las sesiones usan tokens que caducan.</li>
            <li>Cada usuario solo puede acceder a sus propios datos y limitamos los intentos para evitar abusos.</li>
            <li>El acceso a los servidores está restringido a las personas que lo necesitan.</li>
          </ul>
          <p>
            Ningún sistema es infalible. Si detectamos un incidente que ponga en riesgo tus datos, te
            avisaremos y lo comunicaremos a la autoridad según exige la ley.
          </p>
        </Section>

        <Section id="derechos" title="9. Tus derechos">
          <p>Según la LOPDP puedes ejercer, de forma gratuita, tus derechos de:</p>
          <ul>
            <li>Acceso: saber qué datos tenemos sobre ti.</li>
            <li>Rectificación y actualización: corregirlos (también puedes hacerlo desde tu perfil).</li>
            <li>Eliminación de tus datos.</li>
            <li>Oposición y suspensión del tratamiento.</li>
            <li>Portabilidad: recibir tus datos en un formato estructurado.</li>
            <li>Retirar tu consentimiento en cualquier momento.</li>
          </ul>
          <p>
            Escríbenos a <Mail /> desde el correo de tu cuenta indicando qué derecho quieres ejercer.
            Responderemos dentro de los plazos que establece la ley. Si no estás conforme con nuestra
            respuesta, puedes presentar un reclamo ante la Superintendencia de Protección de Datos
            Personales del Ecuador.
          </p>
        </Section>

        <Section id="eliminar-cuenta" title="10. Eliminar tu cuenta">
          <p>
            Envía un correo a <Mail subject="Eliminar mi cuenta de MedicAI" /> desde la dirección con la que
            te registraste, con el asunto «Eliminar mi cuenta». Confirmaremos la solicitud y eliminaremos tu
            cuenta y todos sus datos asociados:
          </p>
          <ul>
            <li>Datos de la cuenta y perfil de salud.</li>
            <li>Medicamentos, registro de tomas y citas (incluidas las que ocultaste).</li>
            <li>Tokens de sesión, verificación y recuperación.</li>
          </ul>
          <p>
            Los registros técnicos de seguridad se eliminan al cumplirse su periodo de rotación. Las alarmas
            guardadas en tu teléfono se borran al desinstalar la app.
          </p>
        </Section>

        <Section id="menores" title="11. Menores de edad">
          <p>
            MedicAI no está dirigida a menores de 13 años y no permite su registro. Si tienes entre 13 y 17
            años, necesitas la autorización de tu madre, padre o representante legal para usar la app. Si
            crees que un menor nos ha dado datos sin esa autorización, escríbenos y los eliminaremos.
          </p>
        </Section>

        <Section id="cambios" title="12. Cambios en esta política">
          <p>
            Si la modificamos, actualizaremos la fecha de esta página y, cuando el cambio sea importante, te
            avisaremos en la app o por correo antes de que entre en vigor.
          </p>
        </Section>

        <footer className="mt-16 border-t border-border pt-6 text-sm text-text-subtle">
          <p>
            ¿Dudas? Escríbenos a <Mail />.
          </p>
          <p className="mt-2">
            <Link href="/" className="hover:text-accent">
              ← Volver al inicio
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
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

function Mail({ subject }: { subject?: string }) {
  const href = `mailto:${CONTROLLER.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return (
    // color en línea: el `a { color: inherit }` global gana a `text-accent`.
    <a href={href} style={{ color: "var(--accent)" }} className="font-medium underline-offset-4 hover:underline">
      {CONTROLLER.email}
    </a>
  );
}
