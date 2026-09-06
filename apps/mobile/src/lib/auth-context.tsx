// สถานะ auth กลางของแอป — token/กิจการ active/รายชื่อกิจการ + bootstrap จาก SecureStore ตอนเปิดแอป
// กติกา flow (คำสั่งเจ้าของ): เปิดแอปบังคับ login → มี token แต่ไม่มีกิจการ → DNA Wizard สร้างกิจการแรก
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/src/api/client";
import {
  clearSession,
  getCachedBrand,
  getTenantId,
  getToken,
  setCachedBrand,
  setTenantId,
  setToken,
} from "@/src/lib/session";
import { currentPushToken, resetPushRegistration } from "@/src/lib/push-register";

// ธีมกิจการต่อ membership — ตรงกับ `branding` ที่ /api/mobile/me ส่งมา (null เมื่อร้านไม่ได้เปิด applyMobile)
export type Branding = {
  displayName: string;
  logoUrl: string | null;
  accent: string;
  accentFg: string;
  navTone: "LIGHT" | "BRAND" | "DARK";
};

export type TenantRow = {
  tenantId: string;
  name: string;
  role: string;
  branding?: {
    displayName: string;
    logoUrl: string | null;
    accent: string;
    accentFg: string;
    navTone: "LIGHT" | "BRAND" | "DARK";
  } | null;
};
type Me = { user: { id: string; email: string; name: string | null }; memberships: TenantRow[] };

type AuthState = {
  ready: boolean; // bootstrap จาก SecureStore เสร็จหรือยัง (ก่อน ready อย่าเพิ่ง redirect)
  token: string | null;
  user: Me["user"] | null;
  tenants: TenantRow[];
  activeTenantId: string | null;
  activeBranding: Branding | null; // ธีมของกิจการ active — ก่อน ready คือค่าที่แคชไว้ (กันกะพริบ) หลัง ready คือของจริง
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [user, setUser] = useState<Me["user"] | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [activeTenantId, setActive] = useState<string | null>(null);
  // ธีมที่แคชไว้ตอนบูต (จาก SecureStore) — ใช้ก่อน ready เท่านั้น กัน UI กะพริบน้ำเงิน→สีแบรนด์
  const [cachedBranding, setCachedBranding] = useState<Branding | null>(null);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await api<Me>("/api/mobile/me", { tenant: false });
      setUser(me.user);
      setTenants(me.memberships);
      return me;
    } catch {
      return null; // token ตาย/ออฟไลน์ — ฝั่งจอจัดการ redirect เอง
    }
  }, []);

  // bootstrap: อ่านธีมที่แคชไว้ก่อน (เฟรมแรกไม่กะพริบ) → token+tenant จาก SecureStore → ดึง me → เลือกกิจการ active ให้ valid เสมอ
  useEffect(() => {
    (async () => {
      try {
        const raw = await getCachedBrand();
        if (raw) setCachedBranding(JSON.parse(raw) as Branding | null);
      } catch {
        /* แคชเพี้ยน/ยังไม่เคยมี — ใช้ปริยาย C.blue ระหว่างรอ /me */
      }

      const t = await getToken();
      if (t) {
        setTok(t);
        const me = await loadMe();
        if (me) {
          const saved = await getTenantId();
          const valid = me.memberships.find((m) => m.tenantId === saved) ?? me.memberships[0] ?? null;
          if (valid) { await setTenantId(valid.tenantId); setActive(valid.tenantId); }
        }
      }
      setReady(true);
    })();
  }, [loadMe]);

  // ธีมจริงของกิจการ active (จาก /me) — ก่อน ready ให้เชื่อค่าที่แคชไว้แทน (เลี่ยงกะพริบระหว่างรอเน็ต)
  const realBranding = useMemo(
    () => tenants.find((t) => t.tenantId === activeTenantId)?.branding ?? null,
    [tenants, activeTenantId],
  );
  const activeBranding = ready ? realBranding : cachedBranding;

  // เขียนทับแคชทุกครั้งที่ธีมจริงเปลี่ยน (สลับกิจการ/ร้านแก้ธีม/login ใหม่) — รอบหน้าเปิดแอปจะไม่กะพริบ
  useEffect(() => {
    if (!ready) return;
    setCachedBrand(JSON.stringify(realBranding)).catch(() => {
      /* เขียนแคชพลาด (พื้นที่เก็บเต็ม ฯลฯ) — ไม่กระทบการใช้งานจริง แค่รอบหน้าอาจกะพริบ */
    });
  }, [ready, realBranding]);

  const signIn = useCallback(async (newToken: string) => {
    await setToken(newToken); // ลง SecureStore ก่อน — loadMe ใช้ token จาก store ได้ทันที
    const me = await loadMe();
    const first = me?.memberships[0] ?? null;
    if (first) { await setTenantId(first.tenantId); setActive(first.tenantId); }
    // ตั้ง state token เป็นลำดับสุดท้าย — Gate ต้องเห็น token พร้อมรายชื่อกิจการครบในเฟรมเดียว
    // (บั๊กเจ้าของเจอ: setTok ก่อน loadMe → เสี้ยววิที่ tenants ยัง [] → โดนเด้งเข้า /dna ทั้งที่มีกิจการ)
    setTok(newToken);
  }, [loadMe]);

  const signOut = useCallback(async () => {
    // ส่ง expoToken ไปด้วย → เซิร์ฟเวอร์ลบทะเบียนเครื่องนี้ทิ้ง
    // (ไม่ส่ง = เครื่องที่ออกจากระบบแล้วยังได้รับแจ้งเตือนของบัญชีเดิมต่อไป)
    let expoToken: string | null = null;
    try { expoToken = await currentPushToken(); } catch { /* ไม่มี token ก็ออกได้ */ }
    try {
      await api("/api/mobile/auth/logout", { body: expoToken ? { expoToken } : {}, tenant: false });
    } catch { /* ออฟไลน์ก็ออกได้ */ }
    resetPushRegistration();
    await clearSession();
    setTok(null); setUser(null); setTenants([]); setActive(null);
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    await setTenantId(tenantId);
    setActive(tenantId);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await loadMe();
    // กิจการใหม่เพิ่งสร้าง → ถ้ายังไม่มี active ให้ตั้งตัวแรก
    if (me && !activeTenantId && me.memberships[0]) {
      await setTenantId(me.memberships[0].tenantId);
      setActive(me.memberships[0].tenantId);
    }
  }, [loadMe, activeTenantId]);

  const value = useMemo(
    () => ({ ready, token, user, tenants, activeTenantId, activeBranding, signIn, signOut, switchTenant, refreshMe }),
    [ready, token, user, tenants, activeTenantId, activeBranding, signIn, signOut, switchTenant, refreshMe],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth ต้องอยู่ใต้ AuthProvider");
  return v;
}
