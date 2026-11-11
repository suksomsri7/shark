// คุยกับลูกค้าแทนร้าน (ใบ S2.9 · แบบ B7 sec-b.jpg หน้า 7) — GET/PUT secretary/after-hours (OWNER เท่านั้นทั้งอ่านและตั้ง)
//   2 สวิตช์: reply (นอกเวลาทำการให้ Shark ตอบ) · handoff (ส่งต่อคนเมื่อไม่แน่ใจ) + ข้อความแจ้งลูกค้าว่าเป็น AI (disclosure)
//   disclosure ตรวจในแอปก่อนส่ง (กติกาเดียวกับเซิร์ฟเวอร์ R-S1.22d: ห้ามว่าง · ≤ 200 ตัว · ต้องมีคำ AI/เอไอ/ผู้ช่วย) — ไม่ผ่าน = ไม่ยิง PUT
//   ตัวอย่างข้อความ = คำนำหน้าคงที่ของเซิร์ฟเวอร์ + คำตอบตัวอย่าง + disclosure ที่กำลังแก้
//   บทบาทอื่น: ไม่ยิง GET (เซิร์ฟเวอร์ตอบ 403) — แสดงป้าย "เจ้าของเท่านั้น" + ข้อมูล PDPA
//   "เวลาทำการ" ตั้งบนเว็บ (หน้าแชทของร้าน) → เปิดหน้าแรก 1.0 (WebView) ด้วย ?open=/app/
// S2.19 (แบบ K4/K5 sec-k.jpg หน้า 4–5 · ต่อท้ายส่วน B7 · ทุกบทบาทที่ดูแชทได้): `InboxSettings` ด้านล่าง
//   ช่องทางที่เชื่อม (GET inbox/connections · masked · อ่านอย่างเดียว · ตั้งบนเว็บ) · ตอบเร็ว (GET inbox/quick-replies · แก้บนเว็บ) ·
//   แจ้งเตือนแชท ทุกข้อความ/เฉพาะที่มอบหมาย/ปิด (GET/PUT secretary/notify kind=inbox) ·
//   K5 กฎรับเรื่อง (GET/PUT inbox/routing · แก้ได้เฉพาะ OWNER/MANAGER — เซิร์ฟเวอร์ตรวจซ้ำ) + SLA (อ่านอย่างเดียว) + เข้า/ออกเวร (POST inbox/shift · คนที่ตอบลูกค้าได้)
//   inbox/systems 403 ⇒ ไม่แสดงส่วนแชทลูกค้า
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, LoadError, Loading, Note, PrimaryButton, SectionLabel, Segment } from "@/src/components/airy";
import { Avatar, ChannelBadge, firstName, useChannelLabel } from "@/src/components/customers/parts";
import {
  NOTIFY_MODES,
  ROUTING_MODES,
  getCurrentSystem,
  inboxGet,
  inboxNote,
  inboxPost,
  inboxPut,
  setInboxCanReply,
  statusOf,
  type Connection,
  type NotifyMode,
  type QuickReply,
  type Routing,
  type RoutingRule,
} from "@/src/api/inbox";
import type { I18nKey } from "@/src/i18n";
import { OwnerOnlyBadge, SettingRow, SettingsTop, Toggle } from "@/src/components/secretary/SettingRow";
import { DISCLOSURE_MAX, disclosureProblem, isDenied, secGet, secPut, serverNote, useActiveRole, type AfterHours } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const PROBLEM = { empty: "sec.cust.err.empty", noAi: "sec.cust.err.noAi", long: "sec.cust.err.long" } as const;
const same = (a: AfterHours | null, b: AfterHours | null) => !!a && !!b && a.reply === b.reply && a.handoff === b.handoff && a.disclosure.trim() === b.disclosure.trim();

