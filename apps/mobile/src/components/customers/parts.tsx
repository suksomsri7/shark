// ชิ้นส่วนร่วมของโซนลูกค้า (ใบ S2.17–S2.19 · แบบ K1–K3 sec-k.jpg) — ป้ายช่องทาง · อวตาร · เวลาไทย · ชีตเลือกพนักงาน
// สีจากธีม (c.channel · c.cust) เท่านั้น · ข้อความผ่าน i18n (cust.*) · ทุกปุ่มมี testID
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/src/components/ui/text";
import { Icon, PrimaryButton, Sheet } from "@/src/components/airy";
import { Avatar as BaseAvatar } from "@/src/components/secretary/MemberBubble";
import type { StaffPick } from "@/src/api/inbox";
import { useT, type I18nKey } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

/** คำนำหน้าที่ไม่ใช้เป็นตัวอักษรของอวตาร ("คุณ" · "ป้า" · "ลุง" · "พี่" · "น้อง") — แบบ K1 "คุณสมชาย" = ส */
const HONORIFIC = /^(\u0e04\u0e38\u0e13|\u0e1b\u0e49\u0e32|\u0e25\u0e38\u0e07|\u0e1e\u0e35\u0e48|\u0e19\u0e49\u0e2d\u0e07)\s*(?=\S)/u;
export function Avatar({ name, seed, size, testID }: { name: string | null | undefined; seed: string; size?: number; testID?: string }) {
  const n = (name ?? "").trim();
  const bare = n.replace(HONORIFIC, "");
  return <BaseAvatar name={bare || n} seed={seed} size={size} testID={testID} />;
}

const LETTER: Record<string, string> = { LINE: "L", WEBCHAT: "W", FACEBOOK: "f", INSTAGRAM: "IG", SHOPEE: "S", LAZADA: "Lz", WHATSAPP: "WA", TIKTOK: "T", APP: "A" };
const CH_LABEL: Record<string, I18nKey> = {
  LINE: "cust.ch.LINE",
  WEBCHAT: "cust.ch.WEBCHAT",
  FACEBOOK: "cust.ch.FACEBOOK",
  INSTAGRAM: "cust.ch.INSTAGRAM",
  SHOPEE: "cust.ch.SHOPEE",
  LAZADA: "cust.ch.LAZADA",
  WHATSAPP: "cust.ch.WHATSAPP",
  TIKTOK: "cust.ch.TIKTOK",
  APP: "cust.ch.APP",
};

/** ชื่อช่องทางสำหรับแสดง (ไม่รู้จัก = ค่าเดิม) */
export function useChannelLabel(): (ch: string | null | undefined) => string {
  const t = useT();
  return (ch) => (ch && CH_LABEL[ch] ? t(CH_LABEL[ch]) : (ch ?? t("cust.ch.all")));
}

/** ป้ายช่องทางสี่เหลี่ยมเล็ก (แบบ K1 "L" เขียว / "W" คราม) */
export function ChannelBadge({ channel, size = 16, testID }: { channel: string; size?: number; testID?: string }) {
  const { c } = useTheme();
  const bg = (c.channel as Record<string, string>)[channel] ?? c.channel.other;
  const letter = LETTER[channel] ?? channel.slice(0, 1);
  return (
    <View testID={testID} style={[styles.badge, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg }]}>
      <Text style={[styles.badgeT, { color: c.onSys, fontSize: letter.length > 1 ? size * 0.42 : size * 0.6, lineHeight: size }]}>{letter}</Text>
    </View>
  );
}

// ───────── เวลาไทย (UTC+7 · ไม่พึ่งเขตเวลาเครื่อง COMMON §A.11) ─────────
const BKK_MS = 7 * 3600_000;
const dayNo = (ms: number) => Math.floor((ms + BKK_MS) / 86_400_000);
export function hhmm(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + BKK_MS);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
/** เวลาในรายการ: วันนี้ = HH:MM · เมื่อวาน · เก่ากว่า = ว/ด */
export function useListTime(): (iso: string | null | undefined, nowMs: number) => string {
  const t = useT();
  return (iso, nowMs) => {
    const ms = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms)) return "";
    const diff = dayNo(nowMs) - dayNo(ms);
    if (diff <= 0) return hhmm(iso);
    if (diff === 1) return t("cust.time.yesterday");
    const d = new Date(ms + BKK_MS);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };
}

/** ชื่อเล่น (คำแรก) ของพนักงาน */
export const firstName = (n: string | null | undefined): string => (n ?? "").trim().split(/\s+/)[0] ?? "";

