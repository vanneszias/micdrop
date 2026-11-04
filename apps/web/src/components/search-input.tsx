import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@chords/ui/components/input-group";
import { Search, X } from "lucide-react";

export function SearchInput({
	onClear,
	...props
}: React.ComponentProps<"input"> & {
	/** Shows a clear button while the field has a value. */
	onClear?: () => void;
}) {
	return (
		<InputGroup>
			<InputGroupAddon>
				<Search />
			</InputGroupAddon>
			<InputGroupInput {...props} />
			{onClear && props.value ? (
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						size="icon-xs"
						aria-label="Clear search"
						onClick={onClear}
					>
						<X />
					</InputGroupButton>
				</InputGroupAddon>
			) : null}
		</InputGroup>
	);
}
