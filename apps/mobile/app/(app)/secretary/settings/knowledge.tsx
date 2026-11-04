// ความรู้ของกิจการ (ใบ S2.9 · แบบ B6 sec-b.jpg หน้า 6) — 3 ส่วน
//   1) กฎ/ข้อเท็จจริงที่รอเจ้าของยืนยัน: GET secretary/memories/pending (OWNER เท่านั้น · คนอื่นไม่ยิง) · ยืนยัน POST memories/[id]/confirm · ลบ DELETE memories/[id]
//   2) สิ่งที่เลขาเรียนรู้จากที่คุณสอน: GET secretary/lessons (ไม่รวม REJECTED) · ยืนยัน POST lessons/[id]/confirm · ไม่รับ DELETE lessons/[id] (OWNER)
//      ที่มา = ห้องงาน (sourceRoomId) · บทเรียนใช้ได้เฉพาะ CONFIRMED (design §8 · COMMON §C.9)
//   3) ข้อมูลสดวันนี้: GET secretary/digest → แถวตัวเลข (ไม่ใช่ block ข้อความ) · ส่วนที่ผู้ดูอ่านไม่ได้เซิร์ฟเวอร์ส่ง null = ไม่แสดง
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, Note, SectionLabel, type IconName } from "@/src/components/airy";
import { OwnerOnlyBadge, SettingsTop } from "@/src/components/secretary/SettingRow";
import { bahtText } from "@/src/components/secretary/bkk";
import { DEFAULT_SECRETARY_NAME, secDeleteId, secGet, secPostId, serverNote, useActiveRole, useSecretaryMe, type Digest, type Lesson, type PendingMemory } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

type Act = { kind: "memory" | "lesson"; id: string; confirm: boolean };