export default function SecretaryCustomersScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const role = useActiveRole();
  const owner = role === "OWNER";
  const { tenants, activeTenantId } = useAuth();
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const [saved, setSaved] = useState<AfterHours | null>(null);
  const [form, setForm] = useState<AfterHours | null>(null);
  const [problem, setProblem] = useState<keyof typeof PROBLEM | null>(null);
  const [busy, setBusy] = useState(false);
  const saveRef = useRef(false); // R-Z30: กดบันทึกซ้ำในรอบเดียวกัน ⇒ PUT ครั้งเดียว
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  // R-S2.14h: ล้มก่อนได้ after-hours = LoadError (403 = การ์ดล็อก · อื่น ๆ = ลองใหม่)
  const [loadErr, setLoadErr] = useState<"denied" | "error" | null>(null);
  const [tick, setTick] = useState(0);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId || !owner) return;
      let live = true;
      secGet("secretary/after-hours")
        .then((r) => {
          if (!live) return;
          setSaved(r);
          setForm(r);
          setLoadErr(null);
        })
        .catch((e) => live && setLoadErr(isDenied(e) ? "denied" : "error"));
      return () => {
        live = false;
      };
    }, [activeTenantId, owner, tick]),
  );
  const retry = useCallback(() => {
    setLoadErr(null);
    setTick((x) => x + 1);
  }, []);

  const dirty = !!form && !same(form, saved);
  const set = (patch: Partial<AfterHours>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setNote(null);
    if (patch.disclosure !== undefined) setProblem(null);
  };

  const save = async () => {
    if (!form || !dirty || busy || saveRef.current) return;
    const p = disclosureProblem(form.disclosure);
    if (p) {
      setProblem(p);
      return;
    }
    const tenant = activeTenantId;
    saveRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      const r = await secPut("secretary/after-hours", { reply: form.reply, handoff: form.handoff, disclosure: form.disclosure.trim() });
      if (tenantRef.current !== tenant) return;
      setSaved(r);
      setForm(r);
      setNote({ text: t("sec.set.savedShort"), warn: false });
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("sec.set.saveFail"), warn: true });
    } finally {
      saveRef.current = false;
      setBusy(false);
    }
  };

  const openHours = () => router.push({ pathname: "/", params: { open: "/app/", t: String(Date.now()) } });

  return (
    <AiryScreen testID="sec-cust">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-cust-top" title={t("sec.title.settingsCustomers")} subtitle={tenantName} />
        {!owner ? (
          <>
            <OwnerOnlyBadge />
            <Text testID="sec-cust-owner" style={[styles.intro, { color: c.textMuted }]}>
              {t("sec.cust.ownerOnly")}
            </Text>
          </>
        ) : null}
        {note ? (
          <Note warn={note.warn} testID="sec-cust-note">
            {note.text}
          </Note>
        ) : null}

        {/* S2.14: ก่อนได้ after-hours = Loading · ล้ม = LoadError เดียวกับทุกจอ (R-S2.14h) */}
        {owner && !form ? (
          loadErr ? (
            <LoadError testID="sec-cust-error" denied={loadErr === "denied"} onRetry={retry} />
          ) : (
            <Loading testID="sec-cust-loading" />
          )
        ) : null}
        {owner && form ? (
          <>
            <Glass radius={radii.sugg} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.body}>
                  <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.reply.title")}</Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.reply.sub")}</Text>
                </View>
                <Toggle testID="sec-cust-afterhours" value={form.reply} onChange={(v) => set({ reply: v })} label={t("sec.cust.reply.title")} />
              </View>
            </Glass>

            <Glass radius={radii.sugg} style={styles.card}>
              <Text style={[styles.sampleL, { color: c.sys.dorm }]}>{t("sec.cust.sampleLabel")}</Text>
              <Text testID="sec-cust-sample" style={[styles.sampleT, { color: c.text }]}>
                {t("sec.cust.prefix")}
                {t("sec.cust.sampleAnswer", { shop: tenantName })}
                {"\n"}
                {form.disclosure.trim()}
              </Text>
            </Glass>

            <Glass radius={radii.sugg} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.body}>
                  <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.handoff.title")}</Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.handoff.sub")}</Text>
                </View>
                <Toggle testID="sec-cust-handoff" value={form.handoff} onChange={(v) => set({ handoff: v })} label={t("sec.cust.handoff.title")} />
              </View>
            </Glass>

            <Glass radius={radii.sugg} style={styles.card}>
              <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.disclosure.title")}</Text>
              <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.disclosure.sub")}</Text>
              <TextInput
                testID="sec-cust-disclosure"
                value={form.disclosure}
                onChangeText={(v) => set({ disclosure: v })}
                multiline
                maxLength={DISCLOSURE_MAX + 50}
                placeholderTextColor={c.placeholder}
                style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: problem ? c.warn.fg : c.glass.border }]}
              />
              {problem ? (
                <Text testID="sec-cust-disclosure-error" style={[styles.err, { color: c.warn.fg }]}>
                  {t(PROBLEM[problem], { n: DISCLOSURE_MAX })}
                </Text>
              ) : null}
            </Glass>

            <View style={styles.save}>
              <PrimaryButton testID="sec-cust-save" label={busy ? t("sec.set.saving") : t("sec.set.save")} disabled={!dirty || busy} onPress={() => void save()} />
            </View>
            <SettingRow testID="sec-cust-hours" icon="clock" title={t("sec.cust.hours.title")} sub={t("sec.cust.hours.sub")} onPress={openHours} />
          </>
        ) : null}

        <InboxSettings onWeb={openHours} />

        <SectionLabel style={styles.label}>{t("sec.cust.pdpaLabel")}</SectionLabel>
        <Glass radius={radii.sugg} style={styles.card}>
          <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.pdpa1.title")}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.pdpa1.body")}</Text>
        </Glass>
        <Glass radius={radii.sugg} style={styles.card}>
          <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.pdpa2.title")}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.pdpa2.body")}</Text>
        </Glass>
      </ScrollView>
    </AiryScreen>
  );
}


