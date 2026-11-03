import { expect, test } from "bun:test";

const base = process.env.CHORDS_TEST_URL || "";
const redirectUri = "https://assistant.chords.test/callback";

async function pkce() {
	const verifier = crypto.randomUUID() + crypto.randomUUID();
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	const challenge = Buffer.from(digest).toString("base64url");
	return { verifier, challenge };
}

test.skipIf(!base)(
	"MCP clients authorize with OAuth and manage songs",
	async () => {
		const unauthenticated = await fetch(`${base}/mcp`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		expect(unauthenticated.status).toBe(401);
		expect(unauthenticated.headers.get("WWW-Authenticate")).toContain(
			"/.well-known/oauth-protected-resource/mcp",
		);
		const metadata = (await (
			await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)
		).json()) as { resource: string; authorization_servers: string[] };
		const resource = metadata.resource;
		const issuer = metadata.authorization_servers[0];

		const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base },
			body: JSON.stringify({
				name: "MCP user",
				email: `${crypto.randomUUID()}@chords.test`,
				password: "integration-test-password-2026",
			}),
		});
		expect(signUp.status).toBe(200);
		const cookie = signUp.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");

		const registration = await fetch(`${issuer}/oauth2/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_name: "Test assistant",
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				scope: "songs:read songs:write offline_access",
			}),
		});
		expect(registration.status).toBe(201);
		const { client_id } = (await registration.json()) as { client_id: string };

		const { verifier, challenge } = await pkce();
		const authorize = await fetch(
			`${issuer}/oauth2/authorize?${new URLSearchParams({
				response_type: "code",
				client_id,
				redirect_uri: redirectUri,
				scope: "songs:read songs:write",
				state: "state-1",
				code_challenge: challenge,
				code_challenge_method: "S256",
				resource,
			})}`,
			{
				headers: {
					Cookie: cookie,
					Accept: "text/html",
					"Sec-Fetch-Mode": "navigate",
				},
				redirect: "manual",
			},
		);
		const consentUrl = new URL(authorize.headers.get("Location") || "", base);
		expect(consentUrl.pathname).toBe("/consent");
		const consent = await fetch(`${issuer}/oauth2/consent`, {
			method: "POST",
			headers: {
				Cookie: cookie,
				Origin: base,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				accept: true,
				oauth_query: consentUrl.search.slice(1),
			}),
		});
		expect(consent.status).toBe(200);
		const callback = new URL(((await consent.json()) as { url: string }).url);
		expect(callback.searchParams.get("state")).toBe("state-1");

		const token = await fetch(`${issuer}/oauth2/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: callback.searchParams.get("code") || "",
				redirect_uri: redirectUri,
				client_id,
				code_verifier: verifier,
				resource,
			}),
		});
		expect(token.status).toBe(200);
		const { access_token } = (await token.json()) as { access_token: string };

		let id = 0;
		async function rpc(method: string, params: unknown) {
			const response = await fetch(`${base}/mcp`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${access_token}`,
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
			});
			const text = await response.text();
			const json = text.startsWith("{")
				? text
				: (text.match(/^data: (.*)$/m)?.[1] ?? text);
			return JSON.parse(json) as {
				result?: {
					tools?: { name: string }[];
					isError?: boolean;
					content?: { text: string }[];
					structuredContent?: Record<string, unknown>;
				};
				error?: unknown;
			};
		}
		const call = async (name: string, args: unknown) =>
			(await rpc("tools/call", { name, arguments: args })).result;

		const tools = await rpc("tools/list", {});
		expect(tools.result?.tools?.map((tool) => tool.name).sort()).toEqual([
			"add_song",
			"create_setlist",
			"get_song",
			"import_song_from_url",
			"list_libraries",
			"search_songs",
			"update_song",
		]);

		const added = await call("add_song", {
			title: "Harbor Lights",
			artist: "The Testers",
			key: "G",
			content: "G        D\nHarbor lights are calling",
		});
		expect(added?.isError).toBeFalsy();
		const songId = (added?.structuredContent as { song: { id: string } }).song
			.id;
		const duplicate = await call("add_song", {
			title: "Harbor Lights",
			songId,
			arrangementName: "Acoustic",
			artist: "The Testers",
			content: "[G]Again",
		});
		expect(duplicate?.isError).toBeFalsy();

		const found = await call("search_songs", { query: "harbor" });
		expect(
			(found?.structuredContent as { songs: { id: string }[] }).songs.some(
				(song) => song.id === songId,
			),
		).toBe(true);

		const song = (await call("get_song", { id: songId, transpose_to: "A" }))
			?.structuredContent as { version: number; content: string; key: string };
		expect(song.key).toBe("G");
		expect(song.content).toContain("[A]");
		expect(song.content).toContain("[E]");

		const updated = await call("update_song", {
			id: songId,
			version: song.version,
			tags: ["sea"],
		});
		expect(updated?.isError).toBeFalsy();
		const stale = await call("update_song", {
			id: songId,
			version: song.version,
			tags: ["overwritten"],
		});
		expect(stale?.isError).toBe(true);
		expect(stale?.content?.[0].text).toContain("changed since version");

		const setlist = await call("create_setlist", {
			title: "Friday gig",
			date: "2026-11-06",
			songs: [
				{ id: songId },
				{ id: songId, key: "A", notes: "Last chorus twice" },
			],
		});
		expect(setlist?.isError).toBeFalsy();
		expect(
			(
				setlist?.structuredContent as { setlist: { songs: { key: string }[] } }
			).setlist.songs.map((entry) => entry.key),
		).toEqual(["G", "A"]);
		const missing = await call("create_setlist", {
			title: "Broken",
			songs: [{ id: "nope" }],
		});
		expect(missing?.isError).toBe(true);
	},
	30_000,
);
