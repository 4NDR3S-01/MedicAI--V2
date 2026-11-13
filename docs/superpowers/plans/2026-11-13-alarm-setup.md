# Prepara tus alarmas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las alertas encadenadas de permisos por una sola pantalla "Prepara tus alarmas" con alarma de prueba, sin bloquear el guardado de medicamentos.

**Architecture:** Un modelo puro (`alarm-setup-steps.ts`) convierte el estado de permisos en pasos; un servicio (`alarm-setup.service.ts`) lee el estado vivo + lo guardado en el teléfono, programa la alarma de prueba y abre la pantalla vía un lanzador (mismo patrón que `assistant-launcher.ts`). `AlarmSetupSheet` (BottomSheet) se monta en `MainAppShell`.

**Tech Stack:** Expo/RN (TS), módulo nativo Android (Java), tests con `node --test` en `app/backend/test`.

**Spec:** `docs/superpowers/specs/2026-11-13-alarm-setup-design.md`

## Global Constraints
- Textos en español sencillo; nada de jerga ("full-screen intent" → "Mostrar sobre la pantalla bloqueada").
- Nunca bloquear el guardado de un medicamento por permisos (solo el diálogo nativo de notificaciones, que no bloquea).
- La alarma de prueba nunca registra tomas ni programa posposiciones.
- Estado local por dispositivo en `appStorage`: `medicai_alarm_test_passed_v1`, `medicai_autostart_confirmed_v1`.
- Editar nativo solo en `app/android-native/` (luego copiar a `android/` o prebuild).

## Review Focus
1. Volver de los ajustes del sistema → las filas se marcan solas sin cerrar la pantalla (refresco en AppState `active`).
2. Marca sin guía conocida (`manufacturer` null u otro) → guía genérica, nunca pantalla vacía.
3. Alarma de prueba con MedicAI en primer plano → igual suena; sus botones no crean registros (guard en `AlarmActivity`).
4. Permiso retirado después de una prueba exitosa → el paso vuelve a aparecer como pendiente (la prueba no oculta pasos comprobables). Test en Task 1.
5. Medicamento de otra persona (`ownerId`) o "según necesidad" → no se abre la pantalla.

---

### Task 1: Modelo de pasos y guías por marca (puro, probado)

**Files:**
- Create: `app/src/shared/services/alarm-setup-steps.ts`
- Create: `app/src/shared/services/oem-alarm-guides.ts`
- Test: `app/backend/test/alarm-setup.test.ts`

**Interfaces — Produces:**
- `type AlarmSetupStepId = 'notifications' | 'exactAlarms' | 'lockScreen' | 'battery' | 'autostart' | 'test'`
- `type AlarmSetupStep = { id: AlarmSetupStepId; title: string; description: string; done: boolean }`
- `type AlarmSetupInput = { platform: string; status: Pick<AlarmPermissionsStatus, 'notifications' | 'alarmChannelBlocked' | 'shouldPromptExactAlarmPermission' | 'shouldPromptFullScreenIntent' | 'shouldPromptBatteryOptimization'>; autostartNeeded: boolean; autostartConfirmed: boolean; testPassed: boolean }` (import de tipo solamente)
- `buildAlarmSetupSteps(input): AlarmSetupStep[]` — orden: notifications, exactAlarms, lockScreen, battery, autostart (solo si `autostartNeeded`), test. En iOS (`platform !== 'android'`) solo `notifications`. `notifications.done = notifications === 'granted' && !alarmChannelBlocked`.
- `needsAlarmSetup(steps): boolean` — algún paso sin `done`.
- `oemAlarmGuide(manufacturer: string | null): { brand: string; steps: string[] }` — honor/huawei, xiaomi(+redmi/poco), samsung, oppo/realme/oneplus, vivo/iqoo, genérica.

- [ ] **Step 1: Tests**
  - Android todo concedido + autostart no necesario + `testPassed:false` → ids `['notifications','exactAlarms','lockScreen','battery','test']`, solo `test` pendiente; `needsAlarmSetup === true`.
  - Igual con `testPassed:true` → `needsAlarmSetup === false`.
  - `shouldPromptFullScreenIntent:true` y `testPassed:true` → `lockScreen.done === false`, `needsAlarmSetup === true` (Review Focus 4).
  - `autostartNeeded:true, autostartConfirmed:false` → incluye `autostart` pendiente; con `true` → done.
  - `alarmChannelBlocked:true` → `notifications.done === false`.
  - iOS → solo `['notifications']`.
  - `oemAlarmGuide('HONOR').brand === 'Honor'`; `oemAlarmGuide(null).steps.length > 0`; `oemAlarmGuide('nokia').brand === 'tu teléfono'`.
