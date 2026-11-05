import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "chords:theme";

// Runs in <head> before first paint so the page never flashes the wrong theme.
// It also keeps listening, so "System" follows the OS live on every page, /login included.
export const THEME_SCRIPT = `(function(){var m=matchMedia("(prefers-color-scheme: dark)");function a(){try{var t=localStorage.getItem("${KEY}");document.documentElement.classList.toggle("dark",t==="dark"||(t!=="light"&&m.matches))}catch(e){document.documentElement.classList.add("dark")}}a();m.addEventListener("change",a)})()`;

function apply(theme: Theme) {
	const dark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
}

function stored(): Theme {
	try {
		const value = localStorage.getItem(KEY);
		return value === "light" || value === "dark" ? value : "system";
	} catch {
		return "system";
	}
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>("system");
	useEffect(() => setThemeState(stored()), []);
	const setTheme = useCallback((next: Theme) => {
		try {
			if (next === "system") localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, next);
		} catch {}
		apply(next);
		setThemeState(next);
	}, []);
	return { theme, setTheme };
}

/** Same as THEME_SCRIPT, for entry points that render without the server shell. */
export function applyStoredTheme() {
	apply(stored());
	window
		.matchMedia("(prefers-color-scheme: dark)")
		.addEventListener("change", () => apply(stored()));
}
