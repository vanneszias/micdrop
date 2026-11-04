import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

type TurnstileApi = {
	render: (
		element: HTMLElement,
		options: {
			sitekey: string;
			callback: (token: string) => void;
			"expired-callback": () => void;
			"error-callback": () => void;
			appearance?: "always" | "execute" | "interaction-only";
		},
	) => string;
	remove: (widget: string) => void;
};
declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

let loading: Promise<TurnstileApi> | undefined;
function loadTurnstile() {
	loading ??= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src =
			"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		script.async = true;
		script.onload = () =>
			window.turnstile ? resolve(window.turnstile) : reject();
		script.onerror = () => {
			loading = undefined;
			reject(new Error("The bot check could not load."));
		};
		document.head.appendChild(script);
	});
	return loading;
}

/**
 * Cloudflare Turnstile. Tokens are single use, so remount it (change its key) after each
 * attempt. Reports "" whenever there is no valid token.
 */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
	const element = useRef<HTMLDivElement>(null);
	const callback = useRef(onToken);
	callback.current = onToken;
	useEffect(() => {
		const sitekey = TURNSTILE_SITE_KEY;
		if (!sitekey) return;
		let widget: string | undefined;
		let cancelled = false;
		void loadTurnstile()
			.then((turnstile) => {
				if (cancelled || !element.current) return;
				widget = turnstile.render(element.current, {
					sitekey,
					appearance: "interaction-only",
					callback: (token) => callback.current(token),
					"expired-callback": () => callback.current(""),
					"error-callback": () => callback.current(""),
				});
			})
			.catch(() => callback.current(""));
		return () => {
			cancelled = true;
			if (widget) window.turnstile?.remove(widget);
		};
	}, []);
	return TURNSTILE_SITE_KEY ? <div ref={element} /> : null;
}
