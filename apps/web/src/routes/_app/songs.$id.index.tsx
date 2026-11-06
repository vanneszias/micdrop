import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { NotFound } from "#/components/not-found";
import { useApp } from "#/features/app-context";
import { Player } from "#/features/player";

export const Route = createFileRoute("/_app/songs/$id/")({
	validateSearch: z.object({
		setlist: z.string().optional(),
		index: z.number().int().min(0).optional(),
	}),
	component: Play,
});

function Play() {
	const { id } = Route.useParams();
	const { setlist, index = 0 } = Route.useSearch();
	const { arrangements, records, account } = useApp();
	const navigate = useNavigate();
	// Player remounts per song, so stage mode lives here to survive a song change.
	const [stage, setStage] = useState(false);
	const song = arrangements.find((row) => row.id === id);
	const list = records.find(
		(row) => row.kind === "setlist" && row.id === setlist,
	);
	const entries = list?.kind === "setlist" ? list.data.entries : [];
	const go = (to: number) => () =>
		void navigate({
			to: "/songs/$id",
			params: { id: entries[to].arrangementId },
			search: { setlist, index: to },
			replace: true,
		});
	if (!song) return <NotFound what="song" to="/songs" />;
	return (
		<Player
			key={`${song.id}-${index}`}
			account={account}
			arrangement={song}
			performanceKey={entries[index]?.key}
			performanceCapo={entries[index]?.capo}
			notes={entries[index]?.notes ?? song.data.privateNotes}
			previous={index > 0 ? go(index - 1) : undefined}
			next={index < entries.length - 1 ? go(index + 1) : undefined}
			stage={stage}
			onStageChange={setStage}
		/>
	);
}