/** ชีตเลือกพนักงาน (มอบหมาย · ส่งต่อ · เรียกคนช่วย) — `askNote` = ช่องเหตุผล/ข้อความ (ส่งต่อบังคับ) */
export function StaffSheet({
  visible,
  testID,
  title,
  people,
  exclude,
  selected,
  onSelect,
  note,
  onNote,
  noteLabel,
  noteRequired = false,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
  error,
}: {
  visible: boolean;
  testID: string;
  title: string;
  people: StaffPick[];
  exclude?: ReadonlySet<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  note?: string;
  onNote?: (v: string) => void;
  noteLabel?: string;
  noteRequired?: boolean;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  error?: string | null;
}) {
  const { c } = useTheme();
  const t = useT();
  const list = people.filter((p) => !exclude?.has(p.userId));
  const can = !!selected && !busy && (!noteRequired || !!note?.trim());
  return (
    <Sheet visible={visible} onClose={onClose} testID={testID} top={110}>
      <Text style={[styles.sheetT, { color: c.text }]}>{title}</Text>
      <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListIn} keyboardShouldPersistTaps="handled">
        {list.length === 0 ? <Text style={[styles.empty, { color: c.textMuted }]}>{t("cust.staff.empty")}</Text> : null}
        {list.map((p) => {
          const on = p.userId === selected;
          return (
            <Pressable
              testID={`${testID}-row`}
              key={p.userId}
              onPress={() => onSelect(p.userId)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.pick, { backgroundColor: on ? c.chip.bg : "transparent", borderColor: on ? c.zone.customers : c.divider }]}
            >
              <Avatar name={p.name} seed={p.userId} size={30} />
              <View style={styles.pickBody}>
                <Text style={[styles.pickN, { color: c.text }]} numberOfLines={1}>
                  {p.name ?? t("cust.staff.noName")}
                </Text>
                {p.onDuty ? <Text style={[styles.pickS, { color: c.status.run }]}>{t("cust.staff.onDuty")}</Text> : null}
              </View>
              {on ? <Icon name="check" size={18} color={c.zone.customers} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {onNote ? (
        <TextInput
          testID={`${testID}-note`}
          value={note}
          onChangeText={onNote}
          placeholder={noteLabel}
          placeholderTextColor={c.placeholder}
          maxLength={500}
          multiline
          style={[styles.note, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
        />
      ) : null}
      {error ? (
        <Text testID={`${testID}-error`} style={[styles.err, { color: c.warn.fg }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.sheetBtn}>
        <PrimaryButton testID={`${testID}-ok`} label={busy ? t("cust.busy") : confirmLabel} disabled={!can} onPress={onConfirm} />
      </View>
    </Sheet>
  );
}

/** ชีตยืนยันสั้น (ปิดห้อง ฯลฯ) */
export function ConfirmSheet({ visible, testID, title, body, okLabel, busy, onOk, onClose }: { visible: boolean; testID: string; title: string; body?: string; okLabel: string; busy: boolean; onOk: () => void; onClose: () => void }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Sheet visible={visible} onClose={onClose} testID={testID} top={460}>
      <Text style={[styles.sheetT, { color: c.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: c.textMuted }]}>{body}</Text> : null}
      <View style={styles.sheetBtn}>
        <PrimaryButton testID={`${testID}-ok`} label={busy ? t("cust.busy") : okLabel} disabled={busy} onPress={onOk} />
      </View>
      <Pressable testID={`${testID}-cancel`} onPress={onClose} accessibilityRole="button" style={styles.cancel}>
        <Text style={[styles.cancelT, { color: c.textMuted }]}>{t("cust.cancel")}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center" },
  badgeT: { fontWeight: "800", textAlign: "center" },
  sheetT: { fontSize: T.h, fontWeight: "700", marginBottom: 10 },
  sheetList: { flexGrow: 0, maxHeight: 320 },
  sheetListIn: { gap: 8, paddingBottom: 4 },
  empty: { fontSize: T.sub, paddingVertical: 12 },
  pick: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.segIn + 2, borderWidth: 1 },
  pickBody: { flex: 1, minWidth: 0 },
  pickN: { fontSize: 15, fontWeight: "600" },
  pickS: { fontSize: T.cap, marginTop: 2 },
  note: { minHeight: 64, borderRadius: radii.segIn + 2, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.sub, lineHeight: 20, marginTop: 12, textAlignVertical: "top" },
  err: { fontSize: T.cap, lineHeight: 18, marginTop: 8 },
  sheetBtn: { marginTop: 14 },
  body: { fontSize: T.sub, lineHeight: 21, marginBottom: 4 },
  cancel: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 24 },
  cancelT: { fontSize: 15 },
});
