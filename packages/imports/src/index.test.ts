import { expect, test } from "bun:test";
import { boundedText, validateSourceUrl } from "./index";

test("imports reject local addresses, credentials, and oversized bodies", async () => {
	for (const url of [
		"http://pnwchords.com",
		"https://127.0.0.1",
		"https://[::1]",
		"https://user:pass@pnwchords.com",
		"https://service.local",
		"https://pnwchords.com:8000",
	])
		expect(() => validateSourceUrl(url)).toThrow();
	expect(validateSourceUrl("https://pnwchords.com/song/").hostname).toBe(
		"pnwchords.com",
	);
	await expect(boundedText(new Response("12345"), 4)).rejects.toThrow(
		"too large",
	);
});
