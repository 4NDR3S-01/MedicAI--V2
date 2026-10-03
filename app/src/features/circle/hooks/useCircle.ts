import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';

import { appStorage } from '../../../shared/storage';
import { getStoredSession } from '../../auth';
import * as circleAPI from '../services/circle.service';
import type { CircleInvitation, CircleMember, CircleOverview } from '../services/circle.service';

// v2: incluye grupos y recordatorios (una caché v1 no tiene esos campos).
const cacheKey = (ownerId?: string) => `medicai_circle_cache_v2${ownerId ? `_${ownerId}` : ''}`;

export const withToken = async () => {
  const session = await getStoredSession();
  if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.accessToken;
};

export function shareInvitation(invitation: CircleInvitation) {
  void Share.share({
    message: `Te invito a mi Círculo en MedicAI para acompañarnos con los medicamentos y las citas.\n\nAbre este enlace: ${invitation.link}\n\nO en la app, entra en Círculo → "Tengo un código" y escribe: ${invitation.code}`,
  }).catch(() => undefined);
}

/**
 * Datos del Círculo de `ownerId` (por defecto, el propio) con caché para
 * mostrar algo al instante, y acciones sobre las invitaciones enviadas.
 */
export function useCircle(ownerId?: string, enabled = true) {
  const [overview, setOverview] = useState<CircleOverview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyInvitationIds, setBusyInvitationIds] = useState<Set<string>>(new Set());
  const overviewRef = useRef(overview);
  overviewRef.current = overview;

  const persist = useCallback((data: CircleOverview) => {
    // La caché del Círculo de otra persona no se guarda en disco.
    if (!ownerId) void appStorage.setItem(cacheKey(), JSON.stringify(data)).catch(() => undefined);
  }, [ownerId]);

  const load = useCallback(async () => {
    try {
      const data = await circleAPI.fetchCircle(await withToken(), ownerId);
      setOverview(data);
      setErrorMessage(null);
      setStatus('ready');
      persist(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo cargar el Círculo.');
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, [ownerId, persist]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setStatus('loading');
    setOverview(null);
    void (async () => {
      if (!ownerId) {
        try {
          const raw = await appStorage.getItem(cacheKey());
          const cached = raw ? (JSON.parse(raw) as CircleOverview) : null;
          if (!cancelled && cached?.members) {
            setOverview(cached);
            setStatus('ready');
          }
        } catch {
          // caché corrupta: se ignora
        }
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ownerId, load]);

  const update = useCallback((change: (current: CircleOverview) => CircleOverview) => {
    const current = overviewRef.current;
    if (!current) return;
    const next = change(current);
    setOverview(next);
    persist(next);
  }, [persist]);

  const replaceMember = useCallback((member: CircleMember) => {
    update((current) => ({
      ...current,
      members: current.members.map((item) => (item.linkId === member.linkId ? member : item)),
    }));
  }, [update]);

  const setInvitationBusy = (id: string, value: boolean) =>
    setBusyInvitationIds((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  const resend = useCallback(async (invitation: CircleInvitation) => {
    setInvitationBusy(invitation.id, true);
    try {
      const updated = await circleAPI.resendInvitation(await withToken(), invitation.id);
      update((current) => ({
        ...current,
        invitations: {
          ...current.invitations,
          sent: current.invitations.sent.map((item) => (item.id === updated.id ? updated : item)),
        },
      }));
      if (updated.inviteeEmail) Alert.alert('Invitación reenviada', `Enviamos de nuevo la invitación a ${updated.inviteeEmail}.`);
      else shareInvitation(updated);
    } catch (error) {
      Alert.alert('No se pudo reenviar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setInvitationBusy(invitation.id, false);
    }
  }, [update]);

  const cancel = useCallback((invitation: CircleInvitation) => {
    const pending = invitation.state === 'PENDING';
    Alert.alert(
      pending ? 'Cancelar invitación' : 'Quitar de la lista',
      pending ? 'El enlace y el código dejarán de funcionar.' : 'La invitación desaparecerá de tu lista.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: pending ? 'Cancelar invitación' : 'Quitar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setInvitationBusy(invitation.id, true);
              try {
                await circleAPI.cancelInvitation(await withToken(), invitation.id);
                update((current) => ({
                  ...current,
                  invitations: { ...current.invitations, sent: current.invitations.sent.filter((item) => item.id !== invitation.id) },
                }));
              } catch (error) {
                Alert.alert('No se pudo cancelar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              } finally {
                setInvitationBusy(invitation.id, false);
              }
            })();
          },
        },
      ],
    );
  }, [update]);

  return { overview, status, errorMessage, load, update, replaceMember, resend, cancel, busyInvitationIds };
}
