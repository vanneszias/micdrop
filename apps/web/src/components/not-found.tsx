import { Button } from "@chords/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "#/components/page-header";

export function NotFound({
	what,
	to,
}: {
	what: string;
	to: "/songs" | "/setlists";
}) {
	return (
		<>
			<PageHeader title="Not found" />
			<Empty>
				<EmptyHeader>
					<EmptyTitle>This {what} isn’t here</EmptyTitle>
					<EmptyDescription>
						It may have been archived or belongs to another library.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button asChild variant="outline">
						<Link to={to}>Back</Link>
					</Button>
				</EmptyContent>
			</Empty>
		</>
	);
}
