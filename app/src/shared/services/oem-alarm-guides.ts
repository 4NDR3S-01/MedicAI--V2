/**
 * Pasos propios de cada marca para que la alarma se vea y suene con la app
 * cerrada. Android no deja comprobarlos, así que se muestran cuando la alarma
 * de prueba no se vio. Puro: probado en backend/test/alarm-setup.test.ts.
 */
export type OemAlarmGuide = { brand: string; steps: string[] };

const GUIDES: { match: string[]; guide: OemAlarmGuide }[] = [
  {
    match: ['honor', 'huawei'],
    guide: {
      brand: 'Honor',
      steps: [
        'Ajustes → Aplicaciones → Inicio de aplicaciones → MedicAI: desactiva "Gestionar automáticamente" y deja activadas las tres opciones.',
        'Ajustes → Aplicaciones → MedicAI → Notificaciones: activa "Pantalla de bloqueo" y "Notificaciones flotantes".',
        'Ajustes → Batería → Inicio de aplicaciones: confirma que MedicAI está en "Gestionar manualmente".',
      ],
    },
  },
  {
    match: ['xiaomi', 'redmi', 'poco'],
    guide: {
      brand: 'Xiaomi',
      steps: [
        'Ajustes → Aplicaciones → MedicAI → Inicio automático: actívalo.',
        'Ajustes → Aplicaciones → MedicAI → Otros permisos: activa "Mostrar en pantalla de bloqueo" y "Mostrar ventanas emergentes en segundo plano".',
        'Ajustes → Aplicaciones → MedicAI → Ahorro de batería: elige "Sin restricciones".',
      ],
    },
  },
  {
    match: ['samsung'],
    guide: {
      brand: 'Samsung',
      steps: [
        'Ajustes → Aplicaciones → MedicAI → Batería: elige "Sin restricciones".',
        'Ajustes → Batería → Límites de uso en segundo plano: quita MedicAI de "Aplicaciones en suspensión".',
      ],
    },
  },
  {
    match: ['oppo', 'realme', 'oneplus'],
    guide: {
      brand: 'Oppo / Realme',
      steps: [
        'Ajustes → Aplicaciones → MedicAI → Uso de batería: activa "Permitir actividad en segundo plano" e "Inicio automático".',
        'Ajustes → Aplicaciones → MedicAI → Notificaciones: activa "Pantalla de bloqueo" y "Notificaciones flotantes".',
      ],
    },
  },
  {
    match: ['vivo', 'iqoo'],
    guide: {
      brand: 'Vivo',
      steps: [
        'Ajustes → Batería → Consumo en segundo plano → MedicAI: "Permitir".',
        'i Manager → Aplicaciones → Inicio automático: activa MedicAI.',
        'Ajustes → Aplicaciones → MedicAI → Permisos: activa "Mostrar en pantalla de bloqueo".',
      ],
    },
  },
];

const GENERIC: OemAlarmGuide = {
  brand: 'tu teléfono',
  steps: [
    'Ajustes → Aplicaciones → MedicAI → Notificaciones: activa las alarmas y "Mostrar en pantalla de bloqueo".',
    'Ajustes → Aplicaciones → MedicAI → Batería: elige "Sin restricciones".',
    'Si tu teléfono tiene "Inicio automático", actívalo para MedicAI.',
  ],
};

export function oemAlarmGuide(manufacturer: string | null): OemAlarmGuide {
  const name = (manufacturer ?? '').toLowerCase();
  return GUIDES.find(({ match }) => match.includes(name))?.guide ?? GENERIC;
}
