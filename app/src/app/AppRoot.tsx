import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LOGO_SOURCE } from '../shared/ui';
import {
  AuthActionStatusScreen,
  ForgotPasswordScreen,
  getStoredSession,
  HomeScreen,
  LoginScreen,
  LoadingScreen,
  type AppAuthSession,
  type AuthTokenValidationStatus,
  type LoginFormState,
  RegisterScreen,
  type RegisterWizardPayload,
  requestPasswordReset,
  ResetPasswordScreen,
  signInWithEmail,
  signOut,
  signUpWithProfile,
  updatePassword,
  validateEmailVerificationToken,
  validatePasswordResetToken,
  verifyEmailToken,
  VerifyEmailPromptScreen,
} from '../features';
import { appStorage } from '../shared/storage';
import { useAppTheme } from '../shared/theme';

const SPLASH_DURATION_MS = 1200;
const AUTH_STATE_STORAGE_KEY = 'medicai_auth_state_v1';
const REGISTER_WIZARD_DRAFT_STORAGE_KEY = 'medicai_register_wizard_draft_v1';
const EMAIL_ACTION_COOLDOWN_MS = 60_000;
const MAX_EMAIL_COOLDOWN_SECONDS = 3_600;

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

type AuthScreenMode =
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'resetPassword'
  | 'verifyEmailPrompt'
  | 'authActionStatus';

type AuthActionTarget = 'login' | 'forgotPassword';

type AuthActionStatusState = {
  variant: 'loading' | 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  primaryAction?: {
    label: string;
    target: AuthActionTarget;
  };
  secondaryAction?: {
    label: string;
    target: AuthActionTarget;
  };
};

const buildVerificationStatusState = (
  status: AuthTokenValidationStatus | 'success',
  message?: string,
): AuthActionStatusState => {
  switch (status) {
    case 'success':
      return {
        variant: 'success',
        title: 'Correo confirmado',
        message: message || 'Tu correo fue confirmado correctamente. Ya puedes iniciar sesión.',
        primaryAction: {
          label: 'Ir al inicio de sesión',
          target: 'login',
        },
      };
    case 'already_verified':
      return {
        variant: 'info',
        title: 'Correo ya confirmado',
        message: message || 'Tu correo ya había sido confirmado. Ya puedes iniciar sesión.',
        primaryAction: {
          label: 'Ir al inicio de sesión',
          target: 'login',
        },
      };
    case 'used':
      return {
        variant: 'warning',
        title: 'Enlace ya utilizado',
        message: message || 'Este enlace de verificación ya fue usado. Si tu correo ya quedó confirmado, puedes iniciar sesión.',
        primaryAction: {
          label: 'Ir al inicio de sesión',
          target: 'login',
        },
      };
    case 'expired':
      return {
        variant: 'warning',
        title: 'Enlace expirado',
        message: message || 'Este enlace de verificación ya venció. Solicita uno nuevo desde la app e inténtalo otra vez.',
        primaryAction: {
          label: 'Ir al inicio de sesión',
          target: 'login',
        },
      };
    case 'invalid':
    default:
      return {
        variant: 'error',
        title: 'Enlace inválido',
        message: message || 'No pudimos validar este enlace de verificación. Abre uno nuevo desde tu correo o solicita otro desde la app.',
        primaryAction: {
          label: 'Ir al inicio de sesión',
          target: 'login',
        },
      };
  }
};

const buildResetPasswordStatusState = (
  status: AuthTokenValidationStatus | 'success',
  message?: string,
): AuthActionStatusState => {
  switch (status) {
    case 'success':
      return {
        variant: 'success',
        title: 'Contraseña actualizada',
        message: message || 'Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión con tu nueva clave.',
        primaryAction: {
          label: 'Ir al inicio de sesión',
          target: 'login',
        },
      };
    case 'used':
      return {
        variant: 'warning',
        title: 'Enlace ya utilizado',
        message: message || 'Este enlace de recuperación ya fue usado. Solicita uno nuevo para crear otra contraseña.',
        primaryAction: {
          label: 'Solicitar nuevo enlace',
          target: 'forgotPassword',
        },
        secondaryAction: {
          label: 'Volver al inicio de sesión',
          target: 'login',
        },
      };
    case 'expired':
      return {
        variant: 'warning',
        title: 'Enlace expirado',
        message: message || 'Este enlace de recuperación ya venció. Solicita uno nuevo para continuar.',
        primaryAction: {
          label: 'Solicitar nuevo enlace',
          target: 'forgotPassword',
        },
        secondaryAction: {
          label: 'Volver al inicio de sesión',
          target: 'login',
        },
      };
    case 'invalid':
    case 'already_verified':
    default:
      return {
        variant: 'error',
        title: 'Enlace inválido',
        message: message || 'No pudimos validar este enlace de recuperación. Solicita uno nuevo desde la app.',
        primaryAction: {
          label: 'Solicitar nuevo enlace',
          target: 'forgotPassword',
        },
        secondaryAction: {
          label: 'Volver al inicio de sesión',
          target: 'login',
        },
      };
  }
};

