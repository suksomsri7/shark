// แถบบนของแอปเลขา 3 โซน (แบบ §10 "แถบบนทุกหน้า" · sec-k.jpg · มติ 14/16 · R1 R2) — ขยาย components/airy/TopBar
// ซ้าย 3 ปุ่มโซน: เลขา (message-circle → /secretary) · ลูกค้า (inbox → /customers) · ทีม (users → /secretary/staff)
//   ปุ่มของโซนปัจจุบัน = พื้นทึบสีโซน (accent / zone.customers / zone.team ใน src/theme) · badge ต่อปุ่ม (≤ 99 · มีจุดเมื่อ > 0)
// ขวา: ? (help-circle → /secretary/help) + ปุ่ม + ตามโซน: เลขา → /secretary/new · ลูกค้า = ไม่มี + · ทีม → /secretary/staff/invite
// กลาง: ชื่อกิจการ active (จาก /api/mobile/me) + ลูกศรเล็ก แตะ = ตัวสลับกิจการ (BusinessSwitcherSheet) · `center="none"` = ว่าง (จอ A1/C3 วางชื่อใหญ่เอง)
// 14 พ.ย. (เจ้าของสั่ง): ชื่อกิจการย้ายเป็นไอคอนกิจการ (BizIcon) ซ้ายสุดของแถบ แตะ = ตัวสลับกิจการ · ไอคอนเลขา = รูปคน (user)
// 14 พ.ย. รอบ 2 (เจ้าของสั่ง): ซ้าย = [กิจการ] [เลขา][ลูกค้า][ทีม][ระบบ][?] · ขวา = ปุ่ม + อย่างเดียว
//   ปุ่มระบบ (grid) → หน้าระบบของกิจการ "/" (WebView) · zone="systems" = ปุ่มระบบทึบ · แตะซ้ำบนหน้าระบบ = onSystems (เปิดเมนูระบบของเว็บ)
// ไม่มีรูปโปรไฟล์ · ไอคอน Feather เท่านั้น (R-UI2) · badges ไม่ส่งมา ⇒ อ่าน store กลาง useZoneBadgeCounts (src/api/secretary.ts) พลาด = 0
// S2.14 badge 3 ไอคอนจาก `GET secretary/badges` เส้นเดียว: เลขา = approvals (กิจการนี้) · ลูกค้า = customers (ห้องที่ยังไม่อ่าน) ·
//   ทีม = team.invites + team.help + team.support · โหลดที่ layout ของโซน (focus/foreground) + หลัง action (scheduleZoneBadges) · ปุ่ม ? ทุกจอที่มีแถบนี้
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Icon, IconBtn, TopBar, type IconName } from "@/src/components/airy";
import { useAuth } from "@/src/lib/auth-context";
import { useCustomersAccess, useZoneBadgeCounts } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme, type ZoneKey } from "@/src/theme/index";
import { size, type as T } from "@/src/theme/tokens";
import { useBusinessSwitcher } from "./BusinessSwitcherSheet";

export type SecZone = ZoneKey | "systems"; // "secretary" | "customers" | "team" | "systems" (หน้าระบบ WebView)
export type ZoneBadges = { secretary?: number; customers?: number; team?: number };

const ZONES: { zone: ZoneKey; icon: IconName; path: string; label: I18nKey }[] = [
  { zone: "secretary", icon: "user", path: "/secretary", label: "sec.zone.secretary" },
  { zone: "customers", icon: "inbox", path: "/customers", label: "sec.zone.customers" },
  { zone: "team", icon: "users", path: "/secretary/staff", label: "sec.zone.team" },
];

