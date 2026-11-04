import { Button } from "@chords/ui/components/button";
import { Separator } from "@chords/ui/components/separator";
import { SidebarTrigger } from "@chords/ui/components/sidebar";
import { cn } from "@chords/ui/lib/utils";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
	title,
	back,
	embedded,
	children,
}: {
	title: React.ReactNode;
	back?: boolean;
	embedded?: boolean;
	children?: React.ReactNode;
}) {
	const router = useRouter();
	return (
		<header
			data-print="hide"
			className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur"
		>
			{back ? (
				<Button
					variant="ghost"
					size="icon-sm"
					className="-ml-1 md:hidden"
					aria-label="Back"
					onClick={() => router.history.back()}
				>
					<ChevronLeft />
				</Button>
			) : null}
			{embedded ? null : (
				<>
					<SidebarTrigger className="-ml-1 hidden md:inline-flex" />
					<Separator
						orientation="vertical"
						className="mr-2 hidden data-[orientation=vertical]:h-4 md:block"
					/>
				</>
			)}
			<h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
			<div className="flex items-center gap-2">{children}</div>
		</header>
	);
}

/** Shared content column for top-level pages, with an optional page intro. */
export function PageBody({
	title,
	description,
	className,
	children,
}: {
	title?: React.ReactNode;
	description?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"mx-auto w-full max-w-5xl space-y-6 px-4 pt-6 pb-10 md:px-8 md:pt-8",
				className,
			)}
		>
			{title ? (
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
			) : null}
			{children}
		</div>
	);
}
