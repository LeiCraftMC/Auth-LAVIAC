/**
 * Catch-all Nitro route → forwards every /api/** request to the Hono app.
 * The Hono `API` is mounted at /api, so endpoints become /api/v1/<resource>,
 * /api/health, /api/docs/v1. See Style-Guides docs/04 (Mounting Hono in Nitro).
 */
import { defineEventHandler, getMethod, getRequestURL, readRawBody } from "h3";
import { Hono } from "hono";
import { API } from "../../lib/api";

let wrapper: Hono | null = null;

export default defineEventHandler(async (event) => {
	if (!wrapper) {
		wrapper = new Hono();
		wrapper.route("/api", API.getApp());
	}

	const url = getRequestURL(event);
	const method = getMethod(event);
	const request = new Request(url.toString(), {
		method,
		headers: event.headers,
		body: method !== "GET" && method !== "HEAD" ? await readRawBody(event) : undefined,
	});

	return wrapper.fetch(request);
});
