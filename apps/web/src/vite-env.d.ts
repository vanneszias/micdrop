/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	/** Public Turnstile site key; sign-up shows the check only when it is set at build time. */
	readonly VITE_TURNSTILE_SITE_KEY?: string;
}
