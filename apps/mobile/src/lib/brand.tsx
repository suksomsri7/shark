// hook สีธีมกิจการ — ใช้แทน C.blue/C.blueHi ในจอ native ทุกจอหลัง login (sessions/chat/dna/การ์ด proposal ฯลฯ)
// ที่มา: activeBranding จาก AuthProvider (มาจาก /api/mobile/me ต่อ tenant · B1)
// ปริยาย = C.blue/#ffffff (ร้านยังไม่ได้ตั้งธีม หรือยังไม่รู้ร้าน เช่นจอ login)
// กันกะพริบตอนเปิดแอป: อ่านแคชล่าสุดจาก SecureStore (shark_brand) เอง "ตอน import โมดูลนี้" (ก่อนคอมโพเนนต์แรก mount ด้วยซ้ำ)
// — auth-context ก็เขียน/อ่านแคชเดียวกันไว้ใน activeBranding แล้ว อันนี้เป็นชั้นกันชนซ้ำสำหรับเฟรมแรกสุดก่อน context ทันเวลา
import { useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useAuth, type Branding } from "@/src/lib/auth-context";
import { C } from "@/src/theme";

const KEY_BRAND = "shark_brand";

export type Brand = {
  accent: string;
  accentFg: string;
  soft: string; // พื้นอ่อน 12% alpha ของ accent — ใช้เป็นพื้นหลังการ์ด/badge โทนแบรนด์
  logoUrl: string | null;
  displayName: string | null;
};

// พื้นอ่อน 12% alpha ของสี accent (hex 3/6 หลัก) — hex เพี้ยนกันชนด้วยน้ำเงินปริยาย
export function brandSoft(hex: string): string {
  const h = (hex ?? "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (full.length !== 6 || [r, g, b].some((n) => Number.isNaN(n))) return "rgba(37, 99, 235, 0.12)";
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

const DEFAULT_BRAND: Brand = {
  accent: C.blue,
  accentFg: "#ffffff",
  soft: brandSoft(C.blue),
  logoUrl: null,
  displayName: null,
};

function toBrand(b: Branding): Brand {
  return {
    accent: b.accent,
    accentFg: b.accentFg,
    soft: brandSoft(b.accent),
    logoUrl: b.logoUrl,
    displayName: b.displayName,
  };
}

// แคชระดับโมดูล — อ่านครั้งเดียวตอนไฟล์นี้ถูก import (เร็วกว่าอ่านใน useEffect ของคอมโพเนนต์แรก)
// เว็บ/เพี้ยน (SecureStore ไม่มี native module) → catch เงียบ ใช้ปริยาย
let moduleCache: Brand = DEFAULT_BRAND;
SecureStore.getItemAsync(KEY_BRAND)
  .then((raw) => {
    if (!raw) return;
    const parsed = JSON.parse(raw) as Branding | null;
    if (parsed) moduleCache = toBrand(parsed);
  })
  .catch(() => {
    /* เว็บ QC / แคชเพี้ยน — ปล่อยเป็นปริยาย */
  });

export function useBrand(): Brand {
  const { activeBranding, ready } = useAuth();
  // เฟรมแรกสุด (ก่อน context ทันด้วยซ้ำ) — ใช้ค่าที่โมดูลนี้อ่านไว้ตอน import
  const [fallback] = useState(() => moduleCache);
  if (!ready) return fallback; // ยังบูตไม่เสร็จ — เชื่อแคชไปก่อน อย่าเพิ่งฟันธงว่า "ไม่มีธีม"
  return activeBranding ? toBrand(activeBranding) : DEFAULT_BRAND;
}
