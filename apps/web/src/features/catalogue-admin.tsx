import { Button } from "@chords/ui/components/button";
import { Input } from "@chords/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "#/lib/songs";
import { useApp } from "./app-context";

type Report = {
	id: string;
	publication_id: string;
	title: string;
	song_id: string;
	reason: string;
	moderated: number;
};
export function CatalogueAdmin() {
	const { account, online, run, busy } = useApp();
	const access = useQuery({
		queryKey: ["catalogue-admin-access", account],
		queryFn: () => api<{ admin: boolean }>("/api/publications"),
		enabled: account !== "local" && online,
	});
	const reports = useQuery({
		queryKey: ["catalogue-reports", account],
		queryFn: () => api<{ reports: Report[] }>("/api/publications?admin=1"),
		enabled: access.data?.admin === true && online,
	});
	const [source, setSource] = useState("");
	const [target, setTarget] = useState("");
	const [publication, setPublication] = useState("");
	if (!access.data?.admin) return null;
	const act = (body: unknown) =>
		run(async () => {
			await api("/api/publications", body);
			await reports.refetch();
		}, "Catalogue updated");
	return (
		<details className="rounded-lg border p-4">
			<summary className="cursor-pointer font-medium">
				Catalogue administration
			</summary>
			<div className="mt-4 space-y-4">
				{reports.error ? <p role="alert">{reports.error.message}</p> : null}
				{reports.data?.reports.length === 0 ? (
					<p className="text-sm">No open reports.</p>
				) : null}
				{reports.data?.reports.map((report) => (
					<article key={report.id} className="space-y-2 border-b pb-3">
						<h3 className="font-medium">{report.title}</h3>
						<p className="text-sm">{report.reason}</p>
						<p className="break-all text-xs text-muted-foreground">
							Publication: {report.publication_id} · Song group:{" "}
							{report.song_id}
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={busy}
								variant="outline"
								onClick={() =>
									void act({
										action: "hide",
										id: report.publication_id,
										hidden: !report.moderated,
									})
								}
							>
								{report.moderated
									? "Restore public entry"
									: "Hide public entry"}
							</Button>
							<Button
								size="sm"
								disabled={busy}
								variant="ghost"
								onClick={() => void act({ action: "resolve", id: report.id })}
							>
								Resolve report
							</Button>
						</div>
					</article>
				))}
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						void act({ action: "merge", source, target });
					}}
				>
					<h3 className="text-sm font-medium">Merge song groups</h3>
					<Input
						aria-label="Source song group ID"
						placeholder="Source song group ID"
						value={source}
						onChange={(event) => setSource(event.target.value)}
						required
					/>
					<Input
						aria-label="Destination song group ID"
						placeholder="Destination song group ID"
						value={target}
						onChange={(event) => setTarget(event.target.value)}
						required
					/>
					<p className="text-xs text-muted-foreground">
						Moves arrangements and saved copies to the destination group.
						Setlists and chord sheets are preserved.
					</p>
					<Button size="sm" type="submit" disabled={busy || source === target}>
						Merge groups
					</Button>
				</form>
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						void act({ action: "regroup", id: publication, target });
					}}
				>
					<h3 className="text-sm font-medium">Move one public arrangement</h3>
					<Input
						aria-label="Publication ID to regroup"
						placeholder="Publication ID"
						value={publication}
						onChange={(event) => setPublication(event.target.value)}
						required
					/>
					<p className="text-xs text-muted-foreground">
						Uses the destination song group entered above.
					</p>
					<Button size="sm" type="submit" disabled={busy || !target}>
						Move arrangement
					</Button>
				</form>
			</div>
		</details>
	);
}
