import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";
import { PdfSetlistImport } from "#/features/pdf-setlist-import";

export const Route = createFileRoute("/_app/setlists_/import")({
	component: ImportPdf,
});

function ImportPdf() {
	const { owner, online, user, store } = useApp();
	return (
		<>
			<PageHeader title="Import setlist from PDF" />
			<div className="w-full max-w-3xl p-4">
				<PdfSetlistImport
					owner={owner}
					online={online}
					signedIn={!!user}
					store={store}
				/>
			</div>
		</>
	);
}
