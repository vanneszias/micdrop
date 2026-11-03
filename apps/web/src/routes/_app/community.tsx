import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "#/components/page-header";
import { CatalogueAdmin } from "#/features/catalogue-admin";
import { CatalogueSearch } from "#/features/catalogue-search";

export const Route = createFileRoute("/_app/community")({
	validateSearch: z.object({ q: z.string().optional() }),
	component: Community,
});
function Community() {
	const { q = "" } = Route.useSearch();
	return (
		<>
			<PageHeader title="Catalogue" />
			<div className="w-full max-w-5xl space-y-4 p-4">
				<CatalogueSearch initialQuery={q} publicOnly />
				<CatalogueAdmin />
			</div>
		</>
	);
}
