// DNA Wizard — สร้างกิจการ + สัมภาษณ์ธุรกิจ → ประกอบระบบให้อัตโนมัติ
// ใช้ทั้งกิจการแรก (บังคับจาก gate) และกดเพิ่มจาก drawer (มีปุ่มยกเลิกกลับ)
//
// ⚠️ questions มาจาก GET (JSON) → ฟังก์ชัน skipIf/defaultWhenSkipped ฝั่ง server หลุดไปตอน serialize
//    จึงต้อง replicate เงื่อนไขข้ามคำถามฝั่ง client (ตรงกับ questions.ts: rewardRedeem, vatRegistered)
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/src/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, apiErrorText } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import {
  InlineError,
  LinkButton,
  PrimaryButton,
  SpinningOrb,
  inputPlaceholder,
  inputStyle,
} from "@/src/components/auth/ui";
import { C, R, S } from "@/src/theme";

type Choice = { value: string; label: string };
type ApiQuestion = {
  id: string;
  ask: string;
  kind: "choice" | "bool" | "number";
  choices?: Choice[];
  min?: number;
  max?: number;
};
type FactVal = string | number | boolean;
type Facts = Record<string, FactVal>;
type PlanStep = {
  type: "CREATE_UNIT" | "CREATE_SYSTEM" | "LINK_UNIT" | "LINK_ACCOUNT_POS" | "ACCOUNT_SETTINGS";
  name?: string;
  because: string;
};
type Plan = { dnaVersion: number; steps: PlanStep[] };

// เงื่อนไขข้ามคำถาม (ต้องตรงกับ skipIf/defaultWhenSkipped ใน src/lib/dna/questions.ts)
const SKIP: Record<string, { when: (f: Facts) => boolean; def: FactVal }> = {
  rewardRedeem: { when: (f) => f.membership === false, def: false },
  vatRegistered: { when: (f) => f.wantsAccounting === false, def: false },
};
const skip = (id: string, f: Facts) => (SKIP[id] ? SKIP[id].when(f) : false);

// พาดหัวภาษาคนต่อ step (ให้ตรงกับหน้า blueprint ฝั่งเว็บ)
function headline(step: PlanStep): string {
  switch (step.type) {
    case "CREATE_UNIT":
      return `เปิดหน้างาน “${step.name ?? ""}”`;
    case "CREATE_SYSTEM":
      return `เปิดระบบ “${step.name ?? ""}”`;
    case "LINK_UNIT":
      return "เชื่อมระบบเข้ากับหน้างาน";
    case "LINK_ACCOUNT_POS":
      return "ต่อยอดขายเข้าบัญชีอัตโนมัติ";
    case "ACCOUNT_SETTINGS":
      return "ตั้งค่าบัญชีของกิจการ";
  }
}

