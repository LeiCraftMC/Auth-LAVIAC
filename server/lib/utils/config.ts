import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { AppConstants } from "./constants";
import { Logger } from "./logger";

interface ConfigSchemaSettings {
	[key: string]: CS.ConfigItem<z.ZodType>;
}

type ConfigLike<T extends ConfigSchemaSettings> = {
	[K in keyof T]: z.infer<T[K]["_schema"]>;
};

class CS {
	private constructor() {}

	static string() {
		return new CS.ConfigItem(z.string());
	}

	static number() {
		return new CS.ConfigItem(z.coerce.number());
	}

	static boolean() {
		return new CS.ConfigItem(
			z.union(
				[
					z.boolean(),
					z
						.string()
						.refine((val) => val === "true" || val === "false")
						.transform((val) => val === "true"),
				],
				{ error: "Expected a boolean value ('true' or 'false')" },
			),
		);
	}

	static enum<const T extends readonly string[]>(values: T) {
		return new CS.ConfigItem(z.enum(values));
	}

	static array() {
		return new CS.ConfigItem(
			z.string().transform<string[]>((val) => {
				if (typeof val === "string") {
					return val
						.split(",")
						.map((v) => v.trim())
						.filter(Boolean);
				}
				return [];
			}),
		);
	}
}

namespace CS {
	export class ConfigItem<const Schema extends z.ZodType> {
		constructor(public _schema: Schema) {}

		public parse(value: unknown) {
			return this._schema.safeParse(value);
		}

		public default(value: z.util.NoUndefined<z.core.output<Schema>>) {
			this._schema = this._schema.default(value) as any;
			return this as any as ConfigItem<z.ZodDefault<Schema>>;
		}

		public optional() {
			this._schema = this._schema.optional() as any;
			return this as any as ConfigItem<z.ZodOptional<Schema>>;
		}
	}
}

class ConfigSchema<T extends ConfigSchemaSettings> {
	readonly schema: T;

	constructor(schema: T) {
		this.schema = schema;
	}

	public parse() {
		const result: ConfigLike<T> = {} as ConfigLike<T>;

		for (const [key, settings] of Object.entries(this.schema)) {
			const value = process.env[`${AppConstants.APP_ENV_PREFIX}_${key}`];

			const parseResult = settings.parse(value);
			if (!parseResult.success) {
				Logger.error(
					`Failed to read the environment variable ${key}: ${parseResult.error.issues[0]?.message}`,
				);
				process.exit(1);
			}

			// Store the parsed (coerced/defaulted) value, not the raw env string —
			// otherwise numbers/booleans stay strings and defaults/optionals are lost.
			(result[key] as any) = parseResult.data;
		}
		return result;
	}
}

export type ENVConfigLike = {
	[K in Extract<
		keyof typeof ConfigHandler.schema.schema,
		string
	> as `${typeof AppConstants.APP_ENV_PREFIX}_${K}`]: z.infer<
		(typeof ConfigHandler.schema.schema)[K]["_schema"]
	>;
};

export type ParsedConfig = ConfigLike<typeof ConfigHandler.schema.schema>;

export class ConfigHandler {
	// Public so ENVConfigLike / ParsedConfig can derive from it without @ts-ignore.
	// Treat it as read-only.
	static schema = new ConfigSchema({
		LOG_LEVEL: CS.enum(["debug", "info", "warn", "error", "critical"]).default("info"),

		API_DISABLE_DOCS: CS.boolean().default(false),

		DB_PATH: CS.string().default("./data/db.sqlite"),
		DB_AUTO_MIGRATE: CS.boolean().default(true),
		DB_MIGRATION_DIR: CS.string().default("./drizzle/migrations"),

		LOG_DIR: CS.string().default("./data/logs"),
		CONFIG_BASE_DIR: CS.string().default("./config"),

		APP_URL: CS.string(),

		// The public auth URL (OIDC issuer) and the System API base URL are separate
		// settings — the System API may live on a different (e.g. local/internal) endpoint.
		ZITADEL_AUTH_URL: CS.string().optional(),
		ZITADEL_SYSTEM_API_URL: CS.string().optional(),
		ZITADEL_SYSTEM_USER_ID: CS.string().optional(),
		ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH: CS.string().optional(),
		ZITADEL_SYSTEM_USER_PRIVATE_KEY: CS.string().optional(),
		// Apply the LAVIAC default branding (label policy + font) to every newly created instance.
		// Needs the system user to hold IAM_OWNER via a `System` membership (see example.env).
		ZITADEL_APPLY_DEFAULT_BRANDING: CS.boolean().default(true),

		OIDC_CLIENT_ID: CS.string().optional(),
		OIDC_CLIENT_SECRET: CS.string().optional(),
		// The Zitadel project role that grants LAVIAC admin access.
		OIDC_ADMIN_ROLE: CS.string().default("laviac_admin"),

		// Session lifetime in hours (docs/10-auth.md default: 7 days).
		SESSION_TTL_HOURS: CS.number().optional(),

		// Static fallback login (alongside OIDC) — REQUIRED at boot so the dashboard is
		// always reachable, even without Zitadel OIDC.
		STATIC_AUTH_USERNAME: CS.string().default("admin"),
		STATIC_AUTH_PASSWORD_HASH: CS.string(),

		// Where the host VM's root filesystem is visible — `/` on bare metal, the read-only bind
		// mount (e.g. `/host`) in Docker. Drives the host stats and the OS update check.
		HOST_ROOT: CS.string().default("/"),
	});

	private static config: ParsedConfig | null = null;

	/** You have to call {@link ConfigHandler.loadConfig} before trying to access the config. */
	static getConfig() {
		return this.config;
	}

	static async loadConfig() {
		if (this.config) return this.config;
		this.config = this.schema.parse();
		return this.config;
	}

	/**
	 * LAVIAC: resolve the Zitadel system-user RSA private key (PEM), always normalized to
	 * PKCS#8 (see {@link normalizePrivateKeyPem}). An inline key
	 * (`LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY`) wins — env-var values may carry literal
	 * `\n` sequences, which are restored; otherwise the key is read from
	 * `LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH` (default:
	 * `${LAVIAC_CONFIG_BASE_DIR}/system-user.pem`). Used by server/lib/zitadel/jwt.ts.
	 */
	static resolveSystemUserPrivateKey(): string {
		const config = ConfigHandler.getConfig();
		if (config?.ZITADEL_SYSTEM_USER_PRIVATE_KEY) {
			return ConfigHandler.normalizePrivateKeyPem(
				config.ZITADEL_SYSTEM_USER_PRIVATE_KEY.replace(/\\n/g, "\n"),
			);
		}
		const path =
			config?.ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH ??
			`${config?.CONFIG_BASE_DIR ?? "./config"}/system-user.pem`;
		return ConfigHandler.normalizePrivateKeyPem(readFileSync(path, "utf8"));
	}

	/**
	 * jose's `importPKCS8` requires PKCS#8 (`-----BEGIN PRIVATE KEY-----`), but
	 * `openssl genrsa -traditional` (see example.env) emits PKCS#1
	 * (`-----BEGIN RSA PRIVATE KEY-----`). PKCS#1 keys are converted via node:crypto;
	 * PKCS#8 input passes through unchanged.
	 */
	static normalizePrivateKeyPem(pem: string): string {
		if (!pem.includes("BEGIN RSA PRIVATE KEY")) return pem;
		const key = createPrivateKey(pem);
		return key.export({ type: "pkcs8", format: "pem" }).toString();
	}
}
