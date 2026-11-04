import { CAPO_FRETS, KEYS, shiftKey } from "@chords/song-core";
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
	original,
}: {
	value: string;
	onChange: (key: string) => void;
	className?: string;
	label?: string;
	/** Marks the song's own key in the menu. */
	original?: string;
	/** Visible label inside the trigger, for toolbars without a field label. */
	prefix?: string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className} aria-label={label}>
				{prefix ? (
					<span className="text-xs text-muted-foreground">{prefix}</span>
				) : null}
				<SelectValue>{value}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{KEYS.map((key) => (
					<SelectItem key={key} value={key}>
						{key}
						{key === original ? (
							<span className="text-xs text-muted-foreground">Original</span>
						) : null}
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
	soundingKey,
}: {
	value: number;
	onChange: (capo: number) => void;
	className?: string;
	prefix?: string;
	/** When set, each fret shows the chord shapes you would play for this key. */
	soundingKey?: string;
}) {
	return (
		<Select
			value={String(value)}
			onValueChange={(next) => onChange(Number(next))}
		>
			<SelectTrigger className={className} aria-label="Capo">
				{prefix ? (
					<span className="text-xs text-muted-foreground">{prefix}</span>
				) : null}
				<SelectValue>{value === 0 ? "No capo" : `Capo ${value}`}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{CAPO_FRETS.map((fret) => (
					<SelectItem key={fret} value={String(fret)}>
						{fret === 0 ? "No capo" : `Capo ${fret}`}
						{soundingKey ? (
							<span className="text-xs text-muted-foreground">
								{shiftKey(soundingKey, -fret)} shapes
							</span>
						) : null}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
