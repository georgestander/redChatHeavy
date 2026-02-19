CREATE TABLE IF NOT EXISTS "ChatBranch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"parentBranchId" uuid,
	"title" text DEFAULT 'New Branch' NOT NULL,
	"createdFromMessageId" uuid,
	"createdFromStart" integer,
	"createdFromEnd" integer,
	"createdFromExcerpt" text,
	"headMessageId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"archivedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "branchId" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ChatBranch" ADD CONSTRAINT "ChatBranch_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Message" ADD CONSTRAINT "Message_branchId_ChatBranch_id_fk" FOREIGN KEY ("branchId") REFERENCES "public"."ChatBranch"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ChatBranch_chat_id_idx" ON "ChatBranch" USING btree ("chatId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ChatBranch_parent_branch_id_idx" ON "ChatBranch" USING btree ("parentBranchId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ChatBranch_created_from_message_id_idx" ON "ChatBranch" USING btree ("createdFromMessageId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ChatBranch_head_message_id_idx" ON "ChatBranch" USING btree ("headMessageId");
--> statement-breakpoint
INSERT INTO "ChatBranch" ("id", "chatId", "title", "createdAt")
SELECT gen_random_uuid(), c."id", 'Main', now()
FROM "Chat" c
LEFT JOIN "ChatBranch" cb ON cb."chatId" = c."id" AND cb."parentBranchId" IS NULL
WHERE cb."id" IS NULL;
--> statement-breakpoint
UPDATE "Message" m
SET "branchId" = cb."id"
FROM "ChatBranch" cb
WHERE m."chatId" = cb."chatId"
  AND cb."parentBranchId" IS NULL
  AND m."branchId" IS NULL;
