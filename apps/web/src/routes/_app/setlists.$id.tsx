import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "#/components/not-found";
import { useApp } from "#/features/app-context";
import { SetlistEditor } from "#/features/setlist-editor";

export const Route = createFileRoute("/_app/setlists/$id")({
	component: SetlistPage,
});

function SetlistPage() {
	const { id } = Route.useParams();
	const { setlists, arrangements, store, save } = useApp();
	const list = setlists.find((row) => row.id === id);
	return list ? (
		<SetlistEditor
			key={list.id}
			list={list}
			getSource={store.getImportSource}
			songs={arrangements}
			save={save}
		/>
	) : (
		<NotFound what="setlist" to="/setlists" />
	);
}
