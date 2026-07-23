// สถานะ auth กลางของแอป — token/กิจการ active/รายชื่อกิจการ + bootstrap จาก SecureStore ตอนเปิดแอป
// กติกา flow (คำสั่งเจ้าของ): เปิดแอปบังคับ login → มี token แต่ไม่มีกิจการ → DNA Wizard สร้างกิจการแรก
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/src/api/client";
import { clearSession, getTenantId, getToken, setTenantId, setToken } from "@/src/lib/session";

export type TenantRow = { tenantId: string; name: string; role: string };
type Me = { user: { id: string; email: string; name: string | null }; memberships: TenantRow[] };

type AuthState = {
  ready: boolean; // bootstrap จาก SecureStore เสร็จหรือยัง (ก่อน ready อย่าเพิ่ง redirect)
  token: string | null;
  user: Me["user"] | null;
  tenants: TenantRow[];
  activeTenantId: string | null;
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

  // bootstrap: อ่าน token+tenant จาก SecureStore → ดึง me → เลือกกิจการ active ให้ valid เสมอ
  useEffect(() => {
    (async () => {
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

  const signIn = useCallback(async (newToken: string) => {
    await setToken(newToken);
    setTok(newToken);
    const me = await loadMe();
    const first = me?.memberships[0] ?? null;
    if (first) { await setTenantId(first.tenantId); setActive(first.tenantId); }
  }, [loadMe]);

  const signOut = useCallback(async () => {
    try { await api("/api/mobile/auth/logout", { body: {}, tenant: false }); } catch { /* ออฟไลน์ก็ออกได้ */ }
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
    () => ({ ready, token, user, tenants, activeTenantId, signIn, signOut, switchTenant, refreshMe }),
    [ready, token, user, tenants, activeTenantId, signIn, signOut, switchTenant, refreshMe],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth ต้องอยู่ใต้ AuthProvider");
  return v;
}
