// LekaaFabHost — ติดตั้งครั้งเดียวที่ app/(app)/_layout.tsx (ครอบ Drawer) · ปุ่มลอย + แผ่น Lekaa · API ต่อจอ/คำอธิบายเต็มอยู่หัวไฟล์ ./core.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useZoneBadgeCounts, type PageContext } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { FabButton, LEKAA_BOTTOM, LEKAA_FAB_SIZE, LEKAA_HIDE_ROUTES, LEKAA_RIGHT, LekaaCtx, routeContext, type HostApi, type ScreenCtx } from "./core";
import { LekaaSheet } from "./LekaaSheet";

export { LEKAA_FAB_SIZE, LEKAA_SLOT_GAP, LekaaFabSlot, routeContext, useLekaa, useLekaaFabHidden, useLekaaFabOffset, useLekaaPageContext, useLekaaSuppress } from "./core";

export function LekaaFabHost({ children }: { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { activeTenantId } = useAuth();
  const counts = useZoneBadgeCounts();
  const [visible, setVisible] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [hidden, setHiddenMap] = useState<Record<string, boolean>>({});
  const [slots, setSlots] = useState<Record<string, number>>({});
  const [suppressed, setSuppressed] = useState(0);
  const screenCtx = useRef<ScreenCtx | null>(null);
  const [captured, setCaptured] = useState<PageContext | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const open = useCallback(() => {
    // จับ "หน้าที่เปิดอยู่" ตอนแตะ — จอบอกเอง (เส้นทางเดียวกัน) ชนะ · ไม่งั้นเดาจากเส้นทาง
    const sc = screenCtx.current;
    setCaptured(sc && sc.path === pathRef.current && sc.ctx ? sc.ctx : routeContext(pathRef.current, paramsRef.current));
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  // เปลี่ยนจอ/กิจการ = ปิดแผ่น (แผ่นเป็นของหน้าที่เปิดอยู่ตอนแตะ)
  useEffect(() => setVisible(false), [pathname, activeTenantId]);

  const api = useMemo<HostApi>(
    () => ({
      open,
      close,
      visible,
      setOffset: (path, px) =>
        setOffsets((o) => {
          const n = { ...o };
          if (px === null) delete n[path];
          else n[path] = px;
          return n;
        }),
      setHidden: (path, on) => setHiddenMap((o) => ({ ...o, [path]: on })),
      setSlot: (path, on) => setSlots((o) => ({ ...o, [path]: Math.max(0, (o[path] ?? 0) + (on ? 1 : -1)) })),
      setScreenCtx: (v) => {
        screenCtx.current = v;
      },
      suppress: (on) => setSuppressed((n) => Math.max(0, n + (on ? 1 : -1))),
    }),
    [open, close, visible],
  );

  const show =
    !!activeTenantId && !visible && suppressed === 0 && !hidden[pathname] && !(slots[pathname] > 0) && !LEKAA_HIDE_ROUTES.some((re) => re.test(pathname));
  const bottom = insets.bottom + LEKAA_BOTTOM + (offsets[pathname] ?? 0);

  return (
    <LekaaCtx.Provider value={api}>
      <View style={styles.host}>
        {children}
        {show ? <FabButton testID="lekaa-fab" size={LEKAA_FAB_SIZE} onPress={open} badge={counts.secretary} style={[styles.float, { bottom, right: LEKAA_RIGHT + insets.right }]} /> : null}
        <LekaaSheet visible={visible} onClose={close} pageContext={captured} />
      </View>
    </LekaaCtx.Provider>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  float: { position: "absolute" },
});
