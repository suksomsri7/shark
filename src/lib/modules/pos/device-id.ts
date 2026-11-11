// POS P1.9 (S2) — รหัสเครื่องทึบของจุดขาย: สร้างครั้งเดียวต่อเบราว์เซอร์ เก็บ localStorage · [A-Za-z0-9_-]{8,64}
// ใช้ร่วมกันระหว่างหน้าขาย (ผูกบิลกับกะของเครื่อง) และหน้ากะ — P1.10 จะผูกกับ PosDevice จริง
const KEY = "shark.pos.deviceId";

/** ฝั่ง client เท่านั้น — server/ไม่มี localStorage = undefined */
export function getPosDeviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const cur = window.localStorage.getItem(KEY);
    if (cur && /^[A-Za-z0-9_-]{8,64}$/.test(cur)) return cur;
    const id = `pos-${(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 64);
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return undefined;
  }
}
