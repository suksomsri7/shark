-- ACC T2.9 (lane 1): seller data + printed text frozen when the document is issued (K4 — an old copy does not change when settings change)
-- nullable, additive; existing documents are frozen lazily (first settings change freezes every issued document that has none)
ALTER TABLE "AccountDocument" ADD COLUMN IF NOT EXISTS "sellerSnapshot" JSONB;
