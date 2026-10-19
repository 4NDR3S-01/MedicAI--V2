// Guías (/guias/[slug]): consejos de organización, nunca indicaciones médicas.
// Cada bloque es un párrafo (string) o una lista ({ list: [...] }).

export type GuideBlock = string | { list: string[] };

export type Guide = {
  slug: string;
  title: string;
  description: string;
  /** "YYYY-MM-DD" */
  published: string;
  readingMinutes: number;
  intro: string;
  sections: { title: string; blocks: GuideBlock[] }[];
  /** Página «Para ti» relacionada, para cerrar la guía. */
  related: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "como-no-olvidar-tomar-medicamentos",
    title: "8 trucos para no olvidar tomar tus medicamentos",
    description:
      "Rutinas, alarmas, pastilleros y qué hacer si se te pasó una dosis. Consejos prácticos para cumplir tu tratamiento todos los días.",
    published: "2026-10-18",
    readingMinutes: 4,
    intro:
      "Olvidar una pastilla de vez en cuando le pasa a casi todo el mundo, sobre todo en tratamientos largos o cuando son varios medicamentos. La buena noticia es que no depende de tener «buena memoria»: depende de tener un sistema. Estos son los trucos que más ayudan.",
    sections: [
      {
        title: "1. Átalo a algo que ya haces",
        blocks: [
          "El hábito más fácil de mantener es el que se engancha a otro que ya tienes: el café de la mañana, lavarte los dientes, la cena. «Después del desayuno, la pastilla de la presión» funciona mejor que «a las 8:00».",
          "Si tu médico te indicó tomarlo con comida o en ayunas, elige una rutina que encaje con esa indicación.",
        ],
      },
      {
        title: "2. Usa alarmas que digan qué tomar",
        blocks: [
          "Una alarma genérica a las 8:00 se apaga sin pensar. Una que dice «Losartán 50 mg · 1 tableta» te obliga a registrar qué estás haciendo. Si tomas varios medicamentos, que cada uno tenga su propio aviso.",
        ],
      },
      {
        title: "3. Marca cada toma",
        blocks: [
          "El problema más común no es olvidar, es dudar: «¿ya me la tomé hoy?». Registrar cada toma (en una app, en un calendario o en el pastillero) evita tanto saltarse una dosis como tomarla dos veces.",
        ],
      },
      {
        title: "4. Prueba un pastillero semanal",
        blocks: [
          "Llenarlo una vez por semana te deja ver de un vistazo si la dosis de hoy sigue ahí. Guárdalo en un lugar visible para ti, pero fuera del alcance de los niños y lejos de la humedad y el calor (el baño no es buena idea).",
        ],
      },
      {
        title: "5. Revisa cuántas te quedan",
        blocks: [
          "Muchas dosis se pierden simplemente porque se acabó la caja. Lleva la cuenta de las pastillas que te quedan y compra o pide la receta cuando falte una semana, no el último día.",
        ],
      },
      {
        title: "6. Planea los días distintos",
        blocks: [
          "Viajes, fines de semana y turnos de noche rompen la rutina. Antes de salir, lleva medicamentos de sobra en el equipaje de mano y, si cambias de zona horaria, pregunta a tu médico o farmacéutico cómo ajustar los horarios.",
        ],
      },
      {
        title: "7. Pide ayuda a alguien de confianza",
        blocks: [
          "Que un familiar sepa tu tratamiento no es perder independencia. Saber que alguien se enterará si se te pasa una dosis importante da tranquilidad a los dos.",
        ],
      },
      {
        title: "8. Si se te pasó una dosis",
        blocks: [
          "Lo que conviene hacer depende de cada medicamento. Como regla general:",
          {
            list: [
              "No tomes una dosis doble para compensar, salvo que tu médico te lo haya indicado.",
              "Revisa el prospecto: muchos indican qué hacer si olvidas una toma.",
              "Ante la duda, pregunta a tu médico o a tu farmacéutico.",
            ],
          },
        ],
      },
    ],
    related: "tratamientos-cronicos",
  },
  {
    slug: "organizar-medicamentos-adulto-mayor",
    title: "Cómo organizar los medicamentos de un adulto mayor",
    description:
      "Una guía para hijos y cuidadores: la lista completa, horarios simples, reparto de tareas entre hermanos y señales para consultar al médico.",
    published: "2026-10-18",
    readingMinutes: 5,
    intro:
      "Con los años es común que los medicamentos se acumulen: uno para la presión, otro para el colesterol, algo para dormir, vitaminas… Cuando son muchos, aumentan las confusiones y las dosis olvidadas o repetidas. Organizarlos es una de las formas más concretas de cuidar a tus papás.",
    sections: [
      {
        title: "1. Haz la lista completa",
        blocks: [
          "Reúne todas las cajas (incluidas las que «ya no toma», las vitaminas y lo que compra sin receta) y anota de cada medicamento:",
          {
            list: [
              "Nombre y concentración (por ejemplo, Metformina 850 mg).",
              "Cuánto y cuándo lo toma.",
              "Para qué es y quién lo recetó.",
              "Desde cuándo y hasta cuándo, si es un tratamiento temporal.",
            ],
          },
        ],
      },
      {
        title: "2. Llévala a cada consulta",
        blocks: [
          "Cuando una persona ve a varios especialistas, nadie tiene el panorama completo. Muestra la lista en cada cita y pide al médico de cabecera que la revise al menos una vez al año: a veces hay medicamentos que ya no hacen falta o que no conviene combinar.",
        ],
      },
      {
        title: "3. Simplifica los horarios (con el médico)",
        blocks: [
          "Cinco horarios distintos al día son difíciles de sostener. Pregunta al médico o al farmacéutico si se pueden agrupar tomas en menos momentos. Nunca cambies horarios ni dosis por tu cuenta.",
        ],
      },
      {
        title: "4. Que las alarmas hagan el trabajo",
        blocks: [
          "Si tu papá o tu mamá usa smartphone, configura alarmas que digan el nombre y la dosis, y que se puedan marcar con un toque. Si no lo usa, las alarmas pueden sonar en el teléfono de quien lo acompaña.",
        ],
      },
      {
        title: "5. Repartan las tareas",
        blocks: [
          "Cuando todo recae en un solo hijo, el cansancio llega rápido. Una forma práctica de repartir:",
          {
            list: [
              "Una persona lleva la lista y las recetas.",
              "Otra se encarga de comprar y de avisar cuando queda poco.",
              "Quien vive más cerca acompaña a las citas.",
              "Todos reciben un aviso si una dosis importante se pasa.",
            ],
          },
        ],
      },
      {
        title: "6. Respeta su autonomía",
        blocks: [
          "Organizar no es controlar. Explica qué vas a ver y por qué, deja que decida lo que puede decidir y pregúntale cómo prefiere que le recuerden las cosas. La ayuda que se acepta es la que funciona.",
        ],
      },
      {
        title: "7. Señales para consultar",
        blocks: [
          "Consulta con el médico si notas mareos, caídas, confusión nueva, mucho sueño o cambios en el apetito después de empezar o cambiar un medicamento. Ante un síntoma grave, llama a los servicios de emergencia.",
        ],
      },
    ],
    related: "cuidar-a-mis-papas",
  },
];

export function getGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug);
}
