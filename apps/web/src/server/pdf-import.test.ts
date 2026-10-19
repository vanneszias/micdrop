import { expect, test } from "bun:test";
import { importPdf } from "./pdf-import";

const extracted = {
	title: "Sunday rehearsal",
	warnings: ["Second song has no chord sheet."],
	songs: [
		{
			title: "Opening",
			artist: "",
			key: "D",
			sourceCapo: 2,
			rawSource: "D     G\nHello world",
			content: "D     G\nHello world",
			notes: "Repeat chorus",
		},
		{
			title: "Closing",
			artist: "",
			key: "",
			sourceCapo: 0,
			rawSource: "Closing",
			content: "",
			notes: "",
		},
	],
};
const request = (body = "%PDF-1.7\nfixture") =>
	new Request("http://localhost/api/import-pdf", { method: "POST", body });
function sender(body: unknown, status = 200) {
	return Object.assign(async () => Response.json(body, { status }), {
		preconnect: fetch.preconnect,
	});
}
const completed = (text: string) => ({
	status: "completed",
	output: [{ type: "message", content: [{ type: "output_text", text }] }],
});

test("PDF extraction uses a server key and strict structured output, preserves order/raw text and normalizes ChordPro", async () => {
	const send = Object.assign(
		async (url: string | URL | Request, init?: RequestInit) => {
			expect(url).toBe("https://api.openai.com/v1/responses");
			expect(new Headers(init?.headers).get("Authorization")).toBe(
				"Bearer fixture-key",
			);
			const body = JSON.parse(String(init?.body));
			expect(body.store).toBe(false);
			expect(body.model).toBe("gpt-4.1");
			expect(body.text.format.strict).toBe(true);
			expect(body.input[0].content[0].file_data).toStartWith(
				"data:application/pdf;base64,JVBERi0",
			);
			return Response.json(completed(JSON.stringify(extracted)));
		},
		{ preconnect: fetch.preconnect },
	);
	const result = await importPdf(request(), "fixture-key", undefined, send);
	expect(result.songs.map((song) => song.title)).toEqual([
		"Opening",
		"Closing",
	]);
	expect(result.songs[0].content).toContain("[D]");
	expect(result.songs[0].rawSource).toBe(extracted.songs[0].rawSource);
	expect(result.songs[0].sourceCapo).toBe(2);
	expect(result.songs[1].content).toBe("");
	expect(result.warnings).toEqual(extracted.warnings);
});

test("PDF import rejects missing configuration, non-PDF and oversized streamed input before invoking AI", async () => {
	let calls = 0;
	const send = Object.assign(
		async () => {
			calls++;
			return Response.json({});
		},
		{ preconnect: fetch.preconnect },
	);
	await expect(
		importPdf(request(), undefined, undefined, send),
	).rejects.toMatchObject({ status: 503 });
	await expect(
		importPdf(request("not a PDF"), "key", undefined, send),
	).rejects.toMatchObject({ status: 400 });
	await expect(
		importPdf(
			request(`%PDF-${"x".repeat(10_000_000)}`),
			"key",
			undefined,
			send,
		),
	).rejects.toMatchObject({ status: 413 });
	expect(calls).toBe(0);
});

test("PDF import handles provider failures, incomplete output, refusals and malformed extraction without accepting partial songs", async () => {
	await expect(
		importPdf(request(), "key", undefined, sender({}, 429)),
	).rejects.toMatchObject({ status: 502 });
	for (const payload of [
		{ status: "incomplete", output: [] },
		{
			status: "completed",
			output: [{ type: "message", content: [{ type: "refusal" }] }],
		},
		completed("not JSON"),
		completed(JSON.stringify({ ...extracted, songs: [] })),
		completed(
			JSON.stringify({
				...extracted,
				songs: [{ ...extracted.songs[0], sourceCapo: 99 }],
			}),
		),
	])
		await expect(
			importPdf(request(), "key", undefined, sender(payload)),
		).rejects.toMatchObject({ status: 422 });
});
