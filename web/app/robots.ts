import type { MetadataRoute } from "next";
import { SITE_URL } from "./content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /auth y /circulo son puentes hacia la app (enlaces de correo e invitaciones).
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/circulo/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
