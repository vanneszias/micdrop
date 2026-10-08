import { env } from "cloudflare:workers";
import { boundedText, importedSheet, validateSourceUrl } from "@chords/imports";
import puppeteer from "@cloudflare/puppeteer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { endpoint, HttpError } from "#/server/auth";

async function importPage(request: Request) {
	const { url: input, rendered } = z
		.object({ url: z.string().max(2000), rendered: z.boolean().default(false) })
		.parse(await request.json());
	let url: URL;
	try {
		url = validateSourceUrl(input);
	} catch {
		throw new HttpError(400, "Use a public HTTPS chord-page URL.");
	}
	let title = "";
	let candidates: string[] = [];
	if (rendered) {
		// Bun's ambient fetch type adds preconnect; Puppeteer uses only the binding's fetch.
		const browser = await puppeteer.launch({
			fetch: Object.assign(env.BROWSER.fetch.bind(env.BROWSER), {
				preconnect: fetch.preconnect,
			}),
		});
		try {
			const page = await browser.newPage();
			await page.setRequestInterception(true);
			page.on("request", (intercepted) => {
				try {
					validateSourceUrl(intercepted.url());
					void intercepted.continue();
				} catch {
					void intercepted.abort();
				}
			});
			await page.goto(url.href, {
				waitUntil: "domcontentloaded",
				timeout: 15_000,
			});
			title = await page.title();
			candidates = await page.$$eval("pre", (elements) =>
				elements
					.map((element) => element.textContent || "")
					.filter((text) => text.length < 200_000),
			);
		} finally {
			await browser.close();
		}
	} else {
		let response: Response | undefined;
		for (let redirects = 0; redirects < 4; redirects++) {
			response = await fetch(url, {
				redirect: "manual",
				signal: AbortSignal.timeout(10_000),
				headers: { Accept: "text/html" },
			});
			if (response.status < 300 || response.status >= 400) break;
			const location = response.headers.get("location");
			if (!location)
				throw new HttpError(
					422,
					"The source redirected without a destination.",
				);
			try {
				url = validateSourceUrl(new URL(location, url).href);
			} catch {
				throw new HttpError(
					422,
					"The source redirected to an unsupported URL.",
				);
			}
		}
		if (!response?.ok)
			throw new HttpError(
				422,
				"This page could not be fetched. Open the source and paste its chord text.",
			);
		if (!response.headers.get("content-type")?.includes("text/html"))
			throw new HttpError(
				422,
				"This URL is not an HTML page. Paste the chord text instead.",
			);
		const html = await boundedText(response);
		let active: { text: string } | undefined;
		const blocks: { text: string }[] = [];
		await new HTMLRewriter()
			.on("title", {
				text(chunk) {
					title += chunk.text;
				},
			})
			.on("pre", {
				element(element) {
					active = { text: "" };
					blocks.push(active);
					element.onEndTag(() => {
						active = undefined;
					});
				},
				text(chunk) {
					if (active) active.text += chunk.text;
				},
			})
			.transform(new Response(html))
			.text();
		candidates = blocks.map((block) => block.text);
	}
	const raw = candidates.sort((a, b) => score(b) - score(a))[0];
	if (!raw || score(raw) < 2)
		throw new HttpError(
			422,
			"No reliable chord block was found. Try rendered extraction, or paste the text from the source.",
		);
	return Response.json(importedSheet(raw, input, title));
}
function score(text: string) {
	return text
		.split("\n")
		.filter((line) =>
			/^\s*(?:[A-G][#b]?(?:m|maj|sus|dim|add|aug)?\d*(?:\/[A-G][#b]?)?\s+)*[A-G][#b]?(?:m|maj|sus|dim|add|aug)?\d*(?:\/[A-G][#b]?)?\s*$/.test(
				line,
			),
		).length;
}
export const Route = createFileRoute("/api/import")({
	server: { handlers: { POST: endpoint(importPage) } },
});
