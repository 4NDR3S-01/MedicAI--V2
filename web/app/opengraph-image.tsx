import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Imagen que aparece al compartir medicai.lat (WhatsApp, redes, etc.).
// Se genera una vez en el build.
export const alt = "MedicAI — Tu agenda médica, siempre presente";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), "app/icon.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: "radial-gradient(circle at 85% 15%, rgba(45, 212, 191, 0.28), transparent 55%), #030712",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={iconSrc} width={96} height={96} alt="" style={{ borderRadius: 24 }} />
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>
            Medic<span style={{ color: "#2dd4bf" }}>AI</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
          <span>Tu agenda médica,</span>
          <span style={{ color: "#2dd4bf" }}>siempre presente</span>
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 32, color: "#94a3b8" }}>
          Medicamentos, citas y el cuidado de tu familia en una sola app.
        </div>
      </div>
    ),
    size,
  );
}
