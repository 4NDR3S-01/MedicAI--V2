import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Una copia por hora como mucho: el archivo puede ser grande. */
const EXPORT_COOLDOWN_MS = 60 * 60_000;
const NAME = { id: true, fullName: true } as const;

/**
 * "Descargar mis datos" (derecho de acceso, Ley 1581 de 2012): reúne toda la
 * información de la cuenta en un JSON legible y la envía como adjunto al
 * correo de la cuenta (así solo la recibe su dueño). Nunca incluye
 * contraseñas, tokens ni datos internos de seguridad.
 */
@Injectable()
export class AccountExportService {
  private readonly logger = new Logger(AccountExportService.name);
  private readonly lastExport = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async sendExport(userId: string) {
    const last = this.lastExport.get(userId);
    if (last && Date.now() - last < EXPORT_COOLDOWN_MS) {
      throw new HttpException('Ya te enviamos una copia hace poco. Revisa tu correo o inténtalo en una hora.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const data = await this.collect(userId);
    if (data.cuenta.correo.endsWith('.invalid')) {
      throw new NotFoundException('Esta cuenta no tiene un correo donde enviar la copia.');
    }
    this.lastExport.set(userId, Date.now());
    try {
      await this.mail.sendDataExportEmail({
        to: data.cuenta.correo,
        fullName: data.cuenta.nombre,
        fileName: `medicai-mis-datos-${new Date().toISOString().slice(0, 10)}.json`,
        json: JSON.stringify(data, null, 2),
      });
    } catch (error) {
      this.lastExport.delete(userId);
      throw error;
    }
    this.logger.log('Data export sent', { userId });
    return { message: `Enviamos una copia de tus datos a ${data.cuenta.correo}.` };
  }

  /** Todo lo de la cuenta, con nombres de campo en español y sin secretos. */
  async collect(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        fullName: true,
        birthDate: true,
        phone: true,
        conditions: true,
        allergies: true,
        pregnancy: true,
        lactation: true,
        recentSurgeries: true,
        immunosuppression: true,
        anticoagulantTreatment: true,
        aiHealthContextConsent: true,
        timezone: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const [medications, appointments, links, groups, audit, sessions] = await Promise.all([
      this.prisma.medication.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: {
          createdBy: { select: NAME },
          logs: { orderBy: { takenAt: 'asc' }, include: { loggedBy: { select: NAME } } },
        },
      }),
      this.prisma.appointment.findMany({ where: { userId }, orderBy: { scheduledAt: 'asc' }, include: { createdBy: { select: NAME } } }),
      this.prisma.circleLink.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        orderBy: { createdAt: 'asc' },
        include: { userA: { select: NAME }, userB: { select: NAME }, grants: true },
      }),
      this.prisma.circleGroup.findMany({ where: { ownerId: userId }, select: { name: true, createdAt: true } }),
      this.prisma.circleAuditEvent.findMany({
        where: { OR: [{ ownerId: userId }, { subjectId: userId }] },
        orderBy: { createdAt: 'asc' },
        include: { owner: { select: NAME }, actor: { select: NAME }, subject: { select: NAME } },
      }),
      this.prisma.userSession.findMany({
        where: { userId },
        select: { deviceName: true, platform: true, createdAt: true, lastUsedAt: true },
      }),
    ]);

    const name = (person: { fullName: string | null } | null | undefined) => person?.fullName ?? null;
    const permissionsOf = (grant: Record<string, unknown> | undefined) =>
      grant
        ? Object.fromEntries(
          ['viewMedications', 'addMedications', 'editMedications', 'deleteMedications', 'manageReminders', 'logDoses',
            'viewAppointments', 'manageAppointments', 'viewHealth', 'manageCircle'].map((key) => [key, grant[key] === true]),
        )
        : null;

    return {
      generado: new Date().toISOString(),
      nota: 'Copia de tus datos en MedicAI (Ley 1581 de 2012, derecho de acceso). Las fechas están en UTC.',
      cuenta: {
        correo: user.email,
        nombre: user.fullName,
        fechaNacimiento: user.birthDate,
        telefono: user.phone,
        zonaHoraria: user.timezone,
        creada: user.createdAt,
        usoDeDatosEnAsistenteIA: user.aiHealthContextConsent,
      },
      salud: {
        condiciones: user.conditions,
        alergias: user.allergies,
        embarazo: user.pregnancy,
        lactancia: user.lactation,
        cirugiasRecientes: user.recentSurgeries,
        inmunosupresion: user.immunosuppression,
        anticoagulantes: user.anticoagulantTreatment,
      },
      medicamentos: medications.map((medication) => ({
        nombre: medication.name,
        dosis: medication.dosage,
        frecuencia: medication.frequency,
        horarios: medication.times,
        dias: medication.scheduleType,
        diasDeLaSemana: medication.weekDays,
        cadaCuantosDias: medication.dayInterval,
        inicio: medication.startDate,
        fin: medication.customEndDate,
        dosisPorEtapas: medication.dosageSteps,
        maximoAlDia: medication.maxDailyDoses,
        horasEntreTomas: medication.minHoursBetween,
        existencias: medication.stockQuantity,
        activo: medication.active,
        notas: medication.notes,
        agregadoPor: name(medication.createdBy),
        creado: medication.createdAt,
        tomas: medication.logs.map((log) => ({
          accion: log.action,
          programada: log.scheduledFor,
          registrada: log.takenAt,
          registradaPor: name(log.loggedBy),
        })),
      })),
      citas: appointments.map((appointment) => ({
        motivo: appointment.title,
        profesional: appointment.doctorName,
        fecha: appointment.scheduledAt,
        lugar: appointment.location,
        notas: appointment.notes,
        asistencia: appointment.attendanceStatus,
        eliminada: !appointment.active,
        agregadaPor: name(appointment.createdBy),
      })),
      circulo: {
        vinculos: links.map((link) => {
          const mine = link.userAId === userId ? 'A' : 'B';
          const other = mine === 'A' ? link.userB : link.userA;
          return {
            persona: name(other),
            loQueEresParaElla: mine === 'A' ? link.relationALabel ?? link.relationA : link.relationBLabel ?? link.relationB,
            loQueEsParaTi: mine === 'A' ? link.relationBLabel ?? link.relationB : link.relationALabel ?? link.relationA,
            estado: link.status,
            desde: link.createdAt,
            hasta: link.revokedAt,
            permisosQueLeDas: permissionsOf(link.grants.find((grant) => grant.ownerId === userId)),
            permisosQueTeDa: permissionsOf(link.grants.find((grant) => grant.granteeId === userId)),
          };
        }),
        grupos: groups.map((group) => group.name),
        historialDeAccesos: audit.map((event) => ({
          fecha: event.createdAt,
          accion: event.action,
          dueñoDeLaInformacion: name(event.owner),
          hechoPor: name(event.actor),
          persona: name(event.subject),
          antes: event.before,
          despues: event.after,
        })),
      },
      dispositivosConSesion: sessions.map((session) => ({
        dispositivo: session.deviceName,
        plataforma: session.platform,
        desde: session.createdAt,
        ultimoUso: session.lastUsedAt,
      })),
    };
  }
}
