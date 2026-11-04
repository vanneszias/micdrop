import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@chords/ui/components/tooltip";

/** Names an icon-only control on hover and focus. */
export function IconTip({
	label,
	children,
}: {
	label: string;
	children: React.ReactElement;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
