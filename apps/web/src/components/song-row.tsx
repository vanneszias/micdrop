import { Button } from "@chords/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@chords/ui/components/dropdown-menu";
import { cn } from "@chords/ui/lib/utils";
import { MoreHorizontal } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/** The list frame every song list shares: Repertoire, Catalogue, setlists and search. */
export function SongList({ className, ...props }: ComponentProps<"ul">) {
	return (
		<ul
			className={cn("divide-y rounded-xl border bg-card", className)}
			{...props}
		/>
	);
}

/** Leading badge of a song row: the key, or a position when the key lives elsewhere. */
export function KeyBadge({
	children,
	muted,
	className,
}: {
	children: ReactNode;
	muted?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-8 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-[13px] font-semibold",
				muted
					? "bg-transparent text-muted-foreground"
					: "bg-chord text-chord-foreground",
				className,
			)}
		>
			{children}
		</span>
	);
}

/**
 * One song in a list: leading badge, title with a meta line, trailing status and actions.
 * `main` is the element that opens the song (a Link or button); it stretches over the row.
 */
export function SongRow({
	leading,
	title,
	meta,
	badges,
	trailing,
	main,
	className,
	children,
	...props
}: {
	leading?: ReactNode;
	title: ReactNode;
	meta?: ReactNode;
	/** Small status chips shown after the title. */
	badges?: ReactNode;
	trailing?: ReactNode;
	/** Wraps the title so the whole row is one target; receives the title content. */
	main?: (content: ReactNode) => ReactNode;
	/** Expanded content below the row. */
	children?: ReactNode;
} & Omit<ComponentProps<"li">, "title">) {
	const content = (
		<>
			<span className="flex min-w-0 items-center gap-2">
				<span className="text-[15px] font-medium max-sm:line-clamp-2 sm:truncate">
					{title}
				</span>
				{badges}
			</span>
			{meta ? (
				<span className="block truncate text-[13px] text-muted-foreground">
					{meta}
				</span>
			) : null}
		</>
	);
	return (
		<li
			className={cn(
				"overflow-hidden first:rounded-t-xl last:rounded-b-xl",
				className,
			)}
			{...props}
		>
			<div
				className={cn(
					"relative flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4",
					main && "transition-colors hover:bg-accent/40",
				)}
			>
				{leading}
				<div className="min-w-0 flex-1">{main ? main(content) : content}</div>
				{trailing ? (
					<div className="relative z-[1] flex shrink-0 items-center gap-1.5">
						{trailing}
					</div>
				) : null}
			</div>
			{children}
		</li>
	);
}

/** Classes that make a row's main link or button cover the whole row. */
export const rowTarget =
	"block w-full min-w-0 text-left outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset";

/** The overflow menu that holds every action beyond a page's primary and secondary ones. */
export function OverflowMenu({
	label,
	children,
	align = "end",
	onCloseAutoFocus,
	size = "icon-sm",
}: {
	label: string;
	children: ReactNode;
	align?: "start" | "end";
	onCloseAutoFocus?: (event: Event) => void;
	size?: "icon-sm" | "icon";
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size={size}
					aria-label={label}
					className="text-muted-foreground hover:text-foreground"
				>
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={align}
				className="min-w-48"
				onCloseAutoFocus={onCloseAutoFocus}
			>
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
