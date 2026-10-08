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
	const sheet = useRef<HTMLDivElement>(null);
	const delta = displayTranspose(shown.data.key, key, shapes ? capo : 0);
	useEffect(() => {
		if (!scrolling) return;
		let frame: number;
		let last = performance.now();
		let position = sheet.current?.scrollTop || 0;
		const tick = (now: number) => {
			if (sheet.current) {
				position += ((now - last) * speed) / 1000;
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
	return (
		<section className="player-screen">
			<header className="player-heading">
				<Button variant="ghost" onClick={close}>
					<ArrowLeft size={16} /> Songbook
				</Button>
				<span className="eyebrow">Playing mode</span>
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
						onClick={() => setFontSize((value) => Math.max(14, value - 2))}
					>
						<Minus size={16} />
					</Button>
					<span>Aa</span>
					<Button
						size="icon"
						variant="ghost"
						aria-label="Larger text"
						onClick={() => setFontSize((value) => Math.min(40, value + 2))}
					>
						<Plus size={16} />
					</Button>
				</div>
				<Button
					variant={diagrams ? "secondary" : "ghost"}
					aria-pressed={diagrams}
					onClick={() => setDiagrams((value) => !value)}
				>
					<Guitar size={16} /> Shapes
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
			<div ref={sheet} className="player-scroll">
				<article className="performance-sheet" data-columns={columns}>
					<h1>{shown.data.title}</h1>
					<p className="artist">{shown.data.artist}</p>
					<div className="performance-meta">
						<span>Key {key}</span>
						{capo && shapes ? <span>Capo {capo}</span> : null}
					</div>
					{notes ? <p className="band-note">{notes}</p> : null}
					<SongSheet
						content={shown.data.content}
						semitones={delta}
						fontSize={fontSize}
						columns={columns}
					/>
				</article>
			</div>
			{diagrams ? (
				<section className="player-shapes" aria-label="Chord shapes">
					<ChordDiagrams content={shown.data.content} semitones={delta} />
				</section>
			) : null}
			<footer className="player-footer">
				<Button variant="ghost" onClick={previous} disabled={!previous}>
					<ChevronLeft size={18} /> Previous
				</Button>
				<div className="actions">
					<Button
						variant={scrolling ? "secondary" : "default"}
						onClick={() => setScrolling((value) => !value)}
					>
						{scrolling ? <Pause size={16} /> : <Play size={16} />}
						{scrolling ? "Pause" : "Autoscroll"}
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
				<Button variant="ghost" onClick={next} disabled={!next}>
					Next <ChevronRight size={18} />
				</Button>
			</footer>
		</section>
	);
}
