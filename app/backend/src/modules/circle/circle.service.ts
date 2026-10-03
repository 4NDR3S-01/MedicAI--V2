import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type CircleInvitation, type CircleLink } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';

import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CircleAccessService } from './circle-access.service';
import {
  HANDOVER_TTL_MS,
  INVITATION_TTL_MS,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MANAGED_EMAIL_DOMAIN,
  MAX_PENDING_INVITATIONS,
  PERMISSION_KEYS,
  RELATION_LABELS,
  careFromFlags,
  flagsFromCare,
  normalizePermissions,
  pickPermissions,
  type CareValue,
  type CirclePermissions,
  type RelationCode,
  type ReminderMode,
} from './circle.constants';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import type { CreateDependentDto } from './dto/create-dependent.dto';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type { UpdateDependentDto } from './dto/update-dependent.dto';
import type { UpdateLinkDto } from './dto/update-link.dto';
import type { UpdatePermissionsDto } from './dto/update-permissions.dto';

const PERSON_SELECT = { id: true, fullName: true, email: true, isManaged: true } satisfies Prisma.UserSelect;
type Person = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

const LINK_INCLUDE = {
  userA: { select: PERSON_SELECT },
  userB: { select: PERSON_SELECT },
  grants: true,
} satisfies Prisma.CircleLinkInclude;
type LinkWithPeople = Prisma.CircleLinkGetPayload<{ include: typeof LINK_INCLUDE }>;

const INVITATION_INCLUDE = {
  inviter: { select: PERSON_SELECT },
  createdBy: { select: PERSON_SELECT },
} satisfies Prisma.CircleInvitationInclude;
type InvitationWithPeople = Prisma.CircleInvitationGetPayload<{ include: typeof INVITATION_INCLUDE }>;

const ALL_PERMISSIONS = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])) as CirclePermissions;
const MAX_DEPENDENTS = 20;
const MAX_GROUPS = 30;
/** Ventana de citas para el seguimiento: algo de historial y lo próximo. */
const CARE_APPOINTMENTS_PAST_MS = 14 * 24 * 60 * 60 * 1000;
const CARE_APPOINTMENTS_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;
const PERSON_NAME_SELECT = { id: true, fullName: true } as const;

/** El correo interno de un perfil a cargo nunca se muestra. */
const publicPerson = (person: Person) => ({
  id: person.id,
  fullName: person.fullName,
  email: person.email.endsWith(`@${MANAGED_EMAIL_DOMAIN}`) ? '' : person.email,
  isManaged: person.isManaged,
});

type InvitationState = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED' | 'EXPIRED';

