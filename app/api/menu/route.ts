import { getPublicCatalogue } from "@/lib/server/public-menu";

export async function GET() {
  return Response.json(await getPublicCatalogue(), { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
