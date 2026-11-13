import json, sys
ROOT = sys.argv[1]
def addr(**k):
    a = {x: "" for x in ["building","room","floor","village","houseNo","moo","soi","street","subdistrict","district","province","postcode","line"]}
    a.update(k); return a
BKK = dict(district="พญาไท", province="กรุงเทพมหานคร", postcode="10400")
EMP = {"taxId":"0105561234560","branchNo":"000000","employerName":"บริษัท ตัวอย่าง จำกัด","employerAddress":"99 ถนนพญาไท แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400",
       "deptName":"สำนักงานใหญ่","lto":False,"branchType":"","rdUserId":"REGREF0000000000001","rdFormFlag":1,"rdSlashMode":"DASH",
       "ssoAccountNo":"1234567890","ssoBranchNo":"000000","signerName":"นายผู้จ่าย ใจกว้าง","certPrefix":"HR50"}
def P(i, code, nid, title, f, l, a=None, sso=None, name=None):
    return {"employeeId":i,"name":name or f"{f} {l}","code":code,"nationalId":nid,"title":title,"firstName":f,"lastName":l,"ssoPrefix":sso,"address":a or addr(**BKK)}
PERS = {
 "p1": P("p1","E01","1100700123455","นาย","สมชาย","ใจดี"),
 "p2": P("p2","E02","3100500654321","นางสาว","สมหญิง","รักงาน"),
 "p3": P("p3","E03",None,"นาย","ไม่มี","เลข"),
 "p4": P("p4","E04","1500100123451","นาย","ว่าง","เงิน"),
 "p5": P("p5","E05","3900100123453","นาย","มี","ทับ", addr(houseNo="12/3", **BKK)),
 "p6": P("p6","E06","1700100123459","","อรุณ","แสงทอง", addr(building="อาคารสิริภิญโญ",room="12",floor="3",village="หมู่บ้านเยาวพรรณ",houseNo="99",moo="4",soi="ซอยรางน้ำ",street="พหลโยธิน",subdistrict="ทุ่งพญาไท",district="ราชเทวี",province="กรุงเทพมหานคร",postcode="10400")),
 "p7": P("p7","E07","1200100123453","นาง","กมลวรรณวิภาวดีศรีสุนทรประเสริฐสุขเจริญ","ทดสอบ"),
 "p8": P("p8","E08","1102000123454","ด.ช.","เด็ก","ชาย"),
 "p9": P("p9","E09","3100600999991","นาย","ไม่","ประกัน"),
}
def it(e, run, day, inc, tax, st="PAID", ev=2, **sso):
    d = {"employeeId":e,"runId":run,"engineVersion":ev,"runStatus":st,"payDate":day,"incomeSatang":inc,"taxSatang":tax}
    d.update({"ssoWageActualSatang":sso.get("a",0),"ssoWageClampedSatang":sso.get("c",0),"ssoEmployeeSatang":sso.get("ee",0),"ssoEmployerSatang":sso.get("er",sso.get("ee",0))})
    return d
pers = lambda *ids: [PERS[i] for i in ids]
YEAR = [it("p1","r10","2026-10-25",3000000,50000), it("p2","r10","2026-10-25",2000000,0), it("p3","r10","2026-10-25",1500000,0),
        it("p1","r11","2026-11-25",3000000,50000), it("p2","r11","2026-11-25",2000000,0), it("p4","r11","2026-11-25",0,0), it("p5","r11","2026-11-25",1000000,0),
        it("p1","r12","2026-12-25",8000000,250000), it("p6","r12","2026-12-25",2500000,12500)]
