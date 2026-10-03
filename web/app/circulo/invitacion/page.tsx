import type { Metadata } from "next";
import Image from "next/image";

import { CircleInviteClient } from "./CircleInviteClient";

export const metadata: Metadata = {
  title: "Invitación al Círculo | MedicAI",
  // El código es privado: que no lo indexen los buscadores.
  robots: { index: false, follow: false },
};

type CircleInvitePageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function CircleInvitePage({ searchParams }: CircleInvitePageProps) {
  const { code: rawCode } = await searchParams;
  const code = normalizeCode(Array.isArray(rawCode) ? rawCode[0] : rawCode);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#0d2137,#173d58)] px-4 py-6 text-[#10243a]">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-2xl items-center justify-center">
        <section className="w-full rounded-[28px] border border-[rgba(188,208,225,0.7)] bg-[rgba(255,255,255,0.96)] p-7 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
          <div className="flex items-center gap-3.5">
            <div className="h-14 w-14 overflow-hidden rounded-[18px] border border-[rgba(188,208,225,0.7)] bg-white">
              <Image src="/logo_app.png" alt="Logo de MedicAI" width={56} height={56} className="h-full w-full object-cover" priority />
            </div>
            <div>
              <strong className="block text-xl font-extrabold">MedicAI</strong>
              <span className="text-sm text-[#607b95]">Asistencia médica y seguimiento de salud</span>
            </div>
          </div>

          <CircleInviteClient code={code} />
        </section>
      </div>
    </main>
  );
}

function normalizeCode(value: string | undefined) {
  const code = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 8 ? code : "";
}