export default function SecretaryKnowledgeScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const role = useActiveRole();
  const owner = role === "OWNER";
  const sec = useSecretaryMe();
  const name = sec?.name ?? DEFAULT_SECRETARY_NAME;
  const { tenants, activeTenantId } = useAuth();
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const [facts, setFacts] = useState<PendingMemory[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    if (!activeTenantId) return;
    const my = ++seq.current;
    const live = () => my === seq.current;
    if (owner) {
      secGet("secretary/memories/pending")
        .then((r) => live() && setFacts(r.items ?? []))
        .catch(() => live() && setFacts([]));
    } else setFacts([]);
    secGet("secretary/lessons")
      .then((r) => live() && setLessons((r.items ?? []).filter((x) => x.status !== "REJECTED")))
      .catch(() => live() && setLessons([]));
    secGet("secretary/digest")
      .then((r) => live() && setDigest(r.digest ?? null))
      .catch(() => live() && setDigest(null));
  }, [activeTenantId, owner]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (a: Act) => {
    if (!owner || busy) return;
    setBusy(a.id);
    setNote(null);
    try {
      if (a.kind === "memory") await (a.confirm ? secPostId("secretary/memories/confirm", a.id) : secDeleteId("secretary/memories", a.id));
      else await (a.confirm ? secPostId("secretary/lessons/confirm", a.id) : secDeleteId("secretary/lessons", a.id));
      setNote({ text: t(a.confirm ? "sec.know.confirmed" : "sec.know.removed"), warn: false });
      load();
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("sec.set.saveFail"), warn: true });
    } finally {
      setBusy(null);
    }
  };

  const buttons = (kind: Act["kind"], id: string, canConfirm: boolean) =>
    owner ? (
      <View style={styles.btns}>
        {canConfirm ? (
          <Pressable
            testID={`sec-know-confirm-${id}`}
            disabled={busy !== null}
            onPress={() => void act({ kind, id, confirm: true })}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: c.accent }]}
          >
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.know.confirm")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID={`sec-know-reject-${id}`}
          disabled={busy !== null}
          onPress={() => void act({ kind, id, confirm: false })}
          accessibilityRole="button"
          style={[styles.btn, { backgroundColor: c.chip.bg }]}
        >
          <Text style={[styles.btnT, { color: c.text }]}>{t(kind === "memory" ? "sec.know.reject" : "sec.know.notThis")}</Text>
        </Pressable>
      </View>
    ) : null;

  const d = digest;
  const digestRows: { key: string; icon: IconName; label: string; value: string }[] = [];
  if (d?.sales) {
    digestRows.push({ key: "sales", icon: "shopping-bag", label: t("sec.know.d.salesToday"), value: t("sec.know.d.salesValue", { amount: t("sec.money.baht", { n: bahtText(d.sales.todaySatang) }), n: d.sales.todayCount }) });
    digestRows.push({ key: "sales7", icon: "trending-up", label: t("sec.know.d.sales7"), value: t("sec.money.baht", { n: bahtText(d.sales.d7Satang) }) });
  }
  if (d?.quietCustomers) digestRows.push({ key: "quiet", icon: "user-x", label: t("sec.know.d.quiet"), value: t("sec.know.d.people", { n: d.quietCustomers.count }) });
  if (d?.lowStock) digestRows.push({ key: "stock", icon: "package", label: t("sec.know.d.lowStock"), value: t("sec.know.d.items", { n: d.lowStock.count }) });
  if (d?.receivables) digestRows.push({ key: "ar", icon: "file-text", label: t("sec.know.d.receivables"), value: t("sec.know.d.arValue", { n: d.receivables.count, amount: t("sec.money.baht", { n: bahtText(d.receivables.totalSatang) }) }) });
  if (d?.tomorrow) digestRows.push({ key: "tomorrow", icon: "calendar", label: t("sec.know.d.tomorrow"), value: t("sec.know.d.appts", { n: d.tomorrow.appointments }) });
  if (d?.pending) digestRows.push({ key: "pending", icon: "clock", label: t("sec.know.d.pending"), value: t("sec.know.d.items", { n: d.pending.approvalsAged + d.pending.leavesAged + d.pending.shopOrders }) });

  return (
    <AiryScreen testID="sec-know">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-know-top" />
        <Text style={[styles.h, { color: c.text }]}>{t("sec.title.settingsKnowledge")}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.know.sub", { name, tenant: tenantName })}</Text>
        {!owner ? <OwnerOnlyBadge /> : null}
        {note ? (
          <Note warn={note.warn} testID="sec-know-note">
            {note.text}
          </Note>
        ) : null}

        <SectionLabel style={styles.label}>{t("sec.know.factsLabel")}</SectionLabel>
        {facts.length === 0 ? (
          <Text testID="sec-know-facts-empty" style={[styles.empty, { color: c.textMuted }]}>
            {owner ? t("sec.know.factsEmpty") : t("sec.know.factsOwner")}
          </Text>
        ) : (
          facts.map((f) => (
            <Glass key={f.id} testID="sec-know-fact" radius={radii.sugg} style={styles.card}>
              <View testID={`sec-know-fact-${f.id}`} style={styles.row}>
                <View style={[styles.ico, { backgroundColor: c.surface }]}>
                  <Icon name="bookmark" size={18} />
                </View>
                <View style={styles.body}>
                  <Text style={[styles.title, { color: c.text }]}>{f.content}</Text>
                  <Text style={[styles.meta, { color: c.textMuted }]}>{t("sec.know.factMeta")}</Text>
                </View>
              </View>
              {buttons("memory", f.id, true)}
            </Glass>
          ))
        )}

        <SectionLabel style={styles.label}>{t("sec.know.lessonsLabel", { name })}</SectionLabel>
        {lessons.length === 0 ? (
          <Text testID="sec-know-lessons-empty" style={[styles.empty, { color: c.textMuted }]}>
            {t("sec.know.lessonsEmpty")}
          </Text>
        ) : (
          lessons.map((l) => {
            const pending = l.status === "PENDING";
            return (
              <Glass key={l.id} testID="sec-know-lesson" radius={radii.sugg} style={styles.card}>
                <View testID={`sec-know-lesson-${l.id}`} style={styles.row}>
                  <View style={[styles.ico, { backgroundColor: c.surface }]}>
                    <Icon name="edit-3" size={18} />
                  </View>
                  <View style={styles.body}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, styles.flex, { color: c.text }]}>{l.pattern}</Text>
                      <View style={[styles.badge, { backgroundColor: pending ? c.accent : c.chip.bg }]}>
                        <Text style={[styles.badgeT, { color: pending ? c.onAccent : c.textDim }]}>{t(pending ? "sec.know.pending" : "sec.know.inUse")}</Text>
                      </View>
                    </View>
                    <Text style={[styles.meta, { color: c.textMuted }]}>
                      {t(l.sourceRoomId ? "sec.know.fromRoom" : "sec.know.fromTeach")} · {t("sec.know.used", { n: l.occurrences ?? 0 })}
                    </Text>
                  </View>
                  {l.sourceRoomId ? (
                    <Pressable testID={`sec-know-room-${l.id}`} onPress={() => router.push(`/secretary/room/${l.sourceRoomId}`)} accessibilityRole="link" hitSlop={8}>
                      <Icon name="chevron-right" size={18} color={c.iconDim} />
                    </Pressable>
                  ) : null}
                </View>
                {buttons("lesson", l.id, pending)}
              </Glass>
            );
          })
        )}

        <SectionLabel style={styles.label}>{t("sec.know.digestLabel")}</SectionLabel>
        <Glass testID="sec-know-digest" radius={radii.card} style={styles.card}>
          {digestRows.length === 0 ? (
            <Text style={[styles.meta, { color: c.textMuted }]}>{t("sec.know.digestEmpty")}</Text>
          ) : (
            digestRows.map((r, i) => (
              <View key={r.key} testID={`sec-know-digest-${r.key}`} style={[styles.dRow, i > 0 && [styles.dSep, { borderTopColor: c.divider }]]}>
                <Icon name={r.icon} size={16} color={c.textDim} />
                <Text style={[styles.dL, { color: c.textDim }]}>{r.label}</Text>
                <Text style={[styles.dV, { color: c.text }]}>{r.value}</Text>
              </View>
            ))
          )}
        </Glass>
        <Text style={[styles.foot, { color: c.textMuted }]}>{t("sec.know.foot", { name })}</Text>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  h: { fontSize: T.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: F.v(28) },
  sub: { fontSize: T.sub, lineHeight: 20, marginTop: 4 },
  label: { marginTop: F.v(36), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
  empty: { fontSize: T.cap + 0.5, marginTop: 10, marginLeft: F.v(10) },
  card: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  ico: { width: 40, height: 40, borderRadius: radii.k + 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  title: { fontSize: T.sub + 1, fontWeight: "600", lineHeight: 21 },
  meta: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: 3 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.k - 2 },
  badgeT: { fontSize: 11.5, fontWeight: "600" },
  btns: { flexDirection: "row", gap: 8, marginTop: 12, marginLeft: 52 },
  btn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill },
  btnT: { fontSize: 13, fontWeight: "600" },
  dRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  dSep: { borderTopWidth: 1 },
  dL: { flex: 1, fontSize: T.cap + 0.5 },
  dV: { fontSize: T.sub, fontWeight: "700" },
  foot: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: spacing.lg, textAlign: "center" },
});
