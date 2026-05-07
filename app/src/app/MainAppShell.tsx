import { useState, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AppointmentsScreen,
  FamilyScreen,
  MedicationsScreen,
  ProfileScreen,
} from '../features/tabs';
import { HomeScreen } from '../features/home';
import type { AppTheme } from '../shared/theme';
import { ChatModal, FloatingChatButton } from '../shared/ui';
import { AppBottomBar, useMainTabContentInset, type MainTabId } from './AppBottomBar';

export type MainAppShellProps = {
  theme: AppTheme;
  userFullName: string | null;
  userEmail: string | null;
  isSigningOut: boolean;
  onSignOut: () => void;
};

export function MainAppShell({
  theme,
  userFullName,
  userEmail,
  isSigningOut,
  onSignOut,
}: Readonly<MainAppShellProps>) {
  const [tab, setTab] = useState<MainTabId>('home');
  const [chatVisible, setChatVisible] = useState(false);
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const contentBottomInset = useMainTabContentInset();

  useEffect(() => {
    AsyncStorage.getItem('user_avatar_data').then((val) => {
      if (val) setAvatarData(val);
    }).catch(() => {});
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
      body = <FamilyScreen theme={theme} contentBottomInset={contentBottomInset} />;
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
          onOpenAssistant={() => setChatVisible(true)}
        />
      );
  }

  return (
    <View style={{ flex: 1 }}>
      {body}
      {tab === 'home' ? <FloatingChatButton theme={theme} onPress={() => setChatVisible(true)} /> : null}
      <ChatModal visible={chatVisible} onClose={() => setChatVisible(false)} theme={theme} />
      <AppBottomBar theme={theme} activeTab={tab} onSelect={setTab} />
    </View>
  );
}
