import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { AuthBridgeClient } from "./AuthBridgeClient";

type AuthAction = "verify-email" | "reset-password";

type AuthBridgePageProps = {
  params: Promise<{ action: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

const ACTION_COPY: Record<AuthAction, { pageTitle: string }> = {
  "verify-email": {
    pageTitle: "Confirmar correo",
  },
  "reset-password": {
    pageTitle: "Restablecer contraseña",
  },
};

export async function generateMetadata({
  params,
}: Pick<AuthBridgePageProps, "params">): Promise<Metadata> {
  const { action } = await params;
  if (!isAuthAction(action)) {
    return {
      title: "MedicAI",
    };
  }

  return {
    title: `${ACTION_COPY[action].pageTitle} | MedicAI`,
  };
}

export default async function AuthBridgePage({
  params,
  searchParams,
}: AuthBridgePageProps) {
  const [{ action }, query] = await Promise.all([params, searchParams]);

  if (!isAuthAction(action)) {
    notFound();
  }

  const token = resolveToken(query.token);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#0d2137,#173d58)] px-4 py-6 text-[#10243a]">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-2xl items-center justify-center">
        <section className="w-full rounded-[28px] border border-[rgba(188,208,225,0.7)] bg-[rgba(255,255,255,0.96)] p-7 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
          <div className="mt-6 flex items-center gap-3.5">
            <div className="h-14 w-14 overflow-hidden rounded-[18px] border border-[rgba(188,208,225,0.7)] bg-white">
              <Image
                src="/logo_app.png"
                alt="Logo de MedicAI"
                width={56}
                height={56}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div>
              <strong className="block text-xl font-extrabold">MedicAI</strong>
              <span className="text-sm text-[#607b95]">
                Asistencia medica y seguimiento de salud
              </span>
            </div>
          </div>

          <AuthBridgeClient action={action} hasToken={Boolean(token)} token={token} />
        </section>
      </div>
    </main>
  );
}

function isAuthAction(action: string): action is AuthAction {
  return action === "verify-email" || action === "reset-password";
}

function resolveToken(token: string | string[] | undefined) {
  if (Array.isArray(token)) {
    return token[0] ?? "";
  }

  return token ?? "";
}
