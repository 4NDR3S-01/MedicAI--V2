import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

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
  const contentBottomInset = useMainTabContentInset();

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
          userEmail={userEmail}
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
