import type { Arrangement } from "@chords/data";
import {
	CAPO_FRETS,
	displayTranspose,
	KEYS,
	keyDistance,
} from "@chords/song-core";
import { ChordDiagrams, SongSheet } from "@chords/song-ui";
import { Button } from "@chords/ui/components/button";
import {
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	Guitar,
	Minus,
	Pause,
	Play,
	Plus,
	Printer,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ThemeToggle } from "./theme-toggle";

const preferences = z.object({
	shapes: z.boolean().default(true),
	fontSize: z.number().min(14).max(40).default(23),
	columns: z.number().int().min(1).max(3).default(1),
	diagrams: z.boolean().default(false),
	speed: z.number().min(5).max(80).default(25),
});
const songPreferences = z.object({
	key: z.string(),
	capo: z.number().int().min(0).max(12),
});

export function Player({
	arrangement,
	account,
	performanceKey,
	notes,
	close,
	next,
	previous,
}: {
	arrangement: Arrangement;
	account: string;
	performanceKey?: string;
	notes?: string;
	close: () => void;
	next?: () => void;
	previous?: () => void;
}) {
	const [shown, setShown] = useState(arrangement);
	const preferenceKey = `chords:player:${account}`;
	const songPreferenceKey = `chords:player:${account}:${arrangement.id}`;
	const [saved] = useState(() => {
		try {
			return preferences.parse(
				JSON.parse(
					localStorage.getItem(preferenceKey) ||
						localStorage.getItem(songPreferenceKey) ||
						"{}",
				),
			);
		} catch {
			return null;
		}
	});
	const [savedSong] = useState(() => {
		try {
			return songPreferences.parse(
				JSON.parse(localStorage.getItem(songPreferenceKey) || "null"),
			);
		} catch {
			return null;
		}
	});
	const [key, setKey] = useState(
		performanceKey ||
			savedSong?.key ||
			KEYS[
				(keyDistance("C", arrangement.data.key) + arrangement.data.sourceCapo) %
					12
			],
	);
	const [capo, setCapo] = useState(
		savedSong?.capo ?? arrangement.data.sourceCapo,
	);
	const [shapes, setShapes] = useState(saved?.shapes ?? true);
	const [fontSize, setFontSize] = useState(saved?.fontSize ?? 23);
	const [columns, setColumns] = useState(saved?.columns ?? 1);
	const [diagrams, setDiagrams] = useState(saved?.diagrams ?? false);
	const [scrolling, setScrolling] = useState(false);
	const [speed, setSpeed] = useState(saved?.speed ?? 25);
	useEffect(() => {
		try {
			localStorage.setItem(
				preferenceKey,
				JSON.stringify({ shapes, fontSize, columns, diagrams, speed }),
			);
			localStorage.setItem(songPreferenceKey, JSON.stringify({ key, capo }));
		} catch {
			/* Playing remains available when preference storage is full. */
		}
	}, [
		preferenceKey,
		songPreferenceKey,
		key,
		capo,
		shapes,
		fontSize,
		columns,
		diagrams,
		speed,
	]);
	const sheet = useRef<HTMLElement>(null);
	const delta = displayTranspose(shown.data.key, key, shapes ? capo : 0);
	useEffect(() => {
		if (!scrolling) return;
		let frame: number;
		let last = performance.now();
		let position = sheet.current?.scrollTop || 0;
		const tick = (now: number) => {
			if (sheet.current) {
				position += (Math.min(now - last, 100) * speed) / 1000;
				sheet.current.scrollTop = position;
				if (
					sheet.current.scrollTop + sheet.current.clientHeight >=
					sheet.current.scrollHeight
				)
					setScrolling(false);
			}
			last = now;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [scrolling, speed]);
	useEffect(() => {
		const pause = () => {
			if (document.hidden) setScrolling(false);
		};
		document.addEventListener("visibilitychange", pause);
		return () => document.removeEventListener("visibilitychange", pause);
	}, []);
	return (
		<section className="player-screen">
			<header className="player-heading">
				<Button variant="ghost" onClick={close}>
					<ArrowLeft size={16} /> Songbook
				</Button>
				<span className="player-wordmark">
					bobo<span>.</span>
				</span>
				<div className="actions">
					<ThemeToggle />
					<Button variant="ghost" onClick={() => window.print()}>
						<Printer size={16} /> Print
					</Button>
				</div>
			</header>
			<div className="player-toolbar">
				<label>
					Sounding key
					<select value={key} onChange={(event) => setKey(event.target.value)}>
						{KEYS.map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label>
					Capo
					<select
						value={capo}
						onChange={(event) => setCapo(Number(event.target.value))}
					>
						{CAPO_FRETS.map((value) => (
							<option key={value} value={value}>
								{value === 0 ? "None" : value}
							</option>
						))}
					</select>
				</label>
				<details className="view-options">
					<summary>View · Aa</summary>
					<div className="view-panel">
						<p>Make yourself comfortable.</p>
						<label>
							Display
							<select
								value={shapes ? "shapes" : "sounding"}
								onChange={(event) => setShapes(event.target.value === "shapes")}
							>
								<option value="shapes">Guitar shapes</option>
								<option value="sounding">Sounding chords</option>
							</select>
						</label>
						<label>
							Columns
							<select
								value={columns}
								onChange={(event) => setColumns(Number(event.target.value))}
							>
								{[1, 2, 3].map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<div className="font-controls">
							<Button
								size="icon"
								variant="ghost"
								aria-label="Smaller text"
								disabled={fontSize <= 14}
								onClick={() => setFontSize((value) => Math.max(14, value - 2))}
							>
								<Minus size={16} />
							</Button>
							<span>{fontSize} px</span>
							<Button
								size="icon"
								variant="ghost"
								aria-label="Larger text"
								disabled={fontSize >= 40}
								onClick={() => setFontSize((value) => Math.min(40, value + 2))}
							>
								<Plus size={16} />
							</Button>
						</div>
					</div>
				</details>
				<Button
					variant={diagrams ? "secondary" : "ghost"}
					aria-pressed={diagrams}
					onClick={() => setDiagrams((value) => !value)}
				>
					<Guitar size={16} /> Chord shapes
				</Button>
			</div>
			{arrangement.updatedAt !== shown.updatedAt ? (
				<div className="update-notice">
					A new version is available.
					<Button
						size="sm"
						variant="outline"
						onClick={() => setShown(arrangement)}
					>
						Use latest version
					</Button>
				</div>
			) : null}
			<section
				ref={sheet}
				className="player-scroll"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll the chord sheet.
				tabIndex={0}
				aria-label="Song chord sheet"
			>
				<article className="performance-sheet" data-columns={columns}>
					<h1>{shown.data.title}</h1>
					<p className="artist">{shown.data.artist}</p>
					<div className="performance-meta">
						<span>Key {key}</span>
						<span>Capo {capo && shapes ? capo : "None"}</span>
					</div>
					{notes ? <p className="band-note">{notes}</p> : null}
					<SongSheet
						content={shown.data.content}
						semitones={delta}
						fontSize={fontSize}
						columns={columns}
					/>
				</article>
			</section>
			{diagrams ? (
				<section className="player-shapes" aria-label="Chord shapes">
					<ChordDiagrams content={shown.data.content} semitones={delta} />
				</section>
			) : null}
			<footer className="player-footer">
				{previous ? (
					<Button variant="ghost" onClick={previous}>
						<ChevronLeft size={18} /> Previous
					</Button>
				) : (
					<span className="player-footer-note">Just you and the music.</span>
				)}
				<div className="actions">
					<Button
						variant={scrolling ? "secondary" : "default"}
						aria-pressed={scrolling}
						onClick={() => setScrolling((value) => !value)}
					>
						{scrolling ? <Pause size={16} /> : <Play size={16} />}
						{scrolling ? "Pause autoscroll" : "Start autoscroll"}
					</Button>
					<label className="scroll-speed">
						Speed
						<input
							type="range"
							min="5"
							max="80"
							value={speed}
							onChange={(event) => setSpeed(Number(event.target.value))}
						/>
					</label>
				</div>
				{next ? (
					<Button variant="ghost" onClick={next}>
						Next <ChevronRight size={18} />
					</Button>
				) : null}
			</footer>
		</section>
	);
}
