# MedicAI — AGENTS.md

## Structure

Monorepo of 3 independent packages (no workspace tool, each has own `node_modules`):

| path | what | tech |
|---|---|---|
| `app/` | Expo/RN mobile app | Expo SDK 54, RN 0.81, TS |
| `web/` | Next.js web app | Next 16, Tailwind v4, TS |
| `app/backend/` | API backend | NestJS 11, Prisma 6 (PostgreSQL), JWT, Resend, Groq |

## Commands

### App (Expo)
- `npm start` — start Expo dev
- `npm run android` — `expo run:android` (native build, not Expo Go)
- `npm run ios` — `expo run:ios`
- `npm run web` — `expo start --web`
- `npm run typecheck` — `tsc --noEmit`
- `npm run backend:dev` — start NestJS backend in dev mode

### Web (Next.js)
- `npm run dev` — `next dev`
- `npm run build` — `next build`
- `npm run start` — `next start`
- `npm run lint` — `eslint`

### Backend (NestJS)
All commands run from `app/backend/`:
- `npm run start:dev` — dev with `ts-node-dev --respawn`
- `npm run build` — `nest build` (cleans dist first)
- `npm run start` / `start:prod` — `node dist/main.js`
- `npm run prisma:generate` — `prisma generate`
- `npm run prisma:migrate` — `prisma migrate dev`
- `npm run pm2:start` — start with pm2 (production)
- `npm test` — Node's built-in test runner via ts-node (`test/**/*.test.ts`, no extra deps). Covers dose calculation (incl. app ↔ server parity, imported from `app/src/shared`), appointment series, Circle access checks, medication edit permissions and stock. Run it in other zones too (`TZ=UTC npm test`): the app's dose code takes a different path when the owner's zone isn't the device's.
- `npm run test:types` — typecheck tests (`tsconfig.test.json`)

## Key Architecture & Conventions

