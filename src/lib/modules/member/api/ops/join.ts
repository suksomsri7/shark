// ops/join.ts — เลนสาธารณะ "สมัครสมาชิกจากลิงก์ของร้าน" (MEMBER-API §2.20 · M3.10 · บริการ `member/join.ts`)
//
// ไม่ต้องมีคีย์ · ไม่ต้องมี session — ด่านของเลนนี้อยู่ที่ `public-lane.ts` (ร้านต้องมีจริง + เพดานต่อ IP)
// และที่บริการ (OTP ใช้ครั้งเดียว · ผิด 5 ครั้งล็อก · ตั๋วสมัคร 15 นาทีใช้ครั้งเดียว · เบอร์ซ้ำ = คนเดิม)
//
// ขั้นตอน: GET form → POST start (ขอรหัส) → POST verify (ได้ `joinToken` หรือ session ถ้าเป็นสมาชิกอยู่แล้ว)
//          → POST complete (ได้ session `cs_…` ใช้กับ `/me/*` ต่อได้ทันที)
// 🔴 `Idempotency-Key` ไม่บังคับ (`idempotency: "optional"`) — ผู้เรียกคือเบราว์เซอร์ของลูกค้า ·
//    ส่งมา = ตอบซ้ำของเดิมตามปกติ (ค่าลับ `token`/`joinToken` ถูกแทนด้วย null ตอนตอบซ้ำ)
// 🔴 ข้อมูลผิด/รหัสผิด = 400 `validation` + ข้อความไทยของบริการ · ขอรหัสถี่ = 429 · ร้านไม่มี = 404
// 🔴 `lineUserId` ในเนื้อคำขอไม่ถูกเชื่อ (ไม่ผูก LINE ให้) — เก็บไว้ให้พนักงานผูกเองภายหลัง ดูหัวไฟล์ join.ts

import { z } from "zod";
import * as join from "../../join";
import { as400 } from "../http-errors";
import { defineMemberOp, type ApiOp } from "../op";
import { JOIN_ACTION, publicIpOf } from "../public-lane";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.10";

const form = defineMemberOp({
  id: "join.form",
  method: "GET",
  path: "/join/{tenantSlug}/form",
  kind: "read",
  action: JOIN_ACTION,
  auth: "public",
  summary:
    "Public, no key. The shop's signup form: the fields a new member fills in (with `required`), the 4 consent channels (LINE, EMAIL, SMS, PUSH), the privacy policy version to accept (0 = none published), the welcome points and whether the referral programme is on.",
  label: "ฟอร์มสมัครสมาชิก",
  test: TEST,
  async handler({ params }) {
    return jsonSafe(await as400(() => join.joinForm(params.tenantSlug ?? "")));
  },
});

const start = defineMemberOp({
  id: "join.start",
  method: "POST",
  path: "/join/{tenantSlug}/start",
  kind: "write",
  action: JOIN_ACTION,
  auth: "public",
  idempotency: "optional",
  summary:
    "Public, no key. Send a one time code to a phone number or email to start signing up. The answer never tells whether the person is already a member. At most 3 codes per number and 10 per network per 10 minutes. `src` counts a visit of the shop's acquisition link.",
  label: "ขอรหัสยืนยันเพื่อสมัครสมาชิก",
  input: z
    .object({
      phone: z.string().trim().max(20).nullish(),
      email: z.string().trim().email().max(200).nullish(),
      src: z.string().trim().max(40).nullish().describe("Acquisition link code from `?src=`."),
      referralCode: z.string().trim().max(20).nullish().describe("Friend's referral code from `?ref=` (checked when completing)."),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(
      await as400(
        () =>
          join.startJoin(
            params.tenantSlug ?? "",
            { phone: input.phone ?? null, email: input.email ?? null, src: input.src ?? null, referralCode: input.referralCode ?? null },
            { ip: publicIpOf(actor) || null },
          ),
        "The code could not be requested with these details.",
      ),
    );
  },
});

const verify = defineMemberOp({
  id: "join.verify",
  method: "POST",
  path: "/join/{tenantSlug}/verify",
  kind: "write",
  action: JOIN_ACTION,
  auth: "public",
  idempotency: "optional",
  replaySecrets: ["joinToken", "token"],
  summary:
    "Public, no key. Check the one time code. A person who is already a member gets `{ existing: true, token }` (a customer session, `cs_...`) and nothing is created; a new person gets `{ existing: false, joinToken }` (`jt_...`, valid 15 minutes) for the complete step. Five wrong codes lock that code.",
  label: "ยืนยันรหัสสมัครสมาชิก",
  input: z
    .object({
      otpId: z.string().trim().min(1).max(80),
      code: z.string().trim().min(4).max(10),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(
      await as400(
        () => join.verifyJoin(params.tenantSlug ?? "", { otpId: input.otpId, code: input.code }, { ip: publicIpOf(actor) || null }),
        "The code is wrong or expired. Request a new code.",
      ),
    );
  },
});

const complete = defineMemberOp({
  id: "join.complete",
  method: "POST",
  path: "/join/{tenantSlug}/complete",
  kind: "write",
  action: JOIN_ACTION,
  auth: "public",
  idempotency: "optional",
  replaySecrets: ["token"],
  summary:
    "Public, no key. Finish signing up with the `joinToken`: the form fields, consent per channel, the accepted policy version (must be the current one), an optional referral code and `src`. The phone or email comes from the verified code, not from the body. Answers the new member and a customer session `token` (`cs_...`) usable on /me right away. Wrong data answers 400 and leaves the joinToken usable.",
  label: "สมัครสมาชิก",
  input: z
    .object({
      joinToken: z.string().trim().min(10).max(120),
      fields: z.record(z.string(), z.unknown()).optional().describe("Values keyed by the field keys of GET /join/{tenantSlug}/form."),
      consents: z
        .array(z.object({ channel: z.string().trim().max(20), granted: z.boolean() }).strict())
        .max(4)
        .optional(),
      policyVersion: z.coerce.number().int().min(0).describe("`policyVersion` of the form the person accepted."),
      referralCode: z.string().trim().max(20).nullish(),
      src: z.string().trim().max(40).nullish(),
      lineUserId: z.string().trim().max(80).nullish().describe("Recorded for staff to link; not trusted to link LINE by itself."),
      device: z.object({ fingerprint: z.string().trim().max(200).nullish() }).strict().nullish(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(
      await as400(
        () =>
          join.completeJoin(
            params.tenantSlug ?? "",
            {
              joinToken: input.joinToken,
              fields: input.fields,
              consents: input.consents,
              policyVersion: input.policyVersion,
              referralCode: input.referralCode ?? null,
              src: input.src ?? null,
              lineUserId: input.lineUserId ?? null,
              device: input.device ?? null,
            },
            { ip: publicIpOf(actor) || null },
          ),
        "The signup was not accepted as sent.",
      ),
    );
  },
});

export const JOIN_OPS: ApiOp[] = [form, start, verify, complete];
