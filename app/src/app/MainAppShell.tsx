import { useCallback, useState, useEffect, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AppointmentsScreen,
  MedicationsScreen,
  ProfileScreen,
} from '../features/tabs';
import { syncOwnReminders } from '../features/tabs/services/reminders-sync';
import { startDoseQueueSync } from '../features/tabs/services/dose-queue';
import { reportTimeZoneIfChanged } from '../features/tabs/services/timezone-sync';
import { CircleScreen, hasPendingCircleInvite, isCirclePushType, onCircleInvite, onOpenCircle } from '../features/circle';
import { registerPushToken } from '../features/tabs/services/push-registration';
import * as Notifications from 'expo-notifications';
import { HomeScreen } from '../features/home';
import type { AppTheme } from '../shared/theme';
import { FloatingChatButton } from '../shared/ui';
import { AssistantChat } from '../features/assistant/AssistantChat';
import { AppBottomBar, useMainTabContentInset, type MainTabId } from './AppBottomBar';
import type { ProfileUser } from '../features/auth/services/auth.service';

export type MainAppShellProps = {
  theme: AppTheme;
  userFullName: string | null;
  userEmail: string | null;
  avatarData?: string | null;
  isSigningOut: boolean;
  onSignOut: () => void;
  onProfileUpdated?: (user: ProfileUser) => void;
};

export function MainAppShell({
  theme,
  userFullName,
  userEmail,
  avatarData: initialAvatarData,
  isSigningOut,
  onSignOut,
  onProfileUpdated,
}: Readonly<MainAppShellProps>) {
  const [tab, setTab] = useState<MainTabId>('home');
  const [chatVisible, setChatVisible] = useState(false);
  const closeChat = useCallback(() => setChatVisible(false), []);
  const [avatarData, setAvatarData] = useState<string | null>(initialAvatarData ?? null);
  const contentBottomInset = useMainTabContentInset();

  useEffect(() => {
    // Si el backend no tiene avatar, intenta cargar del almacenamiento local (fallback)
    if (!initialAvatarData) {
      AsyncStorage.getItem('user_avatar_data').then((val) => {
        if (val) setAvatarData(val);
      }).catch(() => {});
    }
  }, [initialAvatarData]);

  // Alguien del Círculo pudo cambiar medicamentos o citas desde su teléfono:
  // al abrir la app y al volver a ella se ponen al día alarmas y recordatorios.
  useEffect(() => {
    void reportTimeZoneIfChanged();
    void registerPushToken();
    void syncOwnReminders().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void reportTimeZoneIfChanged();
      void registerPushToken();
      void syncOwnReminders().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  // Tomas registradas sin conexión: se envían al recuperar la red.
  useEffect(() => startDoseQueueSync(), []);

  // Una invitación abierta desde un enlace lleva directamente a Círculo.
  useEffect(() => {
    void hasPendingCircleInvite().then((pending) => {
      if (pending) setTab('family');
    });
    const unsubscribeInvite = onCircleInvite(() => setTab('family'));
    // Tocar un aviso del Círculo (también con la app cerrada) abre Círculo.
    const unsubscribeOpen = onOpenCircle(() => setTab('family'));
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (isCirclePushType(response?.notification.request.content.data?.type)) setTab('family');
    });
    return () => {
      unsubscribeInvite();
      unsubscribeOpen();
    };
  }, []);

  const handleSetAvatar = async (data: string) => {
    setAvatarData(data);
    await AsyncStorage.setItem('user_avatar_data', data).catch(() => {});
  };

  let body: ReactNode;
  switch (tab) {
    case 'medications':
      body = <MedicationsScreen theme={theme} contentBottomInset={contentBottomInset} />;
      break;
    case 'family':
      body = <CircleScreen theme={theme} contentBottomInset={contentBottomInset} />;
      break;
    case 'appointments':
      body = <AppointmentsScreen theme={theme} contentBottomInset={contentBottomInset} />;
      break;
    case 'profile':
      body = (
        <ProfileScreen
          theme={theme}
          userFullName={userFullName}
          userEmail={userEmail}
          avatarData={avatarData}
          onSetAvatar={handleSetAvatar}
          onProfileUpdated={onProfileUpdated}
          contentBottomInset={contentBottomInset}
          isSigningOut={isSigningOut}
          onSignOut={onSignOut}
        />
      );
      break;
    default:
      body = (
        <HomeScreen
          theme={theme}
          userFullName={userFullName}
          userEmail={userEmail}
          avatarData={avatarData}
          contentBottomInset={contentBottomInset}
          onOpenMedications={() => setTab('medications')}
          onOpenAppointments={() => setTab('appointments')}
          onOpenCircle={() => setTab('family')}
          onOpenProfile={() => setTab('profile')}
          onOpenAssistant={() => setChatVisible(true)}
        />
      );
  }

  return (
    <View style={{ flex: 1 }}>
      {body}
      {tab === 'home' ? <FloatingChatButton theme={theme} onPress={() => setChatVisible(true)} /> : null}
      <AssistantChat theme={theme} visible={chatVisible} onClose={closeChat} />
      <AppBottomBar theme={theme} activeTab={tab} onSelect={setTab} />
    </View>
  );
}
