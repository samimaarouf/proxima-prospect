-- Add offerTitle and offerLocation columns to prospect_offer
ALTER TABLE "prospect_offer" ADD COLUMN IF NOT EXISTS "offer_title" text;
ALTER TABLE "prospect_offer" ADD COLUMN IF NOT EXISTS "offer_location" text;
