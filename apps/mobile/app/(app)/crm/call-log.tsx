// จอ ข "บันทึกสาย — วางสายแล้ว" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ข) — เด้งเองหลังกดโทรจากการ์ดดีลแล้วกลับเข้าแอป
// ผลสาย (ชิปจากทะเบียนของร้าน) · ระยะเวลา (เติมจากเวลาที่ออกไปโทร) · ทิศทาง · โน้ต · งานถัดไป · ยกเลิก/บันทึก
// API: GET /api/mobile/crm/call-log?contactId=&dealId= · POST /api/mobile/crm/call-log (idempotencyKey — กดซ้ำ = แถวเดียว)
// 🔴 บันทึกสำเร็จ = แถบยืนยันในจอ (ห้าม Alert) · รหัสกันกดซ้ำออกครั้งเดียวต่อการเปิดแผ่น (เน็ตหลุดแล้วกดใหม่ = รหัสเดิม)
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Text, TextInput } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import { Chip, CrmHeader, CrmNotice, crmApiPath, crmStyles, mmss, newIdempotencyKey, paramOf, parseMmss, type CrmCallPrompt } from "@/src/components/crm/ui";
import { C, S } from "@/src/theme";

const DIR_LABEL: Record<string, string> = { OUT: "โทรออก", IN: "สายเข้า" };

/** กำหนดของงานถัดไป = พรุ่งนี้ 10:00 เวลาไทย (ISO) */
function tomorrowTen(now = Date.now()): string {
  const OFFSET = 7 * 3_600_000;
  const t = new Date(now + OFFSET);
  const day = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 10) - OFFSET;
  return new Date(day).toISOString();
}

export default function CrmCallLogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const params = useLocalSearchParams<{ systemId?: string; contactId?: string; dealId?: string; durationSec?: string }>();
  const systemId = paramOf(params.systemId);
  const contactId = paramOf(params.contactId);
  const dealId = paramOf(params.dealId);
  const initialSec = Number(paramOf(params.durationSec) ?? 0);

  const [prompt, setPrompt] = useState<CrmCallPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [direction, setDirection] = useState<string>("OUT");
  const [duration, setDuration] = useState(mmss(Number.isFinite(initialSec) ? initialSec : 0));
  const [note, setNote] = useState("");
  const [nextTask, setNextTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!contactId) {
      setError("ไม่พบผู้ติดต่อของสายนี้ — เปิดบันทึกสายจากการ์ดดีลอีกครั้ง");
      setLoading(false);
      return;
    }
    let live = true;
    api<CrmCallPrompt>(crmApiPath("/api/mobile/crm/call-log", systemId, { contactId, dealId }))
      .then((p) => {
        if (!live) return;
        setPrompt(p);
        setOutcome(p.outcomes[0] ?? null);
      })
      .catch((e) => live && setError(apiErrorText(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [contactId, dealId, systemId]);

  async function save() {
    if (!prompt || busy || saved) return;
    setSaveError(null);
    const sec = parseMmss(duration);
    if (sec === null) {
      setSaveError("ระยะเวลาอ่านไม่ออก — ใส่เป็นนาที:วินาที เช่น 04:32");
      return;
    }
    if (!outcome) {
      setSaveError("เลือกผลสายก่อน — เช่น สนใจ · รับสาย · ไม่รับ");
      return;
    }
    setBusy(true);
    try {
      await api<{ activityId: string }>(crmApiPath("/api/mobile/crm/call-log", systemId), {
        body: {
          contactId: prompt.contact.id,
          dealId: prompt.deal?.id ?? null,
          direction,
          outcome,
          durationSec: sec,
          body: note.trim() || null,
          nextTask: nextTask.trim() ? { title: nextTask.trim(), type: "TASK", dueAt: tomorrowTen() } : null,
          idempotencyKey: key.current,
        },
      });
      setSaved(true);
    } catch (e) {
      setSaveError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const title = prompt ? `${prompt.contact.name}${prompt.deal ? ` — ${prompt.deal.title}` : ""}` : "บันทึกสาย";
  return (
    <View style={[crmStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <CrmHeader title={title} left="back" onLeft={() => (router.canGoBack() ? router.back() : router.replace(crmApiPath("/crm", systemId)))} />
        <ScrollView testID="crm-call-log" contentContainerStyle={[crmStyles.body, { paddingBottom: insets.bottom + S.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.sheetHead}>
            <Feather name="phone-off" size={15} color={C.text} />
            <Text style={crmStyles.sectionTitle}>บันทึกสาย — วางสายแล้ว</Text>
          </View>
          <CrmNotice text={error} tone="error" />
          {loading ? (
            <View style={crmStyles.center}>
              <ActivityIndicator color={brand.accent} />
            </View>
          ) : prompt ? (
            <>
              <View style={[crmStyles.card, styles.who]}>
                <Text style={styles.whoName} numberOfLines={1}>
                  {prompt.contact.name}
                </Text>
                {prompt.deal ? (
                  <Text style={crmStyles.dim} numberOfLines={1}>
                    {prompt.deal.title}
                  </Text>
                ) : null}
              </View>

              <Text style={crmStyles.label}>ผลสาย</Text>
              <View style={styles.wrap}>
                {prompt.outcomes.map((o, i) => (
                  <Chip key={o} testID={`crm-call-outcome-${i}`} label={o} on={outcome === o} onPress={() => setOutcome(o)} />
                ))}
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Text style={crmStyles.label}>ระยะเวลา</Text>
                  <TextInput testID="crm-call-duration" value={duration} onChangeText={setDuration} placeholder="04:32" placeholderTextColor={C.textFaint} style={crmStyles.input} keyboardType="numbers-and-punctuation" />
                </View>
                <View style={styles.col}>
                  <Text style={crmStyles.label}>ทิศทาง</Text>
                  <View style={styles.wrap}>
                    <Chip testID="crm-call-direction-OUT" label={DIR_LABEL.OUT!} on={direction === "OUT"} onPress={() => setDirection("OUT")} />
                    <Chip testID="crm-call-direction-IN" label={DIR_LABEL.IN!} on={direction === "IN"} onPress={() => setDirection("IN")} />
                  </View>
                </View>
              </View>

              <Text style={crmStyles.label}>โน้ต</Text>
              <TextInput testID="crm-call-note" value={note} onChangeText={setNote} placeholder="คุยอะไรกันบ้าง — เช่น สนใจแพ็กเกจ ขอใบเสนอราคาก่อนศุกร์นี้" placeholderTextColor={C.textFaint} style={[crmStyles.input, styles.note]} multiline />

              <Text style={crmStyles.label}>งานถัดไป (กำหนดพรุ่งนี้ 10:00)</Text>
              <TextInput testID="crm-call-next-task" value={nextTask} onChangeText={setNextTask} placeholder="เช่น ส่งใบเสนอราคา" placeholderTextColor={C.textFaint} style={crmStyles.input} />

              <CrmNotice text={saveError} tone="error" />
              {saved ? <CrmNotice testID="crm-call-saved" text="บันทึกสายแล้ว — ดูได้ในไทม์ไลน์ของผู้ติดต่อและดีลบนเว็บ" tone="ok" /> : null}
              <View style={styles.actions}>
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(crmApiPath("/crm", systemId)))} style={crmStyles.ghost}>
                  <Text style={crmStyles.ghostText}>{saved ? "กลับไปที่ดีล" : "ยกเลิก"}</Text>
                </Pressable>
                {/* บันทึกแล้วปุ่มยังอยู่ (กดไม่ได้) — กดซ้ำด้วยรหัสเดิมก็ได้แถวเดียวอยู่ดี แต่ไม่ต้องให้คนลังเลว่ากดไปหรือยัง */}
                <Pressable testID="crm-call-save" onPress={() => void save()} disabled={busy || saved} style={[crmStyles.primary, { backgroundColor: saved ? "#15803d" : C.text }, busy && crmStyles.off]}>
                  {busy ? <ActivityIndicator color={C.bg} /> : <Text style={[crmStyles.primaryText, { color: C.bg }]}>{saved ? "บันทึกแล้ว ✓" : "บันทึก"}</Text>}
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetHead: { flexDirection: "row", alignItems: "center", gap: S.sm },
  who: { padding: S.md, gap: 2 },
  whoName: { color: C.text, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  twoCol: { flexDirection: "row", gap: S.md },
  col: { flex: 1, minWidth: 0, gap: S.xs },
  note: { minHeight: 70, paddingTop: S.sm, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: S.md, marginTop: S.sm },
});
