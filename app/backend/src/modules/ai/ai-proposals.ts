/**
 * Acciones que el asistente puede PROPONER (nunca ejecutar): la app abre el
 * formulario ya rellenado y el usuario revisa y guarda. Todo lo que llega del
 * modelo se valida aquí; lo dudoso se descarta.
 */

export const DOSAGE_UNITS = ['mg', 'g', 'mcg', 'ml', 'gotas', 'comprimido', 'cápsula', 'UI'] as const;

export type MedicationProposal = {
  kind: 'medication';
  name: string;
  dosageAmount: number;
  dosageUnit: (typeof DOSAGE_UNITS)[number];
  /** Cada cuántas horas (24 = una vez al día). */
  intervalHours: number;
  firstDoseTime: string;
  durationDays: number | null;
  notes: string | null;
};

export type AppointmentProposal = {
  kind: 'appointment';
  title: string;
  doctorName: string;
  /** Día y hora de pared en la zona del usuario. */
  date: string;
  time: string;
  location: string | null;
  notes: string | null;
};

export type Proposal = MedicationProposal | AppointmentProposal;

/** Registrar una toma: se resuelve contra sus medicamentos en ai-doses.ts. */
export const LOG_DOSE_TOOL = 'propose_dose_log';

export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_medication',
      description:
        'Prepara un medicamento para que el usuario lo revise y lo guarde en MedicAI con sus recordatorios. Úsalo SOLO si el usuario pide agregar o registrar un medicamento que ya le recetaron y dio el nombre, la dosis, cada cuánto y la hora de la primera toma.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del medicamento, p. ej. "Paracetamol".' },
          dosageAmount: { type: 'number', description: 'Cantidad por toma, p. ej. 500.' },
          dosageUnit: { type: 'string', enum: [...DOSAGE_UNITS] },
          intervalHours: { type: 'integer', description: 'Cada cuántas horas: 4, 6, 8, 12 o 24 (una vez al día). Entre 1 y 24.' },
          firstDoseTime: { type: 'string', description: 'Hora de la primera toma, formato HH:mm de 24 horas.' },
          durationDays: { type: 'integer', description: 'Días de tratamiento si los indicó; omítelo si es indefinido.' },
          notes: { type: 'string', description: 'Indicaciones como "con comida". Opcional.' },
        },
        required: ['name', 'dosageAmount', 'dosageUnit', 'intervalHours', 'firstDoseTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_appointment',
      description:
        'Prepara una cita médica para que el usuario la revise y la guarde con sus recordatorios. Úsalo SOLO si el usuario pide agendar o registrar una cita y dio el motivo o especialidad, el día y la hora.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Motivo o especialidad, p. ej. "Control de cardiología".' },
          doctorName: { type: 'string', description: 'Profesional o especialidad si no dio nombre.' },
          date: { type: 'string', description: 'Fecha YYYY-MM-DD (resuelve "mañana" o "el lunes" con la fecha actual del usuario).' },
          time: { type: 'string', description: 'Hora HH:mm de 24 horas.' },
          location: { type: 'string', description: 'Lugar, opcional.' },
          notes: { type: 'string', description: 'Indicaciones como "ir en ayunas", opcional.' },
        },
        required: ['title', 'doctorName', 'date', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_dose_log',
      description:
        'Prepara el registro de una toma para que el usuario la confirme. Úsalo cuando diga que YA se tomó un medicamento (p. ej. "ya me tomé la metformina") o pida registrarlo. Busca la toma de hoy que corresponde.',
      parameters: {
        type: 'object',
        properties: {
          medicationName: { type: 'string', description: 'Nombre del medicamento tal como lo dijo el usuario.' },
        },
        required: ['medicationName'],
      },
    },
  },
] as const;

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const padTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : value;
};

/** Argumentos del modelo → propuesta válida, o null. */
export function parseProposal(name: string, rawArguments: string, today: string): Proposal | null {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArguments) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (name === 'propose_medication') {
    const medicationName = clean(args.name, 100);
    const amount = Number(args.dosageAmount);
    const unit = DOSAGE_UNITS.find((item) => item.toLowerCase() === clean(args.dosageUnit, 20).toLowerCase());
    const interval = Math.round(Number(args.intervalHours));
    const firstDoseTime = padTime(clean(args.firstDoseTime, 5));
    const duration = args.durationDays === undefined || args.durationDays === null ? null : Math.round(Number(args.durationDays));
    if (!medicationName || !Number.isFinite(amount) || amount <= 0 || amount > 100_000 || !unit) return null;
    if (!Number.isInteger(interval) || interval < 1 || interval > 24 || !isTime(firstDoseTime)) return null;
    return {
      kind: 'medication',
      name: medicationName,
      dosageAmount: amount,
      dosageUnit: unit,
      intervalHours: interval,
      firstDoseTime,
      durationDays: duration && duration > 0 && duration <= 365 ? duration : null,
      notes: clean(args.notes, 300) || null,
    };
  }

  if (name === 'propose_appointment') {
    const title = clean(args.title, 120);
    const doctorName = clean(args.doctorName, 120) || title;
    const date = clean(args.date, 10);
    const time = padTime(clean(args.time, 5));
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isTime(time) || date < today) return null;
    return {
      kind: 'appointment',
      title,
      doctorName,
      date,
      time,
      location: clean(args.location, 160) || null,
      notes: clean(args.notes, 300) || null,
    };
  }
  return null;
}
