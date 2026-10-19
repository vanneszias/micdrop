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
}: {
	value: string;
	onChange: (key: string) => void;
	className?: string;
	label?: string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className} aria-label={label}>
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
}: {
	value: number;
	onChange: (capo: number) => void;
	className?: string;
}) {
	return (
		<Select
			value={String(value)}
			onValueChange={(next) => onChange(Number(next))}
		>
			<SelectTrigger className={className} aria-label="Capo">
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
