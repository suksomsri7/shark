// แชททีม (B27 · แบบ /root/mockups/team-invite/team2.png) — ตัวเรียกเส้น /api/mobile/secretary/team/** + ตัวช่วย pure ของจอ
//   รายชื่อแชท (GET team) · เพิ่มคนด้วยเบอร์ (lookup → members) · ห้อง 1:1 (direct) · ข้อความ (poll after=) · อ่านแล้ว · ปิดเสียง · ตั้ง "คุยอย่างเดียว"
//   ไฟล์แนบใช้ useSecAttach("secretary/team/attachments") + AttachList ของ SecAttach (เส้นไฟล์ตรวจสิทธิ์ห้อง)
//   แยกไฟล์จาก src/api/secretary.ts เพื่อไม่ชนเลนอื่น — เส้นทุกเส้นของทีมอยู่ที่นี่
import { api } from "@/src/api/client";
import { scheduleZoneBadges, type AttachKind, type AttachRef, type MsgAttachment } from "@/src/api/secretary";

export type TeamTag = "OWNER" | "MANAGER" | "STAFF" | "CHAT_ONLY";
export type TeamThread = {
  id: string;
  kind: "DIRECT" | "GROUP";
  name: string;
  peer: { userId: string; membershipId: string | null; tag: TeamTag | null } | null;
  hasPhoto: boolean;
  photoFileId: string | null;
  memberCount: number;
  muted: boolean;
  unread: number;
  last: { body: string; mine: boolean; senderName: string | null; kind: string; attachments: number; at: string } | null;
  updatedAt: string;
};
export type TeamPerson = { userId: string; membershipId: string; name: string; tag: TeamTag; me: boolean; directThreadId: string | null };
export type TeamPending = { inviteId: string; name: string; expiresAt: string; at: string };
export type TeamList = { me: { userId: string; tag: TeamTag; canManage: boolean }; threads: TeamThread[]; people: TeamPerson[]; pending: TeamPending[] };
export type TeamMember = { userId: string; membershipId: string | null; name: string; tag: TeamTag | null; admin: boolean; me: boolean; lastReadAt: string | null };
export type TeamThreadDetail = {
  id: string;
  kind: "DIRECT" | "GROUP";
  name: string;
  photoFileId: string | null;
  createdById: string;
  myRole: "ADMIN" | "MEMBER";
  muted: boolean;
  peer: { userId: string; membershipId: string | null; tag: TeamTag | null; name: string } | null;
  members: TeamMember[];
};
type RawAtt = { fileId: string; name: string; mimeType: string; size: number; kind: AttachKind; url: string };
export type TeamMsg = {
  id: string;
  kind: string;
  body: string;
  attachments: MsgAttachment[];
  senderUserId: string;
  senderName: string;
  mine: boolean;
  at: string;
  deleted: boolean;
  read: boolean;
  readBy: number;
  /** ฟองที่กำลังส่ง (ยังไม่มีจากเซิร์ฟเวอร์) */
  pending?: boolean;
};
type RawMsg = Omit<TeamMsg, "attachments"> & { attachments: RawAtt[] };
export type TeamMsgPage = { items: TeamMsg[]; hasMore: boolean; reads: { userId: string; lastReadAt: string | null }[]; memberCount: number };
export type TeamLookup = { found: false } | { found: true; name: string; member: boolean; invited: boolean };

const B = "/api/mobile/secretary/team";
const enc = encodeURIComponent;

const attOf = (a: RawAtt): MsgAttachment => ({ id: a.fileId, name: a.name, mimeType: a.mimeType, size: a.size, kind: a.kind, url: a.url });
const msgOf = (m: RawMsg): TeamMsg => ({ ...m, attachments: (m.attachments ?? []).map(attOf) });

