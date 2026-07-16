// Question tree — บทสัมภาษณ์ DNA (deterministic, ไม่ใช้ LLM — M4 ค่อยเสียบ free-text)
//
// มาจากบทสนทนาในวิชันเจ้าของตรง ๆ: "เปิดธุรกิจอะไร → กี่สาขา → จองออนไลน์ไหม → ..."
// UI render เป็นแชท (AI ถามทีละข้อ) แต่เบื้องหลังคือ tree ตายตัว = ทดสอบได้ 100%
// ทุกคำตอบเขียนลง DnaFacts field เดียว — ห้ามมีคำถามที่ไม่ map เป็นข้อเท็จจริง

import type { DnaFacts } from "./schema";

export type Question = {
  id: keyof DnaFacts;
  /** ประโยคที่ "AI" ถาม — ภาษาคนทั่วไป ไม่มี jargon */
  ask: string;
  kind: "choice" | "bool" | "number";
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** ข้ามคำถามนี้เมื่อ (เช่น ไม่มีสมาชิก ไม่ต้องถามเรื่องแลกของ) */
  skipIf?: (partial: Partial<DnaFacts>) => boolean;
  /** ค่าอัตโนมัติเมื่อถูกข้าม */
  defaultWhenSkipped?: DnaFacts[keyof DnaFacts];
};

export const QUESTIONS: Question[] = [
  {
    id: "industryHint",
    ask: "สวัสดีครับ 👋 ผมจะช่วยประกอบระบบให้เหมาะกับกิจการของคุณ — ธุรกิจของคุณใกล้เคียงแบบไหนมากที่สุด?",
    kind: "choice",
    choices: [
      { value: "SALON", label: "ร้านตัดผม / เสริมสวย / สปา" },
      { value: "RESTAURANT", label: "ร้านอาหาร / คาเฟ่" },
      { value: "HOTEL", label: "โรงแรม / ที่พัก" },
      { value: "CLINIC", label: "คลินิก / สุขภาพ" },
      { value: "RETAIL", label: "ร้านค้า / ขายของ" },
      { value: "SERVICE", label: "งานบริการ / ช่าง" },
      { value: "OTHER", label: "อื่น ๆ" },
    ],
  },
  { id: "branchCount", ask: "มีทั้งหมดกี่สาขาครับ?", kind: "number", min: 1, max: 20 },
  { id: "appointment", ask: "ลูกค้าจอง/นัดหมายล่วงหน้าได้ไหมครับ? (เช่น จองคิวตัดผม นัดหมอ)", kind: "bool" },
  { id: "tables", ask: "มีโต๊ะให้ลูกค้านั่งทานที่ร้านไหมครับ?", kind: "bool" },
  { id: "rooms", ask: "มีห้องพักให้ลูกค้าเข้าพักไหมครับ?", kind: "bool" },
  {
    id: "walkinQueue",
    ask: "ช่วงลูกค้าเยอะ อยากมีบัตรคิวหน้าร้านไหมครับ? (กดรับคิว เรียกตามลำดับ)",
    kind: "bool",
  },
  { id: "sellsGoods", ask: "มีขายสินค้า/คิดเงินหน้าร้านไหมครับ? (เช่น แชมพู เครื่องดื่ม ของใช้)", kind: "bool" },
  { id: "membership", ask: "อยากให้ลูกค้าสมัครสมาชิกและสะสมแต้มไหมครับ?", kind: "bool" },
  {
    id: "rewardRedeem",
    ask: "ให้ลูกค้าเอาแต้มมาแลกของรางวัลได้ด้วยไหมครับ?",
    kind: "bool",
    skipIf: (p) => p.membership === false,
    defaultWhenSkipped: false,
  },
  { id: "staffCount", ask: "มีพนักงานทั้งหมดกี่คนครับ?", kind: "number", min: 0, max: 500 },
  { id: "wantsAccounting", ask: "อยากให้ระบบช่วยทำบัญชี/ออกใบเสร็จ-ใบกำกับไหมครับ?", kind: "bool" },
  {
    id: "vatRegistered",
    ask: "กิจการจดทะเบียน VAT แล้วหรือยังครับ?",
    kind: "bool",
    skipIf: (p) => p.wantsAccounting === false,
    defaultWhenSkipped: false,
  },
  { id: "usesLineOA", ask: "ใช้ LINE OA คุยกับลูกค้าไหมครับ? (ให้ AI รวมแชทมาไว้ที่เดียว)", kind: "bool" },
];

/** คำถามถัดไปจากคำตอบที่มี — null = ครบแล้ว */
export function nextQuestion(partial: Partial<DnaFacts>): Question | null {
  for (const q of QUESTIONS) {
    if (partial[q.id] !== undefined) continue;
    if (q.skipIf?.(partial)) continue;
    return q;
  }
  return null;
}

/** เติมค่า default ให้ข้อที่ถูกข้าม แล้วคืน facts เต็ม (โยนถ้ายังไม่ครบจริง) */
export function finalizeFacts(partial: Partial<DnaFacts>): Partial<DnaFacts> {
  const out = { ...partial };
  for (const q of QUESTIONS) {
    if (out[q.id] === undefined && q.skipIf?.(out) && q.defaultWhenSkipped !== undefined) {
      (out as Record<string, unknown>)[q.id] = q.defaultWhenSkipped;
    }
  }
  return out;
}
