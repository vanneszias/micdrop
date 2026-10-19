import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@chords/ui/components/input-group";
import { Search } from "lucide-react";

export function SearchInput(props: React.ComponentProps<"input">) {
	return (
		<InputGroup>
			<InputGroupAddon>
				<Search />
			</InputGroupAddon>
			<InputGroupInput {...props} />
		</InputGroup>
	);
}
