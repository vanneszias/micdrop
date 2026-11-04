import { CAPO_FRETS, KEYS } from "@chords/song-core";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";

export function KeySelect({
	value,
	onChange,
	className,
	label = "Key",
	prefix,
}: {
	value: string;
	onChange: (key: string) => void;
	className?: string;
	label?: string;
	/** Visible label inside the trigger, for toolbars without a field label. */
	prefix?: string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className} aria-label={label}>
				{prefix ? (
					<span className="text-xs text-muted-foreground max-sm:hidden">
						{prefix}
					</span>
				) : null}
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{KEYS.map((key) => (
					<SelectItem key={key} value={key}>
						{key}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function CapoSelect({
	value,
	onChange,
	className,
	prefix,
}: {
	value: number;
	onChange: (capo: number) => void;
	className?: string;
	prefix?: string;
}) {
	return (
		<Select
			value={String(value)}
			onValueChange={(next) => onChange(Number(next))}
		>
			<SelectTrigger className={className} aria-label="Capo">
				{prefix ? (
					<span className="text-xs text-muted-foreground max-sm:hidden">
						{prefix}
					</span>
				) : null}
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{CAPO_FRETS.map((fret) => (
					<SelectItem key={fret} value={String(fret)}>
						{fret === 0 ? "No capo" : `Capo ${fret}`}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
