import { expect, test } from "bun:test";
import { localSql } from "./test-db";

const base = process.env.CHORDS_TEST_URL || "";

async function account(name: string) {
	const response = await fetch(`${base}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			name,
			email: `${crypto.randomUUID()}@chords.test`,
			password: "integration-test-password-2026",
		}),
	});
	expect(response.status).toBe(200);
	const cookie = response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
	const { user } = (await response.json()) as { user: { id: string } };
	return { id: user.id, cookie };
}

const post = (path: string, cookie: string, body: unknown) =>
	fetch(`${base}${path}`, {
		method: "POST",
		headers: {
			Cookie: cookie,
			Origin: base,
			"Content-Type": "application/json",
			"User-Agent": "feedback-integration-test",
		},
		body: JSON.stringify(body),
	});

type Item = {
	id: string;
	message: string;
	context: string;
	userId: string;
	resolvedAt: number | null;
};

test.skipIf(!base)(
	"feedback carries its context to administrators, who can resolve it",
	async () => {
		const musician = await account("Feedback sender");
		const operator = await account("Feedback reader");
		if (!/^[a-zA-Z0-9_-]+$/.test(operator.id))
			throw new Error("Unexpected fixture user id.");
		await localSql(`UPDATE user SET role='admin' WHERE id='${operator.id}'`);

		const message = `The transpose button ${crypto.randomUUID()}`;
		expect(
			(await post("/api/feedback", "", { kind: "bug", message })).status,
		).toBe(401);
		expect(
			(
				await post("/api/feedback", musician.cookie, {
					kind: "bug",
					message: "",
				})
			).status,
		).toBe(400);
		const sent = await post("/api/feedback", musician.cookie, {
			kind: "bug",
			message,
			context: { path: "/songs/abc", release: "test", online: true },
		});
		expect(sent.status).toBe(200);
		const { id } = (await sent.json()) as { id: string };

		const list = (status: string, cookie: string) =>
			fetch(`${base}/api/admin?view=feedback&status=${status}`, {
				headers: { Cookie: cookie },
			});
		expect((await list("open", musician.cookie)).status).toBe(403);
		const open = (await (await list("open", operator.cookie)).json()) as {
			rows: Item[];
		};
		const item = open.rows.find((row) => row.id === id);
		expect(item?.message).toBe(message);
		expect(item?.userId).toBe(musician.id);
		const context = JSON.parse(item?.context ?? "{}");
		expect(context.path).toBe("/songs/abc");
		expect(context.userAgent).toBe("feedback-integration-test");

		// Only administrators can resolve, and the change is audited.
		expect(
			(
				await post("/api/admin", musician.cookie, {
					action: "resolve_feedback",
					id,
					resolved: true,
				})
			).status,
		).toBe(403);
		const resolved = await post("/api/admin", operator.cookie, {
			action: "resolve_feedback",
			id,
			resolved: true,
		});
		expect(resolved.status).toBe(200);
		const after = (await (await list("open", operator.cookie)).json()) as {
			rows: Item[];
		};
		expect(after.rows.some((row) => row.id === id)).toBe(false);
		const done = (await (await list("resolved", operator.cookie)).json()) as {
			rows: Item[];
		};
		expect(done.rows.find((row) => row.id === id)?.resolvedAt).toBeNumber();
		const audit = (await (
			await fetch(`${base}/api/admin?view=audit`, {
				headers: { Cookie: operator.cookie },
			})
		).json()) as { rows: { action: string; targetId: string }[] };
		expect(
			audit.rows.some(
				(row) => row.action === "resolve_feedback" && row.targetId === id,
			),
		).toBe(true);
	},
);
