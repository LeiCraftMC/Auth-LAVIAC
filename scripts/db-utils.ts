/**
 * db-utils — thin wrapper around drizzle-kit (generate / migrate / push).
 *
 * Spawns `bunx drizzle-kit` as a separate process. (Running drizzle-kit's CJS bin
 * in-process via Bun's `$` shell segfaults on Bun/Windows, so we spawn it instead.)
 */
const command = process.argv[2] as "generate" | "migrate" | "push" | undefined;

if (command !== "generate" && command !== "migrate" && command !== "push") {
	console.error("Usage: bun scripts/db-utils.ts <generate|migrate|push>");
	process.exit(1);
}

const proc = Bun.spawnSync(["bunx", "drizzle-kit", command, "--config", "drizzle.config.ts"], {
	stdout: "inherit",
	stderr: "inherit",
});

process.exit(proc.exitCode ?? 0);
