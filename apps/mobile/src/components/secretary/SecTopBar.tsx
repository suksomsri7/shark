// แถบบนของแอปเลขา 3 โซน (แบบ §10 "แถบบนทุกหน้า" · sec-k.jpg · มติ 14/16 · R1 R2) — ขยาย components/airy/TopBar
// ซ้าย 3 ปุ่มโซน: เลขา (message-circle → /secretary) · ลูกค้า (inbox → /customers) · ทีม (users → /secretary/staff)
// 15 พ.ย. (เจ้าของสั่ง): ตัดปุ่ม "ลูกค้า" ออกจากแถบบน — ซ้ำกับช่อง "แชทลูกค้า" ในแผ่นเปิดระบบ (แตะช่องนั้น = จอแชท native /customers ไม่ใช่เว็บ)
//   ปุ่มของโซนปัจจุบัน = พื้นทึบสีโซน (accent / zone.customers / zone.team ใน src/theme) · badge ต่อปุ่ม (≤ 99 · มีจุดเมื่อ > 0)
// ขวา: ? (help-circle → /secretary/help) + ปุ่ม + ตามโซน: เลขา → /secretary/new · ลูกค้า = ไม่มี + · ทีม → /secretary/staff/invite
// กลาง: ชื่อกิจการ active (จาก /api/mobile/me) + ลูกศรเล็ก แตะ = ตัวสลับกิจการ (BusinessSwitcherSheet) · `center="none"` = ว่าง (จอ A1/C3 วางชื่อใหญ่เอง)
// 14 พ.ย. (เจ้าของสั่ง): ชื่อกิจการย้ายเป็นไอคอนกิจการ (BizIcon) ซ้ายสุดของแถบ แตะ = ตัวสลับกิจการ · ไอคอนเลขา = รูปคน (user)
// 14 พ.ย. รอบ 2 (เจ้าของสั่ง): ซ้าย = [กิจการ] [เลขา][ลูกค้า][ทีม][ระบบ][?] · ขวา = ปุ่ม + อย่างเดียว (ปุ่มระบบถูกเอาออกในรอบ 3)
// 14 พ.ย. รอบ 3 (เจ้าของอนุมัติแบบ bizsheet4): เอาปุ่มระบบ (grid) ออก ⇒ ซ้าย = [กิจการ] [เลขา][ลูกค้า][ทีม][?] · ขวา = +
//   ไอคอนกิจการเป็น "วงกลม" ทุกที่ (แถบบน/ชีต/รายการ) · แตะ = ชีตกิจการ (BusinessSwitcherSheet: เปิดระบบ ⚙ ⇄) — เข้าระบบของเว็บจากตารางในชีตนั้น
//   zone="systems" = หน้าระบบ (WebView) ⇒ ไม่มีปุ่มโซนใดทึบ และไม่มีปุ่ม +
// ไม่มีรูปโปรไฟล์ · ไอคอน Feather เท่านั้น (R-UI2) · badges ไม่ส่งมา ⇒ อ่าน store กลาง useZoneBadgeCounts (src/api/secretary.ts) พลาด = 0
// CAL2.1 (มติ M1 · แบบ cal-1.png จอ 2): ปุ่มปฏิทิน (calendar → /secretary/calendar) ถัดจาก "ทีม" · badge แดง = badges.calendar (เรื่องวันนี้ที่ยังไม่เสร็จ)
//   zone="calendar" = จอปฏิทิน (ปุ่มปฏิทินทึบสี accent แบบเดียวกับเลขา) · ช่องปุ่มซ้ายแคบลงเป็น 6 (จอ ≥ 375 ไม่ล้น)
// S2.14 badge 3 ไอคอนจาก `GET secretary/badges` เส้นเดียว: เลขา = approvals (กิจการนี้) · ลูกค้า = customers (ห้องที่ยังไม่อ่าน) ·
//   ทีม = team.invites + team.help + team.support · โหลดที่ layout ของโซน (focus/foreground) + หลัง action (scheduleZoneBadges) · ปุ่ม ? ทุกจอที่มีแถบนี้
// 17 พ.ย. (เจ้าของอนุมัติแบบ topbar2 · /root/mockups/topbar-systems): แถบบน = ทุกระบบที่ร้านเปิด + แผ่นดึงลงแทนชีตล่าง
//   ซ้าย = ไอคอนกิจการ (อยู่กับที่ ไม่เลื่อน) · ถัดไป = แถบเลื่อนแนวนอนแถวเดียว (ไม่มีแถบเลื่อน): [ทีม][ปฏิทิน] (คงที่ ลำดับเดิม badge เดิม)
//     → ไอคอนกลม 1 ปุ่มต่อ 1 ระบบที่เปิด (ชุดเดียวกับตารางในแผ่น รวม "หน้าหลัก" · ลำดับที่ผู้ใช้จัดเอง ต่อคน ต่อร้าน) → [?] ท้ายสุด
//     ยาวเกินจอ = ขอบขวาจาง (เลื่อนแล้ว = ขอบซ้ายจางด้วย) · ปุ่ม + ของโซน (ถ้าจอนั้นมี) อยู่กับที่ทางขวานอกแถบเลื่อน
//   ไอคอนระบบ = สีของระบบนั้น (ธีม c.navSys · สว่าง/มืด) · ระบบที่เปิดอยู่ = วงกลมทึบเข้มไอคอนขาว (แบบเดียวกับโซนที่ active) · แชทลูกค้าคง badge ยังไม่อ่าน
//     แตะ = เหมือนแตะช่องเดียวกันในตาราง (ระบบเว็บ = หน้าระบบ "/" ?open= · แชทลูกค้าที่อ่านได้ = จอ native /customers)
//     "เปิดอยู่": หน้าระบบ (zone="systems") = ช่องที่ href ตรงพาธเว็บ (`activePath` จากข้อความ page-context) · โซนลูกค้า = ระบบแชทช่องแรก
//   แตะไอคอนกิจการ หรือ "ลากแถบบนลง" = แผ่นดึงลงจากขอบบน (BusinessSwitcherSheet · แถบนี้ยังเห็นอยู่บนแผ่น) · ลำดับ/รายการระบบอ่านจาก store กลาง ./navSystems
//   (ลากจัดลำดับในแผ่น = แถบนี้เรียงตามทันที) · testID เดิม sec-top-* คงไว้ · ใหม่: sec-top-strip · sec-top-sys-<key> · sec-top-fade-l/-r
import { useCallback, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { Text } from "@/src/components/ui/text";
import { Icon, IconBtn, type IconName } from "@/src/components/airy";
import { useAuth } from "@/src/lib/auth-context";
import { useCustomersAccess, useZoneBadgeCounts } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, bgImage, glassStyle, linear, shadow, useTheme, type ZoneKey } from "@/src/theme/index";
import { size, type as T } from "@/src/theme/tokens";
import { useBusinessSwitcher } from "./BusinessSwitcherSheet";
import { activeTileKey, useNavTiles, type NavTile } from "./navSystems";
import { useOpenSystem } from "./openSystem";
// 15 พ.ย. (เจ้าของอนุมัติแบบ fab6 · Lekaa FAB): ถอดไอคอนเลขา (คน) ⇒ แถบ = [กิจการ][ทีม][ปฏิทิน][?] · สั่งงานใหม่/รายการงาน = ปุ่มลอย Lekaa (ไม่มี + ของโซนเลขาแล้ว)
import { useCalSheet } from "@/src/components/calendar/AddCalSheet";

