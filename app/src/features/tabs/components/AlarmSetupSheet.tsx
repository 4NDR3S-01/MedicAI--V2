import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, BottomSheet } from '../../../shared/ui';
import {
  openAutostartSettings,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
  requestNotificationPermission,
} from '../../../shared/services/alarm-permissions.service';
import {
  TEST_ALARM_DELAY_MS,
  getAlarmSetupSnapshot,
  markAlarmTestPassed,
  markAutostartConfirmed,
  scheduleTestAlarm,
  type AlarmSetupSnapshot,
} from '../../../shared/services/alarm-setup.service';
import type { AlarmSetupStep } from '../../../shared/services/alarm-setup-steps';
import { oemAlarmGuide } from '../../../shared/services/oem-alarm-guides';

/** idle → waiting (alarma programada) → asking ("¿la viste?") → failed (guía de la marca). */
type TestPhase = 'idle' | 'waiting' | 'asking' | 'failed';

/**
 * "Prepara tus alarmas": todo lo que necesita la alarma en una sola pantalla.
 * Solo pide lo que falta; al volver de los ajustes del sistema las filas se
 * marcan solas. La alarma de prueba comprueba lo que Android no deja leer.
 */
export function AlarmSetupSheet({ theme, visible, onClose }: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void }>) {
  const [snapshot, setSnapshot] = useState<AlarmSetupSnapshot | null>(null);
  const [phase, setPhase] = useState<TestPhase>('idle');
  const firesAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getAlarmSetupSnapshot());
    } catch {
      // Se queda con lo último que se pudo leer.
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    setPhase('idle');
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refresh();
      // Volvió después de que sonara la alarma de prueba: preguntar.
      if (firesAt.current && Date.now() >= firesAt.current) {
        firesAt.current = 0;
        setPhase((current) => (current === 'waiting' ? 'asking' : current));
      }
    });
    return () => subscription.remove();
  }, [visible, refresh]);

  // Si no bloqueó el teléfono, la alarma suena igual: preguntar unos segundos después.
  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active') {
        firesAt.current = 0;
        setPhase('asking');
      }
    }, TEST_ALARM_DELAY_MS + 6_000);
    return () => clearTimeout(timer);
  }, [phase]);

  const startTest = async () => {
    const scheduled = await scheduleTestAlarm();
    if (!scheduled) return;
    firesAt.current = Date.now() + TEST_ALARM_DELAY_MS;
    setPhase('waiting');
  };

  const answerTest = async (seen: boolean) => {
    await markAlarmTestPassed(seen);
    setPhase(seen ? 'idle' : 'failed');
    await refresh();
  };

  const activate = async (step: AlarmSetupStep) => {
    switch (step.id) {
      case 'notifications': {
        // Primero el diálogo del sistema; si sigue faltando (se negó antes o el
        // canal de alarmas está silenciado), a los ajustes de notificaciones.
        await requestNotificationPermission();
        const after = await getAlarmSetupSnapshot();
        setSnapshot(after);
        if (!after.steps.find((s) => s.id === 'notifications')?.done) await openNotificationSettings();
        return;
      }
      case 'exactAlarms':
        await openExactAlarmSettings();
        break;
      case 'lockScreen':
        await openFullScreenIntentSettings();
        break;
      case 'battery':
        await openBatteryOptimizationSettings();
        break;
      case 'autostart':
        await openAutostartSettings();
        break;
      case 'test':
        await startTest();
        break;
    }
    void refresh();
  };

  const steps = snapshot?.steps ?? [];
  const missing = steps.filter((step) => !step.done).length;
  const guide = oemAlarmGuide(snapshot?.manufacturer ?? null);
  const autostartStep = steps.find((step) => step.id === 'autostart');

  const subtitle = !snapshot
    ? 'Revisando tu teléfono…'
    : missing === 0
      ? 'Todo listo: tus alarmas sonarán a tiempo.'
      : missing === 1
        ? 'Falta 1 paso para que tus alarmas suenen.'
        : `Faltan ${missing} pasos para que tus alarmas suenen.`;

  return (
    <BottomSheet
      theme={theme}
      visible={visible}
      title="Prepara tus alarmas"
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <AppButton
          theme={theme}
          label={missing === 0 && snapshot ? 'Listo' : 'Más tarde'}
          variant={missing === 0 && snapshot ? 'primary' : 'ghost'}
          onPress={onClose}
          style={styles.flex}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {steps.map((step) => (
          <View key={step.id} style={[styles.row, { borderColor: theme.colors.surfaceBorder }]}>
            <MaterialCommunityIcons
              name={step.done ? 'check-circle' : 'checkbox-blank-circle-outline'}
              size={24}
              color={step.done ? theme.colors.successText : theme.colors.textMuted}
            />
            <View style={styles.flex}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{step.title}</Text>
              {step.done ? null : (
                <Text style={[styles.description, { color: theme.colors.textSecondary }]}>{step.description}</Text>
              )}
              {step.done ? null : (
                <StepActions
                  theme={theme}
                  step={step}
                  phase={phase}
                  onActivate={() => void activate(step)}
                  onConfirmAutostart={() => void markAutostartConfirmed().then(refresh)}
                  onAnswer={(seen) => void answerTest(seen)}
                  onRetry={() => void startTest()}
                />
              )}
            </View>
          </View>
        ))}

        {phase === 'failed' ? (
          <View style={[styles.guide, { backgroundColor: `${theme.colors.accentTertiary}12`, borderColor: `${theme.colors.accentTertiary}40` }]}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
              {`Un paso más en ${guide.brand}`}
            </Text>
            <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
              Tu teléfono tiene ajustes propios que la app no puede revisar. Actívalos y vuelve a probar:
            </Text>
            {guide.steps.map((line, index) => (
              <Text key={line} style={[styles.description, { color: theme.colors.textPrimary }]}>
                {`${index + 1}. ${line}`}
              </Text>
            ))}
            <View style={styles.actions}>
              {autostartStep ? (
                <AppButton theme={theme} label="Inicio automático" variant="secondary" onPress={() => void openAutostartSettings()} />
              ) : null}
              <AppButton theme={theme} label="Ajustes de MedicAI" variant="secondary" onPress={() => void Linking.openSettings()} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function StepActions({
  theme,
  step,
  phase,
  onActivate,
  onConfirmAutostart,
  onAnswer,
  onRetry,
}: Readonly<{
  theme: AppTheme;
  step: AlarmSetupStep;
  phase: TestPhase;
  onActivate: () => void;
  onConfirmAutostart: () => void;
  onAnswer: (seen: boolean) => void;
  onRetry: () => void;
}>) {
  if (step.id === 'autostart') {
    return (
      <View style={styles.actions}>
        <AppButton theme={theme} label="Abrir ajustes" variant="secondary" icon="open-outline" iconPosition="left" onPress={onActivate} />
        <AppButton theme={theme} label="Ya lo activé" variant="ghost" onPress={onConfirmAutostart} />
      </View>
    );
  }

  if (step.id === 'test') {
    if (phase === 'waiting') {
      return (
        <Text style={[styles.hint, { color: theme.colors.accentSecondaryText }]}>
          Bloquea el teléfono ahora. La alarma sonará en 10 segundos.
        </Text>
      );
    }
    if (phase === 'asking') {
      return (
        <View style={styles.gap}>
          <Text style={[styles.hint, { color: theme.colors.textPrimary }]}>
            ¿Viste la alarma en pantalla completa con el teléfono bloqueado?
          </Text>
          <View style={styles.actions}>
            <AppButton theme={theme} label="Sí, la vi" onPress={() => onAnswer(true)} />
            <AppButton theme={theme} label="No" variant="secondary" onPress={() => onAnswer(false)} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.actions}>
        <AppButton
          theme={theme}
          label={phase === 'failed' ? 'Probar otra vez' : 'Probar alarma'}
          icon="alarm-outline"
          iconPosition="left"
          onPress={phase === 'failed' ? onRetry : onActivate}
        />
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <AppButton theme={theme} label="Activar" variant="secondary" icon="open-outline" iconPosition="left" onPress={onActivate} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 10, paddingBottom: 4 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
  title: { fontSize: 15, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 19, fontWeight: '500', marginTop: 2 },
  hint: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  gap: { gap: 2 },
  guide: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
});
