import { Button } from "@chords/ui/components/button";
import { Separator } from "@chords/ui/components/separator";
import { SidebarTrigger } from "@chords/ui/components/sidebar";
import { cn } from "@chords/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment } from "react";

export function PageHeader({
	title,
	back,
	embedded,
	pageTitle,
	crumbs,
	headingInBody,
	children,
}: {
	title: React.ReactNode;
	back?: boolean;
	embedded?: boolean;
	/** The page body shows the title as its heading, so the bar shows a quiet breadcrumb. */
	pageTitle?: boolean;
	/** Parent locations shown before the title, e.g. Repertoire › Amazing Grace. */
	crumbs?: { label: React.ReactNode; to: string }[];
	/** The page renders its own h1, so the bar's title is plain text. */
	headingInBody?: boolean;
	children?: React.ReactNode;
}) {
	const router = useRouter();
	return (
		<header
			data-print="hide"
			className={cn(
				"sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur",
				// Phones use the bottom tabs and the page heading, so the bar would only cost space.
				pageTitle && "max-md:hidden",
			)}
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
			{pageTitle || crumbs?.length ? (
				<nav
					aria-label="Breadcrumb"
					className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground"
				>
					{crumbs?.map((crumb) => (
						<Fragment key={crumb.to}>
							<Link
								to={crumb.to}
								className="truncate hover:text-foreground max-md:hidden"
							>
								{crumb.label}
							</Link>
							<ChevronRight className="size-3.5 shrink-0 max-md:hidden" />
						</Fragment>
					))}
					{pageTitle || headingInBody ? (
						<span className="min-w-0 truncate font-medium text-foreground">
							{title}
						</span>
					) : (
						<h1 className="min-w-0 truncate font-medium text-foreground">
							{title}
						</h1>
					)}
				</nav>
			) : embedded ? (
				<p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
			) : (
				<h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
			)}
			<div className="flex items-center gap-2">{children}</div>
		</header>
	);
}

/**
 * The two content widths. Reading pages (lists, settings, the song sheet) keep a
 * comfortable line length; workspaces (the song and setlist editors) take the room
 * their side-by-side panes need.
 */
export const pageWidth = {
	reading: "max-w-4xl",
	workspace: "max-w-7xl",
} as const;

/** Shared content column for top-level pages, with an optional page intro. */
export function PageBody({
	title,
	description,
	actions,
	className,
	width = "reading",
	children,
}: {
	title?: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
	width?: keyof typeof pageWidth;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"mx-auto w-full space-y-6 px-4 pt-6 pb-10 md:px-8 md:pt-8",
				pageWidth[width],
				className,
			)}
		>
			{title ? (
				<div className="flex flex-wrap items-start gap-3">
					<div className="min-w-0 flex-1 basis-64 space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
						{description ? (
							<p className="text-[15px] text-muted-foreground">{description}</p>
						) : null}
					</div>
					{actions ? (
						// Phones always put the page's actions on their own row, under the intro.
						<div className="flex flex-wrap items-center gap-2 max-sm:w-full">
							{actions}
						</div>
					) : null}
				</div>
			) : null}
			{children}
		</div>
	);
}
