// ข้อมูลของจอเลขา AI ฝั่งแอป — type ตาม docs/api/SECRETARY-API.md + docs/modules/31-secretary.md (COMMON §C.12)
// ทุกเส้นของ /api/mobile/secretary/* อยู่ในไฟล์นี้ไฟล์เดียว (ตาราง PATH) — ชื่อเส้นเปลี่ยนหลัง S1.14 = แก้ PATH ที่เดียว
// จอเรียกด้วยชื่อเส้น เช่น secGet("secretary/rooms") · DTO ที่ยังไม่นิ่ง (S1.14 ยังไม่ merge) ผ่านตัว normalize* ที่รับได้หลายรูป
// ทุกเส้นพลาดได้ — จอใช้ค่าปริยาย/สถานะของตัวเอง (isDenied / startErrorKind)
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { langFrom, setLang } from "@/src/i18n";

// ───────── ตารางเส้น (ชื่อที่จอใช้ → path จริง) ─────────
const PATH = {
  "secretary/me": "/api/mobile/secretary/me",
  "secretary/rooms": "/api/mobile/secretary/rooms",
  "secretary/suggestions": "/api/mobile/secretary/suggestions",
  "secretary/frequent": "/api/mobile/secretary/frequent",
  "secretary/access": "/api/mobile/secretary/access",
  "secretary/inbox/count": "/api/mobile/secretary/inbox/count",
  "inbox/unread": "/api/mobile/inbox/unread",
} as const;
export type SecPath = keyof typeof PATH;

export type SecretaryMe = {
  name: string;
  suffix: string;
  tone?: "polite" | "friendly" | "brief";
  languages: string[];
  stats?: { jobs: number; approvedClean: number; edited: number; rejected: number };
};

/** สถานะห้องของการ์ด (lib rooms.ts roomStatusOf) — รูปอื่นจาก DTO (QUEUED/WAITING_APPROVAL/CLOSED/FAILED) ผ่าน normStatus */
export type RoomStatus = "OPEN" | "RUNNING" | "WAITING" | "DONE";
type Person = { id?: string; name?: string | null; isMe?: boolean };
/** รูปดิบของแถวห้องจาก GET secretary/rooms — รับทั้งรูปในร่าง API และรูปของ lib (startedById/startedByName/memberIds) */
export type RoomRaw = {
  id: string;
  title?: string | null;
  status?: string;
  systems?: string[] | null;
  startedBy?: Person | null;
  startedById?: string;
  startedByName?: string | null;
  sharedWith?: Person[] | null;
  members?: Person[] | null;
  memberIds?: string[] | null;
  unread?: boolean | number;
  pendingProposals?: number;
  badge?: { pendingProposals?: number; unread?: number } | null;
  updatedAt?: string;
};
/** แถวห้องที่จอใช้ (ผ่าน normalizeRoom แล้ว) */
export type RoomCard = {
  id: string;
  title: string;
  status: RoomStatus;
  systems: string[];
  starterName: string | null;
  startedByMe: boolean;
  /** คนอื่นในห้อง (ไม่รวมเรา) */
  others: { id: string; name: string | null }[];
  pending: number;
  unread: boolean;
  updatedAt: string;
};

export type Suggestion = { key: string; system: string; title: string; instruction: string };
export type Frequent = { title: string; instruction: string };
export type AccessItem = { module: string; level: "OFF" | "READ" | "DRAFT" | "AUTO" | string };
export type InboxCount = { total: number; canApprove: number };

/** ชื่อเลขาปริยายก่อนโหลด/เมื่อโหลดไม่ได้ (ค่าเริ่มต้นของระบบ · C1) */
export const DEFAULT_SECRETARY_NAME = "Shark";

type GetMap = {
  "secretary/me": SecretaryMe;
  "secretary/rooms": { items?: RoomRaw[]; nextBefore?: string | null };
  "secretary/suggestions": { items?: unknown[]; frequent?: unknown[] } | unknown[];
  "secretary/frequent": { items?: unknown[] } | unknown[];
  "secretary/access": { items?: AccessItem[]; autoAvailable?: boolean };
  "secretary/inbox/count": InboxCount;
  "inbox/unread": { unread: number };
};
type PostMap = {
  "secretary/rooms": { body: { instruction: string; clientMessageId: string; systems?: string[] }; res: { roomId: string; conversationId?: string; status?: string } };
};
type Query = Record<string, string | number | undefined>;

