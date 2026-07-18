-- WO restaurant customer-pay: ลูกค้าสแกนจ่ายพร้อมเพย์เองจากลิงก์โต๊ะ แล้วแจ้งร้านยืนยันรับเงิน
-- เพิ่มค่า enum ServiceRequestType = PAY_PROMPTPAY (additive, ปลอดภัยต่อของเดิม)
ALTER TYPE "ServiceRequestType" ADD VALUE IF NOT EXISTS 'PAY_PROMPTPAY';
