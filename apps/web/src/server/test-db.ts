/** Runs SQL against the local D1 fixture of an integration run; refuses anything but a local app. */
export async function localSql(command: string) {
	const base = process.env.CHORDS_TEST_URL || "";
	if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
		throw new Error("Integration checks must use a local app.");
	const root = new URL("../../../../", import.meta.url).pathname;
	const child = Bun.spawn(
		[
			`${root}apps/web/node_modules/.bin/wrangler`,
			"d1",
			"execute",
			"chords",
			"--cwd",
			"apps/web",
			"--local",
			"--persist-to",
			process.env.CHORDS_TEST_D1_STATE || `${root}apps/web/.wrangler/state`,
			"--command",
			command,
		],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	const [exit, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	if (exit) throw new Error(`Local fixture provisioning failed: ${stderr}`);
}
