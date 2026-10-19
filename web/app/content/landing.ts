import { Baby, CalendarClock, PackageOpen, Pill, Users, WifiOff } from "lucide-react";

// Textos de la landing. Las FAQ también alimentan los datos estructurados
// (FAQPage) de app/page.tsx: si cambias una, cambia en los dos lados a la vez.

export const FEATURES = [
  {
    Icon: Pill,
    title: "Medicamentos a tu medida",
    description: "Todos los días, ciertos días de la semana, cada N días o solo cuando lo necesites. Incluso dosis que cambian con el tiempo.",
  },
  {
    Icon: CalendarClock,
    title: "Citas que no se olvidan",
    description: "Agenda consultas, controles que se repiten cada mes y recibe el recordatorio antes de que llegue el día.",
  },
  {
    Icon: Users,
    title: "Círculo de cuidado",
    description: "Comparte con tu familia solo lo que tú elijas y recibe un aviso si alguien que cuidas no marcó su dosis.",
  },
  {
    Icon: Baby,
    title: "Perfiles para quien no usa la app",
    description: "Lleva los medicamentos de tu hijo o de un adulto mayor desde tu teléfono, y entrégale la cuenta cuando esté listo.",
  },
  {
    Icon: PackageOpen,
    title: "Inventario de pastillas",
    description: "MedicAI descuenta cada toma y te avisa cuando quedan pocas, antes de que se acaben.",
  },
  {
    Icon: WifiOff,
    title: "Funciona sin conexión",
    description: "Las alarmas suenan sin internet y las tomas que marques se sincronizan solas cuando vuelvas a tener señal.",
  },
];

export const FAQS = [
  {
    q: "¿Es gratuita la aplicación?",
    a: "Sí. MedicAI es gratuita, sin anuncios, e incluye todas sus funciones: recordatorios, citas, Círculo de cuidado y asistente.",
  },
  {
    q: "¿Cómo funciona el Círculo de cuidado?",
    a: "Invitas a un familiar con un enlace y cada uno decide qué comparte con el otro: ver medicamentos, registrar tomas, gestionar citas. Si lo activas, recibes un aviso cuando alguien que cuidas no marca una dosis a tiempo. Puedes cambiar o retirar los permisos cuando quieras.",
  },
  {
    q: "¿Puedo llevar los medicamentos de mi hijo o de mis papás?",
    a: "Sí. Puedes crear un perfil para alguien que no usa la app (por ejemplo, un niño o un adulto mayor) y gestionarlo desde tu teléfono. Cuando esa persona quiera su propia cuenta, se la entregas con un enlace.",
  },
  {
    q: "¿Las alarmas funcionan sin internet?",
    a: "Sí. Las alarmas viven en tu teléfono y suenan aunque no tengas conexión. Las tomas que registres sin señal se guardan y se sincronizan solas al reconectar.",
  },
  {
    q: "¿El asistente reemplaza a mi médico?",
    a: "No. El asistente te ayuda a organizarte y responde dudas generales, pero puede equivocarse y no diagnostica. Antes de cambiar un tratamiento, consulta con tu médico. Ante una emergencia, llama a los servicios de emergencia.",
  },
  {
    q: "¿Están seguros mis datos médicos?",
    a: "Tu información viaja cifrada (HTTPS), las contraseñas se guardan con hash y solo tú y las personas que autorices pueden ver tus datos. Tus datos de salud son opcionales, nunca se venden y puedes descargarlos o pedir que los eliminemos cuando quieras.",
  },
];
