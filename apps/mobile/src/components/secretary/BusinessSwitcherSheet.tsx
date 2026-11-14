// ชีตกิจการ (แบบ bizsheet4 ขั้น 2–3 · เจ้าของอนุมัติ 14 พ.ย.) — ชีต Airy วางทับทั้งจอ (Sheet absolute · Modal ของ RN-web ไม่เรนเดอร์ headless)
// เปิดจากไอคอนกิจการ (BizIcon) ซ้ายสุดของแถบบน (SecTopBar) · มี 2 มุมมองในชีตเดียว (เปิดใหม่ = เริ่มที่ "เปิดระบบ" เสมอ)
// open("switch") = เริ่มที่มุมมอง ② (แถว "สลับกิจการ" ใน /secretary/settings)
// ① "เปิดระบบ" (systems): หัว = BizIcon วงกลมใหญ่ + ชื่อกิจการ (2 บรรทัด) + "คุณเป็น<บทบาท>" · ขวา 2 ปุ่มกลม
//     ⚙ = /business/<tenantId>/settings (เฉพาะ OWNER/MANAGER · BIZ_SETTING_ROLES) · ⇄ = ไปมุมมองเปลี่ยนกิจการ
//   ตาราง 4 คอลัมน์: ช่องแรก "หน้าหลัก" (/app) แล้วตามด้วยทุกระบบของกิจการ active จาก GET secretary/systems
//     (ทะเบียนเดียวกับเมนูเว็บ navSystems — ชุด/ลำดับ/ชื่อเดียวกัน) · ไอคอน Feather + สีตามรหัสระบบ (SYS_LOOK) · badge แดง = แชทลูกค้าที่ยังไม่อ่าน
//   แตะช่อง = ปิดชีต → หน้าระบบ "/" (WebView) ด้วย ?open=<href>&t=<nonce> (M3.11 OPEN_PATH_RE ใน app/(app)/index.tsx)
//   โหลดใหม่ทุกครั้งที่เปิดชีต (badge สด) · แคชต่อกิจการไว้วาดทันที · ล้ม = ข้อความ + ลองใหม่ (ช่อง "หน้าหลัก" ยังกดได้)
// ② "เปลี่ยนกิจการ" (switch): ‹ กลับ ① · หัว + "เลือกกิจการที่จะทำงาน" · แถวกิจการ (BizIcon วงกลม · ชื่อ · บทบาท หรือ "ใช้อยู่ตอนนี้")
//     แถวที่ใช้อยู่ = กรอบเข้ม + วงกลมทึบมี ✓ · อื่น = วงกลมว่าง · แตะ = switchTenant เดิมของ 1.0 (src/lib/auth-context)
//     → ปิด stack ของโซน (dismissAll) → หน้าเลขา /secretary ของกิจการนั้น (ทุกโซน รวมหน้าระบบ) · แถวเส้นประ "+ เพิ่มกิจการใหม่" → /business/new (G1)
// 14 พ.ย.: เอาแถว "เลขาของฉัน" และแถบโควตาออกจากชีตนี้ (ย้ายไปหน้าตั้งค่ากิจการ) · ไม่มีรูปโปรไฟล์ผู้ใช้
// BusinessSwitcherHost ครอบ Stack ของโซน (secretary/customers/business _layout + หน้าระบบ index) → SecTopBar เรียก useBusinessSwitcher().open()
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Icon, Sheet, type IconName } from "@/src/components/airy";
import { useAuth } from "@/src/lib/auth-context";
import { BIZ_SETTING_ROLES, secGet, type NavSystemRow } from "@/src/api/secretary";
import { BizIcon, badgeText } from "./SecTopBar";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** มุมมองของชีต: "systems" = เปิดระบบ (ปริยาย) · "switch" = เปลี่ยนกิจการ */
export type SheetView = "systems" | "switch";
/** open(view) — ไม่ส่ง/ส่งค่าอื่น (เช่น event ของ onPress) = "systems" */
type Switcher = { open: (view?: SheetView) => void; close: () => void; visible: boolean };
const Ctx = createContext<Switcher | null>(null);
const NOOP: Switcher = { open: () => {}, close: () => {}, visible: false };

