"use client";

import { useEffect } from "react";
import { useRhume } from "@/lib/store";

/**
 * Reads persisted decisions, cfg and seasonId after mount. The first client render matches the
 * server render (defaults), so there is no hydration mismatch.
 */
export default function StoreHydrator() {
  useEffect(() => {
    useRhume.getState().hydrate();
  }, []);
  return null;
}