// ───────── K4/K5 แชทลูกค้า (ใบ S2.19) ─────────
const MODE_LABEL: Record<string, I18nKey> = { ROUND_ROBIN: "cust.rule.ROUND_ROBIN", LAST_ASSIGNEE: "cust.rule.LAST_ASSIGNEE", OWNER: "cust.rule.OWNER" };
const NOTIFY_LABEL: Record<NotifyMode, I18nKey> = { ALL: "cust.notify.ALL", ASSIGNED: "cust.notify.ASSIGNED", OFF: "cust.notify.OFF" };
const isNotify = (v: unknown): v is NotifyMode => typeof v === "string" && (NOTIFY_MODES as readonly string[]).includes(v);
type Draft = Omit<RoutingRule, "id">;
const sameRules = (a: Draft[], b: Draft[]) => JSON.stringify(a) === JSON.stringify(b);
const toDraft = (r: Routing | null): Draft[] =>
  (r?.rules ?? [])
    .slice()
    .sort((x, y) => x.order - y.order)
    .map((x, i) => ({ channel: x.channel ?? null, mode: x.mode, enabled: x.enabled, order: i }));

function InboxSettings({ onWeb }: { onWeb: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const chLabel = useChannelLabel();
  const role = useActiveRole();
  const manager = role === "OWNER" || role === "MANAGER";
  const { activeTenantId, user } = useAuth();
  const myId = user?.id ?? null;
  const [ok, setOk] = useState<boolean | null>(null);
  const [systemId, setSystemId] = useState<string | undefined>(undefined);
  const [canReply, setCanReply] = useState(false);
  const [conns, setConns] = useState<Connection[]>([]);
  const [quick, setQuick] = useState<QuickReply[]>([]);
  const [notify, setNotify] = useState<NotifyMode | null>(null);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [rules, setRules] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const busyRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId) return;
      let live = true;
      (async () => {
        try {
          const sys = await inboxGet("inbox/systems");
          const list = sys.items ?? [];
          const cur = getCurrentSystem();
          const sid = cur && list.some((x) => x.id === cur) ? cur : list[0]?.id;
          if (!live) return;
          setOk(!!sid);
          setSystemId(sid);
          setCanReply(sys.canReply !== false);
          setInboxCanReply(sys.canReply !== false);
          if (!sid) return;
          // R-S2.14h: เส้นย่อยล้มที่ไม่ใช่ 403 = ทั้งส่วนเป็น LoadError (ไม่วาด "ยังไม่ได้เชื่อม/ยังไม่มีกฎ" แทนผลจริง) · 403 = ซ่อนส่วนนั้นตามเดิม
          let subFailed = false;
          const soft = <R,>(p: Promise<R>) =>
            p.catch((e: unknown) => {
              if (statusOf(e) !== 403) subFailed = true;
              return null;
            });
          const [cn, qr, rt, nf] = await Promise.all([
            soft(inboxGet("inbox/connections", { systemId: sid })),
            soft(inboxGet("inbox/quick-replies", { systemId: sid })),
            soft(inboxGet("inbox/routing", { systemId: sid })),
            soft(inboxGet("secretary/notify")),
          ]);
          if (!live) return;
          if (subFailed) {
            setFailed(true);
            return;
          }
          setFailed(false);
          setConns(cn?.items ?? []);
          setQuick(qr?.items ?? []);
          setRouting(rt);
          setRules(toDraft(rt));
          const m = nf?.prefs?.inbox;
          setNotify(isNotify(m) ? m : nf ? "ALL" : null);
          setLoaded(true);
        } catch (e) {
          if (!live) return;
          // inbox/systems 403 = ไม่แสดงส่วนแชทลูกค้า (เดิม) · ล้มแบบอื่น = LoadError+ลองใหม่
          if (statusOf(e) === 403) setOk(false);
          else setFailed(true);
        }
      })();
      return () => {
        live = false;
      };
    }, [activeTenantId, tick]),
  );
  const retry = useCallback(() => {
    setFailed(false);
    setTick((x) => x + 1);
  }, []);

  const guard = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote({ text: inboxNote(e) ?? t("cust.err"), warn: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveNotify = (m: string) => {
    if (!isNotify(m) || m === notify) return;
    const prev = notify;
    setNotify(m);
    void guard(async () => {
      try {
        await inboxPut("secretary/notify", { kind: "inbox", mode: m });
      } catch (e) {
        setNotify(prev);
        throw e;
      }
    });
  };

  const onDuty = routing?.onDuty ?? [];
  const meOnDuty = !!myId && onDuty.some((d) => d.userId === myId);
  const toggleShift = () =>
    guard(async () => {
      await inboxPost("inbox/shift", { onDuty: !meOnDuty });
      const rt = await inboxGet("inbox/routing", { systemId });
      setRouting(rt);
      setNote({ text: t(meOnDuty ? "cust.shift.offOk" : "cust.shift.onOk"), warn: false });
    });

  const dirty = !sameRules(rules, toDraft(routing));
  const patch = (i: number, p: Partial<Draft>) => setRules((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRules((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const nx = cur.slice();
      [nx[i], nx[j]] = [nx[j]!, nx[i]!];
      return nx.map((r, k) => ({ ...r, order: k }));
    });
  const chans = [null, ...Array.from(new Set(conns.map((x) => x.type)))];
  const cycleChannel = (i: number) => patch(i, { channel: chans[(chans.indexOf(rules[i]?.channel ?? null) + 1) % chans.length] ?? null });
  const saveRules = () =>
    guard(async () => {
      const rt = await inboxPut("inbox/routing", { systemId, rules: rules.map((r, i) => ({ channel: r.channel, mode: r.mode, enabled: r.enabled, order: i })) });
      setRouting(rt);
      setRules(toDraft(rt));
      setNote({ text: t("sec.set.savedShort"), warn: false });
    });

  if (ok === false) return null;
  // S2.14: ยังไม่รู้ช่องทาง/กฎ = Loading (ไม่โชว์ "ยังไม่ได้เชื่อม/ยังไม่มีกฎ" ก่อนผลมา) · ล้มก่อนได้ผล = LoadError (R-S2.14h)
  if (!loaded) return failed ? <LoadError testID="cust-set-error" onRetry={retry} /> : <Loading testID="cust-set-loading" />;
  const dutyNames = onDuty.map((d) => firstName(d.name)).filter(Boolean).join(" · ");
  return (
    <>
      {/* K4 ช่องทางที่เชื่อม */}
      <SectionLabel style={styles.label}>{t("cust.set.channels")}</SectionLabel>
      <View testID="cust-set-channels">
        {conns.length === 0 ? (
          <Glass radius={radii.sugg} style={styles.card}>
            <Text style={[styles.sub, { color: c.textMuted }]}>{t("cust.set.noChannels")}</Text>
          </Glass>
        ) : null}
        {conns.map((x) => {
          const on = x.status === "ACTIVE";
          return (
            <Glass key={x.id} radius={radii.sugg} style={styles.card}>
              <View style={styles.row}>
                <ChannelBadge channel={x.type} size={40} />
                <View style={styles.body}>
                  <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
                    {chLabel(x.type)} <Text style={[styles.sub, { color: c.textMuted }]}>{x.displayName}</Text>
                  </Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>{t(on ? "cust.set.connected" : x.lastErrorAt ? "cust.set.connError" : "cust.set.connOff")}</Text>
                </View>
                <View style={[styles.dot, { backgroundColor: on ? c.status.run : c.status.done }]} />
              </View>
            </Glass>
          );
        })}
        <Pressable testID="cust-set-channels-web" onPress={onWeb} accessibilityRole="link" style={styles.web}>
          <Text style={[styles.webT, { color: c.cust.ai }]}>{t("cust.set.onWeb")}</Text>
        </Pressable>
      </View>

      {/* K4 ตอบเร็ว */}
      <SectionLabel style={styles.label}>{t("cust.set.quick")}</SectionLabel>
      <View testID="cust-set-quick" style={styles.quickWrap}>
        {quick.map((q) => (
          <View key={q.id} style={[styles.quick, { backgroundColor: c.chip.bg }]}>
            <Text style={[styles.quickT, { color: c.textDim }]} numberOfLines={1}>
              {q.title}
            </Text>
          </View>
        ))}
        <Pressable testID="cust-set-quick-web" onPress={onWeb} accessibilityRole="link" style={[styles.quick, styles.quickAdd, { borderColor: c.divider }]}>
          <Text style={[styles.quickT, { color: c.textMuted }]}>{t("cust.set.quickAdd")}</Text>
        </Pressable>
      </View>

      {/* K4 แจ้งเตือนแชท */}
      <SectionLabel style={styles.label}>{t("cust.set.notify")}</SectionLabel>
      {notify ? (
        <Segment testID="cust-set-notify" options={NOTIFY_MODES.map((m) => ({ key: m, label: t(NOTIFY_LABEL[m]) }))} value={notify} onChange={saveNotify} />
      ) : (
        <Text testID="cust-set-notify" style={[styles.sub, { color: c.textMuted }]}>
          {t("cust.set.notifyUnavailable")}
        </Text>
      )}

      {note ? (
        <Note warn={note.warn} testID="cust-set-note">
          {note.text}
        </Note>
      ) : null}

      {/* K5 กฎรับเรื่องใหม่ */}
      <SectionLabel style={styles.label}>{t("cust.set.routing")}</SectionLabel>
      <View testID="cust-set-routing">
        <Text style={[styles.intro, { color: c.textMuted }]}>{t(manager ? "cust.set.routingIntro" : "cust.set.routingReadOnly")}</Text>
        {rules.length === 0 ? (
          <Glass radius={radii.sugg} style={styles.card}>
            <Text style={[styles.sub, { color: c.textMuted }]}>{t("cust.set.noRules")}</Text>
          </Glass>
        ) : null}
        {rules.map((r, i) => (
          <Glass key={i} radius={radii.sugg} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.body}>
                <Text style={[styles.title, { color: c.text }]}>{MODE_LABEL[r.mode] ? t(MODE_LABEL[r.mode]!) : r.mode}</Text>
                <Text style={[styles.sub, { color: c.textMuted }]}>
                  {r.mode === "ROUND_ROBIN" && dutyNames ? t("cust.rule.rrSub", { names: dutyNames, n: onDuty.length }) : t(r.mode === "LAST_ASSIGNEE" ? "cust.rule.lastSub" : r.mode === "OWNER" ? "cust.rule.ownerSub" : "cust.rule.rrNone")}
                </Text>
                <View style={styles.ruleTools}>
                  <Pressable testID="cust-set-rule-channel" onPress={() => cycleChannel(i)} disabled={!manager} accessibilityRole="button" style={[styles.chip, { backgroundColor: c.chip.bg }]}>
                    <Text style={[styles.chipT, { color: c.chip.fg }]}>{r.channel ? chLabel(r.channel) : t("cust.ch.all")}</Text>
                  </Pressable>
                  {manager ? (
                    <>
                      <Pressable testID="cust-set-rule-up" onPress={() => move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={t("cust.rule.up")} style={styles.tool}>
                        <Icon name="arrow-up" size={16} color={i === 0 ? c.btnOff.fg : c.icon} />
                      </Pressable>
                      <Pressable testID="cust-set-rule-down" onPress={() => move(i, 1)} disabled={i === rules.length - 1} accessibilityRole="button" accessibilityLabel={t("cust.rule.down")} style={styles.tool}>
                        <Icon name="arrow-down" size={16} color={i === rules.length - 1 ? c.btnOff.fg : c.icon} />
                      </Pressable>
                      <Pressable testID="cust-set-rule-remove" onPress={() => setRules((cur) => cur.filter((_, j) => j !== i).map((x, k) => ({ ...x, order: k })))} accessibilityRole="button" accessibilityLabel={t("cust.rule.remove")} style={styles.tool}>
                        <Icon name="trash-2" size={16} color={c.bad.fg} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
              <Toggle testID="cust-set-rule-toggle" value={r.enabled} onChange={(v) => patch(i, { enabled: v })} disabled={!manager} label={MODE_LABEL[r.mode] ? t(MODE_LABEL[r.mode]!) : r.mode} />
            </View>
          </Glass>
        ))}
        {manager && rules.length < 20 ? (
          <View style={styles.addRow}>
            {ROUTING_MODES.map((m) => (
              <Pressable testID="cust-set-rule-add" key={m} onPress={() => setRules((cur) => [...cur, { channel: null, mode: m, enabled: true, order: cur.length }])} accessibilityRole="button" style={[styles.chip, { backgroundColor: c.chip.bg }]}>
                <Text style={[styles.chipT, { color: c.chip.fg }]}>+ {t(MODE_LABEL[m]!)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {manager ? (
          <View style={styles.save}>
            <PrimaryButton testID="cust-set-routing-save" label={busy ? t("sec.set.saving") : t("sec.set.save")} disabled={!dirty || busy} onPress={() => void saveRules()} />
          </View>
        ) : null}
        {routing?.sla ? (
          <>
            <SettingRow testID="cust-set-sla-first" title={t("cust.sla.first")} value={routing.sla.firstResponseMin ? t("cust.sla.min", { n: routing.sla.firstResponseMin }) : t("cust.sla.off")} />
            <SettingRow testID="cust-set-sla-unassigned" title={t("cust.sla.unassigned")} value={routing.sla.unassignedAlertMin ? t("cust.sla.min", { n: routing.sla.unassignedAlertMin }) : t("cust.sla.off")} />
          </>
        ) : null}
      </View>

      {/* K5 เข้าเวร */}
      <SectionLabel style={styles.label}>{t("cust.shift.title")}</SectionLabel>
      <View testID="cust-set-shift">
        <View style={styles.dutyRow}>
          {onDuty.slice(0, 6).map((d) => (
            <Avatar key={d.userId} name={d.name} seed={d.userId} size={34} />
          ))}
          <Text style={[styles.sub, styles.body, { color: c.textMuted }]} numberOfLines={2}>
            {dutyNames || t("cust.shift.none")}
          </Text>
        </View>
        {canReply ? (
          <Glass radius={radii.sugg} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.body}>
                <Text style={[styles.title, { color: c.text }]}>{t(meOnDuty ? "cust.shift.meOn" : "cust.shift.meOff")}</Text>
                <Text style={[styles.sub, { color: c.textMuted }]}>{t("cust.shift.sub")}</Text>
              </View>
              <Toggle testID="cust-set-shift-toggle" value={meOnDuty} onChange={() => void toggleShift()} disabled={busy} label={t("cust.shift.title")} />
            </View>
          </Glass>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  intro: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: spacing.md },
  card: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { flex: 1 },
  title: { fontSize: T.sub + 1.5, fontWeight: "700", lineHeight: 22 },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: 3 },
  sampleL: { fontSize: T.cap - 1, fontWeight: "700" },
  sampleT: { fontSize: T.sub + 0.5, lineHeight: 23, marginTop: 6 },
  input: { minHeight: 70, borderRadius: radii.segIn + 2, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.sub, lineHeight: 20, marginTop: 10, textAlignVertical: "top" },
  err: { fontSize: T.cap, lineHeight: 18, marginTop: 6 },
  save: { marginTop: spacing.lg, marginBottom: 4 },
  label: { marginTop: F.v(36), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  web: { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 4 },
  webT: { fontSize: T.cap + 0.5, fontWeight: "600" },
  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  quick: { borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 14, maxWidth: 220 },
  quickAdd: { borderWidth: 1, borderStyle: "dashed" },
  quickT: { fontSize: 13.5 },
  ruleTools: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  chip: { borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 12 },
  chipT: { fontSize: T.cap },
  tool: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  addRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
});