/** ปุ่ม + ของแต่ละโซน (ลูกค้า/ระบบ = ไม่มี) */
const PLUS: Record<SecZone, { path: string; label: I18nKey } | null> = {
  secretary: { path: "/secretary/new", label: "sec.top.new" },
  customers: null,
  systems: null,
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
  showPlus = true,
  helpOn = false,
  onSystems,
}: {
  zone: SecZone;
  /** ใส่มา = ใช้ค่านี้ (ไม่ดึงเอง) */
  badges?: ZoneBadges;
  /** "tenant" = ชื่อกิจการแตะได้ · "none" = ว่าง */
  center?: "tenant" | "none";
  testID?: string;
  /** false = ซ่อนปุ่ม + ของโซน (เช่น STAFF ในโซนทีม = อ่านอย่างเดียว · S2.10) */
  showPlus?: boolean;
  /** S2.15 จอช่วยเหลือ (H1): ปุ่ม ? ทึบ · ไม่มีปุ่มโซนใดทึบ (แบบ sec-h.jpg หน้า 1) */
  helpOn?: boolean;
  /** หน้าระบบ: แตะปุ่มระบบซ้ำ = เปิดเมนูระบบ (drawer ของเว็บ) */
  onSystems?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const switcher = useBusinessSwitcher();
  const shared = useZoneBadgeCounts(); // R-S2.1e: store กลาง (โหลดที่ layout ของโซน) ไม่ยิงต่อ mount
  const counts = badges ?? shared;
  // 6 ปุ่มซ้าย × 44 + ปุ่ม + ขวา 44 + ช่องกลาง 16: จอ 390 ใช้ช่อง 5 (349) · จอแคบกว่า (375) ช่อง 2 (334) ⇒ ไม่ล้นขอบ 18
  const narrow = useWindowDimensions().width < 390;
  const plus = showPlus ? PLUS[zone] : null;
  // S2.17: ไม่มีสิทธิ์ดูแชทลูกค้า (inbox 403) ⇒ ไม่มีไอคอน "ลูกค้า" ทุกโซน (จอ /customers แสดง "ไม่มีสิทธิ์" เอง)
  const custOk = useCustomersAccess();
  const zones = custOk ? ZONES : ZONES.filter((z) => z.zone !== "customers");

  return (
    <TopBar
      testID={testID}
      left={
        <View style={[styles.left, narrow && styles.leftNarrow]}>
        <BizIcon testID="sec-top-biz" onPress={switcher.open} />
        {zones.map((z) => {
        const n = badgeText(counts[z.zone]);
        return (
          <View key={z.zone} style={styles.slot}>
            <IconBtn
              testID={`sec-top-${z.zone}`}
              icon={z.icon}
              zone={z.zone}
              on={!helpOn && z.zone === zone}
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
        <IconBtn
          testID="sec-top-systems"
          icon="grid"
          on={!helpOn && zone === "systems"}
          label={t("sec.zone.systems")}
          onPress={zone === "systems" ? onSystems : () => router.navigate("/")}
        />
        <IconBtn testID="sec-top-help" icon="help-circle" on={helpOn} label={t("sec.top.help")} onPress={helpOn ? undefined : () => router.push("/secretary/help")} />
        </View>
      }
      center={center === "tenant" ? <TenantTitle onPress={switcher.open} /> : undefined}
      right={plus ? <IconBtn testID="sec-top-new" icon="plus" label={t(plus.label)} onPress={() => router.push(plus.path)} /> : undefined}
    />
  );
}

/** สีพื้นไอคอนกิจการ: สีแบรนด์ของร้าน (branding.accent) · ไม่มี = เลือกจากชุดสีตามชื่อ (คงที่ต่อร้าน) */
const BIZ_COLORS = ["#1E7A8F", "#E07A1F", "#5B5FD6", "#2F9E5B", "#C2456B", "#8A5CD1", "#B8860B", "#3A7BD5"];
export function bizColor(name: string, accent?: string | null): string {
  if (accent) return accent;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BIZ_COLORS[h % BIZ_COLORS.length];
}
/** ตัวย่อ 2 ตัว: หลายคำ = อักษรแรกของ 2 คำแรก ("SIAM DIVE CENTER" → SD) · คำเดียว = 2 ตัวแรก ("GoodFood" → GO) */
export function bizInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const caps = words[0].match(/[A-Z]/g);
    return (caps && caps.length >= 2 ? caps.slice(0, 2).join("") : Array.from(words[0]).slice(0, 2).join("")).toUpperCase();
  }
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
}

/** ไอคอนกิจการ (โลโก้ร้าน หรือ ตัวย่อบนสีแบรนด์) · `tenantId` ไม่ใส่ = กิจการที่ใช้อยู่ · `chevron` = ลูกศรเล็กมุมล่าง (แถบบน) */
export function BizIcon({ tenantId, onPress, testID, sz = size.iconBtn, chevron = true }: { tenantId?: string; onPress?: () => void; testID?: string; sz?: number; chevron?: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const { tenants, activeTenantId } = useAuth();
  const row = tenants.find((x) => x.tenantId === (tenantId ?? activeTenantId));
  const name = row?.name ?? t("sec.tenant.fallback");
  const logo = row?.branding?.logoUrl ?? row?.logoUrl ?? null; // ธีมมือถือก่อน · ปิดธีม = โลโก้ร้านจาก /me (ตั้งค่ากิจการ)
  const bg = bizColor(name, row?.branding?.accent);
  const fg = row?.branding?.accentFg ?? "#FFFFFF";
  const box = { width: sz, height: sz, borderRadius: Math.round(sz * 0.3) };
  const body = (
    <View style={[styles.biz, box, { backgroundColor: logo ? c.surface : bg }]}>
      {logo ? <Image source={{ uri: logo }} style={box} resizeMode="cover" /> : <Text style={[styles.bizT, { color: fg, fontSize: Math.round(sz * 0.34) }]}>{bizInitials(name)}</Text>}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${name} · ${t("sec.top.switch")}`} onPress={onPress} style={{ width: sz, height: sz }}>
      {body}
      {chevron ? (
        <View pointerEvents="none" style={[styles.bizChev, { backgroundColor: c.surface }]}>
          <Icon name="chevron-down" size={11} color={c.text} />
        </View>
      ) : null}
    </Pressable>
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
  left: { flexDirection: "row", alignItems: "center", gap: 5 },
  leftNarrow: { gap: 2 },
  biz: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bizT: { fontWeight: "800", letterSpacing: 0.3 },
  bizChev: { position: "absolute", right: -3, bottom: -3, width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  badge: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 1.5, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
  tenant: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  tenantBig: { gap: 6, alignSelf: "flex-start" },
  smallT: { fontSize: T.sub, fontWeight: "600", flexShrink: 1 },
  bigT: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 36, flexShrink: 1 },
});
