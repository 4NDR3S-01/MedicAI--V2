import {
  ensureApiBaseUrl,
  parseApiErrorMessage,
  readResponseBody,
  requestWithAutoRefresh,
  withOwner,
} from '../../tabs/services/http';
import type { AppointmentData } from '../../tabs/services/appointments.service';
import type { MedicationData, MedicationLog } from '../../tabs/services/medications.service';
import type { PermissionSet } from '../utils/permissions';
import type { CareValue, Relation, RelationCode } from '../utils/relations';

/** isManaged: perfil a cargo, sin cuenta propia (su correo llega vacío). */
export type Person = { id: string; fullName: string | null; email: string; isManaged?: boolean };

/** Recordatorios de otra persona en mi teléfono. */
export type ReminderMode = 'OFF' | 'NOTIFY' | 'ALARM';

export type CircleMember = {
  linkId: string;
  person: Person;
  /** Lo que la otra persona es para mí. */
  relation: Relation;
  /** Lo que yo soy para la otra persona. */
  myRelation: Relation;
  /** Desde mi punto de vista. */
  care: CareValue;
  /** Lo que la otra persona puede hacer con mi información. */
  theyCan: PermissionSet;
  /** Lo que yo puedo hacer con la información de la otra persona. */
  iCan: PermissionSet;
  /** Si recibo en mi teléfono sus recordatorios (y cómo). */
  reminders: ReminderMode;
  since: string;
};

export type InvitationState = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED' | 'EXPIRED';

export type CircleInvitation = {
  id: string;
  code: string;
  link: string;
  state: InvitationState;
  inviter: Person;
  /** Quien la creó (distinto de inviter si se invita en nombre de un perfil a cargo). */
  createdBy: Person;
  inviteeEmail: string | null;
  inviteeName: string | null;
  /** null: invitación sin correo (por código o enlace). */
  inviteeHasAccount: boolean | null;
  /** Lo que quien invita es para la persona invitada. */
  inviterRelation: Relation;
  /** Desde el punto de vista de quien invita. */
  care: CareValue;
  /** Lo que la persona invitada podrá hacer con la información de quien invita. */
  granted: PermissionSet;
  /** Lo que quien invita pide sobre la información de la persona invitada. */
  requested: PermissionSet;
  expiresAt: string;
  createdAt: string;
};

export type PreviousLink = {
  linkId: string;
  person: Person;
  relation: Relation;
  revokedAt: string | null;
  revokedByMe: boolean;
};

/** Grupo privado para organizar el Círculo ("Familia", "Pacientes"). */
export type CircleGroup = { id: string; name: string; icon: string; linkIds: string[] };

export type CircleOverview = {
  owner: Person;
  isSelf: boolean;
  groups: CircleGroup[];
  members: CircleMember[];
  invitations: { received: CircleInvitation[]; sent: CircleInvitation[] };
  previous: PreviousLink[];
};

export type CreateInvitationPayload = {
  email?: string;
  inviteeName?: string;
  relation: RelationCode;
  relationLabel?: string;
  care: CareValue;
  granted: PermissionSet;
  requested: PermissionSet;
  ownerId?: string;
  groupIds?: string[];
};

export type HealthInfo = {
  birthDate: string | null;
  conditions: string | null;
  allergies: string | null;
  pregnancy: boolean;
  lactation: boolean;
  recentSurgeries: boolean;
  immunosuppression: boolean;
  anticoagulantTreatment: boolean;
};

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  accessToken: string,
  fallback: string,
  body?: unknown,
): Promise<T> {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh(path, method, accessToken, body);
  if (!response.ok) throw new Error(await parseApiErrorMessage(response, fallback));
  return readResponseBody<T>(response);
}

export const fetchCircle = (accessToken: string, ownerId?: string) =>
  request<CircleOverview>(withOwner('/circle', ownerId), 'GET', accessToken, 'No se pudo cargar tu Círculo');

export const createInvitation = (accessToken: string, payload: CreateInvitationPayload) =>
  request<CircleInvitation>('/circle/invitations', 'POST', accessToken, 'No se pudo crear la invitación', payload);

export const openInvitationByCode = (accessToken: string, code: string) =>
  request<CircleInvitation>('/circle/invitations/open', 'POST', accessToken, 'No se pudo abrir la invitación', { code });

export const acceptInvitation = (
  accessToken: string,
  invitationId: string,
  payload: { relation: RelationCode; relationLabel?: string; granted: PermissionSet; groupIds?: string[] },
) =>
  request<CircleMember>(`/circle/invitations/${invitationId}/accept`, 'POST', accessToken, 'No se pudo aceptar la invitación', payload);

export const declineInvitation = (accessToken: string, invitationId: string) =>
  request<{ message: string }>(`/circle/invitations/${invitationId}/decline`, 'POST', accessToken, 'No se pudo rechazar la invitación');

export const resendInvitation = (accessToken: string, invitationId: string) =>
  request<CircleInvitation>(`/circle/invitations/${invitationId}/resend`, 'POST', accessToken, 'No se pudo reenviar la invitación');

