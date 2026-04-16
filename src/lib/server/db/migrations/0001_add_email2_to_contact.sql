CREATE TABLE "prospect_message_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"linkedin_url" text,
	"contact_name" text,
	"offer_title" text,
	"company_name" text,
	"channel" text NOT NULL,
	"recipient" text,
	"message" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_contact" ADD COLUMN "email2" text;--> statement-breakpoint
ALTER TABLE "prospect_contact" ADD COLUMN "ai_message_linkedin" text;--> statement-breakpoint
ALTER TABLE "prospect_offer" ADD COLUMN "offer_title" text;--> statement-breakpoint
ALTER TABLE "prospect_offer" ADD COLUMN "offer_location" text;--> statement-breakpoint
ALTER TABLE "prospect_message_history" ADD CONSTRAINT "prospect_message_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_history_user_id_idx" ON "prospect_message_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_history_linkedin_url_idx" ON "prospect_message_history" USING btree ("linkedin_url");