function url(path: SecPath, q?: Query): string {
  const qs = q
    ? Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return qs ? `${PATH[path]}?${qs}` : PATH[path];
}

/** GET เส้นของเลขา · secretary/me ไม่ส่ง x-tenant-id (ข้อมูลต่อผู้ใช้) */
export function secGet<P extends keyof GetMap>(path: P, q?: Query): Promise<GetMap[P]> {
  return api<GetMap[P]>(url(path, q), { tenant: path !== "secretary/me" });
}

export function secPost<P extends keyof PostMap>(path: P, body: PostMap[P]["body"]): Promise<PostMap[P]["res"]> {
  return api<PostMap[P]["res"]>(url(path), { method: "POST", body });
}

/** รหัสข้อความฝั่งแอป (กันส่งซ้ำ · POST rooms) */
export function clientMessageId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────── สถานะผิดพลาด ─────────
/** 403 = บัญชีนี้ยังใช้เลขาในกิจการนี้ไม่ได้ (R-S2.1d) */
export function isDenied(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

/** ผลของ POST rooms ที่ล้ม → ชนิดข้อความบนจอ A2 */
export function startErrorKind(e: unknown): "quota" | "rate" | "denied" | "other" {
  if (!(e instanceof ApiError)) return "other";
  if (e.status === 402 || /quota/i.test(e.code)) return "quota";
  if (e.status === 429) return "rate";
  if (e.status === 403) return "denied";
  return "other";
}

// ───────── normalize (DTO ยังไม่นิ่งจน S1.14) ─────────
export function normStatus(s: unknown): RoomStatus {
  switch (s) {
    case "RUNNING":
    case "QUEUED":
      return "RUNNING";
    case "WAITING":
    case "WAITING_APPROVAL":
      return "WAITING";
    case "DONE":
    case "CLOSED":
    case "FAILED":
      return "DONE";
    default:
      return "OPEN";
  }
}

export function normalizeRoom(r: RoomRaw, myUserId: string | null | undefined): RoomCard {
  const starterId = r.startedBy?.id ?? r.startedById ?? null;
  const startedByMe = r.startedBy?.isMe ?? (!!myUserId && starterId === myUserId);
  const people: { id: string; name: string | null }[] = (r.sharedWith ?? r.members ?? []).map((p, i) => ({ id: p.id ?? `p${i}`, name: p.name ?? null }));
  const fromIds = people.length === 0 ? (r.memberIds ?? []).map((id) => ({ id, name: null })) : people;
  const others = fromIds.filter((p) => p.id !== myUserId && p.id !== starterId);
  const pending = Math.max(0, Math.floor(Number(r.badge?.pendingProposals ?? r.pendingProposals ?? 0) || 0));
  const unread = typeof r.unread === "number" ? r.unread > 0 : !!(r.unread ?? (r.badge?.unread ?? 0) > 0);
  return {
    id: r.id,
    title: (r.title ?? "").trim(),
    status: normStatus(r.status),
    systems: Array.isArray(r.systems) ? r.systems.filter((x) => typeof x === "string") : [],
    starterName: r.startedBy?.name ?? r.startedByName ?? null,
    startedByMe,
    others,
    pending,
    unread,
    updatedAt: r.updatedAt ?? "",
  };
}

const listOf = (v: unknown, key = "items"): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as Record<string, unknown>)[key]) ? ((v as Record<string, unknown>)[key] as unknown[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function normalizeSuggestions(v: unknown): Suggestion[] {
  return listOf(v)
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { key: str(o.key) || `s${i + 1}`, system: str(o.system), title: str(o.title), instruction: str(o.instruction) || str(o.title) };
    })
    .filter((s) => s.title && s.instruction);
}

/** สั่งบ่อย: GET frequent (`{items:[{instruction,count}]}`) หรือ `frequent` ที่แนบมากับ suggestions (ร่าง API) */
export function normalizeFrequent(v: unknown, key = "items"): Frequent[] {
  return listOf(v, key)
    .map((x) => {
      const o = (typeof x === "string" ? { instruction: x } : (x ?? {})) as Record<string, unknown>;
      const instruction = str(o.instruction);
      return { title: str(o.title) || instruction, instruction };
    })
    .filter((f) => f.instruction);
}

