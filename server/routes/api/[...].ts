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

	const request = new Request(url, {
		method,
		headers: event.headers,
		body: method !== "GET" && method !== "HEAD" ? await readRawBody(event) : undefined,
	});

	return wrapper.fetch(request);
});
