import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LOGO_SOURCE } from '../components';
import {
  ForgotPasswordScreen,
  getStoredSession,
  HomeScreen,
  LoginScreen,
  LoadingScreen,
  type AppAuthSession,
  type LoginFormState,
  RegisterScreen,
  type RegisterWizardPayload,
  requestPasswordReset,
  ResetPasswordScreen,
  signInWithEmail,
  signOut,
  signUpWithProfile,
  updatePassword,
  verifyEmailToken,
} from '../features';
import { appStorage } from '../services';
import { useAppTheme } from '../theme';

const SPLASH_DURATION_MS = 1200;
const AUTH_STATE_STORAGE_KEY = 'medicai_auth_state_v1';
const REGISTER_WIZARD_DRAFT_STORAGE_KEY = 'medicai_register_wizard_draft_v1';
const EMAIL_ACTION_COOLDOWN_MS = 60_000;

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

type AuthScreenMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword';

export function AppRoot() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLogoReady, setIsLogoReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<AppAuthSession | null>(null);
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
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [emailActionBlockedUntil, setEmailActionBlockedUntil] = useState<number | null>(null);
  const [registerRenderKey, setRegisterRenderKey] = useState(0);
  const registerRequestInFlightRef = useRef(false);
  const resetRequestInFlightRef = useRef(false);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: '',
    confirmPassword: '',
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
        const rawState = await appStorage.getItem(AUTH_STATE_STORAGE_KEY);
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

        if (
          parsed.authScreen === 'login'
          || parsed.authScreen === 'register'
          || parsed.authScreen === 'forgotPassword'
          || parsed.authScreen === 'resetPassword'
        ) {
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

        await appStorage.setItem(AUTH_STATE_STORAGE_KEY, JSON.stringify(stateToPersist));
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

  useEffect(() => {
    let cancelled = false;

    void getStoredSession().then((storedSession) => {
      if (cancelled) {
        return;
      }

      setSession(storedSession);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleAuthCallbackUrl = async (url: string) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return;
      }

      const queryParams = parsedUrl.searchParams;
      const token = queryParams.get('token');

      try {
        if (!token) {
          return;
        }

        await verifyEmailToken(token);
        Alert.alert('Correo verificado', 'Tu correo fue validado correctamente. Ya puedes iniciar sesion.');
        setAuthScreen('login');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No fue posible procesar el enlace de autenticacion.';
        Alert.alert('Enlace no valido', message);
      }
    };

    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        void handleAuthCallbackUrl(initialUrl);
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthCallbackUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const statusBarStyle = useMemo(() => {
    return theme.mode === 'dark' ? 'light' : 'dark';
  }, [theme.mode]);

  const getRemainingCooldownSeconds = () => {
    if (!emailActionBlockedUntil) {
      return 0;
    }

    const remainingMs = emailActionBlockedUntil - Date.now();
    if (remainingMs <= 0) {
      setEmailActionBlockedUntil(null);
      return 0;
    }

    return Math.ceil(remainingMs / 1000);
  };

  const showEmailRateLimitAlert = (remainingSeconds: number) => {
    Alert.alert(
      'Espera un momento',
      `Para proteger tu cuenta, espera ${remainingSeconds} segundos antes de solicitar otro correo.`,
    );
  };

  const setDefaultEmailCooldown = () => {
    setEmailActionBlockedUntil(Date.now() + EMAIL_ACTION_COOLDOWN_MS);
  };

  const syncEmailCooldownFromErrorMessage = (message: string) => {
    const secondsMatch = /(\d+)\s+segundos?/.exec(message.toLowerCase());
    const seconds = secondsMatch ? Number(secondsMatch[1]) : 60;
    if (Number.isFinite(seconds) && seconds > 0) {
      setEmailActionBlockedUntil(Date.now() + seconds * 1000);
      return;
    }
    setDefaultEmailCooldown();
  };

  const handleLoginSubmit = async () => {
    const email = form.email.trim();
    const password = form.password;

    if (!email) {
      Alert.alert('Correo requerido', 'Ingresa tu correo electronico para continuar.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Correo invalido', 'Verifica el formato de tu correo electronico.');
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

    try {
      setIsSubmittingAuth(true);
      const nextSession = await signInWithEmail(email, password);
      setSession(nextSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion.';
      Alert.alert('No fue posible iniciar sesion', message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleRegisterSubmit = async (payload: RegisterWizardPayload) => {
    if (registerRequestInFlightRef.current) {
      return;
    }

    try {
      registerRequestInFlightRef.current = true;
      setIsSubmittingAuth(true);
      await signUpWithProfile(payload);

      setSavedSpecialConditions(payload.medicalInfo.specialConditions);
      setSavedSpecialConditionVigency(payload.medicalInfo.specialConditionVigency);
      setForm((previous) => ({
        ...previous,
        email: payload.personalData.email.trim(),
        password: '',
      }));

      setAuthScreen('login');
      Alert.alert(
        'Cuenta creada',
        `Tu cuenta se creo correctamente, ${payload.personalData.fullName}. Revisa tu correo para validar la cuenta y luego inicia sesion.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo completar el registro.';
      Alert.alert('No fue posible completar el registro', message);
    } finally {
      setIsSubmittingAuth(false);
      registerRequestInFlightRef.current = false;
    }
  };

  const handleForgotPasswordSubmit = async () => {
    if (resetRequestInFlightRef.current) {
      return;
    }

    const email = form.email.trim();
    if (!email) {
      Alert.alert('Correo requerido', 'Ingresa tu correo electronico para recuperar tu contrasena.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Correo invalido', 'Verifica el formato de tu correo electronico.');
      return;
    }

    const remainingCooldown = getRemainingCooldownSeconds();
    if (remainingCooldown > 0) {
      showEmailRateLimitAlert(remainingCooldown);
      return;
    }

    try {
      resetRequestInFlightRef.current = true;
      setIsSubmittingAuth(true);
      await requestPasswordReset(email);
      setDefaultEmailCooldown();
      Alert.alert(
        'Solicitud enviada',
        'Si el correo pertenece a una cuenta registrada, recibiras instrucciones para restablecer tu contrasena.',
      );
      setAuthScreen('login');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar el correo de recuperacion.';
      if (message.toLowerCase().includes('demasiadas solicitudes de correo')) {
        syncEmailCooldownFromErrorMessage(message);
      }
      Alert.alert('No fue posible enviar la solicitud', message);
    } finally {
      setIsSubmittingAuth(false);
      resetRequestInFlightRef.current = false;
    }
  };

  const handleResetPasswordSubmit = async () => {
    const password = resetPasswordForm.password.trim();
    const confirmPassword = resetPasswordForm.confirmPassword.trim();

    if (!password) {
      Alert.alert('Contrasena requerida', 'Ingresa una nueva contrasena.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Contrasena invalida', 'La nueva contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (!confirmPassword) {
      Alert.alert('Confirmacion requerida', 'Confirma la nueva contrasena.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Contrasenas no coinciden', 'Verifica que ambas contrasenas sean iguales.');
      return;
    }

    try {
      setIsSubmittingAuth(true);
      await updatePassword(password);
      setResetPasswordForm({ password: '', confirmPassword: '' });
      setAuthScreen('login');
      Alert.alert('Contrasena actualizada', 'Tu contrasena fue actualizada correctamente.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible actualizar la contrasena.';
      Alert.alert('Actualizacion no completada', message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsSubmittingAuth(true);
      await signOut();
      setSession(null);
      await appStorage.removeItem(REGISTER_WIZARD_DRAFT_STORAGE_KEY);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cerrar sesion.';
      Alert.alert('No fue posible cerrar sesion', message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleNavigateToRegister = async () => {
    await appStorage.removeItem(REGISTER_WIZARD_DRAFT_STORAGE_KEY);
    setRegisterRenderKey((previous) => previous + 1);
    setAuthScreen('register');
  };

  const renderContent = () => {
    if (!isLogoReady || isLoading || !authReady) {
      return <LoadingScreen theme={theme} />;
    }

    if (session) {
      return (
        <HomeScreen
          theme={theme}
          userEmail={session.user.email ?? null}
          isSigningOut={isSubmittingAuth}
          onSignOut={() => {
            if (!isSubmittingAuth) {
              void handleSignOut();
            }
          }}
        />
      );
    }

    if (authScreen === 'login') {
      return (
        <LoginScreen
          theme={theme}
          form={form}
          isSubmitting={isSubmittingAuth}
          onEmailChange={(value) => setForm((previous) => ({ ...previous, email: value }))}
          onPasswordChange={(value) => setForm((previous) => ({ ...previous, password: value }))}
          onSubmit={() => {
            if (!isSubmittingAuth) {
              void handleLoginSubmit();
            }
          }}
          onForgotPassword={() => setAuthScreen('forgotPassword')}
          onNavigateToRegister={() => {
            void handleNavigateToRegister();
          }}
        />
      );
    }

    if (authScreen === 'forgotPassword') {
      return (
        <ForgotPasswordScreen
          theme={theme}
          email={form.email}
          isSubmitting={isSubmittingAuth}
          onEmailChange={(value) => setForm((previous) => ({ ...previous, email: value }))}
          onSubmit={() => {
            if (!isSubmittingAuth) {
              void handleForgotPasswordSubmit();
            }
          }}
          onBackToLogin={() => setAuthScreen('login')}
        />
      );
    }

    if (authScreen === 'resetPassword') {
      return (
        <ResetPasswordScreen
          theme={theme}
          password={resetPasswordForm.password}
          confirmPassword={resetPasswordForm.confirmPassword}
          isSubmitting={isSubmittingAuth}
          onPasswordChange={(value) =>
            setResetPasswordForm((previous) => ({ ...previous, password: value }))
          }
          onConfirmPasswordChange={(value) =>
            setResetPasswordForm((previous) => ({ ...previous, confirmPassword: value }))
          }
          onSubmit={() => {
            if (!isSubmittingAuth) {
              void handleResetPasswordSubmit();
            }
          }}
          onCancel={() => {
            setResetPasswordForm({ password: '', confirmPassword: '' });
            setAuthScreen('login');
          }}
        />
      );
    }

    return (
      <RegisterScreen
        key={`register-${registerRenderKey}`}
        theme={theme}
        isSubmitting={isSubmittingAuth}
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
