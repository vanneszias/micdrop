export function Bobo({
	className = "",
	label = "Bobo hugging a guitar, ready to play with you",
}: {
	className?: string;
	label?: string;
}) {
	return (
		<img
			className={`bobo ${className}`}
			src="/bobo.svg"
			alt={label}
			width={360}
			height={360}
		/>
	);
}
