"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthAction = "verify-email" | "reset-password";
type AuthTokenValidationStatus =
  | "valid"
  | "used"
  | "expired"
  | "invalid"
  | "already_verified";
type StatusVariant = "loading" | "success" | "warning" | "error" | "info";
type StatusTarget = "login" | "forgotPassword" | "openApp";

type AuthBridgeClientProps = {
  action: AuthAction;
  token: string;
  hasToken: boolean;
};

type AuthTokenValidationResponse = {
  status: AuthTokenValidationStatus;
  message: string;
};

type StatusAction = {
  label: string;
  target: StatusTarget;
};

type StatusState = {
  mode: "status";
  variant: StatusVariant;
  title: string;
  message: string;
  primaryAction?: StatusAction;
  secondaryAction?: StatusAction;
};

type ResetFormState = {
  mode: "reset-form";
};

type ScreenState = StatusState | ResetFormState;

const APP_DEEP_LINK_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_DEEP_LINK_BASE_URL ?? "medicai://auth"
).replace(/\/$/, "");
const WEB_FALLBACK_DELAY_MS = 4000;
const WEB_FALLBACK_RESUME_DELAY_MS = 350;

const statusStyles: Record<StatusVariant, { accent: string; icon: string }> = {
  loading: { accent: "#12a594", icon: "..." },
  success: { accent: "#12a594", icon: "✓" },
  warning: { accent: "#f59a2e", icon: "!" },
  error: { accent: "#d64545", icon: "x" },
  info: { accent: "#1b86e3", icon: "i" },
};

