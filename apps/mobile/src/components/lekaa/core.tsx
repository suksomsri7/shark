// แกนของปุ่มลอย Lekaa (context + ฮุกต่อจอ + ปุ่ม/slot) — Host อยู่ที่ ./LekaaFab.tsx (แยกไฟล์กันวง import: LekaaSheet → RoomView → ฮุกในไฟล์นี้)
// ปุ่มลอย Lekaa + แผ่น Lekaa (เจ้าของอนุมัติแบบ fab6 จอ 1–3 + fab4 จอ 3 · 15 พ.ย.) — ติดตั้งครั้งเดียวที่ app/(app)/_layout.tsx (LekaaFabHost)
//
// ปุ่ม: วงกลมขาว ~62px โลโก้ Lekaa นิ่ง เงาม่วงอ่อน มุมขวาล่างเหนือ safe area — ทุกจอในกิจการ (เลขา/ลูกค้า/ทีม/ปฏิทิน/ช่วยเหลือ/กิจการ/ตั้งค่า + หน้าระบบ WebView)
//   แตะ = แผ่น Lekaa (LekaaSheet) · ตัวเลขแดงบนปุ่ม = รายการรออนุมัติ (badge เดิมของไอคอนเลขาที่ถูกถอดจากแถบบน)
// API ต่อจอ (เลนอื่น เช่น แชททีม ใช้ได้โดยไม่ต้องแตะไฟล์นี้):
//   useLekaaFabOffset(px)        — จอที่มีของล่างลอย (ปุ่มยาว/แถบ) ยกปุ่มขึ้น px เหนือตำแหน่งปกติ · มีผลเฉพาะตอนจอ focus
//   <LekaaFabSlot />              — จอแชท (มีช่องพิมพ์): วางปุ่มไว้ "แถวเดียวกับช่องพิมพ์ ด้านขวา" (แบบ team4 จอ 4) — ปุ่มลอยซ่อนเอง
//                                   ขนาดนอกสุด (รวมวงแหวน) = ความสูงช่องพิมพ์ (`size.inputH` หรือ prop `size`) · จัดชิดล่างแนวเดียวกับช่องพิมพ์
//                                   ช่องพิมพ์หดเองเพราะอยู่ใน row เดียวกัน: <View style={{flexDirection:"row", alignItems:"flex-end", gap:LEKAA_SLOT_GAP}}><InputBar style={{flex:1}}/><LekaaFabSlot/></View>
//   useLekaaFabHidden(hidden?)    — ซ่อนปุ่มบนจอนี้ (เช่น วิซาร์ด/จอที่มีปุ่มหลักล่างเต็มกว้าง)
//   useLekaaPageContext(ctx|null) — จอบอก "หน้าที่ผู้ใช้เปิดอยู่" เอง (หน้าระบบ WebView ส่งจากข้อความ page-context ของเว็บ) ·
//                                   ไม่บอก = Host เดาจากเส้นทาง (routeContext: /customers/<id> · /secretary/staff/<id> · ปฏิทิน ?day=)
//   useLekaa().open()             — เปิดแผ่นจากที่อื่น
// ปุ่มซ่อนเองเมื่อ: แผ่น Lekaa เปิด · มีชีต Airy เปิดอยู่ (Sheet เรียก useLekaaSuppress) · จอนั้นวาง LekaaFabSlot · เส้นทางในรายการ HIDE_ROUTES
//   (แชท AI รุ่นเดิม /chat/<id> · ตั้งชื่อเลขาครั้งแรก · สร้างกิจการ — จอเหล่านี้มีช่องพิมพ์/ปุ่มหลักล่างและไม่ได้วาง slot)
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect, useIsFocused, usePathname } from "expo-router";
import { Text } from "@/src/components/ui/text";
import type { PageContext } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { shadow, useTheme } from "@/src/theme/index";
import { size as SZ } from "@/src/theme/tokens";
import { LekaaLogo } from "./LekaaLogo";

