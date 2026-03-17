CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"linkedin_url" text,
	"phone1" text,
	"phone2" text,
	"email" text,
	"last_contact_date" text,
	"touch_count" text,
	"last_action" text,
	"next_step" text,
	"notes" text,
	"full_name" text,
	"job_title" text,
	"linkedin_data" jsonb,
	"linkedin_summary" text,
	"ai_message" text,
	"contact_status" text DEFAULT 'to_contact',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"pitch" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"offer_url" text,
	"offer_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false,
	"name" text,
	"company" text DEFAULT 'proxima' NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"coresignal_api_key" text,
	"green_api_instance" text,
	"green_api_token" text,
	"fullenrich_api_key" text,
	"fireflies_api_key" text,
	"gmail_email" text,
	"gmail_access_token" text,
	"gmail_refresh_token" text,
	"gmail_token_expiry" timestamp,
	"unipile_account_id" text,
	"unipile_whatsapp_account_id" text,
	"unipile_linkedin_account_id" text,
	"unipile_dsn" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_contact" ADD CONSTRAINT "prospect_contact_offer_id_prospect_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."prospect_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_list" ADD CONSTRAINT "prospect_list_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_offer" ADD CONSTRAINT "prospect_offer_list_id_prospect_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."prospect_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_contact_offer_id_idx" ON "prospect_contact" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "prospect_list_user_id_idx" ON "prospect_list" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prospect_offer_list_id_idx" ON "prospect_offer" USING btree ("list_id");