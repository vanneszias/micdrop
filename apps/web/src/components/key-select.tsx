import {
	CAPO_FRETS,
	KEYS,
	keyLabel,
	type Mode,
	shiftKey,
} from "@chords/song-core";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@chords/ui/components/select";

// Keys whose chords are easy open shapes, worth pointing out in the capo menu.
const OPEN_SHAPES = new Set(["C", "G", "D", "A", "E", "Am", "Em", "Dm"]);

export function KeySelect({
	value,
	onChange,
	className,
	label = "Key",
	prefix,
	original,
	mode,
}: {
	/** Minor songs list Am, Bbm… while the stored value stays the root. */
	mode?: Mode;
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
				<SelectValue>{keyLabel(value, mode)}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{KEYS.map((key) => (
					<SelectItem key={key} value={key}>
						{keyLabel(key, mode)}
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
	mode,
	disabled,
}: {
	disabled?: boolean;
	mode?: Mode;
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
			disabled={disabled}
		>
			<SelectTrigger className={className} aria-label="Capo">
				{prefix ? (
					<span className="text-xs text-muted-foreground">{prefix}</span>
				) : null}
				<SelectValue>{value === 0 ? "No capo" : `Capo ${value}`}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{CAPO_FRETS.filter(
					// High frets rarely help; keep them only when a song already uses one.
					(fret) => !soundingKey || fret <= 7 || fret === value,
				).map((fret) => {
					const shapes = soundingKey
						? keyLabel(shiftKey(soundingKey, -fret), mode)
						: "";
					return (
						<SelectItem
							key={fret}
							value={String(fret)}
							className="*:[span]:last:w-full"
						>
							{fret === 0 ? "No capo" : `Capo ${fret}`}
							{shapes ? (
								<span
									className={
										OPEN_SHAPES.has(shapes)
											? "ml-auto pl-6 text-xs text-muted-foreground after:ml-1.5 after:rounded after:bg-chord after:px-1 after:text-[10px] after:text-chord-foreground after:content-['open']"
											: "ml-auto pl-6 text-xs text-muted-foreground"
									}
								>
									{shapes} shapes
								</span>
							) : null}
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
