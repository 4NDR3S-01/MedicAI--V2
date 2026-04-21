import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LOGO_SOURCE } from '../components/BrandLogo';
import { LoginScreen, type LoginFormState } from '../features/auth/LoginScreen';
import { RegisterScreen, type RegisterWizardPayload } from '../features/auth/RegisterScreen';
import { LoadingScreen } from '../features/loading/LoadingScreen';
import { useAppTheme } from '../theme';

const SPLASH_DURATION_MS = 1200;
const AUTH_STATE_STORAGE_KEY = 'medicai_auth_state_v1';

const DEFAULT_SPECIAL_CONDITIONS: RegisterWizardPayload['medicalInfo']['specialConditions'] = {
  pregnancy: false,
  lactation: false,
  recentSurgeries: false,
  immunosuppression: false,
  anticoagulantTreatment: false,
};

const DEFAULT_SPECIAL_CONDITION_VIGENCY: RegisterWizardPayload['medicalInfo']['specialConditionVigency'] = {
  pregnancy: { isTemporary: false, until: '' },
  lactation: { isTemporary: false, until: '' },
  recentSurgeries: { isTemporary: false, until: '' },
  immunosuppression: { isTemporary: false, until: '' },
  anticoagulantTreatment: { isTemporary: false, until: '' },
};

type AuthScreenMode = 'login' | 'register';

export function AppRoot() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLogoReady, setIsLogoReady] = useState(false);
  const [form, setForm] = useState<LoginFormState>({
    email: '',
    password: '',
  });
  const [authScreen, setAuthScreen] = useState<AuthScreenMode>('login');
  const [savedSpecialConditions, setSavedSpecialConditions] = useState<RegisterWizardPayload['medicalInfo']['specialConditions']>({
    ...DEFAULT_SPECIAL_CONDITIONS,
  });
  const [savedSpecialConditionVigency, setSavedSpecialConditionVigency] =
    useState<RegisterWizardPayload['medicalInfo']['specialConditionVigency']>({
      ...DEFAULT_SPECIAL_CONDITION_VIGENCY,
    });

  const theme = useAppTheme();

  useEffect(() => {
    let isMounted = true;

    const preloadLogo = async () => {
      try {
        await Asset.fromModule(LOGO_SOURCE).downloadAsync();
      } catch {
        // Si falla la precarga, continuamos para no bloquear la app.
      } finally {
        if (isMounted) {
          setIsLogoReady(true);
        }
      }
    };

    void preloadLogo();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrateAuthState = async () => {
      try {
        const rawState = await AsyncStorage.getItem(AUTH_STATE_STORAGE_KEY);
        if (!rawState) {
          return;
        }

        const parsed = JSON.parse(rawState) as {
          email?: string;
          authScreen?: AuthScreenMode;
          specialConditions?: RegisterWizardPayload['medicalInfo']['specialConditions'];
          specialConditionVigency?: RegisterWizardPayload['medicalInfo']['specialConditionVigency'];
        };

        if (!isMounted) {
          return;
        }

        if (typeof parsed.email === 'string') {
          const restoredEmail = parsed.email;
          setForm((previous) => ({ ...previous, email: restoredEmail }));
        }

        if (parsed.authScreen === 'login' || parsed.authScreen === 'register') {
          setAuthScreen(parsed.authScreen);
        }

        if (parsed.specialConditions) {
          setSavedSpecialConditions({
            ...DEFAULT_SPECIAL_CONDITIONS,
            ...parsed.specialConditions,
          });
        }

        if (parsed.specialConditionVigency) {
          setSavedSpecialConditionVigency({
            ...DEFAULT_SPECIAL_CONDITION_VIGENCY,
            ...parsed.specialConditionVigency,
          });
        }
      } catch {
        // Si la hidratacion falla, continuamos con el estado por defecto.
      }
    };

    void hydrateAuthState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const persistAuthState = async () => {
      try {
        const stateToPersist = {
          email: form.email,
          authScreen,
          specialConditions: savedSpecialConditions,
          specialConditionVigency: savedSpecialConditionVigency,
        };

        await AsyncStorage.setItem(AUTH_STATE_STORAGE_KEY, JSON.stringify(stateToPersist));
      } catch {
        // Si falla la persistencia local, no bloqueamos el flujo.
      }
    };

    void persistAuthState();
  }, [authScreen, form.email, savedSpecialConditionVigency, savedSpecialConditions]);

  useEffect(() => {
    if (!isLogoReady) {
      return;
    }

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, SPLASH_DURATION_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [isLogoReady]);

  const statusBarStyle = useMemo(() => {
    return theme.mode === 'dark' ? 'light' : 'dark';
  }, [theme.mode]);

  const handleLoginSubmit = () => {
    const email = form.email.trim();
    const password = form.password;

    if (!email) {
      Alert.alert('Correo requerido', 'Ingresa tu correo para continuar.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Correo invalido', 'Ingresa un correo valido.');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Contrasena requerida', 'Ingresa tu contrasena para continuar.');
      return;
    }

    if (password.trim().length < 6) {
      Alert.alert('Contrasena invalida', 'La contrasena debe tener al menos 6 caracteres.');
      return;
    }

    Alert.alert('Proximo paso', 'Login validado localmente. Flujo listo para el backend.');
  };

  const handleRegisterSubmit = (payload: RegisterWizardPayload) => {
    setSavedSpecialConditions(payload.medicalInfo.specialConditions);
    setSavedSpecialConditionVigency(payload.medicalInfo.specialConditionVigency);
    setForm((previous) => ({
      ...previous,
      email: payload.personalData.email.trim(),
      password: '',
    }));
    setAuthScreen('login');
    Alert.alert(
      'Registro listo',
      `Perfil: ${payload.personalData.fullName}. Ya puedes iniciar sesion con el correo registrado.`,
    );
  };

  const renderContent = () => {
    if (!isLogoReady || isLoading) {
      return <LoadingScreen theme={theme} />;
    }

    if (authScreen === 'login') {
      return (
        <LoginScreen
          theme={theme}
          form={form}
          onEmailChange={(value) => setForm((previous) => ({ ...previous, email: value }))}
          onPasswordChange={(value) => setForm((previous) => ({ ...previous, password: value }))}
          onSubmit={handleLoginSubmit}
          onNavigateToRegister={() => setAuthScreen('register')}
        />
      );
    }

    return (
      <RegisterScreen
        theme={theme}
        onSubmit={handleRegisterSubmit}
        onNavigateToLogin={() => setAuthScreen('login')}
        initialSpecialConditions={savedSpecialConditions}
        initialSpecialConditionVigency={savedSpecialConditionVigency}
      />
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={statusBarStyle} />
        <View style={{ flex: 1 }}>
          {renderContent()}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
