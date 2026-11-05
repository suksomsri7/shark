// ตัวสลับกิจการ (แบบ B1 · sec-b.jpg หน้า 1) — ชีต Airy วางทับทั้งจอ (Sheet absolute · Modal ของ RN-web ไม่เรนเดอร์ headless)
// รายการกิจการของผู้ใช้จาก /api/mobile/me (useAuth().tenants) · แตะ = switchTenant เดิมของ 1.0 (src/lib/auth-context)
// แถว "เลขาของฉัน" → /secretary/settings/secretary (B2) · "+ เพิ่มกิจการใหม่" → /business/new (G1) · ไม่มีรูปโปรไฟล์
// BusinessSwitcherHost ครอบ Stack ของโซน (secretary/customers/business _layout) → SecTopBar เรียก useBusinessSwitcher().open()
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Icon, Sheet } from "@/src/components/airy";
import { useAuth } from "@/src/lib/auth-context";
import { DEFAULT_SECRETARY_NAME, quotaNumbers, secGet, useSecretaryMe } from "@/src/api/secretary";
import { dateBkk } from "./bkk";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

type Switcher = { open: () => void; close: () => void; visible: boolean };
/** รากโซนที่กลับไปหลังสลับกิจการ (R-S2.1c) */
export type ZoneRoot = "/secretary" | "/customers";
const Ctx = createContext<Switcher | null>(null);
const NOOP: Switcher = { open: () => {}, close: () => {}, visible: false };

/** เปิด/ปิดตัวสลับกิจการ · นอก Host (เช่น gallery) = ไม่ทำอะไร */
export function useBusinessSwitcher(): Switcher {
  return useContext(Ctx) ?? NOOP;
}

/** ครอบ Stack ของโซน — ชีตอยู่ชั้นบนสุดของโซนนั้น */
export function BusinessSwitcherHost({ children, root = "/secretary" }: { children?: ReactNode; root?: ZoneRoot }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ open, close, visible }), [open, close, visible]);
  return (
    <Ctx.Provider value={value}>
      <View style={styles.host}>
        {children}
        <BusinessSwitcherSheet visible={visible} onClose={close} root={root} />
      </View>
    </Ctx.Provider>
  );
}

const ROLE_KEYS: Record<string, I18nKey> = { OWNER: "sec.role.OWNER", MANAGER: "sec.role.MANAGER", STAFF: "sec.role.STAFF" };

export function BusinessSwitcherSheet({ visible, onClose, root = "/secretary" }: { visible: boolean; onClose: () => void; root?: ZoneRoot }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { tenants, activeTenantId, switchTenant } = useAuth();
  const sec = useSecretaryMe();
  // S2.20 (หนี้ S2.7 · แบบ B1): แถบโควตางานของกิจการที่ใช้อยู่ — โหลดตอนเปิดชีต · พลาด/ไม่มีเพดาน = ไม่แสดง
  const [quota, setQuota] = useState<{ pct: number; reset: string | null } | null>(null);
  useEffect(() => {
    if (!visible || !activeTenantId) return;
    let live = true;
    secGet("secretary/quota")
      .then((q) => {
        const n = quotaNumbers(q);
        const d = dateBkk(n.resetAt);
        if (live) setQuota(n.limit > 0 ? { pct: n.pct, reset: d ? t("sec.switch.quotaReset", { d: d.date, m: d.month }) : null } : null);
      })
      .catch(() => live && setQuota(null));
    return () => {
      live = false;
    };
  }, [visible, activeTenantId, t]);

  // R-S2.1c: สลับสำเร็จ ⇒ ปิด stack ของโซน (ห้อง/ตั้งค่าของกิจการเดิมไม่ค้าง) แล้วไปรากโซน
  //   cache เลขา + badge ล้างเองใน useSecretaryZone (activeTenantId เปลี่ยน ⇒ resetSecretaryMe)
  async function pick(id: string) {
    if (id === activeTenantId) {
      onClose();
      return;
    }
    await switchTenant(id);
    onClose();
    if (router.canDismiss()) router.dismissAll();
    router.navigate(root);
  }
  function go(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <Sheet testID="sec-switcher" visible={visible} onClose={onClose} top={150}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <Text style={[styles.h, { color: c.text }]}>{t("sec.switch.title")}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.switch.sub")}</Text>

        {tenants.map((row) => {
          const on = row.tenantId === activeTenantId;
          const role = ROLE_KEYS[row.role];
          return (
            <Pressable
              testID={`sec-switch-tenant-${row.tenantId}`}
              key={row.tenantId}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => void pick(row.tenantId)}
              style={[glassStyle(c, radii.sugg), styles.row]}
            >
              <View style={[styles.mono, { backgroundColor: c.chip.bg }]}>
                <Text style={[styles.monoT, { color: c.text }]}>{row.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
                  {on ? t("sec.switch.active") : role ? t(role) : row.role}
                </Text>
              </View>
              {on ? <Icon name="check" size={18} color={c.text} /> : null}
            </Pressable>
          );
        })}

        <Pressable testID="sec-switch-add" accessibilityRole="button" onPress={() => go("/business/new")} style={[glassStyle(c, radii.sugg), styles.row]}>
          <View style={[styles.mono, styles.monoAdd, { borderColor: c.divider }]}>
            <Icon name="plus" size={16} color={c.textMuted} />
          </View>
          <Text style={[styles.name, styles.flex, { color: c.textDim }]}>{t("sec.switch.add")}</Text>
        </Pressable>

        <Pressable
          testID="sec-switch-my-secretary"
          accessibilityRole="button"
          onPress={() => go("/secretary/settings/secretary")}
          style={[glassStyle(c, radii.sugg), styles.row, styles.rowSlim]}
        >
          <Text style={[styles.meta, styles.flex, { color: c.text }]}>{t("sec.switch.mySecretary")}</Text>
          <Text style={[styles.meta, { color: c.textMuted }]}>{sec?.name ?? DEFAULT_SECRETARY_NAME}</Text>
          <Icon name="chevron-right" size={16} color={c.iconDim} />
        </Pressable>

        {quota ? (
          <View testID="sec-switch-quota" style={styles.quota}>
            <Text style={[styles.meta, { color: c.textMuted }]}>{t("sec.switch.quota", { n: quota.pct })}</Text>
            <View style={[styles.bar, { backgroundColor: c.divider }]}>
              <View style={[styles.barIn, { width: `${quota.pct}%`, backgroundColor: c.accent }]} />
            </View>
            {quota.reset ? <Text style={[styles.meta, { color: c.textMuted }]}>{quota.reset}</Text> : null}
          </View>
        ) : null}
        <Text style={[styles.note, { color: c.textMuted }]}>{t("sec.switch.note")}</Text>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  body: { paddingBottom: spacing.xl },
  flex: { flex: 1, minWidth: 0 },
  h: { fontSize: T.lt - 4, fontWeight: "700", lineHeight: 30, marginTop: spacing.xs },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: spacing.xs, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  rowSlim: { paddingVertical: spacing.md + 2 },
  mono: { width: 36, height: 36, borderRadius: radii.k, alignItems: "center", justifyContent: "center" },
  monoAdd: { borderWidth: 1.5, borderStyle: "dashed" },
  monoT: { fontSize: T.body, fontWeight: "700" },
  name: { fontSize: T.body, fontWeight: "600", lineHeight: 22 },
  meta: { fontSize: T.cap, lineHeight: 18 },
  note: { fontSize: T.cap, lineHeight: 19, marginTop: spacing.lg },
  quota: { marginTop: spacing.lg, gap: 6 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barIn: { height: 6, borderRadius: 3 },
});