export function AuthBridgeClient({
  action,
  token,
  hasToken,
}: AuthBridgeClientProps) {
  const [screenState, setScreenState] = useState<ScreenState>(() => ({
    mode: "status",
    variant: "loading",
    title: hasToken ? "Abriendo MedicAI" : "Validando enlace",
    message: hasToken
      ? action === "reset-password"
        ? "Estamos intentando abrir la app para que restablezcas tu contraseña ahí. Si no se abre, podrás continuar en esta página."
        : "Estamos intentando abrir la app para confirmar tu correo ahí. Si no se abre, continuaremos en esta página."
      : action === "reset-password"
        ? "Estamos comprobando tu enlace de recuperación para continuar de forma segura."
        : "Estamos validando tu enlace de confirmación para proteger tu cuenta.",
    primaryAction: hasToken
      ? {
          label: "Abrir MedicAI",
          target: "openApp",
        }
      : undefined,
  }));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deepLinkUrl = useMemo(() => {
    if (!hasToken) {
      return "";
    }

    return `${APP_DEEP_LINK_BASE_URL}/${action}?token=${encodeURIComponent(token)}`;
  }, [action, hasToken, token]);

  useEffect(() => {
    let cancelled = false;
    let fallbackStarted = false;
    let openAppTimeout: number | null = null;
    let fallbackTimeout: number | null = null;

    const clearFallbackTimeout = () => {
      if (fallbackTimeout) {
        window.clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
    };

    const canRunWebFallback = () => (
      document.visibilityState === "visible" &&
      (typeof document.hasFocus !== "function" || document.hasFocus())
    );

    const runWebFallback = async () => {
      if (cancelled || fallbackStarted || !canRunWebFallback()) {
        return;
      }

      fallbackStarted = true;
      clearFallbackTimeout();

      if (!hasToken) {
        setScreenState(
          action === "reset-password"
            ? buildResetPasswordStatusState(
                "invalid",
                "El enlace no incluye un token válido. Solicita uno nuevo desde la app.",
              )
            : buildVerificationStatusState(
                "invalid",
                "El enlace no incluye un token válido. Abre uno nuevo desde tu correo.",
              ),
        );
        return;
      }

      setScreenState({
        mode: "status",
        variant: "loading",
        title: action === "reset-password" ? "Validando enlace" : "Confirmando correo",
        message:
          action === "reset-password"
            ? "Estamos comprobando tu enlace de recuperación para continuar de forma segura."
            : "Estamos validando tu enlace de confirmación para proteger tu cuenta.",
      });

      try {
        if (action === "reset-password") {
          const validation = await apiRequest<AuthTokenValidationResponse>(
            "/api/auth/reset-password/validate",
            { token },
          );

          if (cancelled) {
            return;
          }

          if (validation.status === "valid") {
            setScreenState({ mode: "reset-form" });
            return;
          }

          setScreenState(buildResetPasswordStatusState(validation.status, validation.message));
          return;
        }

        const validation = await apiRequest<AuthTokenValidationResponse>(
          "/api/auth/verify-email/validate",
          { token },
        );

        if (cancelled) {
          return;
        }

        if (validation.status === "valid") {
          const result = await apiRequest<{ message: string }>("/api/auth/verify-email", {
            token,
          });

          if (cancelled) {
            return;
          }

          setScreenState(buildVerificationStatusState("success", result.message));
          return;
        }

        setScreenState(buildVerificationStatusState(validation.status, validation.message));
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "No fue posible procesar el enlace.";
        const statusFromMessage = getTokenStatusFromMessage(message) ?? "invalid";
        setScreenState(
          action === "reset-password"
            ? buildResetPasswordStatusState(statusFromMessage, message)
            : buildVerificationStatusState(statusFromMessage, message),
        );
      }
    };

    const scheduleWebFallback = (delay: number) => {
      if (fallbackStarted) {
        return;
      }

      clearFallbackTimeout();
      fallbackTimeout = window.setTimeout(() => {
        void runWebFallback();
      }, delay);
    };

    const handleBrowserReturn = () => {
      if (!fallbackStarted && canRunWebFallback()) {
        scheduleWebFallback(WEB_FALLBACK_RESUME_DELAY_MS);
      }
    };

    if (!hasToken) {
      void runWebFallback();
      return () => {
        cancelled = true;
        clearFallbackTimeout();
      };
    }

    document.addEventListener("visibilitychange", handleBrowserReturn);
    window.addEventListener("focus", handleBrowserReturn);

    openAppTimeout = window.setTimeout(() => {
      if (!cancelled) {
        window.location.href = deepLinkUrl;
      }
    }, WEB_FALLBACK_RESUME_DELAY_MS);

    scheduleWebFallback(WEB_FALLBACK_DELAY_MS);

    return () => {
      cancelled = true;
      if (openAppTimeout) {
        window.clearTimeout(openAppTimeout);
      }
      clearFallbackTimeout();
      document.removeEventListener("visibilitychange", handleBrowserReturn);
      window.removeEventListener("focus", handleBrowserReturn);
    };
  }, [action, deepLinkUrl, hasToken, token]);

  const openApp = () => {
    if (!deepLinkUrl) {
      return;
    }

    window.location.href = deepLinkUrl;
  };

  const goToHome = () => {
    window.location.href = "/";
  };

  const handleStatusAction = (target: StatusTarget) => {
    if (target === "openApp") {
      openApp();
      return;
    }

    goToHome();
  };

  const handleResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const cleanPassword = password.trim();
    const cleanConfirmPassword = confirmPassword.trim();

    if (!cleanPassword) {
      setFormError("Ingresa una nueva contraseña.");
      return;
    }

    if (cleanPassword.length < 8) {
      setFormError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (!cleanConfirmPassword) {
      setFormError("Confirma la nueva contraseña.");
      return;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      setFormError("Verifica que ambas contraseñas sean iguales.");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiRequest<{ message: string }>("/api/auth/reset-password", {
        token,
        password: cleanPassword,
      });
      setPassword("");
      setConfirmPassword("");
      setScreenState(buildResetPasswordStatusState("success"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No fue posible actualizar la contraseña.";
      const tokenStatus = getTokenStatusFromMessage(message);

      if (tokenStatus === "used" || tokenStatus === "expired" || tokenStatus === "invalid") {
        setPassword("");
        setConfirmPassword("");
        setScreenState(buildResetPasswordStatusState(tokenStatus, message));
        return;
      }

      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (screenState.mode === "reset-form") {
    return (
      <>
        <div className="mt-6 inline-flex items-center rounded-full bg-[rgba(16,36,58,0.08)] px-3.5 py-2 text-xs font-bold uppercase text-[#244564]">
          Seguridad
        </div>
        <h1 className="mt-6 text-[32px] font-extrabold leading-tight text-[#10243a]">
          Nueva contraseña
        </h1>
        <p className="mt-3 text-base leading-7 text-[#607b95]">
          Crea una contraseña segura para proteger tu cuenta.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleResetSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#36536f]" htmlFor="password">
              Nueva contraseña
            </label>
            <input
              autoComplete="new-password"
              className="w-full rounded-2xl border border-[#d6e3ef] bg-[#f8fbfd] px-4 py-3 text-base text-[#10243a] outline-none focus:border-[#12a594]"
              disabled={isSubmitting}
              id="password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              type="password"
              value={password}
            />
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-semibold text-[#36536f]"
              htmlFor="confirmPassword"
            >
              Confirmar contraseña
            </label>
            <input
              autoComplete="new-password"
              className="w-full rounded-2xl border border-[#d6e3ef] bg-[#f8fbfd] px-4 py-3 text-base text-[#10243a] outline-none focus:border-[#12a594]"
              disabled={isSubmitting}
              id="confirmPassword"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repite tu contraseña"
              type="password"
              value={confirmPassword}
            />
          </div>

          {formError ? (
            <div className="rounded-2xl border border-[#f0c5c5] bg-[#fff6f6] px-4 py-3 text-sm leading-6 text-[#9b2f2f]">
              {formError}
            </div>
          ) : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#12a594] px-5 py-3 text-center text-sm font-extrabold text-[#062c28] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Actualizando..." : "Actualizar contraseña"}
          </button>

          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-[#b8d8f1] bg-transparent px-5 py-3 text-center text-sm font-extrabold text-[#1b86e3] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={goToHome}
            type="button"
          >
            Cancelar
          </button>
        </form>
      </>
    );
  }

  const styles = statusStyles[screenState.variant];

  return (
    <>
      <div className="mt-6 inline-flex items-center rounded-full bg-[rgba(16,36,58,0.08)] px-3.5 py-2 text-xs font-bold uppercase text-[#244564]">
        {action === "reset-password" ? "Seguridad" : "Verificación"}
      </div>

      <div className="mt-6 flex justify-center">
        <div
          className="grid h-20 w-20 place-items-center rounded-full text-3xl font-extrabold"
          style={{
            backgroundColor: `${styles.accent}16`,
            color: styles.accent,
          }}
        >
          {screenState.variant === "loading" ? (
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
          ) : (
            styles.icon
          )}
        </div>
      </div>

      <h1 className="mt-6 text-center text-[32px] font-extrabold leading-tight text-[#10243a]">
        {screenState.title}
      </h1>
      <p className="mt-3 text-center text-base leading-7 text-[#607b95]">
        {screenState.message}
      </p>

      {screenState.primaryAction ? (
        <button
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#12a594] px-5 py-3 text-center text-sm font-extrabold text-[#062c28]"
          onClick={() => handleStatusAction(screenState.primaryAction!.target)}
          type="button"
        >
          {screenState.primaryAction.label}
        </button>
      ) : null}

      {screenState.secondaryAction ? (
        <button
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-[#b8d8f1] bg-transparent px-5 py-3 text-center text-sm font-extrabold text-[#1b86e3]"
          onClick={() => handleStatusAction(screenState.secondaryAction!.target)}
          type="button"
        >
          {screenState.secondaryAction.label}
        </button>
      ) : null}
    </>
  );
}

async function apiRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as T;
}

async function parseApiError(response: Response) {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(body.message)) {
      return body.message.join(". ");
    }

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }

    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    return `Request failed with status ${response.status}`;
  }

  return `Request failed with status ${response.status}`;
}

function buildVerificationStatusState(
  status: AuthTokenValidationStatus | "success",
  message?: string,
): StatusState {
  switch (status) {
    case "success":
      return {
        mode: "status",
        variant: "success",
        title: "Correo confirmado",
        message: message || "Tu correo fue confirmado correctamente. Ya puedes iniciar sesión.",
        primaryAction: {
          label: "Ir al inicio de sesión",
          target: "openApp",
        },
      };
    case "already_verified":
      return {
        mode: "status",
        variant: "info",
        title: "Correo ya confirmado",
        message: message || "Tu correo ya había sido confirmado. Ya puedes iniciar sesión.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
    case "used":
      return {
        mode: "status",
        variant: "warning",
        title: "Enlace ya utilizado",
        message:
          message ||
          "Este enlace de verificación ya fue usado. Si tu correo ya quedó confirmado, puedes iniciar sesión.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
    case "expired":
      return {
        mode: "status",
        variant: "warning",
        title: "Enlace expirado",
        message:
          message ||
          "Este enlace de verificación ya venció. Solicita uno nuevo desde la app e inténtalo otra vez.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
    case "invalid":
    default:
      return {
        mode: "status",
        variant: "error",
        title: "Enlace inválido",
        message:
          message ||
          "No pudimos validar este enlace de verificación. Abre uno nuevo desde tu correo o solicita otro desde la app.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
  }
}

function buildResetPasswordStatusState(
  status: AuthTokenValidationStatus | "success",
  message?: string,
): StatusState {
  switch (status) {
    case "success":
      return {
        mode: "status",
        variant: "success",
        title: "Contraseña actualizada",
        message:
          message ||
          "Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión con tu nueva clave.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
    case "used":
      return {
        mode: "status",
        variant: "warning",
        title: "Enlace ya utilizado",
        message:
          message ||
          "Este enlace de recuperación ya fue usado. Solicita uno nuevo para crear otra contraseña.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
    case "expired":
      return {
        mode: "status",
        variant: "warning",
        title: "Enlace expirado",
        message:
          message ||
          "Este enlace de recuperación ya venció. Solicita uno nuevo para continuar.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
    case "invalid":
    case "already_verified":
    default:
      return {
        mode: "status",
        variant: "error",
        title: "Enlace inválido",
        message:
          message ||
          "No pudimos validar este enlace de recuperación. Solicita uno nuevo desde la app.",
        primaryAction: {
          label: "Abrir MedicAI",
          target: "openApp",
        },
      };
  }
}

function getTokenStatusFromMessage(message: string): AuthTokenValidationStatus | null {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("ya fue confirmado") ||
    normalizedMessage.includes("ya estaba verificado") ||
    normalizedMessage.includes("ya puedes iniciar sesión") ||
    normalizedMessage.includes("ya puedes iniciar sesion")
  ) {
    return "already_verified";
  }

  if (normalizedMessage.includes("ya fue utilizado") || normalizedMessage.includes("ya fue usado")) {
    return "used";
  }

  if (normalizedMessage.includes("expir")) {
    return "expired";
  }

  if (
    normalizedMessage.includes("no es válido") ||
    normalizedMessage.includes("no es valido") ||
    normalizedMessage.includes("token inválido") ||
    normalizedMessage.includes("token invalido")
  ) {
    return "invalid";
  }

  return null;
}
