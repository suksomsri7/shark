// ชิ้นส่วนร่วมของจอ "CRM" ในแอปพนักงาน (ใบ C3.7 · ภาพ 13) — ชนิดข้อมูลจาก API · จัดรูปเงิน/เวลาไทย · แถบล่าง ดีล/งาน/เมนู
// ใช้ธีมกลาง C/R/S + สีกิจการ (useBrand) เหมือนจอสมาชิก · ข้อความผ่าน Text กลาง (ฟอนต์ IBM Plex Sans Thai)
// เลี่ยง Intl/toLocaleString (Hermes ไม่ครบ) — จัดรูปตัวเลข/วันที่เอง · เวลาไทย = บวก 7 ชม. แล้วอ่านแบบ UTC
import { Pressable, StyleSheet, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/src/components/ui/text";
import { C, R, S } from "@/src/theme";

// ── ชนิดข้อมูลจาก /api/mobile/crm/* (สัญญาเดียวกับ src/lib/modules/crm/mobile.ts ฝั่งเว็บ) ──
export type CrmDeal = {
  id: string;
  title: string;
  valueSatang: number;
  stageId: string;
  stageName: string;
  stalledDays: number | null;
  nextActivityAt?: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; name: string; phone: string | null } | null;
};
export type CrmDeals = { items: CrmDeal[]; stages: { id: string; name: string; count: number }[] };
export type CrmTask = {
  id: string;
  title: string;
  type: string;
  dueAt: string | null;
  done: boolean;
  contactId: string | null;
  dealId: string | null;
  context?: string | null;
};
export type CrmTasks = { items: CrmTask[]; counts: { today: number; overdue: number; done: number } };
export type CrmCallPrompt = {
  contact: { id: string; name: string };
  deal: { id: string; title: string } | null;
  outcomes: string[];
  directions: string[];
};
export type CrmCardDraft = { name: string; phone: string; email: string; company: string; jobTitle: string };

/** path ของ API + `?systemId=` ที่มากับลิงก์ (ไม่ส่ง = ระบบ CRM ใหม่ใบแรกของร้าน) + พารามิเตอร์อื่น — ไม่มี token ใน URL */
export function crmApiPath(path: string, systemId: string | null | undefined, extra: Record<string, string | null | undefined> = {}): string {
  const q = Object.entries({ systemId: systemId ?? null, ...extra })
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return q ? `${path}?${q}` : path;
}

/** ค่า param ของ expo-router (string | string[]) → string | null */
export function paramOf(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s ? s : null;
}