export type SecZone = ZoneKey | "systems" | "calendar"; // "secretary" | "customers" | "team" | "systems" (หน้าระบบ WebView · ไม่มีปุ่มโซนใดทึบ) | "calendar" (CAL2.1)
export type ZoneBadges = { secretary?: number; customers?: number; team?: number; calendar?: number };

const ZONES: { zone: ZoneKey | "calendar"; icon: IconName; path: string; label: I18nKey }[] = [
  { zone: "team", icon: "users", path: "/secretary/staff", label: "sec.zone.team" },
  { zone: "calendar", icon: "calendar", path: "/secretary/calendar", label: "cal.zone" },
];

/** ปุ่ม + ของแต่ละโซน (ลูกค้า/ระบบ = ไม่มี) */
const PLUS: Record<SecZone, { path: string; label: I18nKey } | null> = {
  secretary: null, // Lekaa FAB: งานใหม่เข้าจากแผ่น Lekaa
  customers: null,
  systems: null,
  calendar: { path: "/secretary/calendar", label: "cal.plus.cal" },
  team: { path: "/secretary/staff/invite", label: "sec.top.invite" },
};

/** ตัวเลขบน badge: 0 = ไม่แสดง · เกิน 99 = "99+" */
export function badgeText(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}

export type SecTopBarProps = {
  zone: SecZone;
  /** ใส่มา = ใช้ค่านี้ (ไม่ดึงเอง) */
  badges?: ZoneBadges;
  /** เดิม: "tenant" = ชื่อกิจการกลางแถบ — topbar2 ไม่มีที่ว่างกลางแถบแล้ว (แถบเลื่อนเต็มกว้าง) ค่านี้ไม่มีผล คงไว้ให้จอเดิมคอมไพล์ได้ */
  center?: "tenant" | "none";
  testID?: string;
  /** false = ซ่อนปุ่ม + ของโซน (เช่น STAFF ในโซนทีม = อ่านอย่างเดียว · S2.10) */
  showPlus?: boolean;
  /** S2.15 จอช่วยเหลือ (H1): ปุ่ม ? ทึบ · ไม่มีปุ่มโซนใดทึบ (แบบ sec-h.jpg หน้า 1) */
  helpOn?: boolean;
  /** help-cases (15 พ.ย.): ปุ่ม + ของจอนั้นเอง (จอช่วยเหลือ = แจ้งปัญหาใหม่) — ใส่มา = แทนเส้นทางของโซน */
  onPlus?: () => void;
  plusLabel?: I18nKey;
  /** topbar2: พาธเว็บของหน้าระบบที่เปิดอยู่ (zone="systems") — ไฮไลต์ไอคอนระบบนั้น */
  activePath?: string | null;
  /** ภายใน: สำเนาแถบที่วาดบนแผ่นดึงลง (แตะไอคอนกิจการ = ปิดแผ่น · ไม่มีท่าลากลง) */
  inPanel?: boolean;
};

