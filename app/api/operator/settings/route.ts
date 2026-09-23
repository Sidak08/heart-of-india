import { z } from "zod";
import { getOperator } from "@/lib/server/operator";
import { policyFromText } from "@/lib/policy-text";
import { approveSeedMenu, readSettings, writeSettings } from "@/lib/server/sheets";
import { jsonError, verifySameOrigin } from "@/lib/server/security";

const intervalSchema = z.object({ open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) });
const weeklyHoursSchema = z.record(z.string(), z.array(intervalSchema).max(3));
const schema = z.object({
  name: z.string().trim().min(2).max(100), tagline: z.string().trim().min(2).max(140), phone: z.string().trim().min(7).max(30),
  publicEmail: z.string().trim().email().max(254).or(z.literal("")), street: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(80),
  province: z.string().trim().length(2), postalCode: z.string().trim().min(6).max(8), weeklyHours: weeklyHoursSchema,
  cutoffMinutes: z.number().int().min(0).max(180), prepMinMinutes: z.number().int().min(1).max(240), prepMaxMinutes: z.number().int().min(1).max(360),
  retentionDays: z.number().int().min(1).max(3650), privacyPolicy: z.string().trim().min(30).max(10_000), orderingPolicy: z.string().trim().min(30).max(10_000),
  menuApproved: z.boolean(), operationsApproved: z.boolean(), policiesApproved: z.boolean(), orderingEnabled: z.boolean(),
}).strict();

export async function GET() {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  try { return Response.json({ settings: await readSettings() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return jsonError("Settings are temporarily unavailable.", 503); }
}

export async function PUT(request: Request) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = schema.safeParse(body); if (!parsed.success) return jsonError("Review the highlighted settings.", 400, parsed.error.flatten());
  const values = parsed.data;
  if (values.prepMaxMinutes < values.prepMinMinutes) return jsonError("Maximum preparation time must be at least the minimum.", 400);
  if (values.orderingEnabled && (!values.menuApproved || !values.operationsApproved || !values.policiesApproved)) return jsonError("Approve the menu, operations, and policies before enabling ordering.", 400);
  if (values.orderingEnabled && !Object.values(values.weeklyHours).some((intervals) => intervals.length)) return jsonError("Add at least one opening-hours interval before enabling ordering.", 400);
  try {
    const current = await readSettings(); const now = new Date().toISOString();
    if (values.menuApproved && !current.menuApprovedAt) await approveSeedMenu(now);
    const settings = {
      ...current, name: values.name, tagline: values.tagline, phone: values.phone, publicEmail: values.publicEmail || null,
      address: { street: values.street, city: values.city, province: values.province.toUpperCase(), postalCode: values.postalCode.toUpperCase(), country: "CA" },
      weeklyHours: values.weeklyHours, cutoffMinutes: values.cutoffMinutes, prepMinMinutes: values.prepMinMinutes, prepMaxMinutes: values.prepMaxMinutes,
      retentionDays: values.retentionDays, privacyPolicy: policyFromText(values.privacyPolicy, "Privacy"), orderingPolicy: policyFromText(values.orderingPolicy, "Ordering and pickup"),
      orderingEnabled: values.orderingEnabled, menuApprovedAt: values.menuApproved ? current.menuApprovedAt ?? now : null,
      operationsApprovedAt: values.operationsApproved ? current.operationsApprovedAt ?? now : null, policiesApprovedAt: values.policiesApproved ? current.policiesApprovedAt ?? now : null,
      catalogRevision: values.menuApproved && !current.menuApprovedAt ? current.catalogRevision + 1 : current.catalogRevision,
      taxLabel: "HST", taxRateBasisPoints: 1300, taxInclusive: false, updatedAt: now,
    };
    await writeSettings(settings); return Response.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Settings could not be saved.", 503); }
}
