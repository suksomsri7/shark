// เริ่มงานใหม่ (ใบ S2.3 · แบบ A2 sec-a.jpg หน้า 2)
//   ทักทายด้วยชื่อ/คำลงท้ายของเลขา (secretary/me) · ข้อเสนอจาก secretary/suggestions (แตะ = เติมคำสั่งลงช่อง ไม่ส่งเอง · มติ 9)
//   "งานที่สั่งบ่อย" จาก secretary/frequent (แตะ = เติม) · 14 พ.ย. (แบบ Ⓐ newtask.png): ตัดส่วน "ระบบที่เลขาเข้าถึงได้" (secretary/access) ออกแล้ว
//   14 พ.ย. (แบบ Ⓑ) ส่งแล้วคุยต่อหน้าเดิม: กดส่ง ⇒ ฟองคำสั่งของเรา + "{ชื่อ} กำลังดูในระบบ…" ขึ้นทันที (RoomView seed · ไม่เปลี่ยนจอ/ไม่มีวงหมุน)
//     หัวจอเปลี่ยนเป็นชื่องาน · ✕ เป็น ‹ (กลับหน้ารวมงาน) · คำทักเดิมจางอยู่บนสุด · POST secretary/rooms สำเร็จ ⇒ RoomView ตัวเดิมได้ roomId แล้วโหลดห้อง
//     (สตรีม/อนุมัติ/ส่งต่อ ทำงานแบบห้องงานทุกอย่าง) · ห้องนี้ไปโผล่ในหน้ารวมห้องตามปกติ · ล้ม ⇒ กลับโหมดพิมพ์ ข้อความ+ไฟล์คืนช่องพิมพ์ + ข้อความแจ้ง
//   14 พ.ย. (แบบ Ⓒ) ปุ่ม + = แผ่นแนบ รูปภาพ/ถ่ายรูป/ไฟล์ (SecAttach) — ไฟล์ส่งไปกับคำสั่ง (`attachments` ของ POST rooms) · กำลังแนบ = ส่งไม่ได้
//   ส่ง = POST secretary/rooms { instruction, clientMessageId, attachments? }
//   R-Z28: clientMessageId เก็บใน ref จนส่งสำเร็จ (กดซ้ำ/ลองใหม่หลังเน็ตหลุด = รหัสเดิม → ห้องเดิม) · คำสั่งหรือกิจการเปลี่ยน = รหัสใหม่
//   R-Z30: 409 pending (ครั้งแรกยังเปิดห้องไม่เสร็จ) ⇒ retryPending รอ 1.5 วิ แล้วลองใหม่เงียบ ๆ ≤ 3 ครั้ง · กดซ้ำกันด้วย sendingRef
//   402 / quota ⇒ การ์ด "โควตางานเดือนนี้หมด" + ลิงก์ /secretary/settings/quota · 429 / อื่น ๆ ⇒ ข้อความสั้นใต้ข้อเสนอ
//   403 (suggestions / POST rooms · R-S2.14h) ⇒ การ์ดล็อก `sec-new-denied` + ล็อกช่องพิมพ์ (ปุ่มส่ง/+ ปิด · ไม่รับการพิมพ์)
//   ช่องพิมพ์ล่างสุด InputBar (ไม่มีปุ่มเสียง · มติ 16) · ปุ่มส่งกดไม่ได้เมื่อว่างหรือกำลังส่ง · ?q= เติมคำสั่งมาจาก C3
// ทุกเส้นผ่าน src/api/secretary.ts · ข้อความผ่าน i18n · สเกล R-UI1 (F.v = แบบ × 0.73 · ตัวอักษรตาม tokens.type)
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, IconBtn, InputBar, LoadError, Note, Orb, SectionLabel, TopBar } from "@/src/components/airy";
import { SuggestionList } from "@/src/components/secretary/SuggestionList";
import { RoomView, type RoomSeed } from "@/src/components/secretary/RoomView";
import { AttachSheet, AttachTray, localAttachments, useSecAttach } from "@/src/components/secretary/SecAttach";
import {
  DEFAULT_SECRETARY_NAME,
  clientMessageId,
  isDenied,
  normalizeFrequent,
  normalizeSuggestions,
  secGet,
  retryPending,
  secPost,
  startErrorKind,
  useSecretaryMe,
  type Frequent,
  type Suggestion,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { size, spacing, type as T } from "@/src/theme/tokens";

const INPUT_BOTTOM = 26;
type ErrKind = "quota" | "rate" | "denied" | "other";
const ERR_KEY = { rate: "sec.new.err.rate", denied: "sec.new.err.denied", other: "sec.new.err.other" } as const;

export default function SecretaryNewScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const { activeTenantId, tenants, user } = useAuth();
  const sec = useSecretaryMe();
  const name = sec?.name ?? DEFAULT_SECRETARY_NAME;
  const suffix = sec?.suffix ?? "";
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");

  const [text, setText] = useState(typeof params.q === "string" ? params.q : "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [frequent, setFrequent] = useState<Frequent[]>([]);
  /** ส่งแล้ว (แบบ Ⓑ): seed = ฟองที่ขึ้นทันที · roomId = ได้ห้องแล้ว (RoomView ตัวเดิมโหลดต่อ) */
  const [seed, setSeed] = useState<RoomSeed | null>(null);
  const [roomId, setRoomId] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const attach = useSecAttach();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErrKind | null>(null);
  const [denied, setDenied] = useState(false);
  const tenantRef = useRef(activeTenantId);
  /** R-Z28: รหัสกันส่งซ้ำของคำสั่งที่ยังส่งไม่สำเร็จ + คำสั่ง/กิจการที่รหัสนี้ผูกอยู่ */
  const cmidRef = useRef<string | null>(null);
  const cmidFor = useRef<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    tenantRef.current = activeTenantId;
    cmidRef.current = null;
  }, [activeTenantId]);

  useEffect(() => {
    if (typeof params.q === "string" && params.q) setText(params.q);
  }, [params.q]);

  const load = useCallback(() => {
    const tenant = activeTenantId;
    if (!tenant) return;
    const live = () => tenantRef.current === tenant;
    setDenied(false);
    const deny = (e: unknown) => {
      if (isDenied(e) && live()) setDenied(true);
      return null;
    };
    const sugg = secGet("secretary/suggestions").catch(deny);
    void sugg.then((r) => live() && setSuggestions(normalizeSuggestions(r)));
    // สั่งบ่อย: เส้นของตัวเอง · ไม่มี/ว่าง ⇒ ใช้ `frequent` ที่แนบมากับ suggestions (ร่าง API)
    void Promise.all([secGet("secretary/frequent").catch(() => null), sugg]).then(([f, s]) => {
      if (!live()) return;
      const own = normalizeFrequent(f);
      setFrequent((own.length > 0 ? own : normalizeFrequent(s, "frequent")).slice(0, 8));
    });
  }, [activeTenantId]);

  const sent = seed !== null;
  useFocusEffect(
    useCallback(() => {
      if (!sent) load();
    }, [load, sent]),
  );

  const fill = (instruction: string) => {
    setText(instruction);
    setErr(null);
  };

  const send = async () => {
    const typed = text.trim();
    if ((!typed && attach.items.length === 0) || !attach.ready || sendingRef.current || denied) return;
    // ไฟล์อย่างเดียว ⇒ คำสั่งปริยาย (เซิร์ฟเวอร์ต้องมีข้อความเสมอ)
    const instruction = typed || t("sec.attach.defaultText");
    const files = attach.take();
    const refs = attach.refs(files);
    sendingRef.current = true;
    setBusy(true);
    setErr(null);
    // แบบ Ⓑ: ฟองของเรา + กำลังดูในระบบ ขึ้นทันทีในหน้านี้ (ยังไม่มี roomId)
    setSeed({ title: instruction.length > 60 ? `${instruction.slice(0, 59)}…` : instruction, text: instruction, attachments: localAttachments(files), at: new Date().toISOString() });
    setText("");
    // คำสั่งเดิม (กดซ้ำ/ลองใหม่) = รหัสเดิม · แก้คำสั่ง/ไฟล์ หรือสลับกิจการ = รหัสใหม่
    const key = `${activeTenantId ?? ""}|${instruction}|${refs.map((r) => r.id).join(",")}`;
    if (cmidFor.current !== key) cmidRef.current = null;
    cmidRef.current = cmidRef.current ?? clientMessageId();
    cmidFor.current = key;
    const cmid = cmidRef.current;
    try {
      const r = await retryPending(() => secPost("secretary/rooms", { instruction, clientMessageId: cmid, ...(refs.length ? { attachments: refs } : {}) }));
      cmidRef.current = null;
      cmidFor.current = null;
      setRoomId(r.roomId); // RoomView ตัวเดิมโหลดห้องต่อ — ไม่เปลี่ยนจอ
    } catch (e) {
      // ล้ม ⇒ กลับโหมดพิมพ์ · ฟองหาย · ข้อความ+ไฟล์คืนช่องพิมพ์
      setSeed(null);
      setText((cur) => cur || typed);
      attach.restore(files);
      const k = startErrorKind(e);
      if (k === "denied") setDenied(true);
      else setErr(k);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace("/secretary"));
  // ชื่อผู้ใช้คำแรก (เช่น "คุณสุข") ให้คำทักสั้นพอบรรทัดเดียว
  const first = user?.name?.trim().split(/\s+/)[0] ?? "";
  const greet = first ? t("sec.new.greetUser", { suffix, user: first, name }) : t("sec.new.greet", { suffix, name });

  if (seed) {
    // แบบ Ⓑ: คุยต่อในหน้านี้ — คำทักเดิมจางอยู่บนสุด · หัว = ชื่องาน + ‹ กลับหน้ารวม (RoomView)
    return (
      <RoomView
        id={roomId}
        seed={seed}
        lead={
          <View testID="sec-new-lead" style={[styles.hello, styles.faded]}>
            <Orb size={size.orb - 6} />
            <Text style={[styles.hint, styles.helloX, { color: c.textMuted }]} numberOfLines={1}>
              {greet}
            </Text>
          </View>
        }
      />
    );
  }

  return (
    <AiryScreen testID="sec-new">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bar}>
          <TopBar
            testID="sec-new-top"
            left={<IconBtn testID="sec-new-close" icon="x" label={t("sec.new.close")} onPress={close} />}
            title={t("sec.title.new")}
            subtitle={tenantName}
            right={<View style={styles.spacer} />}
          />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hello}>
            <Orb size={size.orb + 4} testID="sec-new-orb" />
            <View style={styles.helloX}>
              <Text style={[styles.greet, { color: c.text }]}>{greet}</Text>
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("sec.new.hint")}</Text>
            </View>
          </View>

          {denied ? (
            <LoadError testID="sec-new-denied" denied />
          ) : err === "quota" ? (
            <Glass testID="sec-new-quota" style={styles.quota}>
              <Text style={[styles.quotaT, { color: c.text }]}>{t("sec.new.quota.title")}</Text>
              <Text style={[styles.quotaB, { color: c.textMuted }]}>{t("sec.new.quota.body")}</Text>
              <Pressable testID="sec-new-quota-link" accessibilityRole="link" onPress={() => router.push("/secretary/settings/quota")} style={styles.quotaLink}>
                <Text style={[styles.quotaL, { color: c.text }]}>{t("sec.new.quota.link")}</Text>
              </Pressable>
            </Glass>
          ) : err ? (
            <Note warn testID="sec-new-error">
              {t(ERR_KEY[err])}
            </Note>
          ) : null}

          {suggestions.length > 0 ? (
            <>
              <SectionLabel style={styles.label}>{t("sec.new.suggestLabel", { name })}</SectionLabel>
              <SuggestionList testID="sec-new-suggestion" items={suggestions.slice(0, 4)} onPick={(s) => fill(s.instruction)} />
            </>
          ) : null}

          {frequent.length > 0 ? (
            <>
              <SectionLabel style={styles.label}>{t("sec.new.frequentLabel")}</SectionLabel>
              <View testID="sec-new-frequent" style={styles.wrap}>
                {frequent.map((f, i) => (
                  <Chip key={`${i}-${f.instruction}`} testID={`sec-new-frequent-${i}`} label={f.title.length > 28 ? `${f.title.slice(0, 27)}…` : f.title} onPress={() => fill(f.instruction)} />
                ))}
              </View>
            </>
          ) : null}

        </ScrollView>

        <AttachTray items={attach.items} note={attach.note} onRemove={attach.remove} testID="sec-new-attach" />

        <InputBar
          testID="sec-new-input"
          sendTestID="sec-new-send"
          value={text}
          onChangeText={(v) => {
            if (denied) return; // R-S2.14h: ล็อกช่องพิมพ์เมื่อไม่มีสิทธิ์ (InputBar locked ด้วย)
            setText(v);
            if (err && err !== "quota") setErr(null);
          }}
          onSend={() => void send()}
          onPlus={() => setAttachOpen(true)}
          plusDisabled={denied}
          sendDisabled={(!text.trim() && attach.items.length === 0) || !attach.ready || busy || denied}
          locked={denied}
          placeholder={denied ? t("sec.new.lockedPh") : t("sec.new.input")}
          style={styles.input}
        />
      </KeyboardAvoidingView>
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={(k) => void attach.pick(k)} name={name} testID="sec-new-attach-sheet" />
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { paddingHorizontal: spacing.page, paddingTop: 14 },
  spacer: { width: size.iconBtn },
  page: { paddingHorizontal: spacing.page, paddingBottom: spacing.xl },
  hello: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: F.v(27) },
  helloX: { flex: 1, minWidth: 0 },
  greet: { fontSize: T.body, fontWeight: "700", lineHeight: 22 },
  hint: { fontSize: T.cap, lineHeight: 18, marginTop: 2 },
  label: { marginTop: F.v(36), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: F.v(16) },
  faded: { opacity: 0.45, marginTop: F.v(14) },
  quota: { marginTop: F.v(24) },
  quotaT: { fontSize: T.h, fontWeight: "700", lineHeight: 24 },
  quotaB: { fontSize: T.sub, lineHeight: 20, marginTop: spacing.xs },
  quotaLink: { marginTop: spacing.sm, alignSelf: "flex-start", paddingVertical: spacing.xs },
  quotaL: { fontSize: T.sub, fontWeight: "700", textDecorationLine: "underline" },
  input: { marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM },
});
