// Branch environments on Workers Previews, each with its own D1 database.
//
//   bun scripts/preview.ts deploy [branch]   create or update the branch's Preview from the current build
//   bun scripts/preview.ts delete [branch]   delete the branch's Preview and its database
//
// Workers Builds runs `deploy` as its Preview command, with the branch from WORKERS_CI_BRANCH.
// Run from apps/web after `bun run build` (deploy only). Wrangler needs Cloudflare credentials
// (the Workers Builds API token, or CLOUDFLARE_API_TOKEN). Deploy also needs
// PREVIEW_BETTER_AUTH_SECRET.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const worker = "chords";
// Previews are served from <preview>-chords.<subdomain>.workers.dev.
const subdomain = process.env.WORKERS_SUBDOMAIN || "zias";
const root = resolve(import.meta.dir, "..");
const usage = "usage: preview.ts deploy|delete [branch]";

const [command, branch = process.env.WORKERS_CI_BRANCH] = process.argv.slice(2);
if (!branch) throw new Error(`${usage} (or set WORKERS_CI_BRANCH)`);
const name = previewName(branch);
const database = `${worker}-${name}`;
const tmp = await mkdtemp(join(tmpdir(), "chords-preview-"));
$.cwd(root);

try {
	if (command === "deploy") await deploy();
	else if (command === "delete") await remove();
	else throw new Error(usage);
} finally {
	await rm(tmp, { recursive: true, force: true });
}

// A DNS label holds 63 characters, and the Worker name and a dash share it with the Preview.
function previewName(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 63 - worker.length - 1)
		.replace(/^-+|-+$/g, "");
}

function wrangler(args: string[]) {
	return $`bunx --no-install wrangler ${args}`;
}

async function databaseId() {
	const list: { name: string; uuid: string }[] = await wrangler([
		"d1",
		"list",
		"--json",
	]).json();
	return list.find((entry) => entry.name === database)?.uuid;
}

async function deploy() {
	const secret = process.env.PREVIEW_BETTER_AUTH_SECRET;
	if (!secret) throw new Error("Set the PREVIEW_BETTER_AUTH_SECRET build secret");
	const built = join(root, "dist/server/wrangler.json");
	const config = JSON.parse(await readFile(built, "utf8").catch(() => "null"));
	if (!config) throw new Error("Run bun run build first");

	let id = await databaseId();
	if (!id) {
		await wrangler(["d1", "create", database]);
		id = await databaseId();
	}
	if (!id) throw new Error(`Could not find D1 database ${database}`);

	// Migrations read top-level d1_databases, so point a throwaway config at the Preview database.
	const migrations = join(tmp, "migrations.json");
	await writeFile(
		migrations,
		JSON.stringify({
			name: "chords-migrations",
			d1_databases: [
				{
					binding: "DB",
					database_name: database,
					database_id: id,
					migrations_dir: join(root, "migrations"),
				},
			],
		}),
	);
	await wrangler([
		"d1",
		"migrations",
		"apply",
		"DB",
		"--remote",
		"--config",
		migrations,
	]);

	config.previews.d1_databases = [
		{ binding: "DB", database_name: database, database_id: id },
	];
	await writeFile(built, JSON.stringify(config));

	const secrets = join(tmp, "secrets.json");
	await writeFile(secrets, JSON.stringify({ BETTER_AUTH_SECRET: secret }));

	// Better Auth needs its public URL up front. If Cloudflare serves the Preview elsewhere,
	// redeploy once with the URL it reports.
	let url = `https://${name}-${worker}.${subdomain}.workers.dev`;
	for (let attempt = 0; attempt < 2; attempt++) {
		const output = join(tmp, "output.ndjson");
		await rm(output, { force: true });
		await wrangler([
			"preview",
			"--config",
			built,
			"--name",
			name,
			"--message",
			process.env.WORKERS_CI_COMMIT_SHA || "local",
			"--var",
			`BETTER_AUTH_URL:${url}`,
			"--secrets-file",
			secrets,
		]).env({ ...process.env, WRANGLER_OUTPUT_FILE_PATH: output });
		const entries = (await readFile(output, "utf8"))
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		const served: string | undefined = entries
			.filter((entry) => entry.type === "preview")
			.at(-1)?.preview_urls?.[0];
		if (!served)
			throw new Error(
				`Preview ${name} has no workers.dev URL. Enable preview URLs on the Worker.`,
			);
		const actual = (
			served.startsWith("https://") ? served : `https://${served}`
		).replace(/\/$/, "");
		if (actual === url) break;
		console.error(
			`Preview is served from ${actual}, redeploying with that BETTER_AUTH_URL`,
		);
		url = actual;
	}
	console.log(`Preview: ${url}`);
}

async function remove() {
	await wrangler([
		"preview",
		"delete",
		"--name",
		name,
		"--worker-name",
		worker,
		"--skip-confirmation",
	])
		.nothrow()
		.then(
			(result) =>
				result.exitCode === 0 ||
				console.error(`Preview ${name} was already gone`),
		);
	if (await databaseId())
		await wrangler(["d1", "delete", database, "--skip-confirmation"]);
}
