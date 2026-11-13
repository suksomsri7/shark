# HR H3.6 golden derivation (run: python3 -I ledger/wo-notes/hr-H3.6-derive.py <repo-root>)
# Independent of the code under test: every field is written from the layout tables in hr-H3.6-oracle.md
# (RD Format 2.0 [V] · SSO Format135 [V] · research C3 V1/V2). Output: scripts/fixtures/hr-h3.6-g*.txt
import sys, os
ROOT = sys.argv[1]
FIX = os.path.join(ROOT, "scripts", "fixtures")
BOM = b"\xef\xbb\xbf"

def baht(s):  # satang int -> "1234.56" (RD numeric 15,2; no separators)
    return f"{s // 100}.{s % 100:02d}"

def rd_file(rows, final_crlf=True):
    body = "\r\n".join("|".join(r) for r in rows) + ("\r\n" if final_crlf else "")
    return BOM + body.encode("utf-8")

def rd_header(kind, nid, month, be, n, amt, tax, user):
    # 1 H · 2 SENDER_ID 0000 · 3 SENDER_NID · 4 SENDER_BRANCH · 5 SENDER_ROLE 1 · 6 TAX_TYPE · 7 NID · 8 BRANCH_NO · 9 DEPT_NAME
    # 10 LTO 0 · 11 TAX_MONTH · 12 TAX_YEAR BE · 13 BRANCH_TYPE '' · 14 FORM_TYPE 00 · 15 TOT_NUM · 16 TOT_AMT · 17 TOT_TAX
    # 18 SUR_AMT 0.00 · 19 GTOT_TAX = TOT_TAX · 20 TRANS_AMT 0.00 (media) · 21 USER_ID · 22 FORM_FLAG 1
    return ["H", "0000", nid, "000000", "1", kind, nid, "000000", "สำนักงานใหญ่", "0", month, be, "", "00",
            str(n), baht(amt), baht(tax), "0.00", baht(tax), "0.00", user, "1"]

def rd_detail(seq, pin, title, f, s, date, amt, tax, addr):
    # 1 D · 2 SEQ_NO · 3 BRANCH_NO · 4 PIN · 5 TIN 0000000000 · 6 TITLE ('-' if none) · 7 FNAME · 8 SNAME · 9 PAID_DATE DDMMYYYY BE
    # 10 TAX_RATE 0.00 (progressive) · 11 PAID_AMT · 12 TAX_AMT · 13 INC_TYPE 1 (40(1)) · 14 PAY_CON 1 · 15..26 address (12 parts)
    return ["D", str(seq), "000000", pin, "0000000000", title or "-", f, s, date, "0.00", baht(amt), baht(tax), "1", "1"] + addr

NID = "0105561234560"; USER = "REGREF0000000000001"
A1 = [""] * 9 + ["พญาไท", "กรุงเทพมหานคร", "10400"]
A6 = ["อาคารสิริภิญโญ", "12", "3", "หมู่บ้านเยาวพรรณ", "99", "4", "ซอยรางน้ำ", "พหลโยธิน", "ทุ่งพญาไท", "ราชเทวี", "กรุงเทพมหานคร", "10400"]

def w(name, data):
    p = os.path.join(FIX, name)
    open(p, "wb").write(data)
    print(name, len(data))

# G1 = research C3 V1 (ids replaced by checksum-valid ones)
g1 = [rd_header("PND1", NID, "11", "2569", 2, 5000000, 50000, USER),
      rd_detail(1, "1100700123455", "นาย", "สมชาย", "ใจดี", "25112569", 3000000, 50000, A1),
      rd_detail(2, "3100500654321", "นางสาว", "สมหญิง", "รักงาน", "25112569", 2000000, 0, A1)]
w("hr-h3.6-g1-pnd1.txt", rd_file(g1))
# G2 annual 1ก 2569: cert holder p2 first, then person order · PAID_DATE = 3112<BE>
# p5 houseNo "12/3": rule 11 forbids "/" ⇒ default slashMode DASH writes "12-3" (+ warning SLASH_DASH) · EXCLUDE ⇒ p5 out (G2X)
A5 = ["", "", "", "", "12-3", "", "", "", "", "พญาไท", "กรุงเทพมหานคร", "10400"]
g2 = [rd_header("PND1A", NID, "00", "2569", 4, 21500000, 362500, USER),
      rd_detail(1, "3100500654321", "นางสาว", "สมหญิง", "รักงาน", "31122569", 4000000, 0, A1),
      rd_detail(2, "1100700123455", "นาย", "สมชาย", "ใจดี", "31122569", 14000000, 350000, A1),
      rd_detail(3, "3900100123453", "นาย", "มี", "ทับ", "31122569", 1000000, 0, A5),
      rd_detail(4, "1700100123459", "", "อรุณ", "แสงทอง", "31122569", 2500000, 12500, A6)]
