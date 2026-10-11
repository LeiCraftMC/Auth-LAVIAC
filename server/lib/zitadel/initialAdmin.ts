/**
 * InitialAdmin — the generated owner of a new instance: a human user in the SYSTEM org with a
 * random password. It is meant for the first setup only and hands over to an admin created in the
 * home org, so LAVIAC fills in the data instead of asking for it and shows the password once.
 */
import { randomInt } from "node:crypto";
import type { ZitadelHumanOwner } from "./types";

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
// Zitadel counts any non-alphanumeric character as a symbol (internal/domain/policy_password_complexity.go).
const SYMBOLS = "!#$%&*+-=?@^_";

function pick(chars: string) {
	return chars[randomInt(chars.length)] as string;
}

export class InitialAdmin {
	static readonly USERNAME = "initial-admin";
	/** `.invalid` (RFC 2606) never resolves, so mail to the account goes nowhere. */
	static readonly EMAIL = "initial-admin@laviac.invalid";
	static readonly PASSWORD_LENGTH = 24;

	/** A random password with every character class, so any complexity policy accepts it. */
	static generatePassword(length = InitialAdmin.PASSWORD_LENGTH): string {
		const chars = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SYMBOLS)];
		const all = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS;
		while (chars.length < length) chars.push(pick(all));

		// Fisher–Yates, so the guaranteed classes don't sit at the start.
		for (let i = chars.length - 1; i > 0; i--) {
			const j = randomInt(i + 1);
			[chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
		}
		return chars.join("");
	}

	/** The owner for `_create` and its password (returned to the creator once). */
	static generate(preferredLanguage?: string): { owner: ZitadelHumanOwner; password: string } {
		const password = InitialAdmin.generatePassword();
		return {
			owner: {
				userName: InitialAdmin.USERNAME,
				email: { email: InitialAdmin.EMAIL, isEmailVerified: true },
				profile: { firstName: "Initial", lastName: "Admin", preferredLanguage },
				password: { password, passwordChangeRequired: false },
			},
			password,
		};
	}
}
