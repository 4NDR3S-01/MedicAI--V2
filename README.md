# MedicAI — Asistente Inteligente de Medicación

Proyecto de tesis. Monorepo con 3 paquetes independientes: app móvil, plataforma web y servidor API.

---

## Estructura del Proyecto

```
MedicAI/
├── app/                    # App móvil (Expo + React Native)
│   ├── android-native/     # Módulos nativos Android (Java)
│   ├── plugins/            # Plugins personalizados de Expo
│   ├── backend/            # Servidor API (NestJS)
│   │   └── prisma/         # Esquema de base de datos y migraciones
│   └── src/                # Código fuente de la app
├── web/                    # Plataforma web (Next.js)
│   └── app/                # App Router de Next.js
└── AGENTS.md               # Guía para agentes de IA
```

---

## Stack Tecnológico

### App Móvil (`app/`)

| Tecnología | Versión | Uso |
|---|---|---|
| **Expo SDK** | 54 | Framework multiplataforma (iOS/Android) |
| **React Native** | 0.81 | UI nativa |
| **React** | 19.1 | Biblioteca de componentes |
| **TypeScript** | 5.9 | Tipado estático |

**Módulos de Expo:**
- `expo-notifications` — notificaciones push y locales
- `expo-location` — geolocalización
- `expo-device` — información del dispositivo
- `expo-font` — carga de fuentes personalizadas
- `expo-asset` — gestión de assets
- `expo-status-bar` — control de barra de estado

**Librerías de React Native Community:**
- `@react-native-async-storage/async-storage` — almacenamiento clave-valor persistente
- `@react-native-community/datetimepicker` — selector nativo de fecha/hora
- `react-native-safe-area-context` — márgenes seguros de pantalla
- `react-native-webview` — vistas web embebidas
- `@expo/vector-icons` — iconografía

**Módulos Nativos Android (Java):**
- `AlarmModule` / `AlarmPackage` — puente JS ↔ APIs nativas de alarma
- `AlarmScheduler` — programación de alarmas exactas via `AlarmManager`
- `AlarmReceiver` — recepción y activación de alarmas (pantalla completa)
- `AlarmActivity` — UI de alarma sobre pantalla de bloqueo
- `AlarmService` — servicio en primer plano con sonido/vibración
- `AlarmActionHandler` — manejo de acciones (posponer/descartar)
- `BootReceiver` — reprogramación de alarmas tras reinicio
- `AlarmAppState` — seguimiento de estado foreground/background
- `AlarmEnvironmentModule` — permisos a nivel dispositivo y optimización de batería

**Permisos Android:**
`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `VIBRATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `RECEIVE_BOOT_COMPLETED`

**Entitlements iOS:**
- `com.apple.developer.usernotifications.critical-alerts`
- `com.apple.developer.usernotifications.time-sensitive`
- Background mode: `remote-notification`

**Deep Links:** esquema `medicai://`

**Build:** Expo Prebuild + EAS Build

---

### Plataforma Web (`web/`)

| Tecnología | Versión | Uso |
|---|---|---|
| **Next.js** | 16 | Meta-framework de React (App Router) |
| **React** | 19.2 | Biblioteca de componentes |
| **TypeScript** | 5 | Tipado estático |
| **Tailwind CSS** | 4 | Framework CSS utilitario |
| **PostCSS** | (vía Next.js) | Procesamiento de CSS |
| **ESLint** | 9 | Linting de código |

**Funcionalidades clave:**
- Páginas puente de autenticación (`/auth/verify-email`, `/auth/reset-password`)
- Proxy de API en `/api/auth/[...path]` que redirige al backend NestJS
- Landing page en `/`
- Deep link fallback: intenta abrir `medicai://auth`, tras 4s redirige al flujo web

---

### Servidor Backend (`app/backend/`)

| Tecnología | Versión | Uso |
|---|---|---|
| **NestJS** | 11 | Framework server-side (arquitectura modular) |
| **Express.js** | (via `@nestjs/platform-express`) | Servidor HTTP |
| **TypeScript** | 5.9 | Tipado estático |
| **RxJS** | 7.8 | Programación reactiva |

**Base de Datos:**
| Tecnología | Versión | Uso |
|---|---|---|
| **PostgreSQL** | — | Base de datos relacional |
| **Prisma** | 6 | ORM, migraciones y cliente tipado |

**Modelos de datos (Prisma):**
- `User` — cuentas de usuario con perfil, condiciones de salud, alergias, embarazo, lactancia
- `EmailVerificationToken` — verificación por magic link
- `PasswordResetToken` — tokens de restablecimiento de contraseña
- `Medication` — medicamentos con dosis, frecuencia e intervalos
- `MedicationLog` — registro de tomas (tomado/omitido/pospuesto)
- `Appointment` — citas médicas con estado de asistencia

