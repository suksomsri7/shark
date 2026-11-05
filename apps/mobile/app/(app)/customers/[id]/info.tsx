// ข้อมูลลูกค้า (ใบ S2.19 · แบบ K3 sec-k.jpg หน้า 3 · sec-dark-k.jpg หน้า 3)
//   ข้อมูล (S1.21 · ชื่อเส้นในตาราง src/api/inbox.ts): GET inbox/conversations/[id] (contact · linkedMember · helpers · ผู้ดูแล · สถานะ) ·
//     GET inbox/staff?unitId (คนที่ตอบได้ในหน่วยของห้อง) · เขียน: …/assign · …/handoff (เหตุผลบังคับ · 409 = ผู้ดูแลเปลี่ยนระหว่างกด) ·
//     …/helpers · …/status · …/contact (ผูก/ถอดสมาชิก · ค้นจาก member/search เดิม)
//   🔴 3 แชทไม่ปน: "สั่ง Shark เรื่องลูกค้านี้" = POST secretary/rooms {instruction, clientMessageId, context:{chatConversationId, contactId}}
//      (รหัสเท่านั้น — ไม่ใส่ชื่อ/เบอร์ลูกค้าลงคำสั่ง) → เปิดห้องเลขา /secretary/room/<id> · จอนี้ไม่มีเส้นตอบลูกค้า
//   🔴 PII: เบอร์สมาชิกแสดงแบบปิดกลาง (maskPhone) · ไม่เก็บลงเครื่อง
//   สิทธิ์ (R-S2.17a): canReply จาก store (`inbox/systems` · โหลดซ้ำตอน focus) — false/ยังไม่รู้ ⇒ ซ่อน ผูก/ถอด · มอบหมาย · คนช่วย · สถานะ · ส่งต่อ · ปิดห้อง
//     มอบหมายให้คนอื่น/ผูกสมาชิก = OWNER/MANAGER (คีย์ assign/customer.link · R-S1.25a) · พนักงาน = รับห้องที่ยังไม่มีผู้ดูแลให้ตัวเองเท่านั้น ·
//     ส่งต่อ = ผู้ดูแลปัจจุบัน · คนช่วยในห้อง · OWNER/MANAGER (R-S1.21b) · เซิร์ฟเวอร์ตรวจซ้ำทุกเส้น · 403 ⇒ setCustomersAccess(false)
//   สร้างงานบอร์ด: ยังไม่มี route Bearer ของ task-from-chat ⇒ ปุ่มซ่อน (TASK_ROUTE) · แท็ก: อ่านอย่างเดียว (ยังไม่มีเส้นแก้แท็ก · หนี้ §N)
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, IconBtn, Note, PrimaryButton, SectionLabel, Sheet, TopBar } from "@/src/components/airy";
import { Avatar, ChannelBadge, ConfirmSheet, StaffSheet, firstName, useChannelLabel } from "@/src/components/customers/parts";
import { clientMessageId, secPost, setCustomersAccess, startErrorKind, useActiveRole } from "@/src/api/secretary";
import {
  WAITING_HUMAN_TAG,
  getCurrentSystem,
  inboxGet,
  inboxGetId,
  inboxNote,
  inboxPostId,
  maskPhone,
  setInboxCanReply,
  statusOf,
  useInboxCanReply,
  type ConvStatus,
  type MemberHit,
  type StaffPick,
  type Thread,
} from "@/src/api/inbox";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** สร้างงานบอร์ดจากแชท: ยังไม่มี route (เว็บเป็น server action) ⇒ ไม่แสดงปุ่ม จนกว่าเซิร์ฟเวอร์มีเส้น */
const TASK_ROUTE: string | null = null;
const STATUSES: ConvStatus[] = ["OPEN", "PENDING", "RESOLVED"];
const STATUS_LABEL: Record<string, I18nKey> = { OPEN: "cust.status.OPEN", PENDING: "cust.status.PENDING", RESOLVED: "cust.status.RESOLVED" };
type SheetKind = "assign" | "handoff" | "helpers" | "status" | "close" | "link" | "ask" | null;
const ASK_ERR: Record<ReturnType<typeof startErrorKind>, I18nKey> = { quota: "cust.ask.quota", rate: "cust.ask.rate", denied: "cust.ask.denied", other: "cust.ask.fail" };