export const cancelInvitation = (accessToken: string, invitationId: string) =>
  request<{ message: string }>(`/circle/invitations/${invitationId}`, 'DELETE', accessToken, 'No se pudo cancelar la invitación');

export const updateLink = (
  accessToken: string,
  linkId: string,
  payload: { relation?: RelationCode; relationLabel?: string; care?: CareValue },
) => request<CircleMember>(`/circle/links/${linkId}`, 'PATCH', accessToken, 'No se pudo actualizar el vínculo', payload);

export const updatePermissions = (accessToken: string, linkId: string, permissions: PermissionSet, ownerId?: string) =>
  request<CircleMember>(`/circle/links/${linkId}/permissions`, 'PUT', accessToken, 'No se pudieron guardar los permisos', {
    permissions,
    ...(ownerId ? { ownerId } : {}),
  });

export const revokeLink = (accessToken: string, linkId: string, ownerId?: string) =>
  request<{ message: string }>(withOwner(`/circle/links/${linkId}`, ownerId), 'DELETE', accessToken, 'No se pudo quitar a la persona');

export const fetchHealthInfo = (accessToken: string, userId: string) =>
  request<HealthInfo>(`/circle/people/${userId}/health`, 'GET', accessToken, 'No se pudo cargar su información de salud');

export const updateReminders = (accessToken: string, linkId: string, mode: ReminderMode) =>
  request<CircleMember>(`/circle/links/${linkId}/reminders`, 'PUT', accessToken, 'No se pudo cambiar los recordatorios', { mode });

export type DependentPayload = {
  fullName: string;
  birthDate?: string;
  relation: RelationCode;
  relationLabel?: string;
  myRelation: RelationCode;
  myRelationLabel?: string;
  allergies?: string;
  conditions?: string;
  pregnancy?: boolean;
  lactation?: boolean;
  recentSurgeries?: boolean;
  immunosuppression?: boolean;
  anticoagulantTreatment?: boolean;
  groupIds?: string[];
};

export const createDependent = (accessToken: string, payload: DependentPayload) =>
  request<CircleMember>('/circle/dependents', 'POST', accessToken, 'No se pudo crear el perfil', payload);

export const updateDependent = (
  accessToken: string,
  dependentId: string,
  payload: Partial<Omit<DependentPayload, 'relation' | 'relationLabel' | 'myRelation' | 'myRelationLabel' | 'groupIds'>>,
) => request<CircleMember>(`/circle/dependents/${dependentId}`, 'PATCH', accessToken, 'No se pudo actualizar el perfil', payload);

export const deleteDependent = (accessToken: string, dependentId: string) =>
  request<{ message: string }>(`/circle/dependents/${dependentId}`, 'DELETE', accessToken, 'No se pudo eliminar el perfil');

export const handoverDependent = (accessToken: string, dependentId: string, email: string) =>
  request<{ message: string }>(`/circle/dependents/${dependentId}/handover`, 'POST', accessToken, 'No se pudo enviar el enlace', { email });

// ─── Grupos ───────────────────────────────────────────────────────────────────

export const createGroup = (accessToken: string, name: string, icon?: string) =>
  request<CircleGroup>('/circle/groups', 'POST', accessToken, 'No se pudo crear el grupo', { name, icon });

export const updateGroup = (accessToken: string, groupId: string, payload: { name?: string; icon?: string }) =>
  request<{ message: string }>(`/circle/groups/${groupId}`, 'PATCH', accessToken, 'No se pudo cambiar el grupo', payload);

export const deleteGroup = (accessToken: string, groupId: string) =>
  request<{ message: string }>(`/circle/groups/${groupId}`, 'DELETE', accessToken, 'No se pudo eliminar el grupo');

export const setLinkGroups = (accessToken: string, linkId: string, groupIds: string[]) =>
  request<{ linkId: string; groupIds: string[] }>(`/circle/links/${linkId}/groups`, 'PUT', accessToken, 'No se pudieron guardar los grupos', { groupIds });

// ─── Seguimiento ──────────────────────────────────────────────────────────────

/** null: esa persona no comparte esa parte contigo. */
export type CareData = {
  ownerId: string;
  medications: MedicationData[] | null;
  logs: MedicationLog[] | null;
  appointments: AppointmentData[] | null;
};

/** Inicio del día local o UTC, el anterior (igual que fetchTodayMedicationLogs). */
const startOfTrackingDay = () => {
  const local = new Date();
  local.setHours(0, 0, 0, 0);
  const utc = new Date();
  utc.setUTCHours(0, 0, 0, 0);
  return new Date(Math.min(local.getTime(), utc.getTime()));
};

export const fetchCareData = (accessToken: string) =>
  request<CareData[]>(
    `/circle/care-data?since=${encodeURIComponent(startOfTrackingDay().toISOString())}`,
    'GET',
    accessToken,
    'No se pudo cargar el seguimiento',
  );
