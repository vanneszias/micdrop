import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageBody, PageHeader } from "#/components/page-header";
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
			<PageHeader pageTitle title="Catalogue" />
			<PageBody
				title="Catalogue"
				description="Arrangements shared by other players. Save one to get your own private copy."
			>
				<CatalogueSearch initialQuery={q} publicOnly />
				<CatalogueAdmin />
			</PageBody>
		</>
	);
}
