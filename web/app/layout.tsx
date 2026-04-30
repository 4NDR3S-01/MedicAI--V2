import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://medicai.lat"),
  title: {
    default: "MedicAI",
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



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
