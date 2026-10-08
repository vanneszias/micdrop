import { Button } from "@chords/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		let enabled = window.matchMedia("(prefers-color-scheme: dark)").matches;
		try {
			const saved = localStorage.getItem("chords:theme");
			if (saved) enabled = saved === "dark";
		} catch {
			/* System appearance works when storage is unavailable. */
		}
		document.documentElement.classList.toggle("dark", enabled);
		setDark(enabled);
	}, []);
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
			title={dark ? "Switch to light mode" : "Switch to dark mode"}
			onClick={() => {
				const enabled = !dark;
				setDark(enabled);
				document.documentElement.classList.toggle("dark", enabled);
				try {
					localStorage.setItem("chords:theme", enabled ? "dark" : "light");
				} catch {
					/* Appearance remains available without preference storage. */
				}
			}}
		>
			{dark ? <Sun size={16} /> : <Moon size={16} />}
		</Button>
	);
}