export const getTeam = () => api<TeamList>(B);
export const lookupPhone = (phone: string) => api<TeamLookup>(`${B}/lookup`, { method: "POST", body: { phone } });
export async function addToTeam(phone: string): Promise<{ ok: boolean; inviteId: string; name: string }> {
  const r = await api<{ ok: boolean; inviteId: string; name: string }>(`${B}/members`, { method: "POST", body: { phone } });
  scheduleZoneBadges();
  return r;
}
export const setChatOnly = (membershipId: string) => api<{ ok: boolean }>(`${B}/members/${enc(membershipId)}/chat-only`, { method: "PUT", body: {} });
export const openDirect = (userId: string) => api<{ threadId: string }>(`${B}/direct`, { method: "POST", body: { userId } });
export const getThread = (id: string) => api<{ thread: TeamThreadDetail }>(`${B}/threads/${enc(id)}`);
export const patchThread = (id: string, body: { muted?: boolean; name?: string; photoFileId?: string | null }) => api<{ thread: TeamThreadDetail }>(`${B}/threads/${enc(id)}`, { method: "PATCH", body });
export async function getMessages(id: string, q: { after?: string; before?: string; take?: number } = {}): Promise<TeamMsgPage> {
  const qs = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${enc(String(v))}`)
    .join("&");
  const r = await api<Omit<TeamMsgPage, "items"> & { items: RawMsg[] }>(`${B}/threads/${enc(id)}/messages${qs ? `?${qs}` : ""}`);
  return { ...r, items: (r.items ?? []).map(msgOf) };
}
export async function sendTeamMessage(id: string, body: { body?: string; attachments?: AttachRef[]; clientMessageId?: string }): Promise<TeamMsg | null> {
  const r = await api<{ message?: RawMsg; duplicate?: boolean }>(`${B}/threads/${enc(id)}/messages`, { method: "POST", body });
  return r.message ? msgOf(r.message) : null;
}
export async function markTeamRead(id: string): Promise<void> {
  await api(`${B}/threads/${enc(id)}/read`, { method: "POST", body: {} });
  scheduleZoneBadges();
}
export const deleteTeamMessage = (id: string, messageId: string) => api<{ ok: boolean }>(`${B}/threads/${enc(id)}/messages/${enc(messageId)}`, { method: "DELETE" });

/** cursor คู่ของข้อความ (แบบ pairCursor ของเซิร์ฟเวอร์) */
export const cursorOfMsg = (m: Pick<TeamMsg, "at" | "id">) => `${m.at}|${m.id}`;

/** รวมหน้าข้อความใหม่เข้ากับของเดิม (id ซ้ำ = ใช้ของใหม่ · เรียงเวลา) — pure */
export function mergeMsgs(cur: TeamMsg[], next: TeamMsg[]): TeamMsg[] {
  const by = new Map(cur.filter((m) => !m.pending).map((m) => [m.id, m]));
  for (const m of next) by.set(m.id, m);
  return [...by.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** "อ่านแล้ว" ของข้อความเรา จากเวลาอ่านของสมาชิกอื่น (poll ใหม่ทุกรอบ) — pure */
export function readCountOf(m: Pick<TeamMsg, "at" | "mine">, reads: TeamMsgPage["reads"]): number {
  if (!m.mine) return 0;
  return reads.filter((r) => r.lastReadAt && r.lastReadAt >= m.at).length;
}

/** ข้อความล่าสุดของแถวรายชื่อ ("คุณ: …" ของเรา · กลุ่ม = "<ชื่อ>: …" · ไฟล์ = ป้าย) */
export function previewOf(last: TeamThread["last"], kind: TeamThread["kind"], t: (k: "team.you" | "team.photo" | "team.file" | "team.deleted", v?: Record<string, string>) => string): string {
  if (!last) return "";
  const body = last.body.replace(/\s+/g, " ").trim() || (last.attachments ? t("team.photo") : last.kind === "SYSTEM" ? "" : t("team.deleted"));
  if (last.kind === "SYSTEM") return body;
  if (last.mine) return t("team.you", { text: body });
  return kind === "GROUP" && last.senderName ? `${last.senderName}: ${body}` : body;
}

/** เวลาในรายชื่อแบบ WhatsApp: วันนี้ = HH:MM · เมื่อวาน · ในสัปดาห์ = ชื่อวันย่อ · เก่ากว่า = วว/ดด (เวลาไทย) */
export function listTimeOf(iso: string, nowMs: number, lang: "th" | "en"): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const BKK = 7 * 3600_000;
  const day = (ms: number) => Math.floor((ms + BKK) / 86_400_000);
  const d = day(nowMs) - day(at);
  const local = new Date(at + BKK);
  if (d <= 0) return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  if (d === 1) return lang === "th" ? "เมื่อวาน" : "Yesterday";
  if (d < 7) return (lang === "th" ? ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[local.getUTCDay()]!;
  return `${local.getUTCDate()}/${local.getUTCMonth() + 1}`;
}

/** ลิงก์ดาวน์โหลดแอป (App Store) — แผ่นแชร์ของเครื่องเมื่อเบอร์ยังไม่มี Lekaa · id = ascAppId ใน eas.json (th.in.shark.ai) */
export const LEKAA_APP_URL = "https://apps.apple.com/app/id6793749205";

/** เวลาใต้ฟอง: วันนี้ = HH:MM · ในสัปดาห์ = "จ. 14:02" · เก่ากว่า = "14/11 14:02" (เวลาไทย) */
export function msgTimeOf(iso: string, nowMs: number, lang: "th" | "en"): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const local = new Date(at + 7 * 3600_000);
  const hm = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const day = listTimeOf(iso, nowMs, lang);
  return day === hm ? hm : `${day} ${hm}`;
}
