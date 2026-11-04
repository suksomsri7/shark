// แถบบนของแอปเลขา 3 โซน (แบบ §10 "แถบบนทุกหน้า" · sec-k.jpg · มติ 14/16 · R1 R2) — ขยาย components/airy/TopBar
// ซ้าย 3 ปุ่มโซน: เลขา (message-circle → /secretary) · ลูกค้า (inbox → /customers) · ทีม (users → /secretary/staff)
//   ปุ่มของโซนปัจจุบัน = พื้นทึบสีโซน (accent / zone.customers / zone.team ใน src/theme) · badge ต่อปุ่ม (≤ 99 · มีจุดเมื่อ > 0)
// ขวา: ? (help-circle → /secretary/help) + ปุ่ม + ตามโซน: เลขา → /secretary/new · ลูกค้า = ไม่มี + · ทีม → /secretary/staff/invite
// กลาง: ชื่อกิจการ active (จาก /api/mobile/me) + ลูกศรเล็ก แตะ = ตัวสลับกิจการ (BusinessSwitcherSheet) · `center="none"` = ว่าง (จอ A1/C3 วางชื่อใหญ่เอง)
// ไม่มีรูปโปรไฟล์ · ไอคอน Feather เท่านั้น (R-UI2) · badges ไม่ส่งมา ⇒ อ่าน store กลาง useZoneBadgeCounts (layout โหลด secretary/inbox/count · inbox/unread) พลาด = 0
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Icon, IconBtn, TopBar, type IconName } from "@/src/components/airy";
import { useAuth } from "@/src/lib/auth-context";
import { useZoneBadgeCounts } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme, type ZoneKey } from "@/src/theme/index";
import { size, type as T } from "@/src/theme/tokens";
import { useBusinessSwitcher } from "./BusinessSwitcherSheet";

export type SecZone = ZoneKey; // "secretary" | "customers" | "team"
export type ZoneBadges = { secretary?: number; customers?: number; team?: number };

const ZONES: { zone: SecZone; icon: IconName; path: string; label: I18nKey }[] = [
  { zone: "secretary", icon: "message-circle", path: "/secretary", label: "sec.zone.secretary" },
  { zone: "customers", icon: "inbox", path: "/customers", label: "sec.zone.customers" },
  { zone: "team", icon: "users", path: "/secretary/staff", label: "sec.zone.team" },
];

/** ปุ่ม + ของแต่ละโซน (ลูกค้า = ไม่มี) */
const PLUS: Record<SecZone, { path: string; label: I18nKey } | null> = {
  secretary: { path: "/secretary/new", label: "sec.top.new" },
  customers: null,
  team: { path: "/secretary/staff/invite", label: "sec.top.invite" },
};

/** ตัวเลขบน badge: 0 = ไม่แสดง · เกิน 99 = "99+" */
export function badgeText(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}

export function SecTopBar({
  zone,
  badges,
  center = "tenant",
  testID = "sec-top",
}: {
  zone: SecZone;
  /** ใส่มา = ใช้ค่านี้ (ไม่ดึงเอง) */
  badges?: ZoneBadges;
  /** "tenant" = ชื่อกิจการแตะได้ · "none" = ว่าง */
  center?: "tenant" | "none";
  testID?: string;
}) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const switcher = useBusinessSwitcher();
  const shared = useZoneBadgeCounts(); // R-S2.1e: store กลาง (โหลดที่ layout ของโซน) ไม่ยิงต่อ mount
  const counts = badges ?? shared;
  const plus = PLUS[zone];

  return (
    <TopBar
      testID={testID}
      left={ZONES.map((z) => {
        const n = badgeText(counts[z.zone]);
        return (
          <View key={z.zone} style={styles.slot}>
            <IconBtn
              testID={`sec-top-${z.zone}`}
              icon={z.icon}
              zone={z.zone}
              on={z.zone === zone}
              label={t(z.label)}
              onPress={() => router.navigate(z.path)}
            />
            {n ? (
              <View testID={`sec-top-${z.zone}-badge`} pointerEvents="none" style={[styles.badge, { backgroundColor: c.status.wait, borderColor: c.surface }]}>
                <Text style={[styles.badgeT, { color: c.zone.onZone }]}>{n}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      center={center === "tenant" ? <TenantTitle onPress={switcher.open} /> : undefined}
      right={
        <>
          <IconBtn testID="sec-top-help" icon="help-circle" label={t("sec.top.help")} onPress={() => router.push("/secretary/help")} />
          {plus ? <IconBtn testID="sec-top-new" icon="plus" label={t(plus.label)} onPress={() => router.push(plus.path)} /> : null}
        </>
      }
    />
  );
}

/** ชื่อกิจการ active + ลูกศรลง · `big` = หัวใหญ่ของ A1/C3 (ใต้แถบบน) */
export function TenantTitle({ onPress, big = false, testID }: { onPress?: () => void; big?: boolean; testID?: string }) {
  const { c } = useTheme();
  const t = useT();
  const switcher = useBusinessSwitcher();
  const { tenants, activeTenantId } = useAuth();
  const name = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  return (
    <Pressable
      testID={testID ?? (big ? "sec-tenant" : "sec-top-tenant")}
      accessibilityRole="button"
      accessibilityLabel={t("sec.top.switch")}
      onPress={onPress ?? switcher.open}
      style={[styles.tenant, big && styles.tenantBig]}
    >
      <Text style={[big ? styles.bigT : styles.smallT, { color: c.text }]} numberOfLines={1}>
        {name}
      </Text>
      <Icon name="chevron-down" size={big ? 22 : 14} color={c.iconDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { width: size.iconBtn, height: size.iconBtn },
  badge: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 1.5, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
  tenant: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  tenantBig: { gap: 6, alignSelf: "flex-start" },
  smallT: { fontSize: T.sub, fontWeight: "600", flexShrink: 1 },
  bigT: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 36, flexShrink: 1 },
});