- **Auth flow**: Email magic links via Resend → web bridge (`medicai.lat/auth/verify-email`, `/auth/reset-password`) → deep link (`medicai://auth`) → Expo app via `Linking`. Web tries to open app, falls back to web flow after 4s.
- **Web API proxy**: `web/app/api/auth/[...path]/route.ts` proxies `/api/auth/*` to NestJS backend (`BACKEND_API_URL` env). Frontend never calls backend directly.
- **Expo env**: `EXPO_PUBLIC_API_BASE_URL` (must be reachable from device, e.g. `https://medicai.lat/api`). Set `EXPO_PUBLIC_DEV_OFFLINE_LOGIN=1` to show offline login in dev.
- **Generated native dirs** (`/ios`, `/android`) are gitignored — run `npx expo prebuild` to regenerate.
- **Custom expo plugin** at `app/plugins/withAlarmModule.js` — modifies native alarm module config.
- **Backend** runs via pm2 in production (`ecosystem.config.cjs`), `wait_ready: true` + `process.send('ready')`.
- **Prisma** schema is the single source of truth for the DB (PostgreSQL). Models: User, Medication, MedicationLog, Appointment, EmailVerificationToken, PasswordResetToken, CircleLink, CircleGrant, CircleInvitation, CircleAuditEvent (and others; see the schema). Migrations are hand-written idempotent SQL in `prisma/migrations/`.
- **Círculo** (`app/backend/src/modules/circle`, `app/src/features/circle`): links between people (relation + who cares for whom) and per-direction permissions granted by the data owner. `CircleAccessService.resolveOwner(actor, ownerId, permission)` is the single access check; `/medications` and `/appointments` accept `?ownerId=` to act on another member's data. Revoking a link deletes its grants (a dependent can't lose its last guardian). **Dependents** (`User.isManaged`): profiles without login (e.g. a child) created by a guardian, who gets all grants; "handover" sends a reset-password link that activates the account. **Caregiver reminders**: `CircleGrant.reminderMode` (OFF/NOTIFY/ALARM, the grantee's preference); `syncOwnReminders()` (app/src/features/tabs/services/reminders-sync.ts) merges those medications into the single alarm plan (`setCareAlarmPlan`) and alarm actions log with the owner's id (`getCareMedicationOwner`). Own alarms are always planned before caregiver alarms (shared budget). **Groups** (`CircleGroup`) are private, organize the view only and never grant access. `GET /circle/care-data?since=` returns medications/logs/appointments of everyone sharing with the caller in one request (used by "Seguimiento de hoy" and reminder sync). **Audit**: `Medication`/`Appointment.createdById/updatedById` and `MedicationLog.loggedById` record who acted (owner or a Circle member).
- **Sessions**: one `UserSession` per device (refresh JWT carries `sid`; rotation + reuse detection). Tokens are stored in `expo-secure-store` (`features/auth/services/session-store.ts`), profile in AsyncStorage; an install marker discards iOS Keychain leftovers after reinstall.
- **Offline doses**: `features/tabs/services/dose-queue.ts` — `logDose()` queues on `NetworkError` and flushes on reconnect/foreground.
- **Flexible schedules** (`Medication.scheduleType`): DAILY, WEEKDAYS (`weekDays`, 0 = Sunday), INTERVAL (every `dayInterval` days from `startDate`, "YYYY-MM-DD" in the owner's calendar) and AS_NEEDED (no times/alarms; `maxDailyDoses`/`minHoursBetween`, logged with no `scheduledFor`). `dosageSteps` = dose that changes over time (`[{days, dosage}]` from `startDate`; alarms say that day's dose, `dosageOnDay`). Dose calculation must match in `app/src/shared/services/dose-schedule.ts` and `app/backend/src/common/dose-schedule.ts`. **Stock**: `stockQuantity`/`stockPerDose`/`stockAlertAt`; each TAKEN log subtracts `MedicationLog.stockUnits` (proportional to the day's dose), undo gives it back; crossing the threshold sends a `LOW_STOCK` push (owner) / `CARE_LOW_STOCK` (caregivers).
- **Recurring appointments**: a series is N independent `Appointment` rows sharing `seriesId` (+ `repeatRule` for display), generated server-side in the owner's time zone (`appointment-series.ts`, max 104 / 1 year). Edit/delete accept `?scope=ONE|FOLLOWING`. The app only schedules reminders for the nearest appointments (14 days, `nearestPendingAppointments`) to stay under OS notification limits.
- **Time zones**: `User.timezone` (reported by the app via `PUT /auth/timezone`). Dose times ("08:00") are wall-clock times of the medication's owner; pass `timeZone` in `DoseScheduleInput` for other people's medications (`shared/services/dose-schedule.ts`). Dependents inherit their creator's zone.
- **Push** (`app/backend/src/modules/push`): Expo Push API (FCM V1 key uploaded to Expo; optional `EXPO_ACCESS_TOKEN`). `PushToken` is tied to the session (closing a session stops its pushes). `CareNotifierService.dataChanged()` sends a silent `SYNC` to the owner and caregivers after medication/dose/appointment writes; the app handles it in a background task (`app/src/app/push-tasks.ts`, registered from `index.ts`). `MissedDoseService` (cron every 5 min, `@nestjs/schedule`) alerts caregivers with reminders on when a dose is 1 h overdue (deduped in `MissedDoseAlert`). Circle events (invite, accept, decline, permissions, revoke) send visible pushes on Android channel `medicai_circle`. Invite links: `${APP_BASE_URL}/circulo/invitacion?code=…` (web page) → `medicai://circle/invite?code=…`.
- **Backend validation**: NestJS `ValidationPipe` with `whitelist`, `transform`, `forbidNonWhitelisted`.
- **CORS** configured for `ALLOWED_ORIGINS` env var (default: localhost:8081).
- **Logging**: Custom `AppLogger` with structured context, level from `LOG_LEVEL` env.
- **Error monitoring** (Sentry, off unless configured): backend `SENTRY_DSN` — every `AppLogger.error/fatal` (5xx, cron, process errors) is reported (`infrastructure/monitoring/error-reporting.ts`); app `EXPO_PUBLIC_SENTRY_DSN` (`shared/services/error-reporting.ts`, initialized first in `index.ts`). Health data: never send request bodies/headers/queries, user data, screenshots, touches or console logs. The `@sentry/react-native` Expo config plugin is intentionally NOT in `app.json` (it uploads source maps on release builds and fails without `SENTRY_AUTH_TOKEN`).
- **Profile** (`features/tabs/screens/ProfileScreen.tsx` + `components/profile/*`): every dialog is a shared `FormSheet`/`BottomSheet` (never RN `Modal` with `pageSheet`, which is full-screen on Android). Appearance preference (system/light/dark) lives in `shared/theme/theme-preference.ts`, is read by `useAppTheme` and also applied to native dialogs via `Appearance.setColorScheme`. "Descargar mis datos" = `POST /auth/account/export` (`AccountExportService`): a JSON copy emailed as an attachment to the account's own address, max once per hour, never secrets.
- **Permission history**: `CircleAuditEvent` (append-only) records LINK_CREATED, PERMISSIONS_CHANGED (before/after), LINK_REVOKED, DEPENDENT_CREATED, HANDOVER_STARTED; `GET /circle/history?ownerId=` (own, or a managed person's with `manageCircle`). Any new code that changes grants must add an event.

## Env files
- `app/.env` — `EXPO_PUBLIC_API_BASE_URL` (committed, set for production)
- `app/backend/.env` — DB, JWT, Resend, Groq keys (NOT committed)
- `web/.env` — `BACKEND_API_URL`, `NEXT_PUBLIC_APP_DEEP_LINK_BASE_URL` (NOT committed)

## Entrypoints
- **App**: `app/index.ts` → `App.tsx` → `src/app/AppRoot.tsx` (all auth, navigation, notifications orchestrated here)
- **Web**: `web/app/page.tsx` (landing), `web/app/auth/[action]/page.tsx` (auth bridge)
- **Backend**: `app/backend/src/main.ts`
- **Prisma**: `app/backend/prisma/schema.prisma`
