"use client";

import { setNonce } from "get-nonce";
import { useInsertionEffect } from "react";

export function StyleNonce({ nonce }: { nonce?: string }) {
  useInsertionEffect(() => {
    if (nonce) setNonce(nonce);
  }, [nonce]);
  return null;
}
