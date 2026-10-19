import type { MetadataRoute } from "next";
import { AUDIENCES } from "./content/audiences";
import { GUIDES } from "./content/guides";
import { SITE_URL } from "./content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    ...AUDIENCES.map((a) => ({ url: `${SITE_URL}/para/${a.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITE_URL}/guias`, changeFrequency: "weekly", priority: 0.6 },
    ...GUIDES.map((g) => ({ url: `${SITE_URL}/guias/${g.slug}`, lastModified: g.published, priority: 0.6 })),
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terminos`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
