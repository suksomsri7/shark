// Lekaa FAB (แบบ fab4/fab6 จอ 3 · 15 พ.ย.) — การ์ด CONTEXT_CONFIRM + ชิป "📍 อ้างอิง"
//   ContextConfirmCard: เลขาไม่แน่ใจว่าคำสั่งหมายถึงหน้าที่เปิดอยู่ไหม ⇒ คำถามของเลขาอยู่ในการ์ดขาว + ปุ่ม "ใช่ <ป้าย>" (ทึบ) / "ไม่ใช่"
//     17 พ.ย. (ภาพคู่ fab6 จอ 3): ปุ่มทึบสั้นตามแบบ "ใช่ ใบนี้" (เอกสาร) / "ใช่ อันนี้" (อื่น) — ป้ายเต็มอยู่ในคำถามแล้ว · ข้อความที่ส่งยังเป็น "ใช่ <ป้าย>" (เซิร์ฟเวอร์)
//     กด = POST secretary/rooms/[id]/page-context {answer} (ห้องส่งข้อความ "ใช่ …"/"ไม่ใช่" ต่อให้เอง) · ระหว่างส่งปุ่มปิด · ล้ม = ข้อความสั้นใต้ปุ่ม
//   PageRefChip: ใต้คำตอบของเลขาที่ใช้หน้านั้น (refIds ของห้อง) — ป้ายมาจากเซิร์ฟเวอร์ (อ่านใหม่ด้วยสิทธิ์ผู้สั่ง)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useT } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { type as T } from "@/src/theme/tokens";
import { AssistantRow } from "./Bubble";

export function PageRefChip({ label, testID = "sec-room-ref" }: { label: string; testID?: string }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={[styles.ref, { backgroundColor: c.lekaa.refBg }]}>
      <Text style={[styles.refT, { color: c.lekaa.refFg }]} numberOfLines={1}>
        {t("sec.ctx.ref", { label })}
      </Text>
    </View>
  );
}

export function ContextConfirmCard({
  text,
  label,
  entityType = null,
  busy,
  note,
  onAnswer,
  testID = "sec-room-ctx",
}: {
  text: string;
  label: string;
  /** ชนิดสิ่งที่เปิดอยู่ (ACCOUNT_DOC = "ใบนี้") · ไม่รู้ = "อันนี้" */
  entityType?: string | null;
  busy: boolean;
  note: string | null;
  onAnswer: (yes: boolean) => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <AssistantRow testID={testID}>
      <View style={[glassStyle(c, 18), styles.card, { backgroundColor: c.lekaa.fabBg }]}>
        <Text style={[styles.q, { color: c.text }]} selectable>
          {text}
        </Text>
        <View style={styles.btns}>
          <Pressable testID={`${testID}-yes`} accessibilityRole="button" accessibilityLabel={t("sec.ctx.yes", { label })} disabled={busy} onPress={() => onAnswer(true)} style={[styles.btn, { backgroundColor: c.accent }, busy && styles.off]}>
            <Text style={[styles.btnT, { color: c.onAccent }]} numberOfLines={1}>
              {t(entityType === "ACCOUNT_DOC" ? "sec.ctx.yesDoc" : "sec.ctx.yesThis")}
            </Text>
          </Pressable>
          <Pressable testID={`${testID}-no`} accessibilityRole="button" disabled={busy} onPress={() => onAnswer(false)} style={[styles.btn, { backgroundColor: c.chip.bg }, busy && styles.off]}>
            <Text style={[styles.btnT, { color: c.text }]} numberOfLines={1}>
              {t("sec.ctx.no")}
            </Text>
          </Pressable>
        </View>
        {note ? <Text style={[styles.note, { color: c.bad.fg }]}>{note}</Text> : null}
      </View>
    </AssistantRow>
  );
}

const styles = StyleSheet.create({
  ref: { alignSelf: "flex-start", marginTop: 8, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 10, maxWidth: "100%" },
  refT: { fontSize: T.cap - 0.5, lineHeight: 17 },
  card: { padding: 14, borderRadius: 18 },
  q: { fontSize: T.body - 1, lineHeight: 23 },
  btns: { flexDirection: "row", gap: 8, marginTop: F.v(14) },
  btn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  btnT: { fontSize: T.sub, fontWeight: "700" },
  off: { opacity: 0.5 },
  note: { fontSize: T.cap, marginTop: 8 },
});