const getTokenStatusFromMessage = (message: string): AuthTokenValidationStatus | null => {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('ya fue confirmado')
    || normalizedMessage.includes('ya estaba verificado')
    || normalizedMessage.includes('ya puedes iniciar sesión')
    || normalizedMessage.includes('ya puedes iniciar sesion')
  ) {
    return 'already_verified';
  }

  if (normalizedMessage.includes('ya fue utilizado') || normalizedMessage.includes('ya fue usado')) {
    return 'used';
  }

  if (normalizedMessage.includes('expir')) {
    return 'expired';
  }

  if (
    normalizedMessage.includes('no es válido')
    || normalizedMessage.includes('no es valido')
    || normalizedMessage.includes('token inválido')
    || normalizedMessage.includes('token invalido')
  ) {
    return 'invalid';
  }

  return null;
};

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
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState<string | null>(null);
  const [authActionStatus, setAuthActionStatus] = useState<AuthActionStatusState | null>(null);

  const theme = useAppTheme();

  const clearResetPasswordState = () => {
    setPasswordResetToken(null);
    setResetPasswordForm({ password: '', confirmPassword: '' });
  };

  const presentAuthActionStatus = (statusState: AuthActionStatusState) => {
    setAuthActionStatus(statusState);
    setAuthScreen('authActionStatus');
  };

  const handleAuthActionTarget = (target: AuthActionTarget) => {
    setAuthActionStatus(null);
    clearResetPasswordState();

    if (target === 'forgotPassword') {
      setAuthScreen('forgotPassword');
      return;
    }

    setPendingEmailVerification(null);
    setAuthScreen('login');
  };

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

      if (!token) {
        return;
      }

      const urlLower = url.toLowerCase();
      const isResetPasswordLink = urlLower.includes('reset-password');

      if (isResetPasswordLink) {
        presentAuthActionStatus({
          variant: 'loading',
          title: 'Validando enlace',
          message: 'Estamos comprobando tu enlace de recuperación para continuar de forma segura.',
        });

        try {
          const validation = await validatePasswordResetToken(token);

          if (validation.status === 'valid') {
            setAuthActionStatus(null);
            setPasswordResetToken(token);
            setResetPasswordForm({ password: '', confirmPassword: '' });
            setAuthScreen('resetPassword');
            return;
          }

          clearResetPasswordState();
          presentAuthActionStatus(buildResetPasswordStatusState(validation.status, validation.message));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'No fue posible validar el enlace de recuperación.';
          clearResetPasswordState();
          presentAuthActionStatus(buildResetPasswordStatusState('invalid', message));
        }

        return;
      }

      presentAuthActionStatus({
        variant: 'loading',
        title: 'Confirmando correo',
        message: 'Estamos validando tu enlace de confirmación para proteger tu cuenta.',
      });

      try {
        const validation = await validateEmailVerificationToken(token);

        if (validation.status === 'valid') {
          const result = await verifyEmailToken(token);
          setPendingEmailVerification(null);
          presentAuthActionStatus(buildVerificationStatusState('success', result.message));
          return;
        }

        setPendingEmailVerification(null);
        presentAuthActionStatus(buildVerificationStatusState(validation.status, validation.message));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No fue posible procesar el enlace de autenticacion.';
        const statusFromMessage = getTokenStatusFromMessage(message) ?? 'invalid';
        setPendingEmailVerification(null);
        presentAuthActionStatus(buildVerificationStatusState(statusFromMessage, message));
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

  // Actualizar cooldown cada segundo
  useEffect(() => {
    if (emailActionBlockedUntil === null || authScreen !== 'verifyEmailPrompt') {
      return;
    }

    const interval = setInterval(() => {
      const remainingMs = (emailActionBlockedUntil ?? 0) - Date.now();
      if (remainingMs <= 0) {
        setEmailActionBlockedUntil(null);
        clearInterval(interval);
      } else {
        // Trigger re-render para actualizar cooldownSeconds
        setEmailActionBlockedUntil((prev) => prev);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [emailActionBlockedUntil, authScreen]);

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
    const normalizedMessage = message.toLowerCase();
    const secondsMatch = /(\d+)\s+segundos?/.exec(normalizedMessage)
      ?? /after\s+(\d+)\s+seconds?/.exec(normalizedMessage);
    const seconds = secondsMatch ? Number(secondsMatch[1]) : 60;
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_EMAIL_COOLDOWN_SECONDS) {
      setEmailActionBlockedUntil(Date.now() + seconds * 1000);
      return;
    }
    setDefaultEmailCooldown();
  };

  const handleLoginSubmit = async () => {
    const email = form.email.trim();
    const password = form.password;

    if (!email) {
      Alert.alert('Correo requerido', 'Ingresa tu correo electrónico para continuar.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Correo invalido', 'Verifica el formato de tu correo electrónico.');
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
      
      // Detectar si el error es por email no verificado
      if (message.toLowerCase().includes('verificar') || message.toLowerCase().includes('verified')) {
        setPendingEmailVerification(email);
        setAuthScreen('verifyEmailPrompt');
        return;
      }
      
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

  const handleResendVerificationEmail = async () => {
    const email = pendingEmailVerification;
    if (!email) {
      return false;
    }

    const remainingCooldown = getRemainingCooldownSeconds();
    if (remainingCooldown > 0) {
      showEmailRateLimitAlert(remainingCooldown);
      return false;
    }

    try {
      setIsSubmittingAuth(true);
      // Utilizar endpoint de resend-verification
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/auth/resend-verification`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json() as any;
        const errorMessage = errorData.message || 'Error al reenviar correo';
        // Parsear cooldown si existe en el error (para rate limiting)
        const cooldownMatch = /after\s+(\d+)\s+seconds?/i.exec(errorMessage)
          ?? /(\d+)\s+segundos?/i.exec(errorMessage);
        if (cooldownMatch) {
          const seconds = Number(cooldownMatch[1]);
          if (Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_EMAIL_COOLDOWN_SECONDS) {
            setEmailActionBlockedUntil(Date.now() + seconds * 1000);
          }
        }
        throw new Error(errorMessage);
      }

      setDefaultEmailCooldown();
      Alert.alert(
        'Correo reenviado',
        'Hemos enviado un nuevo enlace de verificacion a tu correo. Revisa tu bandeja de entrada y spam.',
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo reenviar el correo.';
      Alert.alert('Error al reenviar correo', message);
      return false;
    } finally {
      setIsSubmittingAuth(false);
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
      if (!passwordResetToken) {
        Alert.alert('Token requerido', 'Abre el enlace de recuperacion enviado a tu correo para continuar.');
        return;
      }

      setIsSubmittingAuth(true);
      await updatePassword(password, passwordResetToken);
      clearResetPasswordState();
      presentAuthActionStatus(buildResetPasswordStatusState('success'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible actualizar la contrasena.';
      const tokenStatus = getTokenStatusFromMessage(message);

      if (tokenStatus === 'used' || tokenStatus === 'expired' || tokenStatus === 'invalid') {
        clearResetPasswordState();
        presentAuthActionStatus(buildResetPasswordStatusState(tokenStatus, message));
        return;
      }

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

    if (authScreen === 'authActionStatus' && authActionStatus) {
      const { primaryAction, secondaryAction } = authActionStatus;

      return (
        <AuthActionStatusScreen
          theme={theme}
          variant={authActionStatus.variant}
          title={authActionStatus.title}
          message={authActionStatus.message}
          primaryAction={
            primaryAction
              ? {
                  label: primaryAction.label,
                  onPress: () => handleAuthActionTarget(primaryAction.target),
                }
              : undefined
          }
          secondaryAction={
            secondaryAction
              ? {
                  label: secondaryAction.label,
                  onPress: () => handleAuthActionTarget(secondaryAction.target),
                }
              : undefined
          }
        />
      );
    }

    if (authScreen === 'resetPassword' && passwordResetToken) {
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
            clearResetPasswordState();
            setAuthScreen('login');
          }}
        />
      );
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

    if (
      authScreen === 'login'
      || authScreen === 'resetPassword'
      || authScreen === 'authActionStatus'
    ) {
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

    if (authScreen === 'verifyEmailPrompt' && pendingEmailVerification) {
      const cooldownSeconds = Math.max(
        0,
        Math.min(
          MAX_EMAIL_COOLDOWN_SECONDS,
          Math.ceil(((emailActionBlockedUntil ?? 0) - Date.now()) / 1000),
        ),
      );
      return (
        <VerifyEmailPromptScreen
          theme={theme}
          email={pendingEmailVerification}
          isSubmitting={isSubmittingAuth}
          cooldownSeconds={cooldownSeconds}
          onResendEmail={async () => {
            if (!isSubmittingAuth) {
              return handleResendVerificationEmail();
            }
            return false;
          }}
          onBackToLogin={() => {
            setPendingEmailVerification(null);
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
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={statusBarStyle} />
        <View style={{ flex: 1 }}>
          {renderContent()}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