/** ขนาดปุ่มลอย (แบบ fab6 .fab 62px) */
export const LEKAA_FAB_SIZE = 62;
/** ระยะห่างระหว่างช่องพิมพ์กับปุ่มในแถวเดียวกัน (team4 จอ 4: ช่องพิมพ์หดด้านขวา ≈ ขนาดปุ่ม + 10..26) */
export const LEKAA_SLOT_GAP = 10;
export const LEKAA_RIGHT = 20;
export const LEKAA_BOTTOM = 18;
/** เส้นทางที่ไม่มีปุ่ม (ไม่ได้วาง slot แต่มีช่องพิมพ์/ปุ่มหลักล่าง) */
export const LEKAA_HIDE_ROUTES = [/^\/chat\//, /^\/secretary\/onboarding/, /^\/business\/new/, /^\/dna/];

export type ScreenCtx = { path: string; ctx: PageContext | null };
export type HostApi = {
  open: () => void;
  close: () => void;
  visible: boolean;
  setOffset: (path: string, px: number | null) => void;
  setHidden: (path: string, on: boolean) => void;
  setSlot: (path: string, on: boolean) => void;
  setScreenCtx: (v: ScreenCtx | null) => void;
  suppress: (on: boolean) => void;
};
export const LekaaCtx = createContext<HostApi | null>(null);

/** เปิด/ปิดแผ่น Lekaa · นอก Host (เช่น gallery) = ไม่ทำอะไร */
export function useLekaa(): { open: () => void; close: () => void; visible: boolean } {
  const h = useContext(LekaaCtx);
  return h ?? { open: () => {}, close: () => {}, visible: false };
}

/** ยกปุ่มลอยขึ้น px บนจอนี้ (เฉพาะตอน focus) */
export function useLekaaFabOffset(px: number) {
  const h = useContext(LekaaCtx);
  const path = usePathname();
  useFocusEffect(
    useCallback(() => {
      h?.setOffset(path, px);
      return () => h?.setOffset(path, null);
    }, [h, path, px]),
  );
}

/** ซ่อนปุ่มบนจอนี้ (เฉพาะตอน focus) */
export function useLekaaFabHidden(hidden = true) {
  const h = useContext(LekaaCtx);
  const path = usePathname();
  useFocusEffect(
    useCallback(() => {
      h?.setHidden(path, hidden);
      return () => h?.setHidden(path, false);
    }, [h, path, hidden]),
  );
}

/** จอบอกหน้าที่เปิดอยู่เอง (null = ให้ Host เดาจากเส้นทาง) — ค่าใหม่แทนที่ทันทีขณะ focus */
export function useLekaaPageContext(ctx: PageContext | null) {
  const h = useContext(LekaaCtx);
  const path = usePathname();
  const key = ctx ? JSON.stringify(ctx) : "";
  const focused = useIsFocused();
  useEffect(() => {
    if (!h || !focused) return;
    h.setScreenCtx(key ? { path, ctx: JSON.parse(key) as PageContext } : null);
    return () => h.setScreenCtx(null);
  }, [h, path, key, focused]);
}

/** ชีต/แผ่นอื่นที่วาดทับจอ (Sheet ของ airy) — ระหว่างเปิดซ่อนปุ่มลอย (ไม่บังปุ่มของชีต) */
export function useLekaaSuppress(on: boolean) {
  const h = useContext(LekaaCtx);
  useEffect(() => {
    if (!h || !on) return;
    h.suppress(true);
    return () => h.suppress(false);
  }, [h, on]);
}

/** ปุ่ม Lekaa ในแถวเดียวกับช่องพิมพ์ (จอแชท · team4 จอ 4) — ขนาดนอกสุด = ความสูงช่องพิมพ์ */
export function LekaaFabSlot({ size = SZ.inputH, style, testID = "lekaa-fab-slot" }: { size?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const h = useContext(LekaaCtx);
  const path = usePathname();
  const focused = useIsFocused();
  useEffect(() => {
    if (!h || !focused) return;
    h.setSlot(path, true);
    return () => h.setSlot(path, false);
  }, [h, path, focused]);
  if (!h) return null;
  return <FabButton testID={testID} size={size} onPress={h.open} style={style} />;
}

export function FabButton({ size, onPress, style, testID, badge }: { size: number; onPress: () => void; style?: StyleProp<ViewStyle>; testID: string; badge?: number }) {
  const { c } = useTheme();
  const t = useT();
  // วงแหวนม่วงจาง 2px อยู่ "ใน" ขนาดนอกสุด (แบบ: 0 0 0 2px rgba(124,102,234,.15)) — ขนาดรวมวงแหวน = size พอดี
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t("lekaa.open")}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.fab,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.lekaa.fabBg, borderColor: c.lekaa.ring },
        shadow(c.lekaa.shadow),
        style,
      ]}
    >
      <LekaaLogo size={Math.round(size * 0.48)} />
      {badge && badge > 0 ? (
        <View pointerEvents="none" testID={`${testID}-badge`} style={[styles.badge, { backgroundColor: c.danger.bg, borderColor: c.surface }]}>
          <Text style={[styles.badgeT, { color: c.danger.fg }]}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** หน้าที่เปิดอยู่จากเส้นทางของจอ native (pure) — ใช้เมื่อจอไม่ได้บอกเอง */
export function routeContext(pathname: string, params: Record<string, string | string[] | undefined>): PageContext {
  const route = pathname.replace(/^\/+/, "") || "index";
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  let m = /^customers\/([^/]+)/.exec(route);
  if (m) return { route: "customers/[id]", entity: { type: "CHAT", id: decodeURIComponent(m[1]!) } };
  m = /^secretary\/staff\/([^/]+)$/.exec(route);
  if (m && m[1] !== "invite") return { route: "secretary/staff/[membershipId]", entity: { type: "STAFF", id: decodeURIComponent(m[1]!) } };
  const day = one(params.day);
  if (/^secretary\/calendar/.test(route) && /^\d{4}-\d{2}-\d{2}$/.test(day)) return { route: "secretary/calendar", entity: { type: "CAL_DAY", id: day } };
  return { route: route.replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, "/[id]") };
}


const styles = StyleSheet.create({
  fab: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
});

/** ความสูงคีย์บอร์ดที่เปิดอยู่ (0 = ปิด) */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      const kh = e.endCoordinates?.height ?? 0; // อ่านค่าจาก event ทันที (ห้ามอ่านในตัวอัปเดต state)
      setH(kh);
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

/**
 * กรอบกันคีย์บอร์ดบังช่องพิมพ์ (17 พ.ย. · เจ้าของแจ้งจากเครื่องจริง: สั่งงานในแผ่น Lekaa แล้วคีย์บอร์ดปิดช่องพิมพ์)
 *   inSheet = อยู่ในแผ่นที่ชิดขอบล่างจอ ⇒ เว้นล่างเท่าความสูงคีย์บอร์ดเอง (ลบ `bottomInset` ที่พ่อเว้นไว้แล้ว)
 *     — KeyboardAvoidingView คิดจากตำแหน่งของตัวเองในพ่อ ไม่ใช่ในจอ ⇒ ในแผ่นที่เริ่มกลางจอจะเว้นไม่พอ
 *   ไม่ inSheet = KeyboardAvoidingView แบบเดิมของจอเต็ม
 */
export function KeyboardFrame({ inSheet, bottomInset = 0, style, children }: { inSheet: boolean; bottomInset?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const kb = useKeyboardHeight();
  if (!inSheet) {
    return (
      <KeyboardAvoidingView style={style} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={[style, { paddingBottom: Math.max(0, kb - bottomInset) }]}>{children}</View>;
}