export function SecTopBar(props: SecTopBarProps) {
  const { zone, badges, testID = "sec-top", showPlus = true, helpOn = false, onPlus, plusLabel, activePath, inPanel = false } = props;
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const switcher = useBusinessSwitcher();
  const calSheet = useCalSheet(); // CAL2.6: + ของโซนเลขา = แผ่นเลือก (สั่งงาน / เพิ่มเตือน/นัด) · โซนปฏิทิน = แผ่นเพิ่มเตือนตรง · นอก Host = เส้นเดิม
  const shared = useZoneBadgeCounts(); // R-S2.1e: store กลาง (โหลดที่ layout ของโซน) ไม่ยิงต่อ mount
  const counts = badges ?? shared;
  const plus = !showPlus ? null : onPlus ? { path: "", label: plusLabel ?? PLUS[zone]?.label ?? "sec.top.new" } : PLUS[zone];
  // S2.17: ไม่มีสิทธิ์ดูแชทลูกค้า (inbox 403) ⇒ ไม่มีไอคอน "ลูกค้า" ทุกโซน (จอ /customers แสดง "ไม่มีสิทธิ์" เอง)
  const custOk = useCustomersAccess();
  const zones = custOk ? ZONES : ZONES.filter((z) => z.zone !== "customers");
  const { tiles } = useNavTiles();
  const openSystem = useOpenSystem();
  const activeKey = helpOn
    ? null
    : zone === "systems"
      ? activeTileKey(tiles, activePath)
      : zone === "customers"
        ? (tiles.find((x) => x.code === "CHAT")?.key ?? null)
        : null;

  // ── เปิดแผ่น: แตะไอคอนกิจการ / ลากแถบลง — ส่งตำแหน่งแถบ (วางสำเนาบนแผ่นตรงที่เดิม) + props ของแถบ ──
  const rowRef = useRef<View>(null);
  const measure = useCallback((cb: (r: { x: number; y: number; w: number; h: number }) => void) => {
    const v = rowRef.current;
    if (!v) return cb({ x: 0, y: 0, w: 0, h: 0 });
    v.measureInWindow((x, y, w, h) => cb({ x, y, w, h }));
  }, []);
  const panelOpts = useMemo(() => ({ bar: { ...props, inPanel: true }, measure }), [props, measure]);
  const openPanel = useCallback(() => (inPanel ? switcher.close() : switcher.open(panelOpts)), [inPanel, switcher, panelOpts]);
  const beginDrag = useCallback(() => switcher.begin(panelOpts), [switcher, panelOpts]);
  const drag = switcher.drag;
  const pan = useMemo(() => {
    const g = Gesture.Pan().activeOffsetY(12).failOffsetX([-14, 14]).enabled(!!drag && !inPanel);
    if (!drag) return g;
    const { progress, travel, settle } = drag;
    return g
      .onStart(() => {
        scheduleOnRN(beginDrag);
      })
      .onUpdate((e) => {
        progress.value = Math.min(1, Math.max(0, e.translationY / Math.max(1, travel.value)));
      })
      .onEnd((e) => {
        scheduleOnRN(settle, progress.value > 0.35 || e.velocityY > 700);
      });
  }, [drag, inPanel, beginDrag]);

  // ── ขอบจางของแถบเลื่อน ──
  const [box, setBox] = useState({ w: 0, cw: 0, x: 0 });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setBox((b) => (Math.abs(b.x - x) < 1 ? b : { ...b, x }));
  };
  const fadeL = box.x > 1;
  const fadeR = box.cw > box.w + 1 && box.x < box.cw - box.w - 1;

  const sysBtn = (x: NavTile) => {
    const on = x.key === activeKey;
    const n = badgeText(x.badge);
    return (
      <View key={x.key} style={styles.slot}>
        <Pressable
          testID={`sec-top-sys-${x.key}`}
          accessibilityRole="button"
          accessibilityLabel={n ? `${x.label} · ${t("sec.sheet.unread", { n: x.badge })}` : x.label}
          accessibilityState={{ selected: on }}
          hitSlop={4}
          onPress={() => openSystem(x.href, x.code)}
          style={[styles.btn, on ? [{ backgroundColor: c.accent }, shadow(c.glass.shadow)] : glassStyle(c, size.iconBtn / 2)]}
        >
          <Icon name={x.icon} color={on ? c.onAccent : x.fg} />
        </Pressable>
        {n ? (
          <View testID={`sec-top-sys-${x.key}-badge`} pointerEvents="none" style={[styles.badge, { backgroundColor: c.danger.bg, borderColor: c.surface }]}>
            <Text style={[styles.badgeT, { color: c.danger.fg }]}>{n}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <GestureDetector gesture={pan}>
      <View ref={rowRef} testID={testID} style={styles.bar} collapsable={false}>
        <BizIcon testID="sec-top-biz" onPress={openPanel} />
        <View style={styles.stripBox} onLayout={(e: LayoutChangeEvent) => setBox((b) => ({ ...b, w: e.nativeEvent.layout.width }))}>
          <ScrollView
            testID="sec-top-strip"
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            onContentSizeChange={(w) => setBox((b) => ({ ...b, cw: w }))}
            contentContainerStyle={styles.strip}
            accessibilityLabel={t("sec.top.systems")}
          >
            {zones.map((z) => {
              const n = badgeText(counts[z.zone]);
              if (z.zone === "calendar") {
                const on = !helpOn && zone === "calendar";
                return (
                  <View key="calendar" style={styles.slot}>
                    <IconBtn testID="sec-top-calendar" icon="calendar" zone="secretary" on={on} label={t("cal.zone")} onPress={() => router.navigate("/secretary/calendar")} />
                    {n ? (
                      <View testID="sec-top-calendar-badge" pointerEvents="none" style={[styles.badge, { backgroundColor: c.danger.bg, borderColor: c.surface }]}>
                        <Text style={[styles.badgeT, { color: c.danger.fg }]}>{n}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              }
              return (
                <View key={z.zone} style={styles.slot}>
                  <IconBtn
                    testID={`sec-top-${z.zone}`}
                    icon={z.icon}
                    zone={z.zone as ZoneKey}
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
            {tiles.map(sysBtn)}
            <IconBtn testID="sec-top-help" icon="help-circle" on={helpOn} label={t("sec.top.help")} onPress={helpOn ? undefined : () => router.push("/secretary/help")} />
          </ScrollView>
          {fadeL ? <View testID="sec-top-fade-l" pointerEvents="none" style={[styles.fade, styles.fadeL, bgImage(linear(c.topPanel.fade, c.topPanel.fadeTo, 270))]} /> : null}
          {fadeR ? <View testID="sec-top-fade-r" pointerEvents="none" style={[styles.fade, styles.fadeR, bgImage(linear(c.topPanel.fade, c.topPanel.fadeTo, 90))]} /> : null}
        </View>
        {plus ? (
          <IconBtn
            testID="sec-top-new"
            icon="plus"
            label={t(plus.label)}
            onPress={() => {
              if (onPlus) onPlus();
              else if (calSheet && zone === "secretary") calSheet.openPlus();
              else if (calSheet && zone === "calendar") calSheet.openAdd();
              else if (zone !== "calendar") router.push(plus.path);
            }}
          />
        ) : null}
      </View>
    </GestureDetector>
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

/** ไอคอนกิจการ "วงกลม" (โลโก้ร้าน หรือ ตัวย่อบนสีแบรนด์ · bizsheet4) · `tenantId` ไม่ใส่ = กิจการที่ใช้อยู่ · `chevron` = ลูกศรเล็กมุมล่าง (แถบบน) */
export function BizIcon({ tenantId, onPress, testID, sz = size.iconBtn, chevron = true }: { tenantId?: string; onPress?: () => void; testID?: string; sz?: number; chevron?: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const { tenants, activeTenantId } = useAuth();
  const row = tenants.find((x) => x.tenantId === (tenantId ?? activeTenantId));
  const name = row?.name ?? t("sec.tenant.fallback");
  const logo = row?.branding?.logoUrl ?? row?.logoUrl ?? null; // ธีมมือถือก่อน · ปิดธีม = โลโก้ร้านจาก /me (ตั้งค่ากิจการ)
  const bg = bizColor(name, row?.branding?.accent);
  const fg = row?.branding?.accentFg ?? "#FFFFFF";
  const box = { width: sz, height: sz, borderRadius: sz / 2 };
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
      onPress={onPress ?? (() => switcher.open())}
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
  // topbar2: [กิจการ] + แถบเลื่อน (ปุ่มกลม 44 ห่าง 6 · แบบ .btn/.in gap 6) + [+] · ขอบจาง 34
  bar: { height: 52, flexDirection: "row", alignItems: "center", gap: 6 },
  stripBox: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" },
  strip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingRight: 4, paddingLeft: 2 },
  slot: { width: size.iconBtn, height: size.iconBtn },
  btn: { width: size.iconBtn, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center" },
  fade: { position: "absolute", top: 0, bottom: 0, width: 34 },
  fadeL: { left: 0 },
  fadeR: { right: 0 },
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
