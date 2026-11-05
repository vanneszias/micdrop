// biome-ignore-all lint/suspicious/noArrayIndexKey: Highlighted lines and tokens are positional.
import { Textarea } from "@chords/ui/components/textarea";
import { cn } from "@chords/ui/lib/utils";
import { forwardRef, useRef } from "react";

const TOKEN = /(\{[^}\n]*\}?|\[[^\]\n]*\]?)/g;

function highlight(line: string) {
	if (/^\s*#/.test(line))
		return <span className="text-muted-foreground">{line}</span>;
	return line.split(TOKEN).map((part, index) =>
		!part ? null : part.startsWith("[") ? (
			<span key={index} className="font-semibold text-chord-foreground">
				{part}
			</span>
		) : part.startsWith("{") ? (
			<span
				key={index}
				className={
					/^\{(start|end)_of_|^\{(soc|eoc|sov|eov|sob|eob)\b/i.test(part)
						? "font-medium text-foreground/60"
						: "text-muted-foreground"
				}
			>
				{part}
			</span>
		) : (
			<span key={index}>{part}</span>
		),
	);
}

/**
 * A plain textarea with a highlighted copy of its text drawn underneath, so chords,
 * directives and sections stand apart while editing stays native.
 */
export const ChordProTextarea = forwardRef<
	HTMLTextAreaElement,
	React.ComponentProps<"textarea"> & {
		value: string;
		/** False keeps each line whole and scrolls sideways instead. */
		wrapLines?: boolean;
	}
>(function ChordProTextarea(
	{ className, value, onScroll, wrapLines = true, ...props },
	ref,
) {
	const backdrop = useRef<HTMLDivElement>(null);
	const shared = cn(
		// Phones use the proportional face at 16px (smaller inputs make iOS zoom in), so
		// more of each line fits before it wraps.
		"px-3 py-2 font-sans text-base leading-relaxed sm:font-mono md:text-sm",
		wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre",
	);
	return (
		<div className="relative rounded-md bg-transparent dark:bg-input/30">
			<div
				ref={backdrop}
				aria-hidden
				className={cn(
					shared,
					"pointer-events-none absolute inset-0 overflow-hidden border border-transparent",
				)}
			>
				{value.split("\n").map((line, index) => (
					<div key={index}>{line ? highlight(line) : "​"}</div>
				))}
			</div>
			<Textarea
				ref={ref}
				value={value}
				onScroll={(event) => {
					if (backdrop.current) {
						backdrop.current.scrollTop = event.currentTarget.scrollTop;
						backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
					}
					onScroll?.(event);
				}}
				className={cn(
					shared,
					!wrapLines && "overflow-x-auto",
					"relative bg-transparent text-transparent caret-foreground selection:bg-brand/30 selection:text-transparent dark:bg-transparent",
					className,
				)}
				{...props}
			/>
		</div>
	);
});
