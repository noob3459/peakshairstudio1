ALTER TABLE "stylists" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "stylists" ADD CONSTRAINT "stylists_auth_user_id_unique" UNIQUE("auth_user_id");