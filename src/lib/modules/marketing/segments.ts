// marketing/segments.ts — ทางเข้า "กลุ่มลูกค้า" ของฝั่งการตลาด (M3.1 · พิมพ์เขียว §5.9)
//
// 🔴 ไฟล์นี้ **ไม่มีตรรกะของตัวเอง**: เอนจินอยู่ที่ `member/segments.ts` เพราะข้อมูลสมาชิก ฟิลด์ที่ร้าน
//    สร้างเอง ระดับ ความยินยอม และขอบเขตสาขา เป็นของโมดูลสมาชิกทั้งหมด (ถ้าเขียนซ้ำที่นี่ วันหนึ่ง
//    "จำนวนคนในกลุ่ม" ที่หน้าแคมเปญกับที่หน้ากลุ่มลูกค้าจะไม่ตรงกันเงียบ ๆ)
// 🔴 เส้น `marketing→member` เป็น chokepoint ที่อนุมัติแล้ว (fitness F2) และต้องผ่าน **facade**
//    `@/lib/modules/member` เท่านั้น — ห้าม import `member/segments` ตรง
// ผู้เรียก: แคมเปญ v2 (M3.2) · journey (M3.3) · การออก voucher แบบ "เป็นกลุ่ม" (M2.5)

export type {
  SegmentOp,
  SegmentFieldKind,
  SegmentFieldOption,
  SegmentFieldDef,
  SegmentCondition,
  SegmentGroup,
  SegmentDefinition,
  SegmentScope,
  SegmentDto,
  CountSegmentResult,
  SampleSegmentOptions,
  SampleSegmentResult,
  SaveSegmentInput,
} from "@/lib/modules/member";

export {
  listSegmentFields,
  evaluateSegment,
  countSegment,
  sampleSegment,
  listSegments,
  getSegment,
  saveSegment,
  deleteSegment,
  segmentMembers,
  canManageSegments,
  describeDefinition,
  parseDefinition,
  SEGMENT_OPS,
  SEGMENT_OP_LABELS,
} from "@/lib/modules/member";
