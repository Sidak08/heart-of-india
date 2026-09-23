import { z } from "zod";
import { categories } from "@/lib/menu";
import { getOperator } from "@/lib/server/operator";
import { readMenu, updateMenuItem } from "@/lib/server/sheets";
import { jsonError, verifySameOrigin } from "@/lib/server/security";

const categoryIds = new Set(categories.map((category) => category.id));
const updateSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().refine((value) => categoryIds.has(value), "Choose a valid category."),
  priceCents: z.number().int().min(0).max(100_000),
  availability: z.enum(["available", "unavailable", "requires_owner_confirmation"]),
}).strict();

export async function GET() {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  try { return Response.json({ items: await readMenu() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return jsonError("The menu is temporarily unavailable.", 503); }
}

export async function PATCH(request: Request) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return jsonError("Review this menu item and try again.", 400, parsed.error.flatten());
  try {
    const item = await updateMenuItem(parsed.data);
    return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "The menu item could not be saved.", 503);
  }
}
