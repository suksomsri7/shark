// ข้อมูลของจอเลขา AI ฝั่งแอป — type ตาม docs/api/SECRETARY-API.md + docs/modules/31-secretary.md (COMMON §C.12)
// ใบ S2.1 ใช้แค่ 4 เส้น: secretary/me (ภาษา + ชื่อเลขา) · secretary/rooms (A1/C3) · secretary/inbox/count + inbox/unread (badge แถบบน)
// ทุกเส้นพลาดได้เงียบ (เส้นใหม่ยังไม่ขึ้นเซิร์ฟเวอร์จนใบ S1.14/S2.14) — จอใช้ค่าปริยาย
import { useSyncExternalStore } from "react";
import { api } from "@/src/api/client";
import { langFrom, setLang } from "@/src/i18n";

export type SecretaryMe = {
  name: string;
  suffix: string;
  tone?: "polite" | "friendly" | "brief";
  languages: string[];
  stats?: { jobs: number; approvedClean: number; edited: number; rejected: number };
};

export type RoomStatus = "OPEN" | "RUNNING" | "WAITING" | "DONE";
export type RoomItem = {
  id: string;
  title: string;
  status: RoomStatus;
  systems: string[];
  startedBy?: { id: string; name: string | null };
  sharedWith?: { id: string; name: string | null }[];
  unread: number;
  updatedAt: string;
};

export type InboxCount = { total: number; canApprove: number };

/** ชื่อเลขาปริยายก่อนโหลด/เมื่อโหลดไม่ได้ (ค่าเริ่มต้นของระบบ · C1) */
export const DEFAULT_SECRETARY_NAME = "Shark";

// ───────── secretary/me — โหลดครั้งเดียวต่อการเปิดแอป · เปลี่ยนภาษาของจอเลขาตาม languages[0] ─────────
let me: SecretaryMe | null = null;
let inflight: Promise<SecretaryMe | null> | null = null;
const listeners = new Set<() => void>();

export function loadSecretaryMe(force = false): Promise<SecretaryMe | null> {
  if (inflight && !force) return inflight;
  inflight = api<SecretaryMe>("/api/mobile/secretary/me", { tenant: false })
    .then((r) => {
      me = r;
      const l = langFrom(r.languages?.[0]);
      if (l) setLang(l);
      listeners.forEach((fn) => fn());
      return r;
    })
    .catch(() => null);
  return inflight;
}

const getMe = () => me;
export function useSecretaryMe(): SecretaryMe | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getMe,
    getMe,
  );
}

// ───────── เส้นของกิจการ active (x-tenant-id) ─────────
export function listRooms(scope: "mine" | "tenant" = "mine"): Promise<{ items: RoomItem[]; nextBefore: string | null }> {
  return api(`/api/mobile/secretary/rooms?scope=${scope}`);
}

export function inboxCount(): Promise<InboxCount> {
  return api<InboxCount>("/api/mobile/secretary/inbox/count");
}

export function customerUnread(): Promise<{ unread: number }> {
  return api<{ unread: number }>("/api/mobile/inbox/unread");
}
