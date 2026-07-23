// การ์ด proposal ใต้แชท — AI เสนอการกระทำ user ยืนยัน/ไม่ทำ
// DESTRUCTIVE = ปุ่มแดง 2 จังหวะ (armed แล้วกดซ้ำถึงส่ง confirm2x) · resolved = โชว์ note ใต้การ์ด
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { C, R, S } from "@/src/theme";

export type ProposalView = {
  id: string;
  summary: string;
  risk: "NORMAL" | "DESTRUCTIVE";
  resolved?: boolean;
  note?: string;
};

export function ProposalCard({
  proposal,
  busy,
  armed,
  onConfirm,
  onReject,
}: {
  proposal: ProposalView;
  busy: boolean;
  armed: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const destructive = proposal.risk === "DESTRUCTIVE";

  if (proposal.resolved) {
    return (
      <View style={[styles.card, { borderColor: C.border }]}>
        <Text style={styles.summary}>{proposal.summary}</Text>
        <Text style={styles.doneNote}>{proposal.note || "ทำรายการเรียบร้อยแล้ว"}</Text>
      </View>
    );
  }

  const confirmLabel = busy
    ? "กำลังทำ…"
    : destructive
      ? armed
        ? "ยืนยันอีกครั้ง (ลบจริง)"
        : "ยืนยัน"
      : "ยืนยัน";

  return (
    <View style={[styles.card, { borderColor: destructive ? C.danger : C.blue }]}>
      <Text style={[styles.head, { color: destructive ? C.danger : C.textDim }]}>
        {destructive ? "ผู้ช่วยขอยืนยันการลบ/ยกเลิกถาวร" : "ผู้ช่วยขอยืนยันก่อนทำ"}
      </Text>
      <Text style={styles.summary}>{proposal.summary}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={[
            styles.btn,
            styles.confirm,
            destructive ? (armed ? styles.dangerFill : styles.dangerOutline) : styles.blueFill,
            busy && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text
              style={[
                styles.btnText,
                destructive && !armed ? { color: C.danger } : { color: "#ffffff" },
              ]}
            >
              {confirmLabel}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={onReject} disabled={busy} style={[styles.btn, styles.reject, busy && styles.disabled]}>
          <Text style={[styles.btnText, { color: C.text }]}>ไม่ทำ</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderRadius: R.lg,
    padding: S.md,
  },
  head: { fontSize: 12, fontWeight: "600", marginBottom: S.xs },
  summary: { color: C.text, fontSize: 14, lineHeight: 20 },
  doneNote: { color: C.ok, fontSize: 13, marginTop: S.sm },
  actions: { flexDirection: "row", gap: S.sm, marginTop: S.md },
  btn: { minHeight: 44, borderRadius: R.md, alignItems: "center", justifyContent: "center", paddingHorizontal: S.md },
  confirm: { flex: 1 },
  reject: { backgroundColor: C.surfaceHi, paddingHorizontal: S.lg },
  blueFill: { backgroundColor: C.blue },
  dangerFill: { backgroundColor: C.danger },
  dangerOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.danger },
  btnText: { fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
