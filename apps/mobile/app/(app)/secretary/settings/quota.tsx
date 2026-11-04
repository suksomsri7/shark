// โควตางาน (ใบ S2.7 · แบบ B8 sec-b.jpg หน้า 8) — GET secretary/quota (อ่านอย่างเดียว · ไม่สร้างกระเป๋า/ไม่แจก)
//   ตัวเลขที่ผู้ใช้เห็น = งาน · % · วันรีเซ็ต (COMMON §C.6) — ไม่มีตัวเงิน/ยอดคงเหลือใด ๆ ในจอนี้
//   วงโควตา = % งานเดือนนี้ (ตัดที่ 100 · R-S1.13i) · แถวผู้ช่วยวันนี้ = assist เป็น % ของเพดานวัน (ไม่ใช่เงิน)
//   แพ็กเสียเงิน = การ์ดจาง "เร็ว ๆ นี้" (มติเจ้าของ 7.1/7.3 · ยังไม่เปิดขาย)
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, SectionLabel } from "@/src/components/airy";
import { SettingsTop } from "@/src/components/secretary/SettingRow";
import { QuotaBar, QuotaRing } from "@/src/components/secretary/QuotaRing";
import { dateBkk, daysUntil } from "@/src/components/secretary/bkk";
import { quotaNumbers, secGet, type QuotaView } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const MONTH: I18nKey[] = ["sec.month.1", "sec.month.2", "sec.month.3", "sec.month.4", "sec.month.5", "sec.month.6", "sec.month.7", "sec.month.8", "sec.month.9", "sec.month.10", "sec.month.11", "sec.month.12"];

export default function SecretaryQuotaScreen() {
  const { c } = useTheme();
  const t = useT();
  const { user, tenants, activeTenantId } = useAuth();
  const [q, setQ] = useState<QuotaView | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId) return;
      let live = true;
      secGet("secretary/quota")
        .then((r) => {
          if (!live) return;
          setQ(r);
          setFailed(false);
        })
        .catch(() => live && setFailed(true));
      return () => {
        live = false;
      };
    }, [activeTenantId]),
  );

  const n = quotaNumbers(q);
  const now = Date.now();
  const d = dateBkk(n.resetAt);
  const resetText = d ? t("sec.date.dm", { d: d.date, m: t(MONTH[d.month - 1] ?? "sec.month.1") }) : "–";
  const caption = t("sec.quota.caption", { reset: resetText, days: daysUntil(n.resetAt, now), left: n.left, used: n.used, limit: n.limit });
  const first = user?.name?.trim().split(/\s+/)[0] ?? "";
  const levelOk = n.level === "ok" && !n.blocked;

  return (
    <AiryScreen testID="sec-quota">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-quota-top" />
        <Text style={[styles.h, { color: c.text }]}>{t("sec.quota.packFree")}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{first ? t("sec.quota.subUser", { user: first, n: tenants.length }) : t("sec.quota.sub", { n: tenants.length })}</Text>

        <View style={styles.ring}>
          <QuotaRing testID="sec-quota-ring" pct={n.pct} caption={caption} />
        </View>
        {failed ? (
          <Text testID="sec-quota-error" style={[styles.state, styles.stateGap, { color: c.warn.fg }]}>
            {t("sec.set.loadFail")}
          </Text>
        ) : (
          <View style={styles.stateRow}>
            <Icon name={levelOk ? "check" : "alert-circle"} size={14} color={levelOk ? c.status.run : c.warn.fg} />
            <Text testID="sec-quota-level" style={[styles.state, { color: levelOk ? c.status.run : c.warn.fg }]}>
              {levelOk ? t("sec.quota.ok") : (n.text ?? t(n.blocked ? "sec.quota.blocked" : "sec.quota.warn"))}
            </Text>
          </View>
        )}

        <Glass testID="sec-quota-packs" radius={radii.btn} style={[styles.packs, styles.dim]}>
          <Text style={[styles.packsT, { color: c.text }]}>{t("sec.quota.packs")}</Text>
          <View style={[styles.soon, { backgroundColor: c.chip.bg }]}>
            <Text style={[styles.soonT, { color: c.textDim }]}>{t("sec.quota.soon")}</Text>
          </View>
        </Glass>

        <SectionLabel style={styles.label}>{t("sec.quota.assistLabel")}</SectionLabel>
        <Glass testID="sec-quota-assist" radius={radii.card} style={styles.card}>
          <View style={styles.assistRow}>
            <Text style={[styles.assistName, { color: c.text }]}>{t("sec.quota.assist")}</Text>
            <View style={styles.assistBar}>
              <QuotaBar pct={n.assistPct} thin />
            </View>
            <Text style={[styles.assistPct, { color: c.text }]}>{t("sec.set.pct", { n: n.assistPct })}</Text>
          </View>
          <Text style={[styles.assistNote, { color: c.textMuted }]}>{t("sec.quota.assistNote")}</Text>
        </Glass>

        <Glass testID="sec-quota-out" radius={radii.sugg} style={styles.card}>
          <View style={styles.outRow}>
            <Text style={[styles.outT, { color: c.text }]}>{t("sec.quota.outTitle")}</Text>
            <Text style={[styles.outB, { color: c.textMuted }]}>{t("sec.quota.outBody")}</Text>
          </View>
        </Glass>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  h: { fontSize: T.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: F.v(28) },
  sub: { fontSize: T.sub, lineHeight: 20, marginTop: 4 },
  ring: { marginTop: F.v(24) },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  state: { fontSize: T.cap + 0.5 },
  stateGap: { marginTop: 10 },
  packs: { marginTop: F.v(36), height: 56, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  dim: { opacity: 0.55 },
  packsT: { fontSize: T.body, fontWeight: "600" },
  soon: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.pill },
  soonT: { fontSize: 11.5, fontWeight: "600" },
  label: { marginTop: F.v(40), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
  card: { marginTop: 10 },
  assistRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  assistName: { fontSize: T.sub, width: 108 },
  assistBar: { flex: 1 },
  assistPct: { fontSize: T.sub, fontWeight: "700", width: 44, textAlign: "right" },
  assistNote: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: 8 },
  outRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  outT: { fontSize: T.sub, lineHeight: 20, width: 120 },
  outB: { flex: 1, fontSize: T.cap, lineHeight: 18, textAlign: "right" },
});
