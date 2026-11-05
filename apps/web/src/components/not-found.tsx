import { Button } from "@chords/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@chords/ui/components/empty";
import { Link, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "#/components/page-header";
import { useApp } from "#/features/app-context";

export function NotFound({
	what,
	to,
}: {
	what: string;
	to: "/songs" | "/setlists";
}) {
	const { account } = useApp();
	const href = useRouterState({ select: (state) => state.location.href });
	// Without a session, shared links can't resolve yet; that isn't "missing".
	if (account === "local")
		return (
			<>
				<PageHeader title="Sign in" />
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Sign in to open this {what}</EmptyTitle>
						<EmptyDescription>
							You’ll come back to this {what} after signing in.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild>
							<a href={`/login?${new URLSearchParams({ redirect: href })}`}>
								Sign in
							</a>
						</Button>
					</EmptyContent>
				</Empty>
			</>
		);
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
