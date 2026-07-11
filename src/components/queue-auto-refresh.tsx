"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// รีเฟรช server component เป็นระยะ (P1 liveness — SSE เป็น P2)
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
