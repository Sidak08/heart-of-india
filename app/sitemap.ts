import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { const base = process.env.APP_URL ?? "http://localhost:3000"; return ["", "/menu", "/about", "/privacy", "/ordering-policy"].map((path) => ({ url: `${base}${path}`, changeFrequency: path === "/menu" ? "weekly" : "monthly", priority: path === "" ? 1 : path === "/menu" ? .9 : .6 })); }
