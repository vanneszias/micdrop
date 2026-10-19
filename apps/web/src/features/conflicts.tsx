import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import { useApp } from "./app-context";

function text(row: { kind: string; data: unknown }) {
	const data = row.data as { content?: string; entries?: unknown };
	return row.kind === "arrangement"
		? data.content
		: JSON.stringify(data.entries, null, 2);
}

export function Conflicts() {
	const { conflicts, store, run, createSong, busy } = useApp();
	const conflict = conflicts[0];
	if (!conflict) return null;
	const mine = conflict.operation.record;
	const id = mine.id;
	return (
		<Dialog open>
			<DialogContent className="sm:max-w-3xl" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Two versions of “{mine.data.title}”</DialogTitle>
					<DialogDescription>
						This changed elsewhere. Choose which version to keep.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-2">
					{[
						["Yours", text(mine)],
						["Cloud", text(conflict.server)],
					].map(([label, body]) => (
						<div key={label} className="min-w-0 space-y-1">
							<div className="text-xs font-medium text-muted-foreground">
								{label}
							</div>
							<pre className="max-h-60 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
								{body}
							</pre>
						</div>
					))}
				</div>
				<DialogFooter>
					{mine.kind === "arrangement" ? (
						<Button
							variant="ghost"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									await store.resolve(id, "server");
									await createSong({
										...mine.data,
										title: `${mine.data.title} (mine)`,
									});
								})
							}
						>
							Keep both
						</Button>
					) : null}
					<Button
						variant="outline"
						disabled={busy}
						onClick={() => void run(() => store.resolve(id, "server"))}
					>
						Use cloud
					</Button>
					<Button
						disabled={busy}
						onClick={() => void run(() => store.resolve(id, "local"))}
					>
						Use mine
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
