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


// @ts-ignore
export type ParsedConfig = ConfigLike<typeof ConfigHandler.schema.schema>;

export class ConfigHandler {

	private static readonly schema = new ConfigSchema()
		.add("LAVIAC_LOG_LEVEL", false, ["debug", "info", "warn", "error", "critical"])

		.add("LAVIAC_API_DISABLE_DOCS", false, [true, false])
		
		.add("LAVIAC_DB_PATH", false)
		.add("LAVIAC_DB_AUTO_MIGRATE", false, [true, false])

		.add("LAVIAC_CONFIG_BASE_DIR", false)

		.add("LAVIAC_APP_URL", false)

		.add("LAVIAC_ZITADEL_URL", false)
		.add("LAVIAC_ZITADEL_SYSTEM_USER_ID", false)
		.add("LAVIAC_ZITADEL_SYSTEM_USER_PRIVATE_KEY_PATH", false)

		.add("LAVIAC_OIDC_CLIENT_ID", false)
		.add("LAVIAC_OIDC_CLIENT_SECRET", false)
		.add("LAVIAC_OIDC_ADMIN_ROLE", false)
		.add("LAVIAC_SESSION_TTL_HOURS", false)
	;

	private static config: ParsedConfig | null = null;

	/** You have to call {@link ConfigHandler.parseConfigFile} before trying to access the config. */
	static getConfig(): ParsedConfig {
		if (!ConfigHandler.config) {
			throw new Error("Config not loaded. Call ConfigHandler.loadConfig() first.");
		}
		return ConfigHandler.config;
	}

	static async loadConfig(): Promise<ParsedConfig> {
		if (this.config) return this.config;
        this.config = this.schema.parse();
        return this.config;
	}
}


