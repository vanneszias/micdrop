import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "#/components/not-found";
import { useApp } from "#/features/app-context";
import { Editor } from "#/features/editor";

export const Route = createFileRoute("/_app/songs/$id/edit")({
	component: Edit,
});

function Edit() {
	const { id } = Route.useParams();
	const { arrangements, save } = useApp();
	const song = arrangements.find((row) => row.id === id);
	return song ? (
		<Editor key={song.id} arrangement={song} save={save} />
	) : (
		<NotFound what="song" to="/songs" />
	);
}
