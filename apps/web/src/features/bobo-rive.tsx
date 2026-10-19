import wasmUrl from "@rive-app/canvas-lite/rive.wasm?url";
import {
	Alignment,
	Fit,
	Layout,
	RuntimeLoader,
	useRive,
} from "@rive-app/react-canvas-lite";
import { useEffect, useRef } from "react";

RuntimeLoader.setWasmUrl(wasmUrl);
const layout = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });
const moods = { idle: 0, curious: 1, thinking: 2 };

export default function BoboRive({
	active,
	mood,
	celebration,
	onError,
}: {
	active: boolean;
	mood: keyof typeof moods;
	celebration: number;
	onError: () => void;
}) {
	const celebrated = useRef(0);
	const { rive, RiveComponent } = useRive({
		src: "/bobo.riv",
		artboard: "Bobo",
		stateMachines: "Bobo",
		autoBind: true,
		autoplay: false,
		layout,
		onLoadError: onError,
	});
	useEffect(() => {
		if (!rive) return;
		const input = rive.viewModelInstance?.number("mood");
		if (input) input.value = moods[mood];
	}, [rive, mood]);
	useEffect(() => {
		if (!rive) return;
		if (active) rive.play("Bobo");
		else rive.pause("Bobo");
	}, [rive, active]);
	useEffect(() => {
		if (!rive || !active || !celebration || celebrated.current === celebration)
			return;
		rive.viewModelInstance?.trigger("celebrate")?.trigger();
		celebrated.current = celebration;
	}, [rive, active, celebration]);
	return (
		<RiveComponent
			className={`bobo-canvas${rive ? " is-ready" : ""}`}
			aria-hidden="true"
		/>
	);
}