export default function CustomerInfoScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const chLabel = useChannelLabel();
  const params = useLocalSearchParams<{ id?: string; s?: string; open?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const systemId = (typeof params.s === "string" && params.s) || getCurrentSystem() || undefined;
  const { activeTenantId, user } = useAuth();
  const myId = user?.id ?? null;
  const role = useActiveRole();
  const manager = role === "OWNER" || role === "MANAGER";
  const canReply = useInboxCanReply() === true;

  const [thread, setThread] = useState<Thread | null>(null);
  const [gone, setGone] = useState<"notFound" | "denied" | null>(null);
  const [staff, setStaff] = useState<StaffPick[]>([]);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [hits, setHits] = useState<MemberHit[]>([]);
  const busyRef = useRef(false);
  const opened = useRef(false);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant || !id) return;
    try {
      const th = await inboxGetId("inbox/conversations/[id]", id, { systemId });
      if (tenantRef.current !== tenant) return;
      setThread(th);
      setGone(null);
      inboxGet("inbox/staff", { systemId, unitId: th.conversation.unitId ?? undefined })
        .then((r) => tenantRef.current === tenant && setStaff(r.items ?? []))
        .catch(() => setStaff([]));
    } catch (e) {
      const s = statusOf(e);
      if (s === 404) setGone("notFound");
      else if (s === 403) {
        setGone("denied");
        setCustomersAccess(false);
      } else setNote({ text: t("cust.offline"), warn: true });
    }
    inboxGet("inbox/systems")
      .then((r) => tenantRef.current === tenant && setInboxCanReply(r.canReply !== false))
      .catch((e) => {
        if (statusOf(e) !== 403) return;
        setInboxCanReply(false);
        setCustomersAccess(false);
      });
  }, [activeTenantId, id, systemId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // จาก K2 ปุ่ม "เรียกคนช่วย" (?open=helpers) ⇒ เปิดชีตคนช่วยครั้งแรกที่โหลดเสร็จ
  useEffect(() => {
    if (thread && canReply && !opened.current && params.open === "helpers") {
      opened.current = true;
      openSheet("helpers");
    }
  }, [thread, canReply, params.open]);

  const openSheet = (k: SheetKind) => {
    setSheet(k);
    setPick(null);
    setText("");
    setSheetErr(null);
    setHits([]);
  };
  const closeSheet = () => {
    if (!busyRef.current) setSheet(null);
  };

  /** การกระทำทุกปุ่มของจอ: กันกดซ้ำ · สำเร็จ = ปิดชีต + โหลดใหม่ · ล้ม = ข้อความไทยของเซิร์ฟเวอร์ในชีต (409/422) */
  const act = async (fn: () => Promise<unknown>, okText: I18nKey) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSheetErr(null);
    try {
      await fn();
      setSheet(null);
      setNote({ text: t(okText), warn: false });
    } catch (e) {
      const s = statusOf(e);
      setSheetErr(inboxNote(e) ?? t(s === 409 ? "cust.room.claimTaken" : "cust.err"));
    } finally {
      busyRef.current = false;
      setBusy(false);
      void load();
    }
  };

  const assign = () => pick && act(() => inboxPostId("inbox/conversations/[id]/assign", id, { systemId, assigneeUserId: pick }), "cust.info.assigned");
  const handoff = () => pick && act(() => inboxPostId("inbox/conversations/[id]/handoff", id, { systemId, toUserId: pick, reason: text.trim() }), "cust.info.handedOff");
  const callHelper = () => pick && act(() => inboxPostId("inbox/conversations/[id]/helpers", id, { systemId, helperUserId: pick, note: text.trim() || undefined }), "cust.info.helperCalled");
  const setStatus = (s: ConvStatus) => act(() => inboxPostId("inbox/conversations/[id]/status", id, { systemId, status: s }), "cust.info.statusSaved");
  const link = (customerId: string | null) => act(() => inboxPostId("inbox/conversations/[id]/contact", id, { systemId, customerId }), customerId ? "cust.info.linked" : "cust.info.unlinked");

  const search = async () => {
    const q = text.trim();
    if (!q) return;
    setSheetErr(null);
    try {
      const r = await inboxGet("member/search", { q });
      setHits(r.items ?? []);
      if (!(r.items ?? []).length) setSheetErr(t("cust.link.none"));
    } catch (e) {
      setSheetErr(inboxNote(e) ?? t("cust.err"));
    }
  };

  // สั่ง Shark เรื่องลูกค้านี้ — ห้องเลขาใหม่ผูกบริบทด้วยรหัสห้องแชท/ผู้ติดต่อเท่านั้น
  const askShark = async () => {
    const instruction = text.trim();
    if (!instruction || busyRef.current || !thread) return;
    busyRef.current = true;
    setBusy(true);
    setSheetErr(null);
    try {
      const r = await secPost("secretary/rooms", { instruction, clientMessageId: clientMessageId(), context: { chatConversationId: id, contactId: thread.contact.id } });
      setSheet(null);
      router.push(`/secretary/room/${encodeURIComponent(r.roomId)}`);
    } catch (e) {
      setSheetErr(inboxNote(e) ?? t(ASK_ERR[startErrorKind(e)]));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.navigate(`/customers/${encodeURIComponent(id)}`));
  const conv = thread?.conversation ?? null;
  const name = thread?.contact.displayName ?? t("cust.noName");
  const member = thread?.linkedMember ?? null;
  const helpers = thread?.helpers ?? [];
  const tags = conv?.tags ?? [];
  const assignee = conv?.assigneeUserId ?? null;
  const isHelper = !!myId && helpers.some((h) => h.userId === myId);
  const canHandoff = canReply && !!conv && (manager || (!!myId && assignee === myId) || isHelper);
  const canClaimSelf = canReply && !manager && !!conv && conv.status === "OPEN" && !assignee;
  const claimSelf = () => myId && act(() => inboxPostId("inbox/conversations/[id]/assign", id, { systemId, assigneeUserId: myId }), "cust.room.claimed");
  const assignPress = canReply && manager ? () => openSheet("assign") : canClaimSelf ? () => void claimSelf() : undefined;
  const nameOf = (uid: string | null) => (uid ? (firstName(staff.find((s) => s.userId === uid)?.name) || firstName(helpers.find((h) => h.userId === uid)?.name) || null) : null);

  if (gone) {
    return (
      <AiryScreen testID="cust-info">
        <View style={styles.pad}>
          <TopBar left={<IconBtn testID="cust-info-back" icon="chevron-left" label={t("cust.back")} onPress={back} />} right={<View style={styles.spacer} />} />
          <Glass testID="cust-info-gone" style={styles.gone}>
            <Text style={[styles.goneT, { color: c.text }]}>{t(gone === "denied" ? "cust.denied.title" : "cust.room.notFound")}</Text>
          </Glass>
        </View>
      </AiryScreen>
    );
  }

  return (
    <AiryScreen testID="cust-info">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TopBar
          testID="cust-info-top"
          left={<IconBtn testID="cust-info-back" icon="chevron-left" label={t("cust.back")} onPress={back} />}
          title={t("cust.info.title")}
          right={<View style={styles.spacer} />}
        />

        {/* ติดต่อ */}
        <View testID="cust-info-contact" style={styles.contact}>
          <Avatar name={name} seed={thread?.contact.id ?? name} size={46} />
          <View style={styles.contactBody}>
            <Text style={[styles.cName, { color: c.text }]} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.cSubRow}>
              {conv ? <ChannelBadge channel={conv.channel} size={14} /> : null}
              <Text style={[styles.cSub, { color: c.textMuted }]} numberOfLines={2}>
                {[conv ? chLabel(conv.channel) : null, member?.name ?? null, maskPhone(member?.phone)].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
        </View>
        {note ? (
          <Note warn={note.warn} testID="cust-info-note">
            {note.text}
          </Note>
        ) : null}

        {/* ในระบบ SHARK */}
        <SectionLabel style={styles.label}>{t("cust.info.inShark")}</SectionLabel>
        <View testID="cust-info-shark">
          {member ? (
            <Pressable testID="cust-info-member" onPress={() => router.push(`/member/${encodeURIComponent(member.id)}`)} accessibilityRole="button" style={[glassStyle(c, radii.sugg), styles.sysRow]}>
              <View style={[styles.k, { backgroundColor: c.sys.mem }]}>
                <Text style={[styles.kT, { color: c.onSys }]}>{t("cust.info.memberShort")}</Text>
              </View>
              <Text style={[styles.sysT, { color: c.text }]} numberOfLines={1}>
                {t("cust.info.member", { name: member.name ?? name })}
              </Text>
              <Text style={[styles.sysV, { color: c.textMuted }]}>{t("cust.info.open")}</Text>
              <Icon name="chevron-right" size={16} color={c.iconDim} />
            </Pressable>
          ) : (
            <Glass radius={radii.sugg} pad={{ v: 12, h: 14 }} style={styles.sysEmpty}>
              <Text style={[styles.sysEmptyT, { color: c.textMuted }]}>{t("cust.info.noMember")}</Text>
            </Glass>
          )}
          {canReply && manager ? (
          <View style={styles.linkRow}>
            <Pressable testID="cust-info-link" onPress={() => openSheet("link")} accessibilityRole="button" style={[styles.smallBtn, { backgroundColor: c.surface }]}>
              <Text style={[styles.smallBtnT, { color: c.text }]}>{member ? t("cust.info.relink") : t("cust.info.link")}</Text>
            </Pressable>
            {member ? (
              <Pressable testID="cust-info-unlink" onPress={() => void link(null)} accessibilityRole="button" style={[styles.smallBtn, { backgroundColor: c.surface }]}>
                <Text style={[styles.smallBtnT, { color: c.bad.fg }]}>{t("cust.info.unlink")}</Text>
              </Pressable>
            ) : null}
          </View>
          ) : null}
        </View>

        {/* ห้องนี้ */}
        <SectionLabel style={styles.label}>{t("cust.info.thisRoom")}</SectionLabel>
        <InfoRow
          testID="cust-info-assign"
          title={t("cust.info.assignee")}
          value={firstName(conv?.assigneeName) || (canClaimSelf ? t("cust.room.claim") : t("cust.info.nobody"))}
          onPress={assignPress}
        />
        <InfoRow testID="cust-info-helpers" title={t("cust.info.helpers")} value={helpers.map((h) => firstName(h.name)).filter(Boolean).join(", ") || t("cust.info.nobody")} onPress={canReply ? () => openSheet("helpers") : undefined} />
        <InfoRow testID="cust-info-status" title={t("cust.info.status")} value={conv ? t(STATUS_LABEL[conv.status] ?? "cust.status.OPEN") : ""} onPress={canReply ? () => openSheet("status") : undefined} />
        <InfoRow testID="cust-info-tags" title={t("cust.info.tags")} value={tags.map((g) => (g === WAITING_HUMAN_TAG ? t("cust.tag.waitingHuman") : g)).join(" · ") || t("cust.info.noTags")} />

        <View style={styles.btnRow}>
          {canHandoff ? (
            <Pressable testID="cust-info-handoff" onPress={() => openSheet("handoff")} accessibilityRole="button" style={[styles.btn, { backgroundColor: c.surface }]}>
              <Text style={[styles.btnT, { color: c.text }]}>{t("cust.info.handoff")}</Text>
            </Pressable>
          ) : null}
          {TASK_ROUTE ? (
            <Pressable testID="cust-info-task" accessibilityRole="button" style={[styles.btn, { backgroundColor: c.surface }]}>
              <Text style={[styles.btnT, { color: c.text }]}>{t("cust.info.task")}</Text>
            </Pressable>
          ) : null}
          <Pressable testID="cust-info-ask-shark" onPress={() => openSheet("ask")} accessibilityRole="button" style={[styles.btn, styles.btnMain, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]} numberOfLines={1}>
              {t("cust.info.askShark")}
            </Text>
          </Pressable>
        </View>
        {!canReply || !conv ? null : conv.status !== "RESOLVED" ? (
          <Pressable testID="cust-info-close" onPress={() => openSheet("close")} accessibilityRole="button" style={styles.closeBtn}>
            <Text style={[styles.closeT, { color: c.bad.fg }]}>{t("cust.info.close")}</Text>
          </Pressable>
        ) : (
          <Pressable testID="cust-info-close" onPress={() => void setStatus("OPEN")} accessibilityRole="button" style={styles.closeBtn}>
            <Text style={[styles.closeT, { color: c.textMuted }]}>{t("cust.info.reopen")}</Text>
          </Pressable>
        )}
      </ScrollView>

      <StaffSheet
        visible={sheet === "assign"}
        testID="cust-info-assign-sheet"
        title={t("cust.info.assignTitle")}
        people={staff}
        exclude={new Set(conv?.assigneeUserId ? [conv.assigneeUserId] : [])}
        selected={pick}
        onSelect={setPick}
        confirmLabel={pick === myId ? t("cust.room.claim") : t("cust.info.assignOk")}
        busy={busy}
        onConfirm={() => void assign()}
        onClose={closeSheet}
        error={sheetErr}
      />
      <StaffSheet
        visible={sheet === "handoff"}
        testID="cust-info-handoff-sheet"
        title={t("cust.info.handoffTitle")}
        people={staff}
        exclude={new Set([...(myId ? [myId] : []), ...(conv?.assigneeUserId ? [conv.assigneeUserId] : [])])}
        selected={pick}
        onSelect={setPick}
        note={text}
        onNote={setText}
        noteLabel={t("cust.info.handoffReason")}
        noteRequired
        confirmLabel={t("cust.info.handoffOk")}
        busy={busy}
        onConfirm={() => void handoff()}
        onClose={closeSheet}
        error={sheetErr}
      />
      <StaffSheet
        visible={sheet === "helpers"}
        testID="cust-info-helpers-sheet"
        title={t("cust.info.helperTitle")}
        people={staff}
        exclude={new Set([...(myId ? [myId] : []), ...helpers.map((h) => h.userId)])}
        selected={pick}
        onSelect={setPick}
        note={text}
        onNote={setText}
        noteLabel={t("cust.info.helperNote")}
        confirmLabel={t("cust.info.helperOk")}
        busy={busy}
        onConfirm={() => void callHelper()}
        onClose={closeSheet}
        error={sheetErr}
      />
      <Sheet visible={sheet === "status"} onClose={closeSheet} testID="cust-info-status-sheet" top={420}>
        <Text style={[styles.sheetT, { color: c.text }]}>{t("cust.info.status")}</Text>
        {STATUSES.map((s) => (
          <Pressable
            testID="cust-info-status-opt"
            key={s}
            onPress={() => void setStatus(s)}
            disabled={busy || conv?.status === s}
            accessibilityRole="radio"
            accessibilityState={{ checked: conv?.status === s }}
            style={[styles.opt, { borderColor: conv?.status === s ? c.zone.customers : c.divider }]}
          >
            <Text style={[styles.optT, { color: c.text }]}>{t(STATUS_LABEL[s]!)}</Text>
            {conv?.status === s ? <Icon name="check" size={18} color={c.zone.customers} /> : null}
          </Pressable>
        ))}
        {sheetErr ? <Text style={[styles.err, { color: c.warn.fg }]}>{sheetErr}</Text> : null}
      </Sheet>
      <ConfirmSheet
        visible={sheet === "close"}
        testID="cust-info-close-sheet"
        title={t("cust.info.closeTitle")}
        body={t("cust.info.closeBody")}
        okLabel={t("cust.info.close")}
        busy={busy}
        onOk={() => void setStatus("RESOLVED")}
        onClose={closeSheet}
      />
      <Sheet visible={sheet === "link"} onClose={closeSheet} testID="cust-info-link-sheet" top={140}>
        <Text style={[styles.sheetT, { color: c.text }]}>{t("cust.link.title")}</Text>
        <View style={[styles.searchBox, { backgroundColor: c.inputBg, borderColor: c.glass.border }]}>
          <Icon name="search" size={16} color={c.iconDim} />
          <TextInput
            testID="cust-info-link-search"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void search()}
            returnKeyType="search"
            placeholder={t("cust.link.ph")}
            placeholderTextColor={c.placeholder}
            style={[styles.searchIn, { color: c.text }]}
          />
          <Pressable testID="cust-info-link-go" onPress={() => void search()} accessibilityRole="button" hitSlop={6}>
            <Icon name="arrow-right" size={18} />
          </Pressable>
        </View>
        <ScrollView style={styles.hits} contentContainerStyle={styles.hitsIn} keyboardShouldPersistTaps="handled">
          {hits.map((m) => (
            <Pressable testID="cust-info-link-row" key={m.id} onPress={() => void link(m.id)} disabled={busy} accessibilityRole="button" style={[styles.opt, { borderColor: c.divider }]}>
              <View style={styles.flex}>
                <Text style={[styles.optT, { color: c.text }]} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={[styles.hitSub, { color: c.textMuted }]}>{[m.memberCode, m.phoneMasked].filter(Boolean).join(" · ")}</Text>
              </View>
              <Icon name="link" size={16} color={c.iconDim} />
            </Pressable>
          ))}
        </ScrollView>
        {sheetErr ? <Text style={[styles.err, { color: c.warn.fg }]}>{sheetErr}</Text> : null}
      </Sheet>
      <Sheet visible={sheet === "ask"} onClose={closeSheet} testID="cust-info-ask-sheet" top={300}>
        <Text style={[styles.sheetT, { color: c.text }]}>{t("cust.ask.title")}</Text>
        <Text style={[styles.askSub, { color: c.textMuted }]}>{t("cust.ask.sub")}</Text>
        <TextInput
          testID="cust-info-ask-input"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
          placeholder={t("cust.ask.ph")}
          placeholderTextColor={c.placeholder}
          style={[styles.askIn, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
        />
        {sheetErr ? (
          <Text testID="cust-info-ask-error" style={[styles.err, { color: c.warn.fg }]}>
            {sheetErr}
          </Text>
        ) : null}
        <View style={styles.sheetBtn}>
          <PrimaryButton testID="cust-info-ask-send" label={busy ? t("cust.busy") : t("cust.ask.send")} disabled={busy || !text.trim()} onPress={() => void askShark()} />
        </View>
      </Sheet>
    </AiryScreen>
  );
}

function InfoRow({ testID, title, value, onPress }: { testID: string; title: string; value: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={[glassStyle(c, radii.sugg), styles.row]}>
      <Text style={[styles.rowT, { color: c.text }]}>{title}</Text>
      <Text style={[styles.rowV, { color: c.textMuted }]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <Icon name="chevron-right" size={18} color={c.iconDim} /> : <View style={styles.chev} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  pad: { paddingHorizontal: spacing.page },
  flex: { flex: 1, minWidth: 0 },
  spacer: { width: 44 },
  gone: { marginTop: F.v(40), alignItems: "center" },
  goneT: { fontSize: T.body, fontWeight: "600", textAlign: "center" },
  contact: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: F.v(30) },
  contactBody: { flex: 1, minWidth: 0 },
  cName: { fontSize: T.lt - 4, fontWeight: "700" },
  cSubRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  cSub: { fontSize: T.sub - 0.5, lineHeight: 19, flexShrink: 1 },
  label: { marginTop: F.v(40), fontSize: T.cap, letterSpacing: 0.8 },
  sysRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10 },
  k: { minWidth: 30, height: 30, paddingHorizontal: 4, borderRadius: radii.k, alignItems: "center", justifyContent: "center" },
  kT: { fontSize: 10.5, fontWeight: "800" },
  sysT: { flex: 1, fontSize: T.sub + 0.5 },
  sysV: { fontSize: T.cap },
  sysEmpty: { marginTop: 10 },
  sysEmptyT: { fontSize: T.sub },
  linkRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallBtn: { borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 14 },
  smallBtnT: { fontSize: T.cap + 0.5, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingHorizontal: 16, marginTop: 10 },
  rowT: { flex: 1, fontSize: T.body - 0.5 },
  rowV: { fontSize: T.sub - 0.5, maxWidth: 170 },
  chev: { width: 18 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: F.v(30) },
  btn: { flex: 1, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  btnMain: { flex: 2 },
  btnT: { fontSize: T.sub + 0.5, fontWeight: "700" },
  closeBtn: { alignSelf: "center", paddingVertical: 16, paddingHorizontal: 24, marginTop: 6 },
  closeT: { fontSize: T.sub + 0.5, fontWeight: "600" },
  sheetT: { fontSize: T.h, fontWeight: "700", marginBottom: 10 },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: radii.segIn + 2, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8 },
  optT: { flex: 1, fontSize: 15, fontWeight: "600" },
  err: { fontSize: T.cap, lineHeight: 18, marginTop: 10 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radii.segIn + 2, height: 44, paddingHorizontal: 12 },
  searchIn: { flex: 1, minWidth: 0, fontSize: T.sub, paddingVertical: 0, outlineWidth: 0 },
  hits: { flexGrow: 0, maxHeight: 360 },
  hitsIn: { paddingBottom: 6 },
  hitSub: { fontSize: T.cap, marginTop: 2 },
  askSub: { fontSize: T.cap + 0.5, lineHeight: 19, marginBottom: 10 },
  askIn: { minHeight: 96, borderRadius: radii.segIn + 2, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.sub, lineHeight: 20, textAlignVertical: "top" },
  sheetBtn: { marginTop: 14 },
});