// ───────── secretary/me — cache ต่อผู้ใช้ (R-S2.1b) · ล้ม = ไม่ cache ─────────
let me: { userId: string; data: SecretaryMe } | null = null;
let inflight: { userId: string; p: Promise<SecretaryMe | null> } | null = null;
const meListeners = new Set<() => void>();
const emitMe = () => meListeners.forEach((fn) => fn());

/** โหลดเลขาของผู้ใช้นี้ (ครั้งเดียวต่อ user.id) · เปลี่ยนภาษาของจอเลขาตาม languages[0] */
export function loadSecretaryMe(userId: string | null | undefined, force = false): Promise<SecretaryMe | null> {
  if (!userId) {
    resetSecretaryMe();
    return Promise.resolve(null);
  }
  if (!force && me?.userId === userId) return Promise.resolve(me.data);
  if (!force && inflight?.userId === userId) return inflight.p;
  const p: Promise<SecretaryMe | null> = secGet("secretary/me")
    .then((r) => {
      if (inflight?.p !== p) return r; // ถูก reset ระหว่างรอ — ไม่เขียนทับ
      inflight = null;
      me = { userId, data: r };
      const l = langFrom(r.languages?.[0]);
      if (l) setLang(l);
      emitMe();
      return r;
    })
    .catch(() => {
      if (inflight?.p === p) inflight = null; // offline/401 ⇒ ไม่ cache ครั้งหน้าลองใหม่
      return null;
    });
  inflight = { userId, p };
  return p;
}

/** ล้าง cache (signOut · switchTenant · เปลี่ยนผู้ใช้) */
export function resetSecretaryMe(): void {
  me = null;
  inflight = null;
  emitMe();
}

const getMe = () => me?.data ?? null;
export function useSecretaryMe(): SecretaryMe | null {
  return useSyncExternalStore(
    (l) => {
      meListeners.add(l);
      return () => meListeners.delete(l);
    },
    getMe,
    getMe,
  );
}

// ───────── badge 3 โซน — store กลาง (R-S2.1e) · โหลดที่ layout ของโซน (focus/foreground) ─────────
export type ZoneCounts = { secretary: number; customers: number; team: number };
const ZERO: ZoneCounts = { secretary: 0, customers: 0, team: 0 };
let badges: ZoneCounts = ZERO;
const badgeListeners = new Set<() => void>();

export async function refreshZoneBadges(): Promise<void> {
  const [sec, cust] = await Promise.all([secGet("secretary/inbox/count").catch(() => null), secGet("inbox/unread").catch(() => null)]);
  // ทีม = ยังไม่มีแหล่ง (S2.10)
  badges = { secretary: sec?.canApprove ?? 0, customers: cust?.unread ?? 0, team: 0 };
  badgeListeners.forEach((fn) => fn());
}

const getBadges = () => badges;
export function useZoneBadgeCounts(): ZoneCounts {
  return useSyncExternalStore(
    (l) => {
      badgeListeners.add(l);
      return () => badgeListeners.delete(l);
    },
    getBadges,
    getBadges,
  );
}

/**
 * ชั้น layout ของโซน (secretary/customers/business): โหลด secretary/me ต่อ user.id ·
 * ผู้ใช้/กิจการเปลี่ยน (signOut · switchTenant) ⇒ resetSecretaryMe + โหลดใหม่ · badge โหลดตอน focus + กลับมา foreground
 */
export function useSecretaryZone(): void {
  const { user, activeTenantId } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    resetSecretaryMe();
    badges = ZERO;
    badgeListeners.forEach((fn) => fn());
    void loadSecretaryMe(userId);
    if (userId && activeTenantId) void refreshZoneBadges();
  }, [userId, activeTenantId]);
  useFocusEffect(
    useCallback(() => {
      if (!userId || !activeTenantId) return;
      void refreshZoneBadges();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void refreshZoneBadges();
      });
      return () => sub.remove();
    }, [userId, activeTenantId]),
  );
}
