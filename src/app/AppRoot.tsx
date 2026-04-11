import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LOGO_SOURCE } from '../components/BrandLogo';
import { LoginScreen, type LoginFormState } from '../features/auth/LoginScreen';
import { LoadingScreen } from '../features/loading/LoadingScreen';
import { useAppTheme } from '../theme';

const SPLASH_DURATION_MS = 1200;

export function AppRoot() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLogoReady, setIsLogoReady] = useState(false);
  const [form, setForm] = useState<LoginFormState>({
    email: '',
    password: '',
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

  const handleSubmit = () => {
    Alert.alert('Proximo paso', 'Conectaremos este login con tu backend de autenticacion.');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={statusBarStyle} />
        <View style={{ flex: 1 }}>
          {!isLogoReady || isLoading ? (
            <LoadingScreen theme={theme} />
          ) : (
            <LoginScreen
              theme={theme}
              form={form}
              onEmailChange={(value) => setForm((previous) => ({ ...previous, email: value }))}
              onPasswordChange={(value) => setForm((previous) => ({ ...previous, password: value }))}
              onSubmit={handleSubmit}
            />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
