import { GoogleFont, render } from "@cf-wasm/og";
import type { ShareCard } from "./shares";

// Brand colours from styles.css (dark theme), as hex for the renderer.
const COLORS = {
	page: "#141210",
	amber: "#df911a",
	ink: "#281606",
	text: "#f7f5f2",
	muted: "#a8a49f",
	chord: "rgba(246, 184, 77, 0.14)",
	chordText: "#f6b84d",
};

const fonts = [
	new GoogleFont("Noto Sans", { weight: 400 }),
	new GoogleFont("Noto Sans", { weight: 700 }),
];

function Card({ card, host }: { card: ShareCard; host: string }) {
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "64px 72px",
				background: COLORS.page,
				backgroundImage:
					"radial-gradient(circle at 100% 0%, rgba(223, 145, 26, 0.28), rgba(20, 18, 16, 0) 55%)",
				color: COLORS.text,
				fontFamily: "Noto Sans",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 20 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 72,
						height: 72,
						borderRadius: 18,
						background: COLORS.amber,
					}}
				>
					{/* biome-ignore lint/a11y/noSvgWithoutTitle: Satori draws a title as visible text. */}
					<svg
						width="40"
						height="40"
						viewBox="0 0 24 24"
						fill="none"
						stroke={COLORS.ink}
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M9 18V5l12-2v13" />
						<circle cx="6" cy="18" r="3" />
						<circle cx="18" cy="16" r="3" />
					</svg>
				</div>
				<div style={{ fontSize: 38, fontWeight: 700 }}>Mic Drop</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<div
					style={{
						fontSize: 26,
						fontWeight: 700,
						letterSpacing: 3,
						textTransform: "uppercase",
						color: COLORS.chordText,
					}}
				>
					{card.label}
				</div>
				<div
					style={{
						display: "block",
						marginTop: 16,
						fontSize: card.title.length > 36 ? 60 : 72,
						fontWeight: 700,
						lineHeight: 1.1,
						lineClamp: 2,
					}}
				>
					{card.title}
				</div>
				<div
					style={{
						display: "block",
						marginTop: 20,
						fontSize: 34,
						lineHeight: 1.35,
						color: COLORS.muted,
						lineClamp: 2,
					}}
				>
					{card.description}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div style={{ fontSize: 28, color: COLORS.muted }}>{host}</div>
				<div style={{ display: "flex", gap: 12 }}>
					{["G", "D", "Em", "C"].map((chord) => (
						<div
							key={chord}
							style={{
								display: "flex",
								padding: "6px 18px",
								borderRadius: 10,
								fontSize: 28,
								fontWeight: 700,
								background: COLORS.chord,
								color: COLORS.chordText,
							}}
						>
							{chord}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/** Renders a 1200×630 link-preview PNG in the brand style. */
export async function renderCard(card: ShareCard, host: string) {
	const element = <Card card={card} host={host} />;
	const size = { width: 1200, height: 630 };
	// The faces come from Google Fonts; without them previews fall back to the bundled regular face.
	const png = await render(element, { ...size, fonts })
		.asPng()
		.catch(() => render(element, size).asPng());
	return png.image;
}