**Autenticación y Seguridad:**
| Tecnología | Versión | Uso |
|---|---|---|
| **JWT** | (`@nestjs/jwt` 11) | Tokens de acceso (15 min) y refresco (7 días) |
| **bcrypt** | 6 | Hashing de contraseñas |
| **class-validator** | 0.15 | Validación de DTOs con decoradores |
| **class-transformer** | 0.5 | Transformación de objetos |
| **ValidationPipe** | (NestJS) | Validación automática (`whitelist`, `transform`, `forbidNonWhitelisted`) |
| **Throttler** | (`@nestjs/throttler` 6) | Rate limiting |

**Servicios Externos:**
| Servicio | SDK/API | Uso |
|---|---|---|
| **Resend** | SDK v6 | Envío de correos transaccionales (magic links, reset password) |
| **Groq** | API REST directa | Asistente de salud con IA (modelo `llama-3.3-70b-versatile`) |

**Módulos del Backend:**
- `auth` — registro, login, JWT, verificación por magic link, reset password, perfil
- `medications` — CRUD de medicamentos
- `appointments` — CRUD de citas médicas con seguimiento de asistencia
- `ai` — endpoint de chat con asistente de salud (Groq)

**Infraestructura Interna:**
- `AppLogger` — sistema estructurado de logging con niveles (`LOG_LEVEL`)
- `GlobalExceptionFilter` — manejo centralizado de errores
- `HttpRequestLoggerMiddleware` — logging de requests/responses HTTP
- CORS configurable via `ALLOWED_ORIGINS`

**Producción:**
- **PM2** — process manager (`ecosystem.config.cjs`: modo fork, 1 instancia, 512MB RAM, `wait_ready`, auto-restart)

**Dev Tooling:**
| Herramienta | Uso |
|---|---|
| `@nestjs/cli` | CLI de NestJS (build, generar código) |
| `ts-node-dev` | Servidor de desarrollo con hot-reload |
| `ts-node` | Ejecución de TypeScript |
| `@nestjs/testing` | Utilidades de testing |

---

## Flujo de Autenticación

1. Usuario solicita login/registro en la app o web
2. Backend envía magic link por email vía **Resend**
3. Usuario abre el link → página puente de **Next.js** (`web/auth/*`)
4. La página intenta abrir la app vía deep link `medicai://auth`
5. Si no se abre en 4s, continúa el flujo en la web
6. La app móvil recibe el deep link vía `Linking` de Expo

---

## Variables de Entorno

### App (`app/.env`)
- `EXPO_PUBLIC_API_BASE_URL` — URL del backend
- `EXPO_PUBLIC_DEV_OFFLINE_LOGIN` — login offline en desarrollo (debug)

### Web (`web/.env`)
- `BACKEND_API_URL` — URL del backend NestJS
- `NEXT_PUBLIC_APP_DEEP_LINK_BASE_URL` — esquema de deep link (`medicai://auth`)

### Backend (`app/backend/.env`)
- `DATABASE_URL` — conexión PostgreSQL
- `RESEND_API_KEY` — API key de Resend
- `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL` — API de Groq
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — secretos JWT
- `JWT_ACCESS_EXPIRES_IN` (15m), `JWT_REFRESH_EXPIRES_IN` (7d)
- `ALLOWED_ORIGINS`, `LOG_LEVEL`, `MAIL_FROM`
- `APP_DEEP_LINK_BASE_URL`, `APP_BASE_URL`

---

## Comandos Principales

### App Móvil
```bash
cd app
npm start              # Iniciar Expo
npm run android        # Build nativo Android
npm run ios            # Build nativo iOS
npm run typecheck      # Verificar tipos
npm run backend:dev    # Iniciar backend en modo dev
```

### Web
```bash
cd web
npm run dev            # Next.js dev server
npm run build          # Build de producción
npm run lint           # ESLint
```

### Backend
```bash
cd app/backend
npm run start:dev      # Dev con hot-reload
npm run build          # Build de producción
npm run prisma:generate  # Generar cliente Prisma
npm run prisma:migrate   # Ejecutar migraciones
```

---

## Arquitectura General

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  App Móvil   │────▶│   Backend    │────▶│  PostgreSQL  │
│  (Expo/RN)   │     │   (NestJS)   │     │              │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │   Resend     │
                     │   (Email)    │
                     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │    Groq      │
                     │   (IA/LLM)   │
                     └──────────────┘

┌──────────────┐     ┌──────────────┐
│  Plataforma  │────▶│   Backend    │
│  Web (Next)  │Proxy│   (NestJS)   │
└──────────────┘     └──────────────┘
```