w("hr-h3.6-g2-pnd1a.txt", rd_file(g2))
g2x = [rd_header("PND1A", NID, "00", "2569", 3, 20500000, 362500, USER),
      rd_detail(1, "3100500654321", "นางสาว", "สมหญิง", "รักงาน", "31122569", 4000000, 0, A1),
      rd_detail(2, "1100700123455", "นาย", "สมชาย", "ใจดี", "31122569", 14000000, 350000, A1),
      rd_detail(3, "1700100123459", "", "อรุณ", "แสงทอง", "31122569", 2500000, 12500, A6)]
w("hr-h3.6-g2x-pnd1a-exclude.txt", rd_file(g2x))
# G2M monthly Oct/Nov/Dec of the same data (property oracle) · Nov EXCLUDE = G1 bytes
w("hr-h3.6-g2m11-pnd1.txt", rd_file([rd_header("PND1", NID, "11", "2569", 3, 6000000, 50000, USER),
    rd_detail(1, "1100700123455", "นาย", "สมชาย", "ใจดี", "25112569", 3000000, 50000, A1),
    rd_detail(2, "3100500654321", "นางสาว", "สมหญิง", "รักงาน", "25112569", 2000000, 0, A1),
    rd_detail(3, "3900100123453", "นาย", "มี", "ทับ", "25112569", 1000000, 0, A5)]))
w("hr-h3.6-g2m10-pnd1.txt", rd_file([rd_header("PND1", NID, "10", "2569", 2, 5000000, 50000, USER),
    rd_detail(1, "1100700123455", "นาย", "สมชาย", "ใจดี", "25102569", 3000000, 50000, A1),
    rd_detail(2, "3100500654321", "นางสาว", "สมหญิง", "รักงาน", "25102569", 2000000, 0, A1)]))
w("hr-h3.6-g2m12-pnd1.txt", rd_file([rd_header("PND1", NID, "12", "2569", 2, 10500000, 262500, USER),
    rd_detail(1, "1100700123455", "นาย", "สมชาย", "ใจดี", "25122569", 8000000, 250000, A1),
    rd_detail(2, "1700100123459", "", "อรุณ", "แสงทอง", "25122569", 2500000, 12500, A6)]))

# ---- SSO Format 135 ----
def is_mark(c): c = ord(c); return c == 0x0E31 or c == 0x0E33 or 0x0E34 <= c <= 0x0E3A or 0x0E47 <= c <= 0x0E4E
def is_lead(c): return 0x0E40 <= ord(c) <= 0x0E44
def cut(s, n):  # same rule as H3.5 encode.cutAtCluster (brief H3.5 fix r1 F3)
    if len(s) <= n: return s
    k = n
    if is_mark(s[k]):
        while k > 0 and is_mark(s[k - 1]): k -= 1
        if k > 0: k -= 1
    while k > 0 and is_lead(s[k - 1]): k -= 1
    return s[:k]
def L(s, n): s = cut(s, n); return s + " " * (n - len(s))
def Z(v, n): s = str(v); assert len(s) <= n; return s.rjust(n, "0")
def sso_header(acc, br, paid, period, name, rate, n, wages, ee, er):
    # 1 '1' · 2–11 ACC · 12–17 BRANCH · 18–23 PAID DATE DDMMYY(BE) · 24–27 PERIOD MMYY(BE) · 28–72 NAME 45 · 73–76 RATE
    # 77–82 COUNT 6 · 83–97 WAGES 15 · 98–111 TOTAL 14 (ee+er) · 112–123 EE 12 · 124–135 ER 12
    l = "1" + acc + br + paid + period + L(name, 45) + Z(rate, 4) + Z(n, 6) + Z(wages, 15) + Z(ee + er, 14) + Z(ee, 12) + Z(er, 12)
    assert len(l) == 135, len(l); return l
def sso_detail(nid, prefix, f, s, wage, ee):
    # 1 '2' · 2–14 SSO ID (national id) · 15–17 PREFIX · 18–47 FNAME 30 · 48–82 LNAME 35 · 83–96 WAGES 14 · 97–108 PAID 12 · 109–135 blank 27
    l = "2" + nid + prefix + L(f, 30) + L(s, 35) + Z(wage, 14) + Z(ee, 12) + " " * 27
    assert len(l) == 135, len(l); return l
def tis(s): return bytes(c if c < 0x80 else c - 0x0E00 + 0xA0 for c in map(ord, s))
def sso_file(lines, enc, eol):
    t = "".join(l + eol for l in lines)
    return tis(t) if enc == "TIS620" else t.encode("utf-8")
