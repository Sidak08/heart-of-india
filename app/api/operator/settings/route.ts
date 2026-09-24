import { z } from "zod";
import { getOperator } from "@/lib/server/operator";
import { policyFromText } from "@/lib/policy-text";
import { readMenu, readSettings, readSettingsFresh, writeSettings } from "@/lib/server/sheets";
import { jsonError, verifySameOrigin } from "@/lib/server/security";
import { isReasonablePhone } from "@/lib/validation";

const intervalSchema = z.object({ open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), allDay: z.boolean().optional() }).refine((value) => value.allDay || value.open !== value.close, { message: "Equal opening and closing times require the 24-hour option." });
const weeklyHoursSchema = z.record(z.string(), z.array(intervalSchema).max(3));
const dateOverrideSchema = z.object({ date: z.string().date(), intervals: z.array(intervalSchema).max(3) });
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
function invalidIntervals(intervals: Array<{ open: string; close: string; allDay?: boolean }>) {
  if (intervals.some((entry) => entry.allDay) && intervals.length > 1) return true;
  const ranges = intervals.map((entry) => { const [oh, om] = entry.open.split(":").map(Number); const [ch, cm] = entry.close.split(":").map(Number); const start = oh * 60 + om; let end = entry.allDay ? start + 1440 : ch * 60 + cm; if (end < start) end += 1440; return { start, end }; }).sort((a, b) => a.start - b.start);
  return ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end);
}
const schema = z.object({
  name: z.string().trim().min(2).max(100), tagline: z.string().trim().min(2).max(140), phone: z.string().trim().max(30).refine(isReasonablePhone, "Enter a phone number with 10 to 15 digits."),
  publicEmail: z.string().trim().email().max(254).or(z.literal("")), street: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(80),
  province: z.string().trim().length(2), postalCode: z.string().trim().min(6).max(8), weeklyHours: weeklyHoursSchema, dateOverrides: z.array(dateOverrideSchema).max(60),
  cutoffMinutes: z.number().int().min(0).max(180), prepMinMinutes: z.number().int().min(1).max(240), prepMaxMinutes: z.number().int().min(1).max(360),
  retentionDays: z.number().int().min(1).max(3650), privacyPolicy: z.string().trim().min(30).max(10_000), orderingPolicy: z.string().trim().min(30).max(10_000),
  taxLabel: z.string().trim().min(1).max(30), taxRateBasisPoints: z.number().int().min(0).max(5000), taxInclusive: z.boolean(),
  menuApproved: z.boolean(), operationsApproved: z.boolean(), policiesApproved: z.boolean(), orderingEnabled: z.boolean(), expectedUpdatedAt: z.string().datetime().nullable(),
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
  if (Object.keys(values.weeklyHours).length !== DAYS.length || DAYS.some((day) => !(day in values.weeklyHours))) return jsonError("Opening hours must include all seven days.", 400);
  if (Object.values(values.weeklyHours).some(invalidIntervals) || values.dateOverrides.some((entry) => invalidIntervals(entry.intervals))) return jsonError("Opening-hour intervals cannot overlap, and a 24-hour day cannot contain another interval.", 400);
  if (new Set(values.dateOverrides.map((entry) => entry.date)).size !== values.dateOverrides.length) return jsonError("Each date can have only one hours override.", 400);
  if (values.orderingEnabled && !Object.values(values.weeklyHours).some((intervals) => intervals.length)) return jsonError("Add at least one opening-hours interval before enabling ordering.", 400);
  const everyInterval = [...Object.values(values.weeklyHours).flat(), ...values.dateOverrides.flatMap((entry) => entry.intervals)];
  if (everyInterval.some((interval) => { if (interval.allDay) return values.cutoffMinutes >= 1440; const [oh, om] = interval.open.split(":").map(Number); const [ch, cm] = interval.close.split(":").map(Number); const duration = ((ch * 60 + cm) - (oh * 60 + om) + 1440) % 1440; return duration <= values.cutoffMinutes; })) return jsonError("The ordering cutoff must be shorter than every service interval.", 400);
  try {
    const current = await readSettingsFresh(); const now = new Date().toISOString();
    if (current.updatedAt !== values.expectedUpdatedAt) return Response.json({ error: "Settings changed in another session. Reload the current values before saving.", current }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (values.menuApproved && !current.menuApprovedAt) {
      const unresolved = (await readMenu()).filter((item) => item.availability === "requires_owner_confirmation");
      if (unresolved.length) return Response.json({ error: `${unresolved.length} menu item${unresolved.length === 1 ? " still needs" : "s still need"} owner confirmation. Review each item in Edit menu before approving the menu.` }, { status: 409 });
    }
    const settings = {
      ...current, name: values.name, tagline: values.tagline, phone: values.phone, publicEmail: values.publicEmail || null,
      address: { street: values.street, city: values.city, province: values.province.toUpperCase(), postalCode: values.postalCode.toUpperCase(), country: "CA" },
      weeklyHours: values.weeklyHours, dateOverrides: values.dateOverrides, cutoffMinutes: values.cutoffMinutes, prepMinMinutes: values.prepMinMinutes, prepMaxMinutes: values.prepMaxMinutes,
      retentionDays: values.retentionDays, privacyPolicy: policyFromText(values.privacyPolicy, "Privacy"), orderingPolicy: policyFromText(values.orderingPolicy, "Ordering and pickup"),
      orderingEnabled: values.orderingEnabled, menuApprovedAt: values.menuApproved ? current.menuApprovedAt ?? now : null,
      operationsApprovedAt: values.operationsApproved ? current.operationsApprovedAt ?? now : null, policiesApprovedAt: values.policiesApproved ? current.policiesApprovedAt ?? now : null,
      catalogRevision: values.menuApproved && !current.menuApprovedAt ? current.catalogRevision + 1 : current.catalogRevision,
      taxLabel: values.taxLabel, taxRateBasisPoints: values.taxRateBasisPoints, taxInclusive: values.taxInclusive, updatedAt: now,
    };
    await writeSettings(settings); return Response.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Settings could not be saved.", 503); }
}
