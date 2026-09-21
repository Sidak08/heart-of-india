"use client";
import { Minus, Plus } from "lucide-react";

type Props = { value: number; onChange: (value: number) => void; label?: string; minimum?: number; maximum?: number; className?: string; id?: string };

export function QuantityControl({ value, onChange, label = "Quantity", minimum = 1, maximum = 20, className = "", id }: Props) {
  return <div id={id} className={`quantity${className ? ` ${className}` : ""}`} role="group" aria-label={label}><button type="button" onClick={() => onChange(value - 1)} aria-label={`Decrease ${label}`} disabled={value <= minimum}><Minus size={17} /></button><output aria-live="polite">{value}</output><button type="button" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`} disabled={value >= maximum}><Plus size={17} /></button></div>;
}
