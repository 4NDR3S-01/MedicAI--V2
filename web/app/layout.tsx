import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://medicai.lat"),
  title: {
    default: "MedicAI | Recordatorios de citas médicas y medicamentos",
    template: "%s | MedicAI",
  },
  description:
    "MedicAI ayuda a recordar citas médicas, tomar medicamentos a tiempo y coordinar círculos familiares de cuidado.",
  keywords: [
    "recordatorio de citas médicas",
    "recordatorio de medicamentos",
    "app médica",
    "cuidado familiar",
  ],
  openGraph: {
    title: "MedicAI | Recordatorios médicos",
    description: "Recordatorios de citas y medicamentos con cuidado familiar.",
    url: "https://medicai.lat",
    siteName: "MedicAI",
    locale: "es_ES",
    type: "website",
  },
  icons: {
    icon: "/logo_app.png",
    apple: "/logo_app.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00b9cf" },
    { media: "(prefers-color-scheme: dark)", color: "#071315" },
  ],
};

const THEME_BOOTSTRAP = `
(() => {
  try {
    const stored = localStorage.getItem("medicai-theme");
    const system = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = stored === "light" || stored === "dark" ? stored : system;
    document.documentElement.setAttribute("data-theme", theme);
  } catch {}
})();
`;

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
