import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "chords:theme";

// Runs in <head> before first paint so the page never flashes the wrong theme.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.add("dark")}})()`;

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
	useEffect(() => {
		if (theme !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => apply("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme]);
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
}