- [ ] **Step 2:** `cd app/backend && npm test` → falla (módulo no existe).
- [ ] **Step 3:** Implementar ambos módulos (sin imports de react-native en runtime).
- [ ] **Step 4:** `npm test` y `npm run test:types` → pasan.

### Task 2: Alarma de prueba segura en nativo

**Files:** Modify `app/android-native/java/com/william20/medicai/AlarmActivity.java` (`storePendingAction`, `scheduleSnooze` / botón Posponer).

- [ ] **Step 1:** En `AlarmActivity.storePendingAction` y antes de `scheduleSnooze`, salir si `!AlarmActionHandler.isMedicationAlarmId(alarmId)`.
- [ ] **Step 2:** `javac` contra android.jar + classes.jar de react-android → sin errores.

**Produces:** id de prueba `medicai_alarm_test` (no contiene `_dose_`/`_snooze_`) es seguro.

### Task 3: Servicio de preparación + lanzador

**Files:** Create `app/src/shared/services/alarm-setup.service.ts`

**Consumes:** Task 1; `getAlarmPermissionsStatus`, `isOemAutostartRequired`, `getDeviceManufacturer` (alarm-permissions.service); `AlarmNative.scheduleAlarm`; `appStorage`.

**Produces:**
- `getAlarmSetupSnapshot(): Promise<{ steps: AlarmSetupStep[]; needsSetup: boolean; manufacturer: string | null }>`
- `markAutostartConfirmed(): Promise<void>`, `markAlarmTestPassed(passed: boolean): Promise<void>`
- `scheduleTestAlarm(): Promise<boolean>` — `AlarmNative.scheduleAlarm('medicai_alarm_test', Date.now() + 10_000, 'Alarma de prueba', 'Así te avisará MedicAI a la hora de tu medicamento')`; false si no hay módulo.
- `openAlarmSetup(): void`, `onOpenAlarmSetup(listener: () => void): () => void`
- `promptAlarmSetupIfNeeded(): Promise<void>` — abre la pantalla si `needsSetup`.

- [ ] **Step 1:** Implementar. **Step 2:** `npm run typecheck` (app) → pasa.

### Task 4: Pantalla `AlarmSetupSheet`

**Files:** Create `app/src/features/tabs/components/AlarmSetupSheet.tsx`; Modify `app/src/app/MainAppShell.tsx` (montarla, escuchar `onOpenAlarmSetup`).

- BottomSheet "Prepara tus alarmas", subtítulo "Faltan N pasos para que suenen" / "Todo listo".
- Fila por paso: ✅ o botón "Activar": notifications → `requestNotificationPermission()` y si sigue denegado `openNotificationSettings()`; exactAlarms → `openExactAlarmSettings`; lockScreen → `openFullScreenIntentSettings`; battery → `openBatteryOptimizationSettings`; autostart → "Abrir ajustes" (`openAutostartSettings`) + "Ya lo activé" (`markAutostartConfirmed`).
- Paso test: "Probar alarma" → `scheduleTestAlarm()`, mensaje "Bloquea el teléfono ahora; sonará en 10 segundos". Al volver a la app tras programarla: pregunta "¿Viste la alarma en pantalla completa?" Sí → `markAlarmTestPassed(true)`; No → muestra `oemAlarmGuide(manufacturer)` con botones "Abrir ajustes de inicio" (si autostart aplica) y "Ajustes de MedicAI" (`Linking.openSettings`), y "Probar otra vez".
- Refresca `getAlarmSetupSnapshot()` al abrir y en AppState `active`.

- [ ] **Step 1:** Implementar. **Step 2:** `npm run typecheck` → pasa.

### Task 5: No bloquear el guardado; aviso usa la pantalla

**Files:** Modify `MedicationFormSheet.tsx` (~499), `MedicationsScreen.tsx` (~134, ~255), `circle/components/DependentSheets.tsx` (~138), `profile/AlarmStatusCard.tsx`, `alarm-permissions.service.ts` (quitar `ensureAlarmPermissions` si queda sin uso).

- Guardar/activar: `void requestNotificationPermission()` antes (diálogo nativo, sin bloquear), guardar, y luego `void promptAlarmSetupIfNeeded()` solo para medicamentos propios con alarmas (no `ownerId`, no `asNeeded`).
- DependentSheets: revisar qué protege; no abrir la pantalla por datos de otra persona.
- `AlarmStatusCard`: estado desde `getAlarmSetupSnapshot()`; "Resolver ahora" → `openAlarmSetup()`; el enlace de inicio automático pasa a la pantalla.

- [ ] **Step 1:** Implementar. **Step 2:** `npm run typecheck`; `cd backend && npm test`.

### Task 6: Verificar en el teléfono
- [ ] Copiar nativo a `android/`, `./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a`, instalar con `adb install -r`.
- [ ] Crear medicamento → se guarda y abre la pantalla; probar alarma bloqueado; revisar logcat `MedicAI-Alarm`.
