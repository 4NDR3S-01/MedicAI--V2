import {
  AlarmClock, BellRing, CalendarClock, HeartHandshake, Mic, PackageOpen, Repeat, Smartphone,
  TrendingDown, Users, WifiOff, Baby, type LucideIcon,
} from "lucide-react";

// Páginas «Para ti» (/para/[slug]): la misma app contada para cada tipo de
// persona que la busca. Solo prometer lo que la app hace hoy.

export type Audience = {
  slug: string;
  /** Texto corto para el pie de página. */
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  highlight: string;
  intro: string;
  benefits: { Icon: LucideIcon; title: string; text: string }[];
  checklist: string[];
  faqs: { q: string; a: string }[];
  /** Demo animada de la landing que mejor lo cuenta. */
  demo: "circle" | "chat";
};

export const AUDIENCES: Audience[] = [
  {
    slug: "cuidar-a-mis-papas",
    navLabel: "Cuidar a tus papás",
    metaTitle: "Recordatorio de medicamentos para tus papás",
    metaDescription:
      "Sus alarmas suenan en su teléfono y tú te enteras si se pasa una dosis. MedicAI ayuda a cuidar los medicamentos y citas de tus papás, aunque no vivas con ellos.",
    eyebrow: "Para quienes cuidan a sus papás",
    title: "Cuida los medicamentos de tus papás,",
    highlight: "aunque no vivas con ellos",
    intro:
      "Llamar cada mañana para preguntar «¿ya te tomaste la pastilla?» cansa a todos. Con MedicAI ellos reciben sus alarmas y tú solo te enteras cuando algo se pasa.",
    benefits: [
      {
        Icon: AlarmClock,
        title: "Sus alarmas, en su teléfono",
        text: "Suenan aunque el teléfono esté bloqueado, con el nombre del medicamento y la dosis. Tomar, posponer u omitir es un solo toque.",
      },
      {
        Icon: BellRing,
        title: "Te avisa si se pasa una dosis",
        text: "Si una toma no se marca en la hora siguiente, recibes un aviso en tu teléfono. Sin vigilar, sin llamar a cada rato.",
      },
      {
        Icon: Users,
        title: "Entre hermanos, mejor",
        text: "Cada hijo puede estar en el Círculo con sus propios permisos. Todos ven el mismo «Seguimiento de hoy».",
      },
      {
        Icon: Smartphone,
        title: "¿No usan smartphone?",
        text: "Crea un perfil para ellos y lleva sus medicamentos y citas desde tu teléfono. Las alarmas te suenan a ti.",
      },
      {
        Icon: PackageOpen,
        title: "Antes de que se acaben",
        text: "MedicAI descuenta cada toma y avisa cuando quedan pocas pastillas, a ellos y a ti.",
      },
      {
        Icon: CalendarClock,
        title: "Sus citas, también",
        text: "Controles que se repiten cada mes o cada trimestre, con recordatorio antes de la fecha.",
      },
    ],
    checklist: [
      "Ellos deciden qué te comparten y pueden cambiarlo cuando quieran",
      "Funciona con la hora de su ciudad, aunque vivas en otro país",
      "Las alarmas suenan sin internet",
      "Gratis y sin anuncios",
    ],
    faqs: [
      {
        q: "¿Mis papás tienen que saber usar la app?",
        a: "No necesariamente. Si usan su teléfono, solo tienen que tocar «Tomar» cuando suena la alarma; tú puedes cargarles los medicamentos con los permisos del Círculo. Si no usan smartphone, creas un perfil para ellos y lo llevas tú.",
      },
      {
        q: "¿Cuándo me llega el aviso de una dosis olvidada?",
        a: "Cuando una toma programada lleva una hora sin marcarse, MedicAI avisa a las personas del Círculo que activaron los recordatorios de esa persona.",
      },
      {
        q: "¿Puedo ver sus datos sin que ellos lo autoricen?",
        a: "No. Cada persona decide qué comparte (ver, registrar tomas, gestionar citas…) y puede retirar el permiso en cualquier momento.",
      },
    ],
    demo: "circle",
  },
  {
    slug: "medicamentos-de-mis-hijos",
    navLabel: "Medicamentos de tus hijos",
    metaTitle: "Recordatorio de medicamentos para niños",
    metaDescription:
      "Antibióticos cada 8 horas, jarabes «solo si hay fiebre» y controles del pediatra. MedicAI lleva los medicamentos de tus hijos y lo comparte con quien te ayuda a cuidarlos.",
    eyebrow: "Para mamás y papás",
    title: "Los medicamentos de tus hijos,",
    highlight: "sin libretas ni dudas",
    intro:
      "«¿Ya le diste el antibiótico?» «¿A qué hora fue la última dosis del jarabe?» MedicAI lo registra para que todos los que cuidan al niño sepan lo mismo.",
    benefits: [
      {
        Icon: Baby,
        title: "Un perfil para cada hijo",
        text: "No necesitan cuenta ni teléfono: los gestionas desde el tuyo. Cuando crezcan, les entregas su cuenta.",
      },
      {
        Icon: HeartHandshake,
        title: "Compartido con quien cuida",
        text: "Papá, mamá, abuelos o niñera ven las mismas tomas. Si uno ya le dio la dosis, el otro lo sabe.",
      },
      {
        Icon: AlarmClock,
        title: "Tratamientos con horario",
        text: "El antibiótico tres veces al día por siete días: lo configuras una vez y las alarmas se encargan.",
      },
      {
        Icon: Repeat,
        title: "Solo cuando lo necesite",
        text: "Para el jarabe de la fiebre, registras cada toma y configuras el máximo al día y las horas entre una y otra que indicó el pediatra.",
      },
      {
        Icon: TrendingDown,
        title: "Dosis que cambian",
        text: "Si la dosis baja con los días, MedicAI anuncia en cada alarma la que corresponde ese día.",
      },
      {
        Icon: CalendarClock,
        title: "Controles y vacunas",
        text: "Agenda los controles del pediatra, incluidos los que se repiten, y recibe el recordatorio a tiempo.",
      },
    ],
    checklist: [
      "Cada toma queda registrada con quién la dio",
      "Avisos a los otros cuidadores si una dosis se pasa",
      "Funciona sin conexión",
      "Gratis y sin anuncios",
    ],
    faqs: [
      {
        q: "¿Mi hijo necesita su propio teléfono o correo?",
        a: "No. Creas un perfil para él dentro de tu cuenta. Cuando quiera su propia cuenta, se la entregas con un enlace y pasa a controlar sus datos.",
      },
      {
        q: "¿Podemos usarla los dos papás?",
        a: "Sí. Los dos pueden cuidar al mismo niño: cada uno ve sus medicamentos, registra tomas y recibe los avisos que active.",
      },
      {
        q: "¿MedicAI me dice qué dosis darle?",
        a: "No. La dosis la indica el pediatra; MedicAI solo te recuerda la que tú configuraste. Ante cualquier duda, consulta con el médico o el farmacéutico.",
      },
    ],
    demo: "circle",
  },
  {
    slug: "tratamientos-cronicos",
    navLabel: "Tratamientos de largo plazo",
    metaTitle: "App para tratamientos crónicos: hipertensión, diabetes y más",
    metaDescription:
      "Para quienes toman medicamentos todos los días: alarmas que no fallan, inventario de pastillas, controles mensuales y un asistente al que le puedes hablar.",
    eyebrow: "Para tratamientos de largo plazo",
    title: "Cuando el tratamiento es de todos los días,",
    highlight: "que no dependa de tu memoria",
    intro:
      "Presión, diabetes, tiroides, colesterol… Cuando tomas varios medicamentos durante años, lo difícil no es empezar: es no fallar ningún día. MedicAI lo hace rutina.",
    benefits: [
      {
        Icon: AlarmClock,
        title: "Alarmas con nombre y dosis",
        text: "Suenan aunque el teléfono esté bloqueado. Tomar, posponer 10 minutos u omitir, con un toque.",
      },
      {
        Icon: PackageOpen,
        title: "Nunca te quedes sin pastillas",
        text: "MedicAI descuenta cada toma y te avisa cuando quedan pocas, con tiempo para ir a la farmacia.",
      },
      {
        Icon: CalendarClock,
        title: "Controles que se repiten",
        text: "El control mensual o trimestral se agenda una vez y te recuerda cada cita.",
      },
      {
        Icon: Mic,
        title: "Regístralo con la voz",
        text: "Dile al asistente «ya me tomé la de la presión» y queda registrado, sin buscar en la lista.",
      },
      {
        Icon: WifiOff,
        title: "Sin señal, también",
        text: "Las alarmas suenan sin internet y las tomas se sincronizan solas cuando vuelves a tener conexión.",
      },
      {
        Icon: Users,
        title: "Con tu familia al tanto",
        text: "Si quieres, alguien de tu Círculo recibe un aviso cuando una dosis se te pasa.",
      },
    ],
    checklist: [
      "Horarios diarios, ciertos días de la semana o cada N días",
      "Registro de cada toma para saber cómo vas con el tratamiento",
      "Viaja tranquilo: las horas se ajustan a tu zona horaria",
      "Gratis y sin anuncios",
    ],
    faqs: [
      {
        q: "Tomo muchos medicamentos, ¿no se vuelve un caos de alarmas?",
        a: "Cada alarma dice qué medicamento y qué dosis corresponde, y puedes posponerla 10 minutos si en ese momento no puedes.",
      },
      {
        q: "¿El asistente puede cambiar mis medicamentos?",
        a: "No por su cuenta: puede preparar un medicamento o una cita cuando se lo pides, pero siempre lo revisas y confirmas tú. Y nunca reemplaza la indicación de tu médico.",
      },
      {
        q: "¿Qué pasa si cambio de teléfono?",
        a: "Tus medicamentos, citas y registro de tomas están en tu cuenta. Inicias sesión en el teléfono nuevo y las alarmas se vuelven a programar.",
      },
    ],
    demo: "chat",
  },
];

export function getAudience(slug: string) {
  return AUDIENCES.find((a) => a.slug === slug);
}
