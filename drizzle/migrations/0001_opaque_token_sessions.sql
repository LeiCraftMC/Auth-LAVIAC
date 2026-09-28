-- Sessions rebuilt for the docs/10-auth.md opaque-token model: the token id (32-byte hex)
-- is the primary key (O(1) lookup) and the token base is stored only as a Bun.password hash.
-- Rows from the old model (SHA-256 of a plain random token) are incompatible; sessions are
-- ephemeral, so the table is recreated and existing users simply sign in again.
DROP TABLE "sessions";
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"hashed_token" text NOT NULL,
	"user_sub" text NOT NULL,
	"user_email" text,
	"user_name" text,
	"user_role" text DEFAULT 'member' NOT NULL,
	"login_method" text NOT NULL,
	"created_at" integer DEFAULT (unixepoch() * 1000) NOT NULL,
	"expires_at" integer NOT NULL
);