/** เปิด/ปิดชีตกิจการ · นอก Host (เช่น gallery) = ไม่ทำอะไร */
export function useBusinessSwitcher(): Switcher {
  return useContext(Ctx) ?? NOOP;
}

/** ครอบ Stack ของโซน — ชีตอยู่ชั้นบนสุดของโซนนั้น */
export function BusinessSwitcherHost({ children }: { children?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [start, setStart] = useState<SheetView>("systems");
  const open = useCallback((view?: SheetView) => {
    setStart(view === "switch" ? "switch" : "systems");
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ open, close, visible }), [open, close, visible]);
  return (
    <Ctx.Provider value={value}>
      <View style={styles.host}>
        {children}
        <BusinessSwitcherSheet visible={visible} onClose={close} startView={start} />
      </View>
    </Ctx.Provider>
  );
}

const ROLE_KEYS: Record<string, I18nKey> = { OWNER: "sec.role.OWNER", MANAGER: "sec.role.MANAGER", STAFF: "sec.role.STAFF" };

/** ไอคอน Feather + สีของแต่ละรหัสระบบ (UnitType / SystemType / หน้า fixed) — สีชุดเดียวกับแบบ bizsheet4 · รหัสใหม่ที่ยังไม่รู้จัก = grid เทา */
const SYS_LOOK: Record<string, { icon: IconName; color: string }> = {
  HOTEL: { icon: "key", color: "#6A4FD8" },
  RESTAURANT: { icon: "coffee", color: "#E07A1F" },
  SHOP: { icon: "shopping-bag", color: "#D9488F" },
  BOOKING: { icon: "calendar", color: "#178A99" },
  QUEUE: { icon: "hash", color: "#3A7BD5" },
  TICKET: { icon: "tag", color: "#C2456B" },
  MEMBER: { icon: "user", color: "#5B5FD6" },
  REWARD: { icon: "gift", color: "#D9488F" },
  COUPON: { icon: "percent", color: "#E5484D" },
  POINT: { icon: "star", color: "#E08A00" },
  CHAT: { icon: "message-square", color: "#2F9E5B" },
  MEETING: { icon: "message-circle", color: "#3A7BD5" },
  ACCOUNT: { icon: "file-text", color: "#1E7A8F" },
  KANBAN: { icon: "clipboard", color: "#B8860B" },
  POS: { icon: "shopping-cart", color: "#E07A1F" },
  CRM: { icon: "target", color: "#C2456B" },
  KB: { icon: "book-open", color: "#2F7DE1" },
  HR: { icon: "briefcase", color: "#8A5CD1" },
  INVENTORY: { icon: "box", color: "#E07A1F" },
  MARKETING: { icon: "volume-2", color: "#E5484D" },
  RENTAL: { icon: "truck", color: "#2F9E5B" },
  SCHOOL: { icon: "award", color: "#5B5FD6" },
  CLINIC: { icon: "activity", color: "#E5484D" },
  PAGES: { icon: "layout", color: "#666666" },
};
const SYS_FALLBACK = { icon: "grid" as IconName, color: "#666666" };

/** แคชรายการระบบต่อกิจการ (วาดทันทีตอนเปิดชีตครั้งถัดไป · โหลดใหม่ทับเสมอ) */
const systemsCache = new Map<string, NavSystemRow[]>();

