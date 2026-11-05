import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@chords/ui/components/tooltip";
import { useRef, useState } from "react";

/**
 * Names an icon-only control on hover and keyboard focus. Focus handed back by a closing
 * menu or popover does not open it, so tooltips never linger after a click.
 */
export function IconTip({
	label,
	children,
}: {
	label: string;
	children: React.ReactElement;
}) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	return (
		<Tooltip
			open={open}
			onOpenChange={(next) => {
				const element = trigger.current;
				if (
					next &&
					element &&
					!element.matches(":hover") &&
					!element.matches(":focus-visible")
				)
					return;
				setOpen(next);
			}}
		>
			<TooltipTrigger ref={trigger} asChild>
				{children}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