// ── จัดรูป ──
/** 15200000 สตางค์ → "฿152,000" */
export function baht(satang: number): string {
  const n = Math.round((Number.isFinite(satang) ? satang : 0) / 100);
  return `฿${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const OFFSET = 7 * 3_600_000;
const DAY = 86_400_000;
const thaiDayNo = (t: number) => Math.floor((t + OFFSET) / DAY);

/** ISO → "10:00" (ถ้าเป็นวันนี้) · "พรุ่งนี้ 10:00" · "13 ก.ย." — เวลาไทย */
export function thaiWhen(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + OFFSET);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const diff = thaiDayNo(t) - thaiDayNo(now);
  if (diff === 0) return `วันนี้ ${hm}`;
  if (diff === 1) return `พรุ่งนี้ ${hm}`;
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
}

/** วินาที → "04:32" */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "04:32" / "272" → วินาที · อ่านไม่ออก = null */
export function parseMmss(text: string): number | null {
  const t = text.trim();
  if (!t) return 0;
  const m = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d{1,5}$/.test(t) ? Number(t) : null;
}

/** รหัสกันกดซ้ำของคำขอบันทึกสาย 1 ครั้ง (สุ่มในเครื่อง · ไม่มีข้อมูลส่วนตัว) */
export function newIdempotencyKey(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// ── หัวจอ (ปุ่มซ้าย · ชื่อจอ) ──
export function CrmHeader({ title, left, onLeft }: { title: string; left: "menu" | "back"; onLeft: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onLeft} hitSlop={10} style={styles.iconBtn} accessibilityLabel={left === "menu" ? "เปิดเมนู" : "กลับ"}>
        <Feather name={left === "menu" ? "menu" : "chevron-left"} size={left === "menu" ? 20 : 24} color={C.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

/** แถบล่าง (ภาพ 13): ดีล · งาน · เมนู — เมนูเปิด Drawer ของกิจการ */
export function CrmTabBar({ active, onDeals, onTasks, onMenu, bottom }: { active: "deals" | "tasks"; onDeals: () => void; onTasks: () => void; onMenu: () => void; bottom: number }) {
  const item = (key: "deals" | "tasks" | "menu", icon: "briefcase" | "check-square" | "grid", label: string, onPress: () => void) => {
    const on = key === active;
    return (
      <Pressable key={key} testID={`crm-tab-${key}`} onPress={onPress} style={styles.tab} accessibilityLabel={label}>
        <Feather name={icon} size={18} color={on ? C.text : C.textFaint} />
        <Text style={[styles.tabText, on && styles.tabOn]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(bottom, S.sm) }]}>
      {item("deals", "briefcase", "ดีล", onDeals)}
      {item("tasks", "check-square", "งาน", onTasks)}
      {item("menu", "grid", "เมนู", onMenu)}
    </View>
  );
}

/** กล่องข้อความแจ้ง (ผิดพลาด/สำเร็จ/ข้อมูล) — ขึ้นใต้จุดที่เกี่ยว ไม่ใช่ Alert */
export function CrmNotice({ text, tone = "info", testID }: { text: string | null; tone?: "info" | "error" | "ok"; testID?: string }) {
  if (!text) return null;
  return (
    <Text testID={testID} style={[styles.notice, tone === "error" && styles.noticeError, tone === "ok" && styles.noticeOk]}>
      {text}
    </Text>
  );
}

/** ชิปเลือก (ขั้นดีล · ผลสาย · ทิศทาง) */
export function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** เปิด Drawer ของโซนกิจการ — ไล่หา parent ที่มี openDrawer (ห้าม import @react-navigation/* ตรง · SDK 56+) */
export function openDrawerFrom(navigation: unknown): void {
  let nav: unknown = navigation;
  for (let i = 0; i < 5 && nav; i += 1) {
    const n = nav as { openDrawer?: () => void; getParent?: () => unknown };
    if (typeof n.openDrawer === "function") {
      n.openDrawer();
      return;
    }
    nav = n.getParent?.();
  }
}

export const crmStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: S.lg, gap: S.md },
  card: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: R.lg },
  sectionTitle: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  label: { color: C.textDim, fontSize: 12, fontFamily: "IBMPlexSansThai_600SemiBold" },
  dim: { color: C.textDim, fontSize: 13 },
  faint: { color: C.textFaint, fontSize: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: S.xl, gap: S.sm },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, minHeight: 42, color: C.text, fontSize: 14 },
  primary: { flex: 1, borderRadius: R.md, height: 46, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  ghost: { flex: 1, borderRadius: R.md, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  ghostText: { color: C.text, fontSize: 15, fontFamily: "IBMPlexSansThai_600SemiBold" },
  off: { opacity: 0.5 },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: C.text, fontSize: 16, fontFamily: "IBMPlexSansThai_700Bold" },
  tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg, paddingTop: S.xs },
  tab: { flex: 1, alignItems: "center", gap: 2, paddingVertical: S.xs },
  tabText: { color: C.textFaint, fontSize: 11 },
  tabOn: { color: C.text, fontFamily: "IBMPlexSansThai_700Bold" },
  notice: { color: C.textDim, fontSize: 13, lineHeight: 20 },
  noticeError: { color: C.danger },
  noticeOk: { color: "#15803d", fontFamily: "IBMPlexSansThai_600SemiBold" },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.bg, flexShrink: 0 },
  chipOn: { borderColor: C.text, borderWidth: 1.5 },
  chipText: { color: C.textDim, fontSize: 12 },
  chipTextOn: { color: C.text, fontFamily: "IBMPlexSansThai_700Bold" },
});
