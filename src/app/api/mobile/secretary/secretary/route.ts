// GET/PUT /api/mobile/secretary/secretary — ตัวตนเลขาของผู้ใช้ (ชื่อ · คำลงท้าย · น้ำเสียง · ภาษา) · แถวระดับผู้ใช้ (ข้ามร้าน) ⇒ ไม่ต้องมี x-tenant-id
//   GET อ่านอย่างเดียว (ไม่สร้างแถว · ไม่มีแถว = ค่าเริ่มต้น `saved:false`) · PUT ตรวจด้วย `normalizeIdentityPatch` ตัวเดียวกับ lib (ผิด = 400 ไทย) → `updateSecretary`
import { z } from "zod";
import { identityOf, normalizeIdentityPatch, sampleSpeech, secretaryOf, updateSecretary, SECRETARY_DEFAULT, type SecretaryIdentity } from "@/lib/ai/secretary/secretary";
import { secretaryDto } from "@/lib/ai/secretary/dto";
import { ok, readBody, thrown, userGate, withRateLimit, withErrors } from "../_shared";

const PutBody = z
  .object({ name: z.string().max(200).optional(), suffix: z.string().max(100).optional(), tone: z.string().max(20).optional(), languages: z.array(z.string().max(10)).max(10).optional() })
  .strict();

async function GET_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const row = await secretaryOf(a.userId);
  const identity: SecretaryIdentity = row ? identityOf(row) : { ...SECRETARY_DEFAULT, languages: [...SECRETARY_DEFAULT.languages] };
  return ok(secretaryDto(identity, sampleSpeech(identity), !!row));
}

async function PUT_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "secretary");
  if (rl) return rl;
  const b = await readBody(req, PutBody);
  if (!b.ok) return b.res;
  try {
    normalizeIdentityPatch(b.v); // ตัวตรวจเดียวกับ updateSecretary — ผิด = throw ไทย (ไม่เขียน)
    const row = await updateSecretary(a.userId, b.v as Partial<SecretaryIdentity>);
    const identity = identityOf(row);
    return ok(secretaryDto(identity, sampleSpeech(identity), true));
  } catch (e) {
    return thrown(e, "secretary.put");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/secretary GET", GET_);
export const PUT = withErrors("secretary/secretary PUT", PUT_);