export function BusinessSwitcherSheet({ visible, onClose, startView = "systems" }: { visible: boolean; onClose: () => void; startView?: SheetView }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { tenants, activeTenantId, switchTenant } = useAuth();
  const [view, setView] = useState<SheetView>(startView);
  const [systems, setSystems] = useState<NavSystemRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  // เปิดชีตใหม่ = เริ่มที่ "เปิดระบบ" (หรือ "เปลี่ยนกิจการ" เมื่อเปิดด้วย open("switch") เช่น แถว "สลับกิจการ" ในตั้งค่า)
  useEffect(() => {
    if (visible) setView(startView);
  }, [visible, startView]);

  // โหลดระบบของกิจการ active ทุกครั้งที่เปิดชีต/สลับกิจการ — ระหว่างโหลดแสดงแคชของกิจการนี้เท่านั้น (ไม่โชว์ของร้านเดิม)
  useEffect(() => {
    if (!visible || !activeTenantId) return;
    let live = true;
    setSystems(systemsCache.get(activeTenantId) ?? null);
    setFailed(false);
    secGet("secretary/systems")
      .then((r) => {
        const items = Array.isArray(r?.items) ? r.items : [];
        systemsCache.set(activeTenantId, items);
        if (live) setSystems(items);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [visible, activeTenantId, reload]);

  const me = tenants.find((x) => x.tenantId === activeTenantId);
  const name = me?.name ?? t("sec.tenant.fallback");
  const roleKey = me ? ROLE_KEYS[me.role] : undefined;
  const role = roleKey ? t(roleKey) : (me?.role ?? "");
  const canSet = !!me && BIZ_SETTING_ROLES.includes(me.role);

  /** เปิดระบบใน WebView หน้าระบบ ("/") — t = nonce ให้แตะช่องเดิมซ้ำแล้วยังเปิดอีก */
  function openSystem(href: string) {
    onClose();
    router.navigate({ pathname: "/", params: { open: encodeURI(href), t: String(Date.now()) } });
  }
  function go(path: string) {
    onClose();
    router.push(path);
  }
  // R-S2.1c: สลับสำเร็จ ⇒ ปิด stack ของโซน (ห้อง/ตั้งค่าของกิจการเดิมไม่ค้าง) แล้วไปหน้าเลขาของกิจการนั้น (bizsheet4 ขั้น 3)
  //   cache เลขา + badge ล้างเองใน useSecretaryZone (activeTenantId เปลี่ยน ⇒ resetSecretaryMe) · หน้าระบบ reload เองเมื่อ activeTenantId เปลี่ยน
  async function pick(id: string) {
    if (id === activeTenantId) {
      onClose();
      return;
    }
    await switchTenant(id);
    onClose();
    if (router.canDismiss()) router.dismissAll();
    router.navigate("/secretary");
  }

  const tiles: { key: string; label: string; icon: IconName; color: string; badge: number; href: string }[] = [
    { key: "home", label: t("sec.sheet.home"), icon: "home", color: c.text, badge: 0, href: "/app" },
    ...(systems ?? []).map((s) => {
      const look = SYS_LOOK[s.code] ?? SYS_FALLBACK;
      return { key: s.key, label: s.label, icon: look.icon, color: look.color, badge: s.badge, href: s.href };
    }),
  ];

  return (
    <Sheet testID="sec-switcher" visible={visible} onClose={onClose} top={130}>
      {view === "systems" ? (
        <ScrollView testID="sec-sheet-systems" showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <View style={styles.head}>
            <BizIcon sz={56} chevron={false} />
            <View style={styles.flex}>
              <Text testID="sec-sheet-name" style={[styles.bizName, { color: c.text }]} numberOfLines={2}>
                {name}
              </Text>
              {role ? <Text style={[styles.meta, { color: c.textMuted }]}>{t("sec.sheet.youAre", { role })}</Text> : null}
            </View>
            {canSet && activeTenantId ? (
              <Pressable
                testID="sec-sheet-settings"
                accessibilityRole="button"
                accessibilityLabel={t("bizset.gear", { name })}
                hitSlop={6}
                onPress={() => go(`/business/${encodeURIComponent(activeTenantId)}/settings`)}
                style={[styles.round, { backgroundColor: c.chip.bg }]}
              >
                <Icon name="settings" size={19} color={c.textDim} />
              </Pressable>
            ) : null}
            <Pressable
              testID="sec-sheet-switch"
              accessibilityRole="button"
              accessibilityLabel={t("sec.top.switch")}
              hitSlop={6}
              onPress={() => setView("switch")}
              style={[styles.round, { backgroundColor: c.chip.bg }]}
            >
              <Icon name="repeat" size={18} color={c.textDim} />
            </Pressable>
          </View>

          <Text style={[styles.h3, { color: c.text }]}>{t("sec.sheet.open")}</Text>
          <View style={styles.grid}>
            {tiles.map((x) => {
              const n = badgeText(x.badge);
              return (
                <Pressable
                  key={x.key}
                  testID={`sec-sheet-sys-${x.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={n ? `${x.label} · ${t("sec.sheet.unread", { n: x.badge })}` : x.label}
                  onPress={() => openSystem(x.href)}
                  style={styles.tile}
                >
                  <View style={[styles.tileIc, { backgroundColor: x.key === "home" ? c.chip.bg : `${x.color}1A` }]}>
                    <Icon name={x.icon} size={23} color={x.color} />
                    {n ? (
                      <View testID={`sec-sheet-sys-${x.key}-badge`} pointerEvents="none" style={[styles.badge, { backgroundColor: c.bad.fg, borderColor: c.surface }]}>
                        <Text style={[styles.badgeT, { color: c.onSys }]}>{n}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.tileT, { color: c.textDim }]} numberOfLines={2}>
                    {x.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {systems === null && !failed ? <ActivityIndicator testID="sec-sheet-loading" style={styles.state} size="small" color={c.iconDim} /> : null}
          {failed && systems === null ? (
            <Pressable testID="sec-sheet-retry" accessibilityRole="button" onPress={() => setReload((k) => k + 1)} style={[glassStyle(c, radii.sugg), styles.row, styles.state]}>
              <Icon name="wifi-off" size={18} color={c.warn.fg} />
              <Text style={[styles.meta, styles.flex, { color: c.text }]}>{t("sec.state.error")}</Text>
              <Icon name="rotate-cw" size={16} color={c.iconDim} />
            </Pressable>
          ) : null}
          {systems !== null && systems.length === 0 ? <Text style={[styles.meta, styles.state, { color: c.textMuted }]}>{t("sec.sheet.empty")}</Text> : null}
        </ScrollView>
      ) : (
        <ScrollView testID="sec-sheet-switcher" showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <View style={styles.switchHead}>
            <Pressable
              testID="sec-sheet-back"
              accessibilityRole="button"
              accessibilityLabel={t("sec.sheet.back")}
              hitSlop={6}
              onPress={() => setView("systems")}
              style={[styles.round, { backgroundColor: c.chip.bg }]}
            >
              <Icon name="chevron-left" size={20} color={c.text} />
            </Pressable>
            <Text style={[styles.h, { color: c.text }]}>{t("sec.switch.title")}</Text>
          </View>
          <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.switch.sub")}</Text>

          {tenants.map((row) => {
            const on = row.tenantId === activeTenantId;
            const rk = ROLE_KEYS[row.role];
            return (
              <Pressable
                testID={`sec-switch-tenant-${row.tenantId}`}
                key={row.tenantId}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                onPress={() => void pick(row.tenantId)}
                style={[glassStyle(c, radii.sugg), styles.row, on && { borderWidth: 2, borderColor: c.text }]}
              >
                <BizIcon tenantId={row.tenantId} sz={40} chevron={false} />
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
                    {on ? t("sec.switch.active") : rk ? t(rk) : row.role}
                  </Text>
                </View>
                {on ? (
                  <View style={[styles.radio, { backgroundColor: c.text, borderColor: c.text }]}>
                    <Icon name="check" size={14} color={c.surface} />
                  </View>
                ) : (
                  <View style={[styles.radio, { borderColor: c.iconDim }]} />
                )}
              </Pressable>
            );
          })}

          <Pressable testID="sec-switch-add" accessibilityRole="button" onPress={() => go("/business/new")} style={[styles.row, styles.add, { borderColor: c.divider }]}>
            <Icon name="plus" size={18} color={c.textMuted} />
            <Text style={[styles.name, styles.flex, { color: c.textDim }]}>{t("sec.switch.add")}</Text>
          </Pressable>
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  body: { paddingBottom: spacing.xl },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  bizName: { fontSize: T.h + 2, fontWeight: "800", lineHeight: 24 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  h3: { fontSize: T.body, fontWeight: "700", marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg },
  tile: { width: "25%", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  tileIc: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tileT: { fontSize: T.cap, lineHeight: 16, textAlign: "center" },
  badge: { position: "absolute", top: -5, right: -7, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
  state: { marginTop: spacing.lg },
  switchHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  h: { fontSize: T.lt - 4, fontWeight: "700", lineHeight: 30 },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  add: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: radii.sugg, paddingVertical: spacing.lg },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  name: { fontSize: T.body, fontWeight: "600", lineHeight: 22 },
  meta: { fontSize: T.cap, lineHeight: 18 },
});
