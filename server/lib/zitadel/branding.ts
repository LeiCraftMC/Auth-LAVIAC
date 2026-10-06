/**
 * ZitadelBranding — the LAVIAC default branding every new virtual instance receives:
 * LeiCraft_MC colors, dark-only theme, no Zitadel watermark and the Rubik font.
 *
 * Applied by the `applyDefaultBranding` task (server/lib/tasks/applyDefaultBranding.ts) right
 * after an instance is created, or on demand from the instance's Branding page. The font ships
 * as a Nitro server asset (`server/assets/branding/`); `server/plugins/startup.ts` registers
 * the loader, so outside Nitro (tests, api-client generation) the font is simply unavailable.
 */
import { Logger } from "../utils/logger";
import type { ZitadelUpdateLabelPolicyRequest } from "./types";

export class ZitadelBranding {
	/** Light and dark variants are identical — the theme is pinned to dark anyway. */
	static readonly DEFAULT_LABEL_POLICY = {
		primaryColor: "#0392CA",
		backgroundColor: "#020719",
		warnColor: "#FF6467",
		fontColor: "#FFFFFF",
		primaryColorDark: "#0392CA",
		backgroundColorDark: "#020719",
		warnColorDark: "#FF6467",
		fontColorDark: "#FFFFFF",
		hideLoginNameSuffix: false,
		disableWatermark: true,
		themeMode: "THEME_MODE_DARK",
	} as const satisfies ZitadelUpdateLabelPolicyRequest;

	static readonly FONT = {
		/** Key in Nitro's `assets:server` storage (= path below `server/assets/`). */
		assetKey: "branding/rubik-600.woff2",
		fileName: "rubik-600.woff2",
		contentType: "font/woff2",
	} as const;

	protected static fontLoader: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null = null;
	protected static font: Uint8Array<ArrayBuffer> | null = null;

	static setFontLoader(loader: () => Promise<Uint8Array<ArrayBuffer> | null>) {
		ZitadelBranding.fontLoader = loader;
		ZitadelBranding.font = null;
	}

	/**
	 * The default branding font (read once, then cached), or `null` when no loader is registered
	 * or loading fails.
	 */
	static async loadFont(): Promise<Uint8Array<ArrayBuffer> | null> {
		if (ZitadelBranding.font) return ZitadelBranding.font;
		if (!ZitadelBranding.fontLoader) return null;
		try {
			ZitadelBranding.font = await ZitadelBranding.fontLoader();
			return ZitadelBranding.font;
		} catch (err) {
			Logger.error("Failed to load the default branding font:", err);
			return null;
		}
	}
}
