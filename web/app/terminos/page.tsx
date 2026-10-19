import type { Metadata } from "next";
import { CONTROLLER, InlineLink, LegalFooter, LegalHeader, LegalToc, Mail, Section } from "../components/legal";

const TERMS_VERSION = "2026-10-18";
const LAST_UPDATED = "18 de octubre de 2026";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Las reglas de uso de MedicAI: tu cuenta, los recordatorios, el asistente de IA, el Círculo de cuidado y nuestras responsabilidades.",
  alternates: { canonical: "/terminos" },
};

const SECTIONS = [
  { id: "aceptacion", title: "Aceptación" },
  { id: "servicio", title: "Qué es MedicAI" },
  { id: "no-medico", title: "No es consejo médico" },
  { id: "cuenta", title: "Tu cuenta" },
  { id: "recordatorios", title: "Recordatorios y alarmas" },
  { id: "asistente", title: "Asistente de IA" },
  { id: "circulo", title: "Círculo de cuidado y dependientes" },
  { id: "uso-aceptable", title: "Uso aceptable" },
  { id: "contenido", title: "Tus datos y contenido" },
  { id: "precio", title: "Precio y cambios del servicio" },
  { id: "propiedad", title: "Propiedad intelectual" },
  { id: "responsabilidad", title: "Limitación de responsabilidad" },
  { id: "terminacion", title: "Suspensión y cierre de cuenta" },
  { id: "cambios", title: "Cambios en estos términos" },
  { id: "ley", title: "Ley aplicable" },
] as const;

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg text-text">
      <LegalHeader />

      <article className="mx-auto max-w-3xl px-5 pb-24 pt-12 leading-relaxed">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Legal</p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Términos y condiciones
        </h1>
        <p className="mt-3 text-sm text-text-subtle">
          Última actualización: {LAST_UPDATED} · Versión {TERMS_VERSION}
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">En resumen</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-text-muted">
            <li>MedicAI te ayuda a organizar medicamentos, citas y el cuidado de tu familia.</li>
            <li>No es un servicio médico: no diagnostica ni reemplaza a tu médico. Ante una emergencia, llama a los servicios de emergencia.</li>
            <li>Los recordatorios dependen de tu teléfono; revisa que las notificaciones y alarmas estén permitidas.</li>
            <li>Tú decides con quién compartes tus datos en el Círculo y puedes retirar ese acceso cuando quieras.</li>
            <li>Tus datos son tuyos. Cómo los tratamos está en la <InlineLink href="/privacidad">política de privacidad</InlineLink>.</li>
          </ul>
        </div>

        <LegalToc sections={SECTIONS} />

        <Section id="aceptacion" title="1. Aceptación">
          <p>
            Estos términos regulan el uso de la app y del sitio web {CONTROLLER.brand}, que ofrece{" "}
            <strong>{CONTROLLER.legalName}</strong> desde {CONTROLLER.country}. Al crear una cuenta o usar la
            app aceptas estos términos y la <InlineLink href="/privacidad">política de privacidad</InlineLink>.
            Si no estás de acuerdo, no uses el servicio.
          </p>
        </Section>

        <Section id="servicio" title="2. Qué es MedicAI">
          <p>MedicAI es una herramienta de organización personal y familiar que te permite:</p>
          <ul>
            <li>Registrar medicamentos con sus horarios, dosis e inventario, y recibir alarmas para tomarlos.</li>
            <li>Agendar citas médicas, incluidas las que se repiten, con recordatorios.</li>
            <li>Compartir información con las personas de tu Círculo de cuidado, con los permisos que tú eliges.</li>
            <li>Conversar con un asistente de IA que responde dudas generales y te ayuda a cargar datos.</li>
          </ul>
        </Section>

        <Section id="no-medico" title="3. No es consejo médico">
          <p>
            MedicAI <strong>no es un dispositivo médico ni presta servicios de salud</strong>. No diagnostica,
            no prescribe y no sustituye la consulta con un profesional. La información que registras (dosis,
            horarios, indicaciones) es responsabilidad tuya y debe coincidir con lo que indicó tu médico o
            farmacéutico.
          </p>
          <p>
            Ante una emergencia, no uses la app: acude al centro de salud más cercano o llama a los servicios de
            emergencia de tu país.
          </p>
        </Section>

        <Section id="cuenta" title="4. Tu cuenta">
          <ul>
            <li>
              Debes tener al menos 13 años. Si tienes entre 13 y 17, necesitas la autorización de tu madre,
              padre o representante legal.
            </li>
            <li>Los datos que registras deben ser verdaderos y estar actualizados.</li>
            <li>
              Eres responsable de mantener seguro el acceso a tu cuenta y a tu teléfono. Si crees que alguien
              entró sin permiso, cierra sus sesiones desde la app y escríbenos.
            </li>
            <li>La cuenta es personal: no la compartas ni la vendas.</li>
          </ul>
        </Section>

        <Section id="recordatorios" title="5. Recordatorios y alarmas">
          <p>
            Hacemos todo lo posible para que los recordatorios lleguen a tiempo, pero dependen de factores que
            no controlamos: los permisos de notificaciones y alarmas, el ahorro de batería, el modo no molestar,
            la conexión a internet y el propio sistema de tu teléfono.
          </p>
          <p>
            Por eso <strong>no garantizamos</strong> que cada alarma o aviso llegue siempre. Si un medicamento
            es crítico para tu salud, usa MedicAI como apoyo y no como único recordatorio. Los avisos a tu
            Círculo (por ejemplo, cuando una dosis no se marca a tiempo) son una ayuda adicional y tampoco están
            garantizados.
          </p>
        </Section>

        <Section id="asistente" title="6. Asistente de IA">
          <ul>
            <li>
              Las respuestas las genera un modelo de inteligencia artificial: son orientativas y{" "}
              <strong>pueden contener errores</strong>. Verifícalas con un profesional antes de actuar.
            </li>
            <li>
              El asistente puede preparar un medicamento, una cita o el registro de una toma, pero nunca guarda
              nada por su cuenta: siempre lo revisas y confirmas tú.
            </li>
            <li>No lo uses para emergencias ni para decidir cambios en tu tratamiento.</li>
            <li>
              Puede tener límites de uso y dejar de estar disponible temporalmente si el proveedor externo no
              responde.
            </li>
          </ul>
        </Section>

        <Section id="circulo" title="7. Círculo de cuidado y dependientes">
          <ul>
            <li>
              Cada persona decide qué permisos da a los demás sobre sus propios datos y puede cambiarlos o
              retirarlos en cualquier momento. Comparte solo con personas de tu confianza.
            </li>
            <li>
              Quien recibe acceso a los datos de otra persona se compromete a usarlos únicamente para
              acompañar su cuidado y a no compartirlos con terceros.
            </li>
            <li>
              Al crear el perfil de un <strong>dependiente</strong> (por ejemplo, un hijo o un adulto mayor que
              no usa la app), declaras que eres su representante legal o que cuentas con su autorización, y
              asumes la responsabilidad de los datos que registras.
            </li>
            <li>
              Cuando el dependiente recibe su propia cuenta («entregar la cuenta»), pasa a controlar sus datos y
              los permisos de los demás.
            </li>
          </ul>
        </Section>

        <Section id="uso-aceptable" title="8. Uso aceptable">
          <p>No está permitido:</p>
          <ul>
            <li>Registrar datos de otra persona sin su autorización o sin ser su representante.</li>
            <li>Usar la app para acosar, vigilar o perjudicar a otras personas.</li>
            <li>Intentar acceder a cuentas o datos ajenos, o vulnerar la seguridad del servicio.</li>
            <li>Automatizar solicitudes, sobrecargar los servidores o abusar del asistente de IA.</li>
            <li>Copiar, revender o explotar comercialmente el servicio sin nuestro permiso.</li>
          </ul>
        </Section>

        <Section id="contenido" title="9. Tus datos y contenido">
          <p>
            Los datos que registras son tuyos. Nos das el permiso mínimo necesario para guardarlos, procesarlos
            y mostrarlos a ti y a las personas que autorices, solo con el fin de prestar el servicio. Puedes
            descargar una copia desde tu perfil o pedir que los eliminemos.
          </p>
          <p>
            El detalle de qué datos tratamos, con quién y cómo ejercer tus derechos está en la{" "}
            <InlineLink href="/privacidad">política de privacidad</InlineLink>.
          </p>
        </Section>

        <Section id="precio" title="10. Precio y cambios del servicio">
          <p>
            Actualmente MedicAI es gratuita. Si en el futuro ofrecemos funciones de pago, te lo informaremos
            con anticipación y nunca te cobraremos sin tu aceptación expresa.
          </p>
          <p>
            Podemos mejorar, modificar o retirar funciones. Si un cambio afecta de forma importante cómo usas la
            app, te avisaremos con antelación razonable.
          </p>
        </Section>

        <Section id="propiedad" title="11. Propiedad intelectual">
          <p>
            La marca {CONTROLLER.brand}, el diseño, el código y los contenidos de la app y del sitio pertenecen a{" "}
            {CONTROLLER.legalName} o a sus licenciantes. Te damos una licencia personal, gratuita, no exclusiva e
            intransferible para usar la app conforme a estos términos.
          </p>
        </Section>

        <Section id="responsabilidad" title="12. Limitación de responsabilidad">
          <p>
            El servicio se ofrece «tal como está». En la medida que lo permita la ley, {CONTROLLER.legalName} no
            responde por daños derivados de: decisiones de salud tomadas con base en la app o en el asistente,
            recordatorios que no llegaron por causas ajenas a nosotros, datos incorrectos registrados por los
            usuarios, o interrupciones del servicio y de los proveedores externos.
          </p>
          <p>Nada de lo anterior limita los derechos que te reconoce la ley como consumidor.</p>
        </Section>

        <Section id="terminacion" title="13. Suspensión y cierre de cuenta">
          <p>
            Puedes dejar de usar MedicAI y pedir que eliminemos tu cuenta cuando quieras escribiendo a{" "}
            <Mail subject="Eliminar mi cuenta de MedicAI" />.
          </p>
          <p>
            Podemos suspender o cerrar una cuenta que incumpla estos términos o ponga en riesgo a otras personas
            o al servicio. Salvo casos graves o urgentes, te avisaremos antes y te daremos la oportunidad de
            descargar tus datos.
          </p>
        </Section>

        <Section id="cambios" title="14. Cambios en estos términos">
          <p>
            Si los modificamos, actualizaremos la fecha de esta página y, cuando el cambio sea importante, te
            avisaremos en la app o por correo antes de que entre en vigor. Si sigues usando MedicAI después, se
            entiende que aceptas la nueva versión.
          </p>
        </Section>

        <Section id="ley" title="15. Ley aplicable">
          <p>
            Estos términos se rigen por las leyes de la República del {CONTROLLER.country}. Antes de acudir a
            otras vías, escríbenos a <Mail /> para intentar resolver cualquier desacuerdo de forma directa.
          </p>
        </Section>

        <LegalFooter related={{ href: "/privacidad", label: "Política de privacidad" }} />
      </article>
    </main>
  );
}
