/**
 * ConfigHandler — typed LAVIAC_* environment-variable loader.
 * Copied from Style-Guides shared/backend/config-schema.ts and adapted to the LAVIAC prefix.
 * See docs/09-config-and-logging.md.
 */
import { readFileSync } from "node:fs";
import { Logger } from "./logger";

interface ConfigSchemaSetting<
	REQUIRED extends ConfigSchemaSetting.Required,
	TYPE extends ConfigSchemaSetting.Type = undefined,
> {
	required: REQUIRED;
	type?: TYPE;
}

namespace ConfigSchemaSetting {
	export type Required = boolean;
	export type Type = string[] | boolean[] | undefined;
	export type Sample = ConfigSchemaSetting<Required, Type>;
}

type ConfigValueType<
	T extends ConfigSchemaSetting.Sample,
	F = [T] extends [ConfigSchemaSetting<any, infer U>]
		? U extends (string | boolean)[]
			? U[number]
			: string
		: string,
> = T["required"] extends true ? F : F | undefined;

interface ConfigSchemaSettings {
	[key: string]: ConfigSchemaSetting.Sample;
}

type ConfigLike<T extends ConfigSchemaSettings> = {
	[K in keyof T]: ConfigValueType<T[K]>;
};

class ConfigSchema<T extends ConfigSchemaSettings = {}> {
	readonly schema: T = {} as any;

	public add<
		KEY extends string,
		Setings extends ConfigSchemaSetting<ISREQUIRED, TYPE>,
		ISREQUIRED extends boolean,
		const TYPE extends ConfigSchemaSetting.Type = undefined,
	>(key: KEY, required = false as ISREQUIRED, type?: TYPE) {
		(this.schema as any)[key] = { required, type };
		return this as any as ConfigSchema<T & { [K in KEY]: Setings }>;
	}

	public parse() {
		const result: ConfigLike<T> = {} as ConfigLike<T>;

		for (const [key, settings] of Object.entries(this.schema)) {
			const value = process.env[key];

			if (!value) {
				if (settings.required) {
					Logger.error(`The environment variable ${key} is required but not set.`);
					process.exit(1);
				}
				continue;
			}

			if (settings.type) {
				if (typeof settings.type[0] === "boolean") {
					(result[key] as any) = value.toLowerCase() === "true";
					continue;
				}
				if (!(settings.type as string[]).some((t) => t.toLowerCase() === value.toLowerCase())) {
					Logger.error(
						`The environment variable ${key} has to be one of the following: ${settings.type.join(", ")}`,
					);
					process.exit(1);
				}
			}

			(result[key] as any) = value;
		}
		return result;
	}
}

const schema = new ConfigSchema()
	.add("LAVIAC_LOG_LEVEL", false, ["debug", "info", "warn", "error", "critical"])
	.add("LAVIAC_API_DISABLE_DOCS", false, [true, false])
	.add("LAVIAC_DB_PATH", false)
	.add("LAVIAC_DB_AUTO_MIGRATE", false, [true, false])
	.add("LAVIAC_APP_URL", false)
	.add("LAVIAC_ZITADEL_URL", false)
	.add("LAVIAC_ZITADEL_SYSTEM_USER_ID", false)
	.add("LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY", false)
	.add("LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH", false)
	.add("LAVIAC_OIDC_CLIENT_ID", false)
	.add("LAVIAC_OIDC_CLIENT_SECRET", false)
	.add("LAVIAC_OIDC_ADMIN_ROLE", false)
	.add("LAVIAC_SESSION_TTL_HOURS", false);

export type ParsedConfig = ConfigLike<typeof schema.schema>;

export class ConfigHandler {
	private static config: ParsedConfig | null = null;

	static getConfig(): ParsedConfig {
		if (!ConfigHandler.config) {
			throw new Error("Config not loaded. Call ConfigHandler.loadConfig() first.");
		}
		return ConfigHandler.config;
	}

	static async loadConfig(): Promise<ParsedConfig> {
		if (ConfigHandler.config) return ConfigHandler.config;
		ConfigHandler.config = schema.parse();
		return ConfigHandler.config;
	}
}

/**
 * Resolve the system-user RSA private key PEM from env: either the inline PEM
 * (LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY) or a file path
 * (LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH).
 */
export function resolveSystemUserPrivateKey(): string {
	const config = ConfigHandler.getConfig();
	if (config.LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY) {
		return config.LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY;
	}
	const path = config.LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH;
	if (path) {
		return readFileSync(path, "utf8");
	}
	Logger.error(
		"Neither LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY nor LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH is set.",
	);
	process.exit(1);
}
