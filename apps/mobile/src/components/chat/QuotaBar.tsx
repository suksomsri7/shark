// แถบโควตาผู้ช่วย AI — โผล่เมื่อใช้เกินครึ่งเท่านั้น (หน้าปกติสะอาด ไม่ยัดตัวเลขให้เจ้าของร้าน)
// ยิง GET /api/mobile/usage · ล้ม/ยังไม่ถึงครึ่ง = ไม่แสดงอะไรเลย (ห้ามขึ้น error รบกวน)
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { api } from "@/src/api/client";
import { C, R, S } from "@/src/theme";

type Usage = {
  scope: "session" | "week";
  used: number;
  limit: number;
  pct: number;
  warn: boolean;
  degraded: boolean;
  blocked: "session" | "week" | null;
  resetAt: string;
};

// เวลาที่โควตากลับมา แบบสั้นภาษาไทย (เลี่ยง Intl — Hermes ไม่ครบ)
function backAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins <= 0) return "อีกสักครู่";
  if (mins < 60) return `อีก ${mins} นาที`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `อีก ${hrs} ชม.`;
  return `อีก ${Math.round(hrs / 24)} วัน`;
}

export function QuotaBar() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Usage>("/api/mobile/usage")
        .then(setUsage)
        .catch(() => setUsage(null));
    }, []),
  );

  if (!usage || usage.pct < 50) return null;
  const full = usage.blocked !== null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.label, usage.warn && styles.labelWarn]}>
          {full ? "โควตาผู้ช่วย AI เต็มแล้ว" : `ใช้โควตาผู้ช่วย AI แล้ว ${usage.pct}%`}
        </Text>
        <Text style={styles.reset}>โควตาใหม่{backAt(usage.resetAt)}</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(100, usage.pct)}%` },
            usage.warn && styles.fillWarn,
          ]}
        />
      </View>
      {usage.degraded && !full && (
        <Text style={styles.note}>ตอนนี้ใช้โหมดประหยัดชั่วคราว เพื่อให้คุยต่อได้จนครบรอบ</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: S.lg,
    marginBottom: S.sm,
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.surface,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
  label: { fontSize: 12, color: C.textDim },
  labelWarn: { color: "#b45309", fontWeight: "600" },
  reset: { fontSize: 12, color: C.textFaint },
  track: {
    marginTop: S.sm,
    height: 5,
    borderRadius: R.full,
    backgroundColor: C.border,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: R.full, backgroundColor: C.blue },
  fillWarn: { backgroundColor: "#f59e0b" },
  note: { marginTop: S.sm, fontSize: 11, color: C.textFaint },
});
