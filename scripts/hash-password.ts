/**
 * hash-password — generate an Argon2id hash for the static fallback login.
 *
 * Feed the resulting string into LAVIAC_STATIC_AUTH_PASSWORD_HASH (.env):
 *
 *   bun run hash-password <password>
 *
 * The password is visible in your shell history; for shared machines prefer:
 *   bun -e "console.log(await Bun.password.hash('your password'))"
 */
const password = process.argv[2];

if (!password) {
	console.error("Usage: bun run hash-password <password>");
	console.error(
		"The hash is Bun.password-compatible (argon2id) and goes into LAVIAC_STATIC_AUTH_PASSWORD_HASH.",
	);
	process.exit(1);
}

console.log(await Bun.password.hash(password));
