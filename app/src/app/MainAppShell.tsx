import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  AppointmentsScreen,
  AssistantScreen,
  FamilyScreen,
  MedicationsScreen,
  ProfileScreen,
} from '../features/tabs';
import { HomeScreen } from '../features/home';
import type { AppTheme } from '../shared/theme';
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
  const [assistantOpen, setAssistantOpen] = useState(false);
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
          onOpenAssistant={() => setAssistantOpen(true)}
        />
      );
  }

  if (assistantOpen) {
    return (
      <View style={{ flex: 1 }}>
        <AssistantScreen theme={theme} onClose={() => setAssistantOpen(false)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {body}
      <AppBottomBar theme={theme} activeTab={tab} onSelect={setTab} />
    </View>
  );
}
