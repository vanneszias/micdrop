import { escapeHtml } from "./email";
import { DEFAULT_CARD, shareCard } from "./shares";

const SHARE_PATH = /^\/(?:invite|shared)\/([^/]+)\/?$/;

/**
 * Adds Open Graph and Twitter tags to server-rendered pages. Share and invite links preview
 * with their own card; the tags need absolute URLs, so they are added here with the origin.
 */
export async function withSocialMeta(request: Request, response: Response) {
	if (
		request.method !== "GET" ||
		!response.headers.get("Content-Type")?.startsWith("text/html")
	)
		return response;
	const url = new URL(request.url);
	const token = SHARE_PATH.exec(url.pathname)?.[1];
	const card =
		(token && (await shareCard(token).catch(() => undefined))) || undefined;
	const image = new URL("/api/og", url.origin);
	if (card && token) image.searchParams.set("token", token);
	const title = card?.title || "Mic Drop";
	const description = (card || DEFAULT_CARD).description;
	const tags = [
		["property", "og:type", "website"],
		["property", "og:site_name", "Mic Drop"],
		["property", "og:title", title],
		["property", "og:description", description],
		["property", "og:url", `${url.origin}${url.pathname}`],
		["property", "og:image", image.href],
		["property", "og:image:width", "1200"],
		["property", "og:image:height", "630"],
		["property", "og:image:alt", `${title} · Mic Drop`],
		["name", "twitter:card", "summary_large_image"],
		["name", "twitter:title", title],
		["name", "twitter:description", description],
		["name", "twitter:image", image.href],
	]
		.map(
			([key, name, content]) =>
				`<meta ${key}="${name}" content="${escapeHtml(content)}">`,
		)
		.join("");
	return new HTMLRewriter()
		.on("head", {
			element: (head) => {
				head.append(tags, { html: true });
			},
		})
		.transform(response);
}
