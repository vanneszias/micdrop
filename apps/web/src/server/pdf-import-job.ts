import { env, waitUntil } from "cloudflare:workers";
import { HttpError } from "./http-error";
import {
	extractPdf,
	logImport,
	type PdfProvider,
	readPdf,
	requireKey,
} from "./pdf-import";

const KEYS = {
	openai: "OPENAI_API_KEY",
	gemini: "GEMINI_API_KEY",
	mistral: "MISTRAL_API_KEY",
} as const;

function providerConfig() {
	const provider = (process.env.PDF_IMPORT_PROVIDER || "openai") as PdfProvider;
	if (!(provider in KEYS))
		throw new HttpError(
			503,
			`PDF_IMPORT_PROVIDER must be one of ${Object.keys(KEYS).join(", ")}.`,
		);
	return {
		provider,
		apiKey: requireKey(process.env[KEYS[provider]]),
		model: process.env.PDF_IMPORT_MODEL || undefined,
	};
}

const STALE_MS = 10 * 60_000;

export async function startPdfJob(request: Request, userId: string) {
	const config = providerConfig();
	const bytes = await readPdf(request);
	const id = crypto.randomUUID();
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO pdf_import_jobs (id, user_id, status, created_at, updated_at) VALUES (?, ?, 'running', ?, ?)",
	)
		.bind(id, userId, now, now)
		.run();
	logImport(id, "queued", { userId, bytes: bytes.length });
	waitUntil(
		(async () => {
			try {
				const result = await extractPdf(bytes, { ...config, jobId: id });
				await finish(id, "done", { result: JSON.stringify(result) });
			} catch (error) {
				const status = error instanceof HttpError ? error.status : 500;
				const message =
					error instanceof HttpError
						? error.message
						: "The import failed unexpectedly. Try again.";
				if (!(error instanceof HttpError))
					logImport(id, "crashed", {
						message: error instanceof Error ? error.stack : String(error),
					});
				await finish(id, "failed", { error: message, status });
			}
		})(),
	);
	return id;
}

async function finish(
	id: string,
	status: "done" | "failed",
	fields: { result?: string; error?: string; status?: number },
) {
	await env.DB.prepare(
		"UPDATE pdf_import_jobs SET status = ?, result = ?, error = ?, error_status = ?, updated_at = ? WHERE id = ?",
	)
		.bind(
			status,
			fields.result ?? null,
			fields.error ?? null,
			fields.status ?? null,
			Date.now(),
			id,
		)
		.run();
	logImport(id, status);
}

export async function readPdfJob(id: string, userId: string) {
	const row = await env.DB.prepare(
		"SELECT status, result, error, error_status, updated_at FROM pdf_import_jobs WHERE id = ? AND user_id = ?",
	)
		.bind(id, userId)
		.first<{
			status: string;
			result: string | null;
			error: string | null;
			error_status: number | null;
			updated_at: number;
		}>();
	if (!row) throw new HttpError(404, "Import not found.");
	if (row.status === "running" && Date.now() - row.updated_at > STALE_MS) {
		await finish(id, "failed", {
			error: "The import timed out. Try again.",
			status: 504,
		});
		return { status: "failed", error: "The import timed out. Try again." };
	}
	if (row.status === "done")
		return { status: "done", result: JSON.parse(row.result ?? "null") };
	if (row.status === "failed") return { status: "failed", error: row.error };
	return { status: "running" };
}
