"use client";

import { Banknote, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatCad } from "@/lib/menu";
import type { Quote } from "@/lib/server/quote";
import { isReasonablePhone } from "@/lib/validation";

type Errors = Partial<Record<"name" | "email" | "phone" | "notes", string>>;
const ATTEMPT_KEY = "heart-of-india-order-attempt-v1";

function validate(form: FormData) {
  const errors: Errors = {}; const name = String(form.get("name") ?? "").trim(); const email = String(form.get("email") ?? "").trim(); const phone = String(form.get("phone") ?? "").trim(); const notes = String(form.get("notes") ?? "").trim();
  if (name.length < 2 || name.length > 80) errors.name = "Enter a name between 2 and 80 characters.";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
  if (phone.length > 30 || !isReasonablePhone(phone)) errors.phone = "Enter a phone number with 10 to 15 digits.";
  if (notes.length > 500) errors.notes = "Notes must be 500 characters or fewer.";
  return { errors, values: { name, email, phone, notes } };
}

export function CheckoutClient() {
  const cart = useCart(); const [quote, setQuote] = useState<Quote | null>(null); const [quotedFingerprint, setQuotedFingerprint] = useState(""); const [quoteError, setQuoteError] = useState(""); const [loadingQuote, setLoadingQuote] = useState(false); const [submitting, setSubmitting] = useState(false); const [errors, setErrors] = useState<Errors>({}); const [submitError, setSubmitError] = useState(""); const formRef = useRef<HTMLFormElement>(null); const attemptId = useRef(""); const quoteRequestId = useRef(0);
  const requestLines = useMemo(() => cart.lines.map(({ lineId, itemId, quantity, selections }) => ({ lineId, itemId, quantity, selections })), [cart.lines]);
  const fingerprint = useMemo(() => JSON.stringify(requestLines), [requestLines]);
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null") as { fingerprint?: string; attemptId?: string } | null;
      attemptId.current = stored?.fingerprint === fingerprint && stored.attemptId ? stored.attemptId : crypto.randomUUID();
      sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ fingerprint, attemptId: attemptId.current }));
    } catch { attemptId.current ||= crypto.randomUUID(); }
  }, [fingerprint]);
  useEffect(() => {
    const requestId = ++quoteRequestId.current;
    if (!cart.hydrated || !requestLines.length || !cart.canCheckout) { queueMicrotask(() => { if (requestId !== quoteRequestId.current) return; setQuote(null); setQuotedFingerprint(""); setQuoteError(cart.hydrated && requestLines.length && !cart.canCheckout ? "Review the unavailable or changed items in your cart first." : ""); }); return; }
    const controller = new AbortController(); queueMicrotask(() => {
      if (controller.signal.aborted || requestId !== quoteRequestId.current) return; setLoadingQuote(true); setQuote(null); setQuotedFingerprint(""); setQuoteError("");
      fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: requestLines }), signal: controller.signal })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Quote failed."); if (requestId === quoteRequestId.current) { setQuote(data); setQuotedFingerprint(fingerprint); } })
        .catch((error) => { if (error.name !== "AbortError" && requestId === quoteRequestId.current) setQuoteError(error.message); })
        .finally(() => { if (requestId === quoteRequestId.current) setLoadingQuote(false); });
    }); return () => controller.abort();
  }, [cart.hydrated, cart.canCheckout, fingerprint, requestLines]);
  const currentQuote = quotedFingerprint === fingerprint ? quote : null;
  if (!cart.hydrated) return <div className="container page-loading">Loading checkout…</div>;
  if (!cart.lines.length) return <main className="container empty-page"><h1 className="display">Your cart is empty</h1><p>Add something from the menu before checkout.</p><Link className="button-primary" href="/menu">View menu</Link></main>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitError(""); const checked = validate(new FormData(event.currentTarget)); setErrors(checked.errors);
    const first = Object.keys(checked.errors)[0] as keyof Errors | undefined; if (first) { formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    if (!currentQuote?.orderable || !attemptId.current) return; setSubmitting(true);
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: attemptId.current, customer: checked.values, lines: requestLines, acceptedQuoteToken: currentQuote.quoteToken }) });
      const data = await response.json();
      if (response.status === 409 && data.quote) { setQuote(data.quote); setQuotedFingerprint(fingerprint); attemptId.current = crypto.randomUUID(); try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ fingerprint, attemptId: attemptId.current })); } catch { /* session storage is optional */ } throw new Error("The order changed. Review the updated total and place it again."); }
      if (!response.ok || !data.statusUrl) throw new Error(data.error || "The order could not be placed.");
      try { sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* session storage is optional */ }
      window.location.assign(data.statusUrl);
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "The order could not be placed."); setSubmitting(false); }
  }
  return <main className="container checkout-page"><div className="cart-page-head"><span className="eyebrow">Guest pickup order</span><h1 className="section-title">Pickup details</h1><p>Place your order now and pay at the restaurant when you collect it.</p></div><div className="checkout-grid"><form ref={formRef} className="checkout-form" onSubmit={submit} noValidate><h2 className="display">Contact information</h2><div className="field"><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" maxLength={80} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} />{errors.name && <p id="name-error" className="field-error">{errors.name}</p>}</div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />{errors.email && <p id="email-error" className="field-error">{errors.email}</p>}</div><div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined} />{errors.phone && <p id="phone-error" className="field-error">{errors.phone}</p>}</div><div className="field"><label htmlFor="notes">Order notes <span>(optional)</span></label><textarea id="notes" name="notes" rows={4} maxLength={500} aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? "notes-help notes-error" : "notes-help"} /><div className="field-help" id="notes-help">Up to 500 characters. The restaurant may not be able to accommodate every request.</div>{errors.notes && <p id="notes-error" className="field-error">{errors.notes}</p>}</div><div className="pay-at-store-card"><Banknote aria-hidden="true" /><div><strong>Pay at store</strong><span>No online payment is collected. Pay when you pick up your order.</span></div></div></form><aside className="order-summary checkout-summary"><h2 className="display">Your order</h2>{loadingQuote && <p aria-live="polite">Checking current prices and availability…</p>}{quoteError && <div className="inline-error" role="alert"><strong>We could not confirm the order.</strong><span>{quoteError}</span></div>}{currentQuote?.lines.map((line) => <div className="receipt-line" key={line.lineId}><div><strong>{line.quantity} × {line.name}</strong>{line.selections.map((selection) => <small key={selection.groupId}>{selection.groupLabel}: {selection.optionName}</small>)}</div><strong>{formatCad(line.lineTotalCents)}</strong></div>)}{currentQuote && <><div className="summary-row"><span>Subtotal</span><strong>{formatCad(currentQuote.subtotalCents)}</strong></div>{currentQuote.taxBreakdown.map((tax) => <div className="summary-row" key={tax.label}><span>{tax.label}{tax.inclusive ? " (included)" : ""}</span><strong>{formatCad(tax.amountCents)}</strong></div>)}{currentQuote.feeCents > 0 && <div className="summary-row"><span>Fee</span><strong>{formatCad(currentQuote.feeCents)}</strong></div>}<div className="summary-row summary-total"><span>Total due at store</span><strong>{formatCad(currentQuote.totalCents)}</strong></div><div className="pickup-box"><MapPin size={19} aria-hidden="true" /><strong>Pickup at</strong><span>{currentQuote.pickupAddress.street}, {currentQuote.pickupAddress.city}, {currentQuote.pickupAddress.province} {currentQuote.pickupAddress.postalCode}</span>{currentQuote.pickupEstimateText && <span>{currentQuote.pickupEstimateText}</span>}</div>{currentQuote.blockers.length > 0 && <div className="preview-block" role="status"><strong>Online ordering is unavailable right now.</strong>{currentQuote.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div>}<button className="button-primary full payment-button" type="button" disabled={!currentQuote.orderable || submitting || loadingQuote} aria-busy={submitting} onClick={() => formRef.current?.requestSubmit()}>{submitting && <span className="button-spinner" aria-hidden="true" />}<span>{submitting ? "Placing your order…" : "Place pickup order"}</span></button>{submitError && <p className="field-error" role="alert">{submitError}</p>}</>}</aside></div></main>;
}
