import {
	lazy,
	Suspense,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

const greetings = [
	"Oh, hello! I saved you a spot.",
	"Found my pick. It was here all along.",
	"One little chord is a lovely place to start.",
];

const BoboRive = lazy(() =>
	import("./bobo-rive").catch(() => ({ default: () => <span hidden /> })),
);

export function Bobo({
	className = "",
	label = "Bobo hugging a guitar, ready to play with you",
	mood = "idle",
	celebration = 0,
	animated = true,
	interactive = true,
	messages = greetings,
}: {
	className?: string;
	label?: string;
	mood?: "idle" | "curious" | "thinking";
	celebration?: number;
	animated?: boolean;
	interactive?: boolean;
	messages?: readonly string[];
}) {
	const speechId = useId();
	const container = useRef<HTMLSpanElement>(null);
	const bubble = useRef<HTMLOutputElement>(null);
	const nextMessage = useRef(0);
	const [speech, setSpeech] = useState("");
	const [cheer, setCheer] = useState(0);
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);
	const [allowed, setAllowed] = useState(false);
	const [visible, setVisible] = useState(false);
	const [pageVisible, setPageVisible] = useState(true);
	const [started, setStarted] = useState(false);
	const [failed, setFailed] = useState(false);
	useLayoutEffect(() => {
		const anchor = container.current;
		const output = bubble.current;
		if (!speech || !anchor || !output) return;
		const boundary = anchor.closest(
			".sidebar, .songbook-welcome, .app-dialog, .content-wrap",
		);
		const position = () => {
			const rect = anchor.getBoundingClientRect();
			const bounds = boundary?.getBoundingClientRect();
			const welcome = boundary?.matches(".songbook-welcome");
			const inset = welcome ? 0 : 12;
			const left = Math.max(12, (bounds?.left ?? 0) + inset);
			const right = Math.min(
				window.innerWidth - 12,
				(bounds?.right ?? window.innerWidth) - inset,
			);
			const preferredWidth = welcome ? rect.width : 220;
			output.style.maxWidth = `${Math.max(0, Math.min(preferredWidth, right - left))}px`;
			const width = output.getBoundingClientRect().width;
			const headCenter = rect.left + rect.width * 0.55;
			const bubbleLeft = Math.max(
				left,
				Math.min(headCenter - 18, right - width),
			);
			output.style.left = `${bubbleLeft - rect.left}px`;
			output.style.setProperty(
				"--bobo-tail-left",
				`${Math.max(14, Math.min(headCenter - bubbleLeft, width - 20))}px`,
			);
			const topEdge = Math.max(
				12,
				anchor.closest(".app-dialog")?.getBoundingClientRect().top ?? 0,
			);
			output.dataset.below = String(
				rect.top + rect.height * 0.15 - 8 - output.offsetHeight < topEdge,
			);
		};
		position();
		const observer = new ResizeObserver(position);
		observer.observe(anchor);
		if (boundary) observer.observe(boundary);
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, true);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position, true);
		};
	}, [speech]);
	useEffect(() => {
		if (celebration) setCheer((value) => value + 1);
	}, [celebration]);
	useEffect(() => {
		if (!cheer) return;
		const timer = window.setTimeout(() => setSpeech(""), 4500);
		return () => window.clearTimeout(timer);
	}, [cheer]);
	useEffect(() => {
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateMotion = () => setAllowed(!motion.matches);
		const updateVisibility = () => setPageVisible(!document.hidden);
		updateMotion();
		updateVisibility();
		motion.addEventListener("change", updateMotion);
		document.addEventListener("visibilitychange", updateVisibility);
		const observer = new IntersectionObserver(([entry]) => {
			setVisible(entry?.isIntersecting ?? false);
		});
		if (container.current) observer.observe(container.current);
		return () => {
			observer.disconnect();
			motion.removeEventListener("change", updateMotion);
			document.removeEventListener("visibilitychange", updateVisibility);
		};
	}, []);
	const active = animated && allowed && visible && pageVisible;
	useEffect(() => {
		if (active) setStarted(true);
	}, [active]);
	const artwork = (
		<>
			<img
				src="/bobo.svg"
				alt={interactive ? "" : label}
				width={360}
				height={360}
			/>
			{started && allowed && animated && !failed ? (
				<Suspense fallback={null}>
					<BoboRive
						active={active}
						mood={
							interactive && (hovered || focused) && mood === "idle"
								? "curious"
								: mood
						}
						celebration={cheer}
						onError={() => setFailed(true)}
					/>
				</Suspense>
			) : null}
		</>
	);
	return (
		<span
			ref={container}
			className={`bobo ${interactive ? "bobo-interactive" : ""} ${className}`}
		>
			{interactive ? (
				<button
					type="button"
					className="bobo-hitbox"
					aria-label="Say hello to Bobo"
					aria-describedby={speech ? speechId : undefined}
					onPointerEnter={() => setHovered(true)}
					onPointerLeave={() => setHovered(false)}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					onClick={() => {
						setSpeech(
							messages[nextMessage.current++ % messages.length] ?? greetings[0],
						);
						setCheer((value) => value + 1);
					}}
				>
					{artwork}
				</button>
			) : (
				artwork
			)}
			{interactive ? (
				<output ref={bubble} id={speechId} className="bobo-speech">
					{speech ? <span>{speech}</span> : null}
				</output>
			) : null}
		</span>
	);
}