const RESEND_COOLDOWN_MS = 60_000;
const PREVIOUS_LINKS_LIMIT = 10;
const SENT_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class CircleService {
  private readonly logger = new Logger(CircleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CircleAccessService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ─── Vista general ─────────────────────────────────────────────────────────

  /**
   * Todo lo que muestra la pantalla Círculo de `ownerId` (por defecto, el
   * propio actor): miembros, invitaciones recibidas/enviadas y vínculos
   * anteriores. Ver el Círculo de otra persona requiere administrarlo.
   */
  async overview(actorId: string, ownerId?: string) {
    const targetId = await this.access.resolveOwner(actorId, ownerId, 'manageCircle');
    const target = await this.findPerson(targetId, true);
    const now = new Date();

    const [links, previous, received, sent] = await Promise.all([
      this.prisma.circleLink.findMany({
        where: { status: 'ACTIVE', OR: [{ userAId: targetId }, { userBId: targetId }] },
        include: LINK_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.circleLink.findMany({
        where: { status: 'REVOKED', OR: [{ userAId: targetId }, { userBId: targetId }] },
        include: LINK_INCLUDE,
        orderBy: { revokedAt: 'desc' },
        take: PREVIOUS_LINKS_LIMIT,
      }),
      // Las invitaciones recibidas solo las ve y responde la propia persona.
      targetId === actorId
        ? this.prisma.circleInvitation.findMany({
          where: { status: 'PENDING', expiresAt: { gt: now }, ...this.inviteeFilter(target) },
          include: INVITATION_INCLUDE,
          orderBy: { createdAt: 'desc' },
        })
        : Promise.resolve([]),
      this.prisma.circleInvitation.findMany({
        where: {
          inviterId: targetId,
          status: { in: ['PENDING', 'DECLINED'] },
          updatedAt: { gt: new Date(now.getTime() - SENT_HISTORY_MS) },
        },
        include: INVITATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const sentWithAccounts = await this.markAccounts(sent);
    // Los grupos son privados: solo se ven en el propio Círculo.
    const activeLinkIds = new Set(links.map((link) => link.id));
    const groups = targetId === actorId
      ? await this.prisma.circleGroup.findMany({
        where: { ownerId: targetId },
        include: { members: { select: { linkId: true } } },
        orderBy: { createdAt: 'asc' },
      })
      : [];

    return {
      owner: publicPerson(target),
      isSelf: targetId === actorId,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        icon: group.icon,
        linkIds: group.members.map((member) => member.linkId).filter((linkId) => activeLinkIds.has(linkId)),
      })),
      members: links.map((link) => this.toMember(link, targetId)),
      invitations: {
        received: received.map((invitation) => this.toInvitation(invitation, now)),
        sent: sentWithAccounts.map(({ invitation, hasAccount }) => this.toInvitation(invitation, now, hasAccount)),
      },
      previous: previous.map((link) => {
        const member = this.toMember(link, targetId);
        return {
          linkId: member.linkId,
          person: member.person,
          relation: member.relation,
          revokedAt: link.revokedAt,
          revokedByMe: link.revokedById === targetId,
        };
      }),
    };
  }

  // ─── Invitaciones ──────────────────────────────────────────────────────────

  async createInvitation(actorId: string, dto: CreateInvitationDto) {
    const inviterId = await this.access.resolveOwner(actorId, dto.ownerId, 'manageCircle');
    const inviter = await this.findPerson(inviterId, true);
    const email = dto.email?.trim().toLowerCase() || null;
    const relationLabel = this.relationLabel(dto.relation, dto.relationLabel);

    if (email && email === inviter.email) {
      throw new BadRequestException('No puedes invitarte a ti mismo.');
    }

    const pendingCount = await this.prisma.circleInvitation.count({
      where: { inviterId, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pendingCount >= MAX_PENDING_INVITATIONS) {
      throw new BadRequestException('Tienes demasiadas invitaciones pendientes. Cancela alguna antes de crear otra.');
    }

    let inviteeUserId: string | null = null;
    if (email) {
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      inviteeUserId = existing?.id ?? null;
      if (existing && (await this.findActiveLink(inviterId, existing.id))) {
        throw new ConflictException('Esta persona ya está en el Círculo.');
      }
      const duplicate = await this.prisma.circleInvitation.findFirst({
        where: { inviterId, inviteeEmail: email, status: 'PENDING', expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Ya hay una invitación pendiente para este correo. Puedes reenviarla desde la lista.');
      }
    }

    const care = flagsFromCare(dto.care);
    // Solo grupos propios, y solo si invito en mi nombre.
    const inviterGroupIds = inviterId === actorId ? await this.ownGroupIds(actorId, dto.groupIds) : [];
    const invitation = await this.createWithUniqueCode((code) =>
      this.prisma.circleInvitation.create({
        data: {
          inviterId,
          createdById: actorId,
          inviteeEmail: email,
          inviteeUserId,
          inviteeName: dto.inviteeName?.trim() || null,
          code,
          inviterRelation: dto.relation,
          inviterRelationLabel: relationLabel,
          inviterCaresForInvitee: care.iCare,
          inviteeCaresForInviter: care.caresForMe,
          inviterGroupIds,
          grantedPermissions: normalizePermissions(dto.granted as Record<string, unknown>),
          requestedPermissions: normalizePermissions(dto.requested as Record<string, unknown>),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
        include: INVITATION_INCLUDE,
      }),
    );

    if (email) this.sendInvitationEmail(invitation);
    this.logger.log('Circle invitation created', { inviterId, actorId, invitationId: invitation.id, byEmail: Boolean(email) });
    return this.toInvitation(invitation, new Date(), inviteeUserId ? true : email ? false : null);
  }

  /**
   * Abre una invitación por código (o enlace). Si no estaba dirigida a un
   * correo, queda asociada a la cuenta que la abre: así aparece en su lista
   * aunque cierre la app antes de responder.
   */
  async openByCode(actorId: string, rawCode: string) {
    const code = this.normalizeCode(rawCode);
    const actor = await this.findPerson(actorId, true);
    const invitation = await this.prisma.circleInvitation.findUnique({
      where: { code },
      include: INVITATION_INCLUDE,
    });
    if (!invitation || invitation.status === 'CANCELED') {
      throw new NotFoundException('No encontramos una invitación con ese código. Revisa que esté bien escrito.');
    }
    if (invitation.inviterId === actorId) {
      throw new BadRequestException('Esta invitación la creaste tú. Compártela con la persona que quieres invitar.');
    }
    this.assertCanRespond(invitation, actor);

    if (!invitation.inviteeUserId && invitation.status === 'PENDING') {
      await this.prisma.circleInvitation.updateMany({
        where: { id: invitation.id, inviteeUserId: null },
        data: { inviteeUserId: actorId },
      });
    }
    return this.toInvitation(invitation, new Date());
  }

  async acceptInvitation(actorId: string, invitationId: string, dto: AcceptInvitationDto) {
    const actor = await this.findPerson(actorId, true);
    const invitation = await this.findInvitationForInvitee(invitationId, actor);
    this.assertPending(invitation);

    if (await this.findActiveLink(invitation.inviterId, actorId)) {
      throw new ConflictException('Ya formas parte del Círculo de esta persona.');
    }

    const care = { aCaresForB: invitation.inviterCaresForInvitee, bCaresForA: invitation.inviteeCaresForInviter };
    const inviterIsManaged = (await this.findPerson(invitation.inviterId)).isManaged;
    try {
      const link = await this.prisma.$transaction(async (tx) => {
        // Solo una respuesta gana aunque se acepte dos veces a la vez.
        const { count } = await tx.circleInvitation.updateMany({
          where: { id: invitation.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', respondedAt: new Date(), inviteeUserId: actorId },
        });
        if (!count) throw new ConflictException('Esta invitación ya fue respondida.');

        const created = await tx.circleLink.create({
          data: {
            userAId: invitation.inviterId,
            userBId: actorId,
            relationA: invitation.inviterRelation,
            relationALabel: invitation.inviterRelationLabel,
            relationB: dto.relation,
            relationBLabel: this.relationLabel(dto.relation, dto.relationLabel),
            ...care,
            invitationId: invitation.id,
          },
        });
        await tx.circleGrant.createMany({
          data: [
            {
              linkId: created.id,
              ownerId: invitation.inviterId,
              granteeId: actorId,
              ...normalizePermissions(invitation.grantedPermissions as Record<string, unknown>),
              // Quien acepta cuidar a un perfil a cargo recibe sus alarmas (puede cambiarlo).
              reminderMode: inviterIsManaged ? 'ALARM' : 'OFF',
            },
            {
              linkId: created.id,
              ownerId: actorId,
              granteeId: invitation.inviterId,
              // Un perfil a cargo no usa la app: no tiene sentido darle permisos.
              ...normalizePermissions(inviterIsManaged ? null : (dto.granted as Record<string, unknown>)),
            },
          ],
        });
        const groupIds = [
          ...(await this.ownGroupIds(invitation.inviterId, invitation.inviterGroupIds)),
          ...(await this.ownGroupIds(actorId, dto.groupIds)),
        ];
        if (groupIds.length) {
          await tx.circleGroupMember.createMany({
            data: groupIds.map((groupId) => ({ groupId, linkId: created.id })),
            skipDuplicates: true,
          });
        }
        return tx.circleLink.findUniqueOrThrow({
          where: { id: created.id },
          include: LINK_INCLUDE,
        });
      });

      this.logger.log('Circle invitation accepted', { invitationId, linkId: link.id });
      return this.toMember(link, actorId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya formas parte del Círculo de esta persona.');
      }
      throw error;
    }
  }

  async declineInvitation(actorId: string, invitationId: string) {
    const actor = await this.findPerson(actorId, true);
    const invitation = await this.findInvitationForInvitee(invitationId, actor);
    const { count } = await this.prisma.circleInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: new Date(), inviteeUserId: actorId },
    });
    if (!count) throw new ConflictException('Esta invitación ya fue respondida.');
    this.logger.log('Circle invitation declined', { invitationId });
    return { message: 'Invitación rechazada.' };
  }

  async cancelInvitation(actorId: string, invitationId: string) {
    const invitation = await this.findInvitationForInviter(actorId, invitationId);
    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException('Esta invitación ya fue aceptada. Para quitar a la persona, revoca el vínculo.');
    }
    await this.prisma.circleInvitation.update({ where: { id: invitation.id }, data: { status: 'CANCELED' } });
    return { message: 'Invitación cancelada.' };
  }

  async resendInvitation(actorId: string, invitationId: string) {
    const invitation = await this.findInvitationForInviter(actorId, invitationId);
    if (invitation.status === 'ACCEPTED' || invitation.status === 'CANCELED') {
      throw new ConflictException('Esta invitación ya no se puede reenviar.');
    }
    if (Date.now() - invitation.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Acabas de enviarla. Espera un minuto antes de reenviarla.');
    }

    const updated = await this.prisma.circleInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'PENDING',
        respondedAt: null,
        // Si la rechazó otra cuenta por código, vuelve a quedar libre.
        inviteeUserId: invitation.inviteeEmail ? invitation.inviteeUserId : null,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      include: INVITATION_INCLUDE,
    });
    if (updated.inviteeEmail) this.sendInvitationEmail(updated);
    const [{ hasAccount }] = await this.markAccounts([updated]);
    return this.toInvitation(updated, new Date(), hasAccount);
  }

  // ─── Vínculos ──────────────────────────────────────────────────────────────

  /** Cambia lo que YO soy para la otra persona y/o quién cuida a quién. */
  async updateLink(actorId: string, linkId: string, dto: UpdateLinkDto) {
    const link = await this.findActiveLinkById(linkId);
    const side = this.sideOf(link, actorId);
    if (!side) throw new NotFoundException('Vínculo no encontrado.');

    const data: Prisma.CircleLinkUpdateInput = {};
    if (dto.relation) {
      const label = this.relationLabel(dto.relation, dto.relationLabel);
      if (side === 'A') Object.assign(data, { relationA: dto.relation, relationALabel: label });
      else Object.assign(data, { relationB: dto.relation, relationBLabel: label });
    }
    if (dto.care) {
      const { iCare, caresForMe } = flagsFromCare(dto.care);
      if (side === 'A') Object.assign(data, { aCaresForB: iCare, bCaresForA: caresForMe });
      else Object.assign(data, { bCaresForA: iCare, aCaresForB: caresForMe });
    }

    const updated = await this.prisma.circleLink.update({
      where: { id: link.id },
      data,
      include: LINK_INCLUDE,
    });
    return this.toMember(updated, actorId);
  }

  /**
   * Cambia lo que la otra persona del vínculo puede hacer con la información
   * del dueño. Solo lo decide el dueño (o quien administra su Círculo, que no
   * puede ampliarse permisos a sí mismo).
   */
  async updatePermissions(actorId: string, linkId: string, dto: UpdatePermissionsDto) {
    const ownerId = await this.access.resolveOwner(actorId, dto.ownerId, 'manageCircle');
    const link = await this.findActiveLinkById(linkId);
    const side = this.sideOf(link, ownerId);
    if (!side) throw new NotFoundException('Vínculo no encontrado.');
    const granteeId = side === 'A' ? link.userBId : link.userAId;
    if (ownerId !== actorId && granteeId === actorId) {
      throw new ForbiddenException('No puedes cambiar los permisos que esta persona te concede a ti.');
    }

    const permissions = normalizePermissions(dto.permissions as Record<string, unknown>);
    await this.prisma.circleGrant.upsert({
      where: { linkId_ownerId: { linkId: link.id, ownerId } },
      create: { linkId: link.id, ownerId, granteeId, ...permissions },
      update: permissions,
    });
    this.logger.log('Circle permissions updated', { linkId, ownerId, actorId });

    const updated = await this.prisma.circleLink.findUniqueOrThrow({
      where: { id: link.id },
      include: LINK_INCLUDE,
    });
    return this.toMember(updated, ownerId);
  }

  /**
   * Termina el vínculo: cualquiera de las dos personas (o quien administra el
   * Círculo de una de ellas) puede hacerlo. Los permisos se BORRAN en la misma
   * transacción, así que el acceso desaparece de inmediato en ambos sentidos.
   */
  async revokeLink(actorId: string, linkId: string, ownerId?: string) {
    const targetId = await this.access.resolveOwner(actorId, ownerId, 'manageCircle');
    const link = await this.findActiveLinkById(linkId);
    if (!this.sideOf(link, targetId)) throw new NotFoundException('Vínculo no encontrado.');
    await this.assertNotLastGuardian(link);

    await this.prisma.$transaction([
      this.prisma.circleGrant.deleteMany({ where: { linkId: link.id } }),
      this.prisma.circleLink.update({
        where: { id: link.id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedById: targetId },
      }),
    ]);
    this.logger.log('Circle link revoked', { linkId, actorId, targetId });
    return { message: 'Vínculo eliminado. Ya no comparten información.' };
  }

  /** Información de salud relevante de otra persona (si la comparte). */
  async healthInfo(actorId: string, ownerId: string) {
    const targetId = await this.access.resolveOwner(actorId, ownerId, 'viewHealth');
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        birthDate: true,
        conditions: true,
        allergies: true,
        pregnancy: true,
        lactation: true,
        recentSurgeries: true,
        immunosuppression: true,
        anticoagulantTreatment: true,
      },
    });
    if (!user) throw new NotFoundException('Persona no encontrada.');
    return user;
  }

  // ─── Grupos (privados, solo organizan) ─────────────────────────────────────

  async createGroup(actorId: string, name: string, icon?: string) {
    const count = await this.prisma.circleGroup.count({ where: { ownerId: actorId } });
    if (count >= MAX_GROUPS) throw new BadRequestException('Llegaste al máximo de grupos.');
    const group = await this.prisma.circleGroup.create({
      data: { ownerId: actorId, name: name.trim(), icon: icon ?? 'account-group' },
    });
    return { id: group.id, name: group.name, icon: group.icon, linkIds: [] as string[] };
  }

  async updateGroup(actorId: string, groupId: string, data: { name?: string; icon?: string }) {
    const { count } = await this.prisma.circleGroup.updateMany({
      where: { id: groupId, ownerId: actorId },
      data: { name: data.name?.trim(), icon: data.icon },
    });
    if (!count) throw new NotFoundException('Grupo no encontrado.');
    return { message: 'Grupo actualizado.' };
  }

  /** Borra el grupo; las personas siguen en el Círculo. */
  async deleteGroup(actorId: string, groupId: string) {
    const { count } = await this.prisma.circleGroup.deleteMany({ where: { id: groupId, ownerId: actorId } });
    if (!count) throw new NotFoundException('Grupo no encontrado.');
    return { message: 'Grupo eliminado. Las personas siguen en tu Círculo.' };
  }

  /** Define en qué grupos propios está la otra persona de un vínculo. */
  async setLinkGroups(actorId: string, linkId: string, groupIds: string[]) {
    const link = await this.findActiveLinkById(linkId);
    if (!this.sideOf(link, actorId)) throw new NotFoundException('Vínculo no encontrado.');
    const valid = await this.ownGroupIds(actorId, groupIds);
    await this.prisma.$transaction([
      this.prisma.circleGroupMember.deleteMany({ where: { linkId, group: { ownerId: actorId } } }),
      this.prisma.circleGroupMember.createMany({ data: valid.map((groupId) => ({ groupId, linkId })) }),
    ]);
    return { linkId, groupIds: valid };
  }

  private async ownGroupIds(ownerId: string, groupIds: string[] | undefined | null) {
    if (!groupIds?.length) return [];
    const groups = await this.prisma.circleGroup.findMany({
      where: { ownerId, id: { in: [...new Set(groupIds)] } },
      select: { id: true },
    });
    return groups.map((group) => group.id);
  }

  // ─── Seguimiento (varias personas en una sola petición) ────────────────────

  /**
   * Medicamentos, tomas desde `since` y citas cercanas de TODAS las personas
   * que comparten esa información con el actor. Pensado para cuidadores y
   * profesionales con muchas personas: una petición en vez de una por persona.
   */
  async careData(actorId: string, since: Date) {
    const grants = await this.prisma.circleGrant.findMany({
      where: {
        granteeId: actorId,
        link: { status: 'ACTIVE' },
        OR: [{ viewMedications: true }, { viewAppointments: true }],
      },
      select: { ownerId: true, viewMedications: true, viewAppointments: true },
    });
    const medOwners = grants.filter((grant) => grant.viewMedications).map((grant) => grant.ownerId);
    const apptOwners = grants.filter((grant) => grant.viewAppointments).map((grant) => grant.ownerId);
    const now = Date.now();

    const [medications, logs, appointments] = await Promise.all([
      medOwners.length
        ? this.prisma.medication.findMany({
          where: { userId: { in: medOwners } },
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: PERSON_NAME_SELECT }, updatedBy: { select: PERSON_NAME_SELECT } },
        })
        : Promise.resolve([]),
      medOwners.length
        ? this.prisma.medicationLog.findMany({
          where: {
            medication: { userId: { in: medOwners } },
            OR: [{ takenAt: { gte: since } }, { scheduledFor: { gte: since } }],
          },
          include: { loggedBy: { select: PERSON_NAME_SELECT }, medication: { select: { userId: true } } },
          orderBy: { takenAt: 'desc' },
          take: 5000,
        })
        : Promise.resolve([]),
      apptOwners.length
        ? this.prisma.appointment.findMany({
          where: {
            userId: { in: apptOwners },
            active: true,
            scheduledAt: { gte: new Date(now - CARE_APPOINTMENTS_PAST_MS), lte: new Date(now + CARE_APPOINTMENTS_FUTURE_MS) },
          },
          orderBy: { scheduledAt: 'asc' },
          include: { createdBy: { select: PERSON_NAME_SELECT }, updatedBy: { select: PERSON_NAME_SELECT } },
        })
        : Promise.resolve([]),
    ]);

    return grants.map((grant) => ({
      ownerId: grant.ownerId,
      medications: grant.viewMedications ? medications.filter((item) => item.userId === grant.ownerId) : null,
      logs: grant.viewMedications
        ? logs.filter((log) => log.medication.userId === grant.ownerId).map(({ medication: _medication, ...log }) => log)
        : null,
      appointments: grant.viewAppointments ? appointments.filter((item) => item.userId === grant.ownerId) : null,
    }));
  }

  // ─── Recordatorios para cuidadores ─────────────────────────────────────────

  /** Recibir (o no) en mi teléfono los recordatorios de la otra persona del vínculo. */
  async updateReminders(actorId: string, linkId: string, mode: ReminderMode) {
    const link = await this.findActiveLinkById(linkId);
    const side = this.sideOf(link, actorId);
    if (!side) throw new NotFoundException('Vínculo no encontrado.');
    const otherId = side === 'A' ? link.userBId : link.userAId;

    const grant = await this.prisma.circleGrant.findUnique({ where: { linkId_ownerId: { linkId: link.id, ownerId: otherId } } });
    if (mode !== 'OFF' && !(grant?.viewMedications || grant?.viewAppointments)) {
      throw new BadRequestException('Para recibir sus recordatorios, esta persona debe permitirte ver sus medicamentos o sus citas.');
    }
    if (grant) await this.prisma.circleGrant.update({ where: { id: grant.id }, data: { reminderMode: mode } });

    const updated = await this.prisma.circleLink.findUniqueOrThrow({ where: { id: link.id }, include: LINK_INCLUDE });
    return this.toMember(updated, actorId);
  }

  // ─── Perfiles a cargo ──────────────────────────────────────────────────────

  /**
   * Crea una persona sin cuenta propia (p. ej. un hijo pequeño) a cargo del
   * actor: el actor recibe todos los permisos sobre su información, incluido
   * administrar su Círculo (para añadir a otro tutor), y sus alarmas.
   */
  async createDependent(actorId: string, dto: CreateDependentDto) {
    const actor = await this.findPerson(actorId);
    if (actor.isManaged) throw new ForbiddenException('Esta cuenta no puede crear perfiles.');

    const count = await this.prisma.user.count({ where: { managedById: actorId, isManaged: true } });
    if (count >= MAX_DEPENDENTS) {
      throw new BadRequestException('Llegaste al máximo de perfiles a cargo.');
    }

    const relationLabel = this.relationLabel(dto.relation, dto.relationLabel);
    const myRelationLabel = this.relationLabel(dto.myRelation, dto.myRelationLabel);

    const link = await this.prisma.$transaction(async (tx) => {
      const dependent = await tx.user.create({
        data: {
          email: `${randomBytes(12).toString('hex')}@${MANAGED_EMAIL_DOMAIN}`,
          // Hash imposible: nadie puede iniciar sesión hasta entregar la cuenta.
          passwordHash: `!managed:${randomBytes(16).toString('hex')}`,
          fullName: dto.fullName.trim(),
          birthDate: dto.birthDate || null,
          allergies: dto.allergies?.trim() || null,
          conditions: dto.conditions?.trim() || null,
          isManaged: true,
          managedById: actorId,
        },
      });
      const created = await tx.circleLink.create({
        data: {
          userAId: actorId,
          userBId: dependent.id,
          relationA: dto.myRelation,
          relationALabel: myRelationLabel,
          relationB: dto.relation,
          relationBLabel: relationLabel,
          aCaresForB: true,
          bCaresForA: false,
        },
      });
      await tx.circleGrant.createMany({
        data: [
          { linkId: created.id, ownerId: dependent.id, granteeId: actorId, ...ALL_PERMISSIONS, reminderMode: 'ALARM' },
          { linkId: created.id, ownerId: actorId, granteeId: dependent.id },
        ],
      });
      return tx.circleLink.findUniqueOrThrow({ where: { id: created.id }, include: LINK_INCLUDE });
    });

    this.logger.log('Dependent profile created', { actorId, dependentId: link.userBId });
    return this.toMember(link, actorId);
  }

  async updateDependent(actorId: string, dependentId: string, dto: UpdateDependentDto) {
    await this.assertManagesDependent(actorId, dependentId);
    await this.prisma.user.update({
      where: { id: dependentId },
      data: {
        fullName: dto.fullName?.trim(),
        birthDate: dto.birthDate === undefined ? undefined : dto.birthDate || null,
        allergies: dto.allergies === undefined ? undefined : dto.allergies.trim() || null,
        conditions: dto.conditions === undefined ? undefined : dto.conditions.trim() || null,
      },
    });
    const link = await this.prisma.circleLink.findFirstOrThrow({
      where: {
        status: 'ACTIVE',
        OR: [
          { userAId: actorId, userBId: dependentId },
          { userAId: dependentId, userBId: actorId },
        ],
      },
      include: LINK_INCLUDE,
    });
    return this.toMember(link, actorId);
  }

  /** Borra el perfil y TODA su información (medicamentos, citas, vínculos). */
  async deleteDependent(actorId: string, dependentId: string) {
    await this.assertManagesDependent(actorId, dependentId);
    await this.prisma.user.delete({ where: { id: dependentId } });
    this.logger.log('Dependent profile deleted', { actorId, dependentId });
    return { message: 'Perfil eliminado.' };
  }

  /**
   * "Entregar la cuenta": la persona recibe un enlace en su correo para crear
   * su contraseña. Al hacerlo, la cuenta deja de estar a cargo y pasa a ser
   * suya; los tutores conservan sus permisos hasta que ella decida otra cosa.
   */
  async handoverDependent(actorId: string, dependentId: string, rawEmail: string) {
    await this.assertManagesDependent(actorId, dependentId);
    const email = rawEmail.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== dependentId) {
      throw new ConflictException('Ese correo ya tiene una cuenta en MedicAI. Usa otro correo.');
    }

    const token = randomBytes(32).toString('hex');
    const dependent = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: dependentId, consumedAt: null } });
      await tx.passwordResetToken.create({
        data: {
          userId: dependentId,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + HANDOVER_TTL_MS),
        },
      });
      return tx.user.update({ where: { id: dependentId }, data: { email }, select: PERSON_SELECT });
    });
    const tutor = await this.findPerson(actorId);

    const base = this.config.getOrThrow<string>('APP_BASE_URL').replace(/\/$/, '');
    await this.mail.sendAccountHandoverEmail({
      to: email,
      fullName: dependent.fullName,
      tutorName: tutor.fullName?.trim() || tutor.email,
      activationUrl: `${base}/auth/reset-password?token=${encodeURIComponent(token)}`,
    });
    this.logger.log('Dependent handover started', { actorId, dependentId });
    return { message: `Enviamos un enlace a ${email} para que cree su contraseña.` };
  }

  private async assertManagesDependent(actorId: string, dependentId: string) {
    await this.access.resolveOwner(actorId, dependentId, 'manageCircle');
    if (dependentId === actorId) throw new ForbiddenException('Acción no permitida.');
    const dependent = await this.findPerson(dependentId);
    if (!dependent.isManaged) {
      throw new ForbiddenException('Esta persona ya gestiona su propia cuenta.');
    }
  }

  /** Un perfil a cargo no puede quedarse sin nadie que lo administre. */
  private async assertNotLastGuardian(link: CircleLink) {
    const [a, b] = await Promise.all([this.findPerson(link.userAId), this.findPerson(link.userBId)]);
    const dependent = a.isManaged ? a : b.isManaged ? b : null;
    if (!dependent) return;
    const others = await this.prisma.circleGrant.count({
      where: { ownerId: dependent.id, manageCircle: true, linkId: { not: link.id }, link: { status: 'ACTIVE' } },
    });
    if (!others) {
      const name = dependent.fullName?.trim() || 'esta persona';
      throw new BadRequestException(
        `Nadie más administra a ${name}. Agrega a otro cuidador con permiso para administrar su Círculo, o elimina su perfil.`,
      );
    }
  }

  // ─── Ayudantes ─────────────────────────────────────────────────────────────

  private async findPerson(userId: string, requireVerifiedEmailInfo = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PERSON_SELECT, isEmailVerified: requireVerifiedEmailInfo },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    return user as Person & { isEmailVerified?: boolean };
  }

  /** Invitaciones dirigidas a esta persona: por cuenta o por su correo verificado. */
  private inviteeFilter(person: Person & { isEmailVerified?: boolean }): Prisma.CircleInvitationWhereInput {
    const or: Prisma.CircleInvitationWhereInput[] = [{ inviteeUserId: person.id }];
    if (person.isEmailVerified) or.push({ inviteeEmail: person.email });
    return { OR: or, inviterId: { not: person.id } };
  }

  private assertCanRespond(invitation: CircleInvitation, actor: Person & { isEmailVerified?: boolean }) {
    if (invitation.inviteeEmail) {
      if (invitation.inviteeEmail !== actor.email) {
        throw new ForbiddenException('Esta invitación se envió a otro correo. Pide a quien te invitó que la envíe a tu correo o que comparta un código.');
      }
      if (!actor.isEmailVerified) {
        throw new ForbiddenException('Confirma tu correo para poder responder esta invitación.');
      }
    } else if (invitation.inviteeUserId && invitation.inviteeUserId !== actor.id) {
      throw new ForbiddenException('Esta invitación ya la abrió otra cuenta. Pide a quien te invitó un código nuevo.');
    }
  }

  private assertPending(invitation: CircleInvitation) {
    const state = this.stateOf(invitation, new Date());
    if (state === 'EXPIRED') throw new BadRequestException('Esta invitación venció. Pide a quien te invitó que la reenvíe.');
    if (state !== 'PENDING') throw new ConflictException('Esta invitación ya fue respondida.');
  }

  private async findInvitationForInvitee(invitationId: string, actor: Person & { isEmailVerified?: boolean }) {
    const invitation = await this.prisma.circleInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.inviterId === actor.id) throw new NotFoundException('Invitación no encontrada.');
    const addressed =
      invitation.inviteeUserId === actor.id || (invitation.inviteeEmail !== null && invitation.inviteeEmail === actor.email);
    if (!addressed) throw new NotFoundException('Invitación no encontrada.');
    this.assertCanRespond(invitation, actor);
    return invitation;
  }

  /** La invitación la gestiona quien invita o quien administra su Círculo. */
  private async findInvitationForInviter(actorId: string, invitationId: string) {
    const invitation = await this.prisma.circleInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundException('Invitación no encontrada.');
    if (invitation.inviterId !== actorId) {
      await this.access.resolveOwner(actorId, invitation.inviterId, 'manageCircle');
    }
    return invitation;
  }

  private findActiveLink(userId: string, otherId: string) {
    return this.prisma.circleLink.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { userAId: userId, userBId: otherId },
          { userAId: otherId, userBId: userId },
        ],
      },
      select: { id: true },
    });
  }

  private async findActiveLinkById(linkId: string) {
    const link = await this.prisma.circleLink.findUnique({ where: { id: linkId } });
    if (!link || link.status !== 'ACTIVE') throw new NotFoundException('Vínculo no encontrado o ya eliminado.');
    return link;
  }

  private sideOf(link: CircleLink, userId: string): 'A' | 'B' | null {
    if (link.userAId === userId) return 'A';
    if (link.userBId === userId) return 'B';
    return null;
  }

  private relationLabel(relation: RelationCode, label?: string) {
    if (relation !== 'OTHER') return null;
    const trimmed = label?.trim();
    if (!trimmed) throw new BadRequestException('Escribe qué relación tienen.');
    return trimmed;
  }

  private stateOf(invitation: CircleInvitation, now: Date): InvitationState {
    if (invitation.status === 'PENDING' && invitation.expiresAt <= now) return 'EXPIRED';
    return invitation.status as InvitationState;
  }

  private normalizeCode(raw: string) {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== INVITE_CODE_LENGTH) {
      throw new BadRequestException(`El código tiene ${INVITE_CODE_LENGTH} caracteres.`);
    }
    return code;
  }

  private async createWithUniqueCode<T>(create: (code: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = Array.from({ length: INVITE_CODE_LENGTH }, () =>
        INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)],
      ).join('');
      try {
        return await create(code);
      } catch (error) {
        const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision) throw error;
      }
    }
    throw new ConflictException('No pudimos generar la invitación. Inténtalo de nuevo.');
  }

  /** ¿La persona invitada por correo ya tiene cuenta? (null si no hay correo). */
  private async markAccounts<T extends CircleInvitation>(invitations: T[]) {
    const emails = [...new Set(invitations.map((item) => item.inviteeEmail).filter((value): value is string => Boolean(value)))];
    const existing = emails.length
      ? await this.prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })
      : [];
    const known = new Set(existing.map((user) => user.email));
    return invitations.map((invitation) => ({
      invitation,
      hasAccount: invitation.inviteeUserId
        ? true
        : invitation.inviteeEmail
          ? known.has(invitation.inviteeEmail)
          : null,
    }));
  }

  private inviteUrl(code: string) {
    const base = this.config.getOrThrow<string>('APP_BASE_URL').replace(/\/$/, '');
    return `${base}/circulo/invitacion?code=${encodeURIComponent(code)}`;
  }

  private formatCode(code: string) {
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  }

  private toInvitation(
    invitation: InvitationWithPeople,
    now: Date,
    inviteeHasAccount: boolean | null = null,
  ) {
    return {
      id: invitation.id,
      code: this.formatCode(invitation.code),
      link: this.inviteUrl(invitation.code),
      state: this.stateOf(invitation, now),
      inviter: publicPerson(invitation.inviter),
      /** Quien la creó: distinto del inviter si se invita en nombre de otra persona. */
      createdBy: publicPerson(invitation.createdBy),
      inviteeEmail: invitation.inviteeEmail,
      inviteeName: invitation.inviteeName,
      inviteeHasAccount,
      inviterRelation: { code: invitation.inviterRelation, label: invitation.inviterRelationLabel },
      /** Desde el punto de vista de quien invita. */
      care: careFromFlags(invitation.inviterCaresForInvitee, invitation.inviteeCaresForInviter),
      granted: normalizePermissions(invitation.grantedPermissions as Record<string, unknown>),
      requested: normalizePermissions(invitation.requestedPermissions as Record<string, unknown>),
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  /** Un vínculo visto desde `viewerId`: la otra persona y los permisos en ambos sentidos. */
  private toMember(link: LinkWithPeople, viewerId: string) {
    const viewerIsA = link.userAId === viewerId;
    const other = viewerIsA ? link.userB : link.userA;
    const grantFor = (ownerId: string): CirclePermissions =>
      pickPermissions(link.grants.find((grant) => grant.ownerId === ownerId) ?? null);

    const theirGrant = link.grants.find((grant) => grant.ownerId === other.id);
    return {
      linkId: link.id,
      person: publicPerson(other),
      /** Lo que la otra persona es para mí. */
      relation: viewerIsA
        ? { code: link.relationB, label: link.relationBLabel }
        : { code: link.relationA, label: link.relationALabel },
      /** Lo que yo soy para la otra persona. */
      myRelation: viewerIsA
        ? { code: link.relationA, label: link.relationALabel }
        : { code: link.relationB, label: link.relationBLabel },
      care: (viewerIsA
        ? careFromFlags(link.aCaresForB, link.bCaresForA)
        : careFromFlags(link.bCaresForA, link.aCaresForB)) as CareValue,
      /** Lo que la otra persona puede hacer con mi información. */
      theyCan: grantFor(viewerId),
      /** Lo que yo puedo hacer con la información de la otra persona. */
      iCan: grantFor(other.id),
      /** Si recibo en mi teléfono sus recordatorios (y cómo). */
      reminders: (theirGrant?.reminderMode ?? 'OFF') as ReminderMode,
      since: link.createdAt,
    };
  }

  private sendInvitationEmail(invitation: InvitationWithPeople) {
    if (!invitation.inviteeEmail) return;
    const relation = invitation.inviterRelation === 'OTHER'
      ? invitation.inviterRelationLabel ?? RELATION_LABELS.OTHER
      : RELATION_LABELS[invitation.inviterRelation as RelationCode] ?? RELATION_LABELS.OTHER;
    const nameOf = (person: Person) => person.fullName?.trim() || person.email;
    void this.mail
      .sendCircleInvitationEmail({
        to: invitation.inviteeEmail,
        inviterName: nameOf(invitation.inviter),
        // Perfil a cargo: la invitación la envía su tutor para que le ayudes a cuidarlo.
        onBehalfOf: invitation.inviter.isManaged ? nameOf(invitation.createdBy) : null,
        relation,
        code: this.formatCode(invitation.code),
        inviteUrl: this.inviteUrl(invitation.code),
      })
      .catch((error: unknown) => {
        this.logger.error('Circle invitation email failed', error as Error, { invitationId: invitation.id });
      });
  }

}