CO = "บริษัท ตัวอย่าง จำกัด"
g3 = [sso_header("1234567890", "000000", "151269", "1169", CO, 500, 2, 2443000, 122200, 122200),
      sso_detail("1100700123455", "003", "สมชาย", "ใจดี", 1500000, 75000),
      sso_detail("3100500654321", "004", "สมหญิง", "รักงาน", 943000, 47200)]
w("hr-h3.6-g3-sso.txt", sso_file(g3, "TIS620", "\r\n"))
w("hr-h3.6-g3u-sso-utf8.txt", sso_file(g3, "UTF8", "\r\n"))
w("hr-h3.6-g3l-sso-lf.txt", sso_file(g3, "TIS620", "\n"))
LONG = "กมลวรรณวิภาวดีศรีสุนทรประเสริฐสุขเจริญ"
print("LONG len", len(LONG), "cut30", cut(LONG, 30), len(cut(LONG, 30)))
def g3x(mode):
    w1 = 4000000 if mode == "ACTUAL" else 1750000
    return [sso_header("1234567890", "000000", "151269", "1169", CO, 500, 2, w1 + 1200000, 147500, 147500),
            sso_detail("1100700123455", "003", "สมชาย", "ใจดี", w1, 87500),
            sso_detail("1200100123453", "005", LONG, "ทดสอบ", 1200000, 60000)]
w("hr-h3.6-g3a-sso-actual.txt", sso_file(g3x("ACTUAL"), "TIS620", "\r\n"))
w("hr-h3.6-g3b-sso-clamped.txt", sso_file(g3x("CLAMPED"), "TIS620", "\r\n"))
for l in g1 + g2 + g2x: print(len(l), "|".join(l))
for l in g3 + g3x("ACTUAL"): print(l.replace(" ", "·"))

# ---- DB goldens (oracle §5 fixture: tenant qc-hr-h36-*, system A, runs 2031 = BE 2574) ----
DNID = "0105555000013"; DUSER = "QCREF00000000000036"
AD = ["", "", "", "", "", "", "", "", "ทุ่งพญาไท", "ราชเทวี", "กรุงเทพมหานคร", "10400"]
AD1 = ["", "", "", "", "99", "", "", "พญาไท", "ทุ่งพญาไท", "ราชเทวี", "กรุงเทพมหานคร", "10400"]
db1 = [rd_header("PND1", DNID, "02", "2574", 3, 6700000, 75000, DUSER),
       rd_detail(1, "1102000123454", "นาย", "เอกชัย", "หนึ่งดี", "27022574", 3500000, 75000, AD1),
       rd_detail(2, "3100600999991", "นางสาว", "บุษบา", "สองใจ", "27022574", 2000000, 0, AD),
       rd_detail(3, "1500100123451", "ด.ช.", "ดำรง", "สี่ทิศ", "27022574", 1200000, 0, AD)]
w("hr-h3.6-db1-pnd1.txt", rd_file(db1))
db2 = [rd_header("PND1A", DNID, "00", "2574", 4, 16800000, 175000, DUSER),
       rd_detail(1, "3100600999991", "นางสาว", "บุษบา", "สองใจ", "31122574", 5100000, 0, AD),
       rd_detail(2, "1102000123454", "นาย", "เอกชัย", "หนึ่งดี", "31122574", 9500000, 175000, AD1),
       rd_detail(3, "1500100123451", "ด.ช.", "ดำรง", "สี่ทิศ", "31122574", 1200000, 0, AD),
       rd_detail(4, "3900100123453", "นาง", "ห้าวหาญ", "ใจกล้า", "31122574", 1000000, 0, AD)]
w("hr-h3.6-db2-pnd1a.txt", rd_file(db2))
DCO = "บริษัท คิวซี ไฟล์ยื่น จำกัด"
def db3(mode):
    a, b = (3000000, 2000000) if mode == "ACTUAL" else (1750000, 1750000)
    return [sso_header("9876543210", "000000", "150374", "0274", DCO, 500, 2, a + b, 175000, 175000),
            sso_detail("1102000123454", "003", "เอกชัย", "หนึ่งดี", a, 87500),
            sso_detail("3100600999991", "004", "บุษบา", "สองใจ", b, 87500)]
w("hr-h3.6-db3-sso.txt", sso_file(db3("CLAMPED"), "TIS620", "\r\n"))
w("hr-h3.6-db3a-sso-actual.txt", sso_file(db3("ACTUAL"), "TIS620", "\r\n"))
for l in db1 + db2: print("|".join(l))
for l in db3("CLAMPED"): print(l.replace(" ", "·"))
