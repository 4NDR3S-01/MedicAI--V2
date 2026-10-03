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
import { randomInt } from 'crypto';

import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CircleAccessService } from './circle-access.service';
import {
  INVITATION_TTL_MS,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MAX_PENDING_INVITATIONS,
  RELATION_LABELS,
  careFromFlags,
  flagsFromCare,
  normalizePermissions,
  pickPermissions,
  type CareValue,
  type CirclePermissions,
  type RelationCode,
} from './circle.constants';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type { UpdateLinkDto } from './dto/update-link.dto';
import type { UpdatePermissionsDto } from './dto/update-permissions.dto';

const PERSON_SELECT = { id: true, fullName: true, email: true } satisfies Prisma.UserSelect;
type Person = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

const LINK_INCLUDE = {
  userA: { select: PERSON_SELECT },
  userB: { select: PERSON_SELECT },
  grants: true,
} satisfies Prisma.CircleLinkInclude;
type LinkWithPeople = Prisma.CircleLinkGetPayload<{ include: typeof LINK_INCLUDE }>;

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
          include: { inviter: { select: PERSON_SELECT } },
          orderBy: { createdAt: 'desc' },
        })
        : Promise.resolve([]),
      this.prisma.circleInvitation.findMany({
        where: {
          inviterId: targetId,
          status: { in: ['PENDING', 'DECLINED'] },
          updatedAt: { gt: new Date(now.getTime() - SENT_HISTORY_MS) },
        },
        include: { inviter: { select: PERSON_SELECT } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const sentWithAccounts = await this.markAccounts(sent);

    return {
      owner: target,
      isSelf: targetId === actorId,
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
          grantedPermissions: normalizePermissions(dto.granted as Record<string, unknown>),
          requestedPermissions: normalizePermissions(dto.requested as Record<string, unknown>),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
        include: { inviter: { select: PERSON_SELECT } },
      }),
    );

    if (email) this.sendInvitationEmail(invitation, inviter);
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
      include: { inviter: { select: PERSON_SELECT } },
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
            },
            {
              linkId: created.id,
              ownerId: actorId,
              granteeId: invitation.inviterId,
              ...normalizePermissions(dto.granted as Record<string, unknown>),
            },
          ],
        });
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
      include: { inviter: { select: PERSON_SELECT } },
    });
    if (updated.inviteeEmail) this.sendInvitationEmail(updated, updated.inviter);
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
    invitation: CircleInvitation & { inviter: Person },
    now: Date,
    inviteeHasAccount: boolean | null = null,
  ) {
    return {
      id: invitation.id,
      code: this.formatCode(invitation.code),
      link: this.inviteUrl(invitation.code),
      state: this.stateOf(invitation, now),
      inviter: invitation.inviter,
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

    return {
      linkId: link.id,
      person: other,
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
      since: link.createdAt,
    };
  }

  private sendInvitationEmail(invitation: CircleInvitation, inviter: Person) {
    if (!invitation.inviteeEmail) return;
    const relation = invitation.inviterRelation === 'OTHER'
      ? invitation.inviterRelationLabel ?? RELATION_LABELS.OTHER
      : RELATION_LABELS[invitation.inviterRelation as RelationCode] ?? RELATION_LABELS.OTHER;
    void this.mail
      .sendCircleInvitationEmail({
        to: invitation.inviteeEmail,
        inviterName: inviter.fullName?.trim() || inviter.email,
        relation,
        code: this.formatCode(invitation.code),
        inviteUrl: this.inviteUrl(invitation.code),
      })
      .catch((error: unknown) => {
        this.logger.error('Circle invitation email failed', error as Error, { invitationId: invitation.id });
      });
  }
}

