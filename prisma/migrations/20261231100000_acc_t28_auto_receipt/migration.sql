-- ACC T2.8 (lane 1): per-document override of the automatic receipt on payment (null = follow docConfig.receipt.autoOnPayment)
ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "autoReceipt" BOOLEAN;