export default function DnaScreen() {
  const router = useRouter();
  const { tenants, switchTenant, refreshMe } = useAuth();
  const isAdding = useRef(tenants.length > 0); // เพิ่มกิจการ (มีอยู่แล้ว) → โชว์ปุ่มยกเลิก

  const [phase, setPhase] = useState<"name" | "interview" | "summary">("name");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const [questions, setQuestions] = useState<ApiQuestion[]>([]);
  const [answers, setAnswers] = useState<Facts>({});
  const [order, setOrder] = useState<string[]>([]); // ลำดับข้อที่ตอบแล้ว (ไว้ย้อนกลับ)
  const [numDraft, setNumDraft] = useState("");

  const [submitting, setSubmitting] = useState(false); // POST answers
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const [applying, setApplying] = useState(false); // POST apply
  const [err, setErr] = useState<string | null>(null);

  const current = useMemo(
    () => questions.find((q) => answers[q.id] === undefined && !skip(q.id, answers)) ?? null,
    [questions, answers],
  );

  // ── ขั้น 0: สร้างกิจการ + ดึงคำถาม ──
  async function createTenant() {
    const nm = name.trim();
    if (!nm) {
      setErr("กรุณากรอกชื่อกิจการ");
      return;
    }
    setErr(null);
    setCreating(true);
    try {
      const r = await api<{ tenantId: string }>("/api/mobile/tenants", { body: { name: nm }, tenant: false });
      await switchTenant(r.tenantId); // client จะแนบ X-Tenant-Id กิจการใหม่ให้อัตโนมัติ
      const q = await api<{ questions: ApiQuestion[] }>("/api/mobile/dna/questions");
      setQuestions(q.questions);
      setPhase("interview");
    } catch (x) {
      setErr(apiErrorText(x));
    } finally {
      setCreating(false);
    }
  }

  // ── ตอบคำถาม ──
  function answer(id: string, value: FactVal) {
    setErr(null);
    setNumDraft("");
    const next: Facts = { ...answers, [id]: value };
    setAnswers(next);
    setOrder((o) => [...o, id]);
    const more = questions.find((q) => next[q.id] === undefined && !skip(q.id, next));
    if (!more) void submitAnswers(next);
  }

  function submitNumber(q: ApiQuestion) {
    const n = Number(numDraft);
    const min = q.min ?? 0;
    const max = q.max ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isInteger(n) || n < min || n > max) {
      setErr(`กรุณาใส่ตัวเลข ${min}–${max}`);
      return;
    }
    answer(q.id, n);
  }

  function back() {
    setErr(null);
    setNumDraft("");
    if (order.length === 0) return;
    const last = order[order.length - 1];
    setOrder(order.slice(0, -1));
    setAnswers((a) => {
      const c = { ...a };
      delete c[last];
      return c;
    });
  }

  // ── ส่งคำตอบ → เสนอพิมพ์เขียว ──
  async function submitAnswers(facts: Facts) {
    // เติม default ให้ข้อที่ถูกข้าม (server ตรวจ facts ต้องครบทุก field)
    const full: Facts = { ...facts };
    for (const [id, cfg] of Object.entries(SKIP)) {
      if (full[id] === undefined && cfg.when(full)) full[id] = cfg.def;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api<{ blueprintId: string; plan: Plan }>("/api/mobile/dna/answers", {
        body: { facts: full },
      });
      setBlueprintId(r.blueprintId);
      setPlan(r.plan);
      setPhase("summary");
    } catch (x) {
      setErr(apiErrorText(x)); // ค้างที่ interview (current=null) → โชว์ปุ่มลองใหม่
    } finally {
      setSubmitting(false);
    }
  }

  // ── ประกอบระบบจริง ──
  async function apply() {
    if (!blueprintId) return;
    setApplying(true);
    setErr(null);
    try {
      const r = await api<{ ok: boolean; results: unknown[] }>("/api/mobile/dna/apply", {
        body: { blueprintId },
      });
      if (!r.ok) throw new Error("apply_failed");
      await refreshMe();
      router.replace("/(app)");
    } catch (x) {
      setErr(
        x instanceof Error && x.message === "apply_failed"
          ? "ประกอบระบบไม่สำเร็จ ลองอีกครั้ง"
          : apiErrorText(x),
      );
      setApplying(false); // สำเร็จแล้ว redirect ไม่ต้องปิด — พลาดถึงปิด spinner ให้กดใหม่
    }
  }

  async function cancel() {
    if (tenants[0]) await switchTenant(tenants[0].tenantId);
    router.replace("/(app)");
  }

  // ── overlay: กำลังประกอบระบบ ──
  if (applying) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.overlay}>
          <SpinningOrb size={96} />
          <Text style={styles.overlayText}>กำลังประกอบระบบ...</Text>
          <Text style={styles.overlayDim}>สักครู่นะครับ กำลังเปิดระบบให้ตามข้อมูลกิจการของคุณ</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* หัวข้อ + ยกเลิก (เฉพาะตอนเพิ่มกิจการ) */}
        <View style={styles.top}>
          {isAdding.current ? (
            <LinkButton label="ยกเลิก" onPress={cancel} tone="dim" />
          ) : (
            <View style={styles.topSpacer} />
          )}
          {phase === "interview" && questions.length > 0 && (
            <Text style={styles.progress}>
              ข้อ {Math.min(order.length + 1, questions.length)}/{questions.length}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* ── ขั้น 0: ชื่อกิจการ ── */}
          {phase === "name" && (
            <View style={styles.block}>
              <Text style={styles.h1}>ตั้งค่ากิจการใหม่</Text>
              <Text style={styles.sub}>เริ่มจากบอกชื่อกิจการของคุณก่อนครับ</Text>
              <View style={styles.gap} />
              <Text style={styles.label}>ชื่อกิจการ</Text>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (err) setErr(null);
                }}
                placeholder="เช่น ร้านตัดผมพี่ชาย"
                placeholderTextColor={inputPlaceholder}
                editable={!creating}
                style={inputStyle}
                onSubmitEditing={createTenant}
                returnKeyType="next"
              />
              <InlineError text={err} />
              <View style={styles.gap} />
              <PrimaryButton label="เริ่มตั้งค่า" onPress={createTenant} loading={creating} />
            </View>
          )}

          {/* ── ขั้นสัมภาษณ์ ── */}
          {phase === "interview" && (
            <View style={styles.block}>
              {submitting ? (
                <View style={styles.thinking}>
                  <SpinningOrb size={72} />
                  <Text style={styles.thinkingText}>กำลังออกแบบระบบให้คุณ...</Text>
                </View>
              ) : current ? (
                <View style={styles.qcard}>
                  <Text style={styles.ask}>{current.ask}</Text>

                  {current.kind === "choice" && (
                    <View style={styles.choices}>
                      {current.choices?.map((c) => (
                        <Pressable
                          key={c.value}
                          onPress={() => answer(current.id, c.value)}
                          style={({ pressed }) => [styles.choiceBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.choiceText}>{c.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {current.kind === "bool" && (
                    <View style={styles.boolRow}>
                      <Pressable
                        onPress={() => answer(current.id, true)}
                        style={({ pressed }) => [styles.boolBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.boolText}>ใช่</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => answer(current.id, false)}
                        style={({ pressed }) => [styles.boolBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.boolText}>ไม่ใช่</Text>
                      </Pressable>
                    </View>
                  )}

                  {current.kind === "number" && (
                    <View>
                      <TextInput
                        value={numDraft}
                        onChangeText={(t) => {
                          setNumDraft(t.replace(/[^0-9]/g, ""));
                          if (err) setErr(null);
                        }}
                        placeholder={`${current.min ?? 0}–${current.max ?? ""}`}
                        placeholderTextColor={inputPlaceholder}
                        keyboardType="number-pad"
                        style={[inputStyle, styles.numInput]}
                        onSubmitEditing={() => submitNumber(current)}
                        returnKeyType="next"
                      />
                      <View style={styles.gap} />
                      <PrimaryButton
                        label="ต่อไป"
                        onPress={() => submitNumber(current)}
                        disabled={numDraft === ""}
                      />
                    </View>
                  )}

                  <InlineError text={err} />
                  {order.length > 0 && (
                    <LinkButton label="ย้อนกลับ" onPress={back} tone="dim" />
                  )}
                </View>
              ) : (
                // ตอบครบแต่ POST answers พลาด → ให้ลองใหม่ (ห้ามค้างเงียบ)
                <View style={styles.qcard}>
                  <Text style={styles.ask}>ส่งคำตอบไม่สำเร็จ</Text>
                  <InlineError text={err} />
                  <View style={styles.gap} />
                  <PrimaryButton label="ลองอีกครั้ง" onPress={() => void submitAnswers(answers)} />
                  <LinkButton label="ย้อนกลับ" onPress={back} tone="dim" />
                </View>
              )}
            </View>
          )}

          {/* ── ขั้นสรุปพิมพ์เขียว ── */}
          {phase === "summary" && plan && (
            <View style={styles.block}>
              <Text style={styles.h1}>ระบบที่จะเปิดให้คุณ</Text>
              <Text style={styles.sub}>ตรวจดูให้ครบแล้วกดประกอบระบบได้เลยครับ</Text>
              <View style={styles.gap} />

              {plan.steps.length === 0 ? (
                <View style={styles.stepCard}>
                  <Text style={styles.stepHead}>ยังไม่จำเป็นต้องเปิดระบบเพิ่ม</Text>
                  <Text style={styles.stepWhy}>จากคำตอบของคุณ เริ่มใช้งานหน้าหลักได้เลย</Text>
                </View>
              ) : (
                plan.steps.map((step, i) => (
                  <View key={i} style={styles.stepCard}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={styles.stepHead}>{headline(step)}</Text>
                      <Text style={styles.stepWhy}>เพราะ {step.because}</Text>
                    </View>
                  </View>
                ))
              )}

              <InlineError text={err} />
              <View style={styles.gap} />
              <PrimaryButton
                label={plan.steps.length === 0 ? "เริ่มใช้งาน" : "ประกอบระบบให้เลย"}
                onPress={apply}
                loading={applying}
              />
              <LinkButton
                label="ย้อนกลับแก้คำตอบ"
                onPress={() => {
                  setPhase("interview");
                  back();
                }}
                tone="dim"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: S.lg,
    paddingTop: S.sm,
    minHeight: 40,
  },
  topSpacer: { width: 1 },
  progress: { color: C.textDim, fontSize: 14, fontWeight: "600" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: S.xl },
  block: { gap: S.xs },
  h1: { color: C.text, fontSize: 24, fontFamily: "IBMPlexSansThai_700Bold" },
  sub: { color: C.textDim, fontSize: 15, marginTop: S.xs },
  label: { color: C.textDim, fontSize: 14, marginBottom: S.sm },
  gap: { height: S.lg },

  qcard: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.xl,
    gap: S.md,
  },
  ask: { color: C.text, fontSize: 20, fontFamily: "IBMPlexSansThai_700Bold", lineHeight: 28 },
  choices: { gap: S.sm },
  choiceBtn: {
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingVertical: S.lg,
    paddingHorizontal: S.lg,
  },
  choiceText: { color: C.text, fontSize: 16, fontWeight: "600" },
  boolRow: { flexDirection: "row", gap: S.md },
  boolBtn: {
    flex: 1,
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingVertical: S.xl,
    alignItems: "center",
  },
  boolText: { color: C.text, fontSize: 18, fontFamily: "IBMPlexSansThai_700Bold" },
  pressed: { backgroundColor: C.blueSoft, borderColor: C.blue },
  numInput: { fontSize: 22, fontWeight: "700" },

  thinking: { alignItems: "center", gap: S.lg, paddingVertical: S.xl },
  thinkingText: { color: C.textDim, fontSize: 16 },

  stepCard: {
    flexDirection: "row",
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginBottom: S.sm,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: C.blueHi, fontSize: 13, fontWeight: "700" },
  stepBody: { flex: 1, gap: S.xs },
  stepHead: { color: C.text, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  stepWhy: { color: C.textDim, fontSize: 13, lineHeight: 19 },

  overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: S.lg, padding: S.xl },
  overlayText: { color: C.text, fontSize: 20, fontFamily: "IBMPlexSansThai_700Bold", marginTop: S.md },
  overlayDim: { color: C.textDim, fontSize: 14, textAlign: "center" },
});
