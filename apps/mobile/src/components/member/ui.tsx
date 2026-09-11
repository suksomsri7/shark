// ชิ้นส่วนร่วมของจอ "สมาชิก" ในแอปพนักงาน (M3.11 · ภาพ 28) — หัวจอ · ชิประดับ · วงชื่อย่อ · ชนิดข้อมูลจาก API
// ใช้ธีมกลาง C/R/S + สีกิจการ (useBrand) เหมือนจออื่นของแอป · ข้อความผ่าน Text กลาง (ฟอนต์ IBM Plex Sans Thai)
// เลี่ยง Intl/toLocaleString (Hermes ไม่ครบ) — จัดรูปตัวเลข/วันที่เอง
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/src/components/ui/text";
import { C, R, S } from "@/src/theme";

// ── ชนิดข้อมูลจาก /api/mobile/member/* (สัญญาเดียวกับ src/lib/modules/member/staff-app.ts ฝั่งเว็บ) ──
export type MemberRow = {
  id: string;
  memberCode: string;
  name: string;
  phoneMasked: string;
  tier: { name: string; color: string } | null;
  points: number;
};

export type StampCardRow = {
  cardId: string;
  name: string;
  slots: number;
  stamps: number;
  pinRequired: boolean;
  reward: string;
};

export type MemberSummary = {
  member: MemberRow;
  stats: { points: number; vouchers: number; stamp: { name: string; stamps: number; slots: number } | null };
  history: { id: string; at: string; kind: string; title: string; sub: string }[];
  links: { redeem: string; points: string; voucher: string };
  canStamp: boolean;
};

export type StampResult = { card: StampCardRow; completed: boolean; banner: string };

// ── จัดรูป ──
/** 2340 → "2,340" (ไม่พึ่ง Intl) */
export function fmtNum(n: number): string {
  const s = String(Math.round(Number.isFinite(n) ? n : 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** ISO → "3 ก.ย." ตามเวลาไทย (บวก 7 ชม. แล้วอ่านแบบ UTC — ไม่พึ่งเขตเวลาของเครื่อง) */
export function thaiShortDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 7 * 3_600_000);
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
}

/** ชื่อย่อ 1 ตัวอักษรในวงกลม (ภาพ 28 "ส") */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

// ── หัวจอ (ปุ่มซ้าย · ชื่อจอ · ช่องขวา) ──
export function MemberHeader({
  title,
  left,
  onLeft,
  right,
}: {
  title: string;
  left: "menu" | "back";
  onLeft: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onLeft} hitSlop={10} style={styles.iconBtn} accessibilityLabel={left === "menu" ? "เปิดเมนู" : "กลับ"}>
        <Feather name={left === "menu" ? "menu" : "chevron-left"} size={left === "menu" ? 20 : 24} color={C.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={styles.iconBtn} />}
    </View>
  );
}

/** สีป้ายระดับ (`TagColor` ของ MemberTierDef) — ค่าเดียวกับโทเคน `--color-tag-*` ของเว็บ (globals.css) */
const TAG_COLORS: Record<string, string> = {
  SLATE: "#737373",
  BLUE: "#1d4ed8",
  GREEN: "#15803d",
  AMBER: "#b45309",
  RED: "#b91c1c",
  PURPLE: "#6d28d9",
};

/** ชิประดับสมาชิก (Gold/Silver/Member) — กรอบ/ตัวอักษรเป็นสีของระดับที่ร้านตั้ง */
export function TierChip({ tier }: { tier: { name: string; color: string } | null }) {
  if (!tier) return null;
  const raw = String(tier.color ?? "");
  const color = TAG_COLORS[raw.toUpperCase()] ?? (/^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : C.textDim);
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>
        {tier.name}
      </Text>
    </View>
  );
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2.6 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initialOf(name)}</Text>
    </View>
  );
}

/** กล่องข้อความแจ้ง (ผิดพลาด/ข้อมูล) — ขึ้นบรรทัดใหม่ได้ ไม่ตัดท้าย */
export function Notice({ text, tone = "info" }: { text: string | null; tone?: "info" | "error" }) {
  if (!text) return null;
  return <Text style={[styles.notice, tone === "error" ? styles.noticeError : null]}>{text}</Text>;
}

export const memberStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: S.lg, gap: S.md },
  card: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: R.lg },
  sectionTitle: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  dim: { color: C.textDim, fontSize: 13 },
  faint: { color: C.textFaint, fontSize: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: S.xl, gap: S.sm },
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
  chip: { borderWidth: 1, borderRadius: R.sm - 2, paddingHorizontal: 6, paddingVertical: 1, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "IBMPlexSansThai_600SemiBold" },
  avatar: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.textDim, fontFamily: "IBMPlexSansThai_600SemiBold" },
  notice: { color: C.textDim, fontSize: 13, lineHeight: 20 },
  noticeError: { color: C.danger },
});