YP = pers("p1","p2","p3","p4","p5","p6")
V = {"_note":"HR H3.6 pure vectors — inputs for buildPnd1 / buildSso110 / itemFigures / thaiIdOk / taxCertContent / taxCertDocNo. Hand derivation + field tables: ledger/wo-notes/hr-H3.6-oracle.md. Golden bytes: scripts/fixtures/hr-h3.6-g*.txt (ledger/wo-notes/hr-H3.6-derive.py).",
 "employer": EMP, "persons": PERS,
 "pnd": {
  "G1": {"in":{"kind":"PND1","taxYear":2026,"taxMonth":11,"employer":EMP,"persons":pers("p1","p2"),"items":[it("p1","r11","2026-11-25",3000000,50000), it("p2","r11","2026-11-25",2000000,0)],"certs":[],"options":{}},
         "file":"hr-h3.6-g1-pnd1.txt","fileName":"PND1_0105561234560_000000_2569_11_00_00.txt","lineCount":2,"totalIncomeSatang":5000000,"totalTaxSatang":50000,"notIncluded":[],"warnings":[]},
  "G2": {"in":{"kind":"PND1A","taxYear":2026,"taxMonth":None,"employer":EMP,"persons":YP,"items":YEAR,"certs":[{"employeeId":"p2","docSeq":1,"formSeq":1}],"options":{}},
         "file":"hr-h3.6-g2-pnd1a.txt","fileName":"PND1A_0105561234560_000000_2569_00_00_00.txt","lineCount":4,"totalIncomeSatang":21500000,"totalTaxSatang":362500,
         "notIncluded":[{"employeeId":"p3","cause":"INCOMPLETE","fields":["nationalId"],"incomeSatang":1500000,"taxSatang":0},
                        {"employeeId":"p4","cause":"ZERO_INCOME","fields":[],"incomeSatang":0,"taxSatang":0}],
         "warnings":[{"employeeId":"p5","code":"SLASH_DASH","fields":["address.houseNo"]}]},
  "G2X": {"_why":"G2 with options.slashMode EXCLUDE (profile rdSlashMode) ⇒ p5 out, named","in":{"kind":"PND1A","taxYear":2026,"taxMonth":None,"employer":EMP,"persons":YP,"items":YEAR,"certs":[{"employeeId":"p2","docSeq":1,"formSeq":1}],"options":{"slashMode":"EXCLUDE"}},
         "file":"hr-h3.6-g2x-pnd1a-exclude.txt","lineCount":3,"totalIncomeSatang":20500000,"totalTaxSatang":362500,
         "notIncluded":[{"employeeId":"p3","cause":"INCOMPLETE","fields":["nationalId"],"incomeSatang":1500000,"taxSatang":0},
                        {"employeeId":"p4","cause":"ZERO_INCOME","fields":[],"incomeSatang":0,"taxSatang":0},
                        {"employeeId":"p5","cause":"INCOMPLETE","fields":["address.houseNo:char"],"incomeSatang":1000000,"taxSatang":0}],
         "warnings":[]},
  "G2M10": {"in":{"kind":"PND1","taxYear":2026,"taxMonth":10,"employer":EMP,"persons":YP,"items":YEAR,"certs":[],"options":{}},"file":"hr-h3.6-g2m10-pnd1.txt","fileName":"PND1_0105561234560_000000_2569_10_00_00.txt","lineCount":2,"totalIncomeSatang":5000000,"totalTaxSatang":50000,
         "notIncluded":[{"employeeId":"p3","cause":"INCOMPLETE","fields":["nationalId"],"incomeSatang":1500000,"taxSatang":0}],"warnings":[]},
  "G2M11": {"in":{"kind":"PND1","taxYear":2026,"taxMonth":11,"employer":EMP,"persons":YP,"items":YEAR,"certs":[],"options":{}},"file":"hr-h3.6-g2m11-pnd1.txt","fileName":"PND1_0105561234560_000000_2569_11_00_00.txt","lineCount":3,"totalIncomeSatang":6000000,"totalTaxSatang":50000,
         "notIncluded":[{"employeeId":"p4","cause":"ZERO_INCOME","fields":[],"incomeSatang":0,"taxSatang":0}],"warnings":[{"employeeId":"p5","code":"SLASH_DASH","fields":["address.houseNo"]}]},
  "G2M11X": {"in":{"kind":"PND1","taxYear":2026,"taxMonth":11,"employer":EMP,"persons":YP,"items":YEAR,"certs":[],"options":{"slashMode":"EXCLUDE"}},"file":"hr-h3.6-g1-pnd1.txt","fileName":"PND1_0105561234560_000000_2569_11_00_00.txt","lineCount":2,"totalIncomeSatang":5000000,"totalTaxSatang":50000,
         "notIncluded":[{"employeeId":"p4","cause":"ZERO_INCOME","fields":[],"incomeSatang":0,"taxSatang":0},{"employeeId":"p5","cause":"INCOMPLETE","fields":["address.houseNo:char"],"incomeSatang":1000000,"taxSatang":0}],"warnings":[]},
  "G2M12": {"in":{"kind":"PND1","taxYear":2026,"taxMonth":12,"employer":EMP,"persons":YP,"items":YEAR,"certs":[],"options":{}},"file":"hr-h3.6-g2m12-pnd1.txt","fileName":"PND1_0105561234560_000000_2569_12_00_00.txt","lineCount":2,"totalIncomeSatang":10500000,"totalTaxSatang":262500,"notIncluded":[],"warnings":[]},
  "G2W": {"_why":"same as G2 with p2's cert stored formSeq 2 and an APPROVED + a v1 run item ⇒ bytes = G2, warnings exact","in":{"kind":"PND1A","taxYear":2026,"taxMonth":None,"employer":EMP,"persons":YP,
         "items":[dict(x, runStatus="APPROVED") if x["runId"]=="r12" else (dict(x, engineVersion=1) if x["runId"]=="r10" else x) for x in YEAR],"certs":[{"employeeId":"p2","docSeq":1,"formSeq":2}],"options":{}},
         "file":"hr-h3.6-g2-pnd1a.txt","warnings":[{"employeeId":None,"code":"NOT_PAID","fields":[]},{"employeeId":None,"code":"V1_RUN","fields":[]},{"employeeId":"p2","code":"CERT_SEQ","fields":[]},{"employeeId":"p5","code":"SLASH_DASH","fields":["address.houseNo"]}]},
  "refuse": [
   {"id":"R1","patch":{"employer.taxId":None},"code":"PROFILE","fields":["taxId"]},
   {"id":"R2","patch":{"employer.taxId":"0105561234567"},"code":"PROFILE","fields":["taxId"]},
   {"id":"R3","patch":{"employer.rdUserId":""},"code":"PROFILE","fields":["rdUserId"]},
   {"id":"R4","patch":{"employer.branchNo":"1"},"code":"PROFILE","fields":["branchNo"]},
   {"id":"R5","patch":{"employer.deptName":"สาขา/1"},"code":"PROFILE","fields":["deptName"]},
   {"id":"R6","patch":{"options.formType":"100"},"code":"OPTIONS","fields":["formType"]},
   {"id":"R7","patch":{"options.seqNo":100},"code":"OPTIONS","fields":["seqNo"]},
   {"id":"R8","patch":{"options.formFlag":3},"code":"OPTIONS","fields":["formFlag"]},
   {"id":"R9","patch":{"taxMonth":13},"code":"OPTIONS","fields":["taxMonth"]},
   {"id":"R11","patch":{"options.slashMode":"KEEP"},"code":"OPTIONS","fields":["slashMode"]},
   {"id":"R10","patch":{"items":[]},"code":"EMPTY","fields":[]}
  ],
  "charName": {"_why":"'/' in a name is never transliterated (DASH applies to address parts only) ⇒ p1 INCOMPLETE firstName:char, file built with p2","patch":{"persons":[dict(PERS["p1"], firstName="สม/ชาย"), PERS["p2"]]},"lineCount":1,"notIncluded":[{"employeeId":"p1","cause":"INCOMPLETE","fields":["firstName:char"],"incomeSatang":3000000,"taxSatang":50000}]},
  "options": [
   {"id":"O1","options":{"formType":"01","seqNo":2},"fileName":"PND1_0105561234560_000000_2569_11_01_02.txt","header14":"01"},
   {"id":"O2","options":{"formFlag":2},"header20":"500.00","header22":"2"}
  ]
 },
 "sso": {
  "G3": {"in":{"run":{"periodKey":"2026-11","payDate":"2026-11-25","status":"PAID"},"employer":EMP,"persons":pers("p1","p2"),
          "items":[it("p1","r11","2026-11-25",0,0,a=1500000,c=1500000,ee=75000), it("p2","r11","2026-11-25",0,0,a=943000,c=943000,ee=47200)],
          "options":{"encoding":"TIS620","wageMode":"CLAMPED","paidDate":"2026-12-15","rateBp":500,"lineEnd":"CRLF"}},
         "file":"hr-h3.6-g3-sso.txt","fileName":"SSO110_1234567890_000000_256911.txt","contentType":"text/plain; charset=windows-874","lineCount":2,"totalWageSatang":2443000,"totalContributionSatang":244400,"notIncluded":[],"warnings":[]},
  "G3D": {"_why":"G3 with options {} ⇒ defaults TIS620 · CLAMPED · paidDate 15th of the next month · 500 · CRLF ⇒ same bytes","file":"hr-h3.6-g3-sso.txt"},
  "G3U": {"options":{"encoding":"UTF8"},"file":"hr-h3.6-g3u-sso-utf8.txt","contentType":"text/plain; charset=utf-8"},
  "G3L": {"options":{"lineEnd":"LF"},"file":"hr-h3.6-g3l-sso-lf.txt"},
  "G3A": {"in":{"run":{"periodKey":"2026-11","payDate":"2026-11-25","status":"APPROVED"},"employer":EMP,"persons":pers("p1","p7","p8","p9"),
          "items":[it("p1","r11","2026-11-25",0,0,"APPROVED",a=4000000,c=1750000,ee=87500), it("p7","r11","2026-11-25",0,0,"APPROVED",a=1200000,c=1200000,ee=60000),
                   it("p8","r11","2026-11-25",0,0,"APPROVED",a=900000,c=900000,ee=45000), it("p9","r11","2026-11-25",0,0,"APPROVED",a=0,c=0,ee=0)],
          "options":{"wageMode":"ACTUAL"}},
         "file":"hr-h3.6-g3a-sso-actual.txt","lineCount":2,"totalWageSatang":5200000,"totalContributionSatang":295000,
         "notIncluded":[{"employeeId":"p8","cause":"INCOMPLETE","fields":["ssoPrefix"],"wageSatang":900000,"contributionSatang":45000},{"employeeId":"p9","cause":"NOT_INSURED","fields":[],"wageSatang":0,"contributionSatang":0}],
         "warnings":[{"employeeId":"p7","code":"NAME_CUT","fields":["firstName"]}]},
  "G3B": {"options":{"wageMode":"CLAMPED"},"file":"hr-h3.6-g3b-sso-clamped.txt","totalWageSatang":2950000},
  "refuse": [
   {"id":"S1","patch":{"employer.ssoAccountNo":"123"},"code":"PROFILE","fields":["ssoAccountNo"]},
   {"id":"S2","patch":{"employer.ssoBranchNo":None},"code":"PROFILE","fields":["ssoBranchNo"]},
   {"id":"S3","patch":{"employer.employerName":"Shop\tCo"},"code":"PROFILE","fields":["employerName"]},
   {"id":"S4","patch":{"options.encoding":"UTF16"},"code":"OPTIONS","fields":["encoding"]},
   {"id":"S5","patch":{"options.wageMode":"GROSS"},"code":"OPTIONS","fields":["wageMode"]},
   {"id":"S6","patch":{"options.paidDate":"2026-02-30"},"code":"OPTIONS","fields":["paidDate"]},
   {"id":"S7","patch":{"options.rateBp":10001},"code":"OPTIONS","fields":["rateBp"]},
   {"id":"S8","patch":{"options.lineEnd":"CR"},"code":"OPTIONS","fields":["lineEnd"]},
   {"id":"S9","patch":{"run.status":"DRAFT"},"code":"STATUS","fields":[]},
   {"id":"S10","patch":{"items":[]},"code":"EMPTY","fields":[]}
  ],
  "tisChar": {"_why":"p1 firstName 'สมชาย😀' under TIS620 ⇒ p1 INCOMPLETE firstName:char · UTF8 ⇒ included","employeeId":"p1","firstName":"สมชาย😀"}
 },
 "figures": [
  {"id":"F1","row":{"engineVersion":2,"whtSatang":75000,"addSatang":500000,"ssoBaseSatang":1750000,"ssoEmployeeSatang":87500,"ssoEmployerSatang":87500,"snapshotJson":{"engineVersion":2,"whtIncomeSatang":3500000,"whtOneOffSatang":25000,"ssoWageSatang":3000000,"baseSalarySatang":3000000}},
   "out":{"ok":True,"source":"V2","incomeSatang":3500000,"taxSatang":75000,"oneOffTaxSatang":25000,"ssoWageActualSatang":3000000,"ssoWageClampedSatang":1750000,"ssoEmployeeSatang":87500,"ssoEmployerSatang":87500}},
  {"id":"F2","row":{"engineVersion":1,"whtSatang":0,"addSatang":100000,"ssoBaseSatang":1750000,"ssoEmployeeSatang":87500,"ssoEmployerSatang":87500,"snapshotJson":{"baseSalarySatang":2000000,"addSatang":100000,"ssoEligible":True}},
   "out":{"ok":True,"source":"V1","incomeSatang":2100000,"taxSatang":0,"oneOffTaxSatang":None,"ssoWageActualSatang":2000000,"ssoWageClampedSatang":1750000,"ssoEmployeeSatang":87500,"ssoEmployerSatang":87500}},
  {"id":"F3","row":{"engineVersion":1,"whtSatang":0,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{"baseSalarySatang":1000000,"ssoEligible":False}},
   "out":{"ok":True,"source":"V1","incomeSatang":1000000,"taxSatang":0,"oneOffTaxSatang":None,"ssoWageActualSatang":0,"ssoWageClampedSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0}},
  {"id":"F4","row":{"engineVersion":2,"whtSatang":75000,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{"engineVersion":2,"whtOneOffSatang":0,"ssoWageSatang":0}},"out":{"ok":False}},
  {"id":"F5","row":{"engineVersion":2,"whtSatang":1000,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{"whtIncomeSatang":100000,"whtOneOffSatang":2000,"ssoWageSatang":0}},"out":{"ok":False},"_why":"one-off tax > total tax"},
  {"id":"F6","row":{"engineVersion":2,"whtSatang":0,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{"whtIncomeSatang":-1,"whtOneOffSatang":0,"ssoWageSatang":0}},"out":{"ok":False}},
  {"id":"F7","row":{"engineVersion":2,"whtSatang":0,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{"whtIncomeSatang":"100","whtOneOffSatang":0,"ssoWageSatang":0}},"out":{"ok":False}},
  {"id":"F8","row":{"engineVersion":1,"whtSatang":0,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{}},"out":{"ok":False}},
  {"id":"F9","row":{"engineVersion":3,"whtSatang":0,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":{"whtIncomeSatang":0,"whtOneOffSatang":0,"ssoWageSatang":0}},"out":{"ok":False}},
  {"id":"F10","row":{"engineVersion":2,"whtSatang":0,"addSatang":0,"ssoBaseSatang":0,"ssoEmployeeSatang":0,"ssoEmployerSatang":0,"snapshotJson":None},"out":{"ok":False}}
 ],
 "thaiId": [["1100700123455",True],["3100500654321",True],["3809900379362",True],["0105561234560",True],["0105561234567",False],["1100700123456",False],
            ["110070012345",False],["11007001234555",False],["110070012345a",False],["1-1007-00123-45-5",False],["",False],[None,False]],
 "docNo": [{"prefix":"HR50","taxYear":2026,"seq":1,"out":"HR50-2026-0001"},{"prefix":"HR50","taxYear":2031,"seq":12,"out":"HR50-2031-0012"},{"prefix":"T","taxYear":2031,"seq":10000,"out":"T-2031-10000"}],
}
ROW1 = "เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)"
PAYER = {"taxId":EMP["taxId"],"branchNo":"000000","name":EMP["employerName"],"address":EMP["employerAddress"]}
def C(kind, seq, fseq, p, payee_addr, inc, tax, sso, text, issue):
    return {"v":1,"kind":kind,"taxYear":2026,"taxYearBe":2569,"bookNo":"2569","docNo":f"HR50-2026-{seq:04d}","formType":"PND1A","formSeq":fseq,
            "payer":PAYER,"payee":{"taxId":p["nationalId"],"name":" ".join(x for x in [p["title"],p["firstName"],p["lastName"]] if x),"address":payee_addr},
            "rows":[{"row":"1","label":ROW1,"paidWhen":"2569","amountSatang":inc,"taxSatang":tax}],
            "totalSatang":inc,"totalTaxSatang":tax,"totalTaxText":text,"funds":{"govSatang":0,"ssoSatang":sso,"providentSatang":0},
            "payCondition":1,"issueDate":issue,"signerName":EMP["signerName"]}
V["cert"] = [
 {"id":"C1","in":{"kind":"ANNUAL","taxYear":2026,"seq":2,"formSeq":2,"issueDate":"2027-02-01","employer":EMP,"person":PERS["p1"],"figures":{"incomeSatang":14000000,"taxSatang":350000,"ssoSatang":225000}},
  "out":C("ANNUAL",2,2,PERS["p1"],"พญาไท กรุงเทพมหานคร 10400",14000000,350000,225000,"สามพันห้าร้อยบาทถ้วน","2027-02-01"),
  "pdfMust":["HR50-2026-0002","0105561234560","1100700123455","140,000.00","3,500.00","2,250.00"],
  "pdfMustThai":["หนังสือรับรองการหักภาษี ณ ที่จ่าย","ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร","นาย สมชาย ใจดี","บริษัท ตัวอย่าง จำกัด","สามพันห้าร้อยบาทถ้วน","ภ.ง.ด.1ก","หัก ณ ที่จ่าย","กองทุนประกันสังคม",ROW1],
  "pdfPage":["ฉบับที่ 1","ฉบับที่ 2"],"pdfNot":["3100500654321"]},
 {"id":"C2","in":{"kind":"LEAVER","taxYear":2026,"seq":1,"formSeq":1,"issueDate":"2026-12-10","employer":EMP,"person":PERS["p2"],"figures":{"incomeSatang":4000000,"taxSatang":0,"ssoSatang":0}},
  "out":C("LEAVER",1,1,PERS["p2"],"พญาไท กรุงเทพมหานคร 10400",4000000,0,0,"ศูนย์บาทถ้วน","2026-12-10")},
 {"id":"C3","in":{"kind":"ANNUAL","taxYear":2026,"seq":3,"formSeq":3,"issueDate":"2027-02-01","employer":EMP,"person":PERS["p6"],"figures":{"incomeSatang":2500000,"taxSatang":12500,"ssoSatang":0}},
  "out":C("ANNUAL",3,3,PERS["p6"],"อาคารสิริภิญโญ ห้อง 12 ชั้น 3 หมู่บ้านเยาวพรรณ เลขที่ 99 หมู่ 4 ซอยรางน้ำ ถนน พหลโยธิน ทุ่งพญาไท ราชเทวี กรุงเทพมหานคร 10400",2500000,12500,0,"หนึ่งร้อยยี่สิบห้าบาทถ้วน","2027-02-01")},
 {"id":"C4","_why":"no structured parts ⇒ address.line then subdistrict district province postcode","in":{"kind":"ANNUAL","taxYear":2026,"seq":4,"formSeq":4,"issueDate":"2027-02-01","employer":EMP,
   "person":dict(PERS["p4"], address={**PERS["p4"]["address"], "line":"55/1 ซอยสุข", "subdistrict":"ทุ่งพญาไท"}),"figures":{"incomeSatang":100,"taxSatang":0,"ssoSatang":0}},
  "outPayeeAddress":"55/1 ซอยสุข ทุ่งพญาไท พญาไท กรุงเทพมหานคร 10400","outTotalTaxText":"ศูนย์บาทถ้วน"}
]
open(f"{ROOT}/scripts/fixtures/hr-h3.6-vectors.json","w",encoding="utf-8").write(json.dumps(V, ensure_ascii=False, indent=1)+"\n")
