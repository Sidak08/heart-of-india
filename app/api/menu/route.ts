import { getPublicCatalogue } from "@/lib/server/public-menu";

export async function GET() {
  return Response.json(await getPublicCatalogue(), { headers: { "Cache-Control": "no-store" } });
}
