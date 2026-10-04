CREATE TABLE "proposed_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"submitted_by_stylist_id" text NOT NULL,
	"page" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stylists" ADD COLUMN "facebook_handle" text;--> statement-breakpoint
ALTER TABLE "stylists" ADD COLUMN "personal_phone" text;--> statement-breakpoint
ALTER TABLE "stylists" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "stylists" ADD COLUMN "access_role" text DEFAULT 'stylist' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposed_changes" ADD CONSTRAINT "proposed_changes_submitted_by_stylist_id_stylists_id_fk" FOREIGN KEY ("submitted_by_stylist_id") REFERENCES "public"."stylists"("id") ON DELETE no action ON UPDATE no action;