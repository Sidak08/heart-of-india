"use client";
import { Minus, Plus } from "lucide-react";

export function QuantityControl({ value, onChange, label = "Quantity" }: { value: number; onChange: (value: number) => void; label?: string }) {
  return <div className="quantity" aria-label={label}><button type="button" onClick={() => onChange(value - 1)} aria-label="Decrease quantity" disabled={value <= 1}><Minus size={17} /></button><output aria-live="polite">{value}</output><button type="button" onClick={() => onChange(value + 1)} aria-label="Increase quantity" disabled={value >= 20}><Plus size={17} /></button></div>;
}
