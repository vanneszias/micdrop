import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@chords/ui/components/sheet";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NotFound } from "#/components/not-found";
import { useApp } from "#/features/app-context";
import { SetlistEditor } from "#/features/setlist-editor";

export const Route = createFileRoute("/_app/setlists/$id")({
	component: SetlistPage,
});

function SetlistPage() {
	const { id } = Route.useParams();
	const { setlists, arrangements, store, save } = useApp();
	const navigate = useNavigate();
	const list = setlists.find((row) => row.id === id);
	const close = () => void navigate({ to: "/setlists" });
	return (
		<Sheet open onOpenChange={(open) => !open && close()}>
			<SheetContent
				showCloseButton={false}
				className="w-full gap-0 overflow-y-auto sm:max-w-2xl"
				// Focus the panel itself so the first toolbar button doesn't open with a focus ring.
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					(event.currentTarget as HTMLElement).focus();
				}}
			>
				<SheetTitle className="sr-only">
					{list?.data.title ?? "Setlist"}
				</SheetTitle>
				<SheetDescription className="sr-only">Edit setlist</SheetDescription>
				{list ? (
					<SetlistEditor
						key={list.id}
						list={list}
						getSource={store.getImportSource}
						songs={arrangements}
						save={save}
						onClose={close}
					/>
				) : (
					<NotFound what="setlist" to="/setlists" />
				)}
			</SheetContent>
		</Sheet>
	);
}
