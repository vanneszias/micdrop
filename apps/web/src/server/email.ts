/** Server-only transactional mail. Cloudflare simulates delivery during local development. */
export function sendEmail(
	binding: SendEmail,
	message: { to: string; subject: string; text: string; html: string },
) {
	return binding.send({ ...message, from: "welcome@micdrop.day" });
}

/** How long a verification or email-change link stays valid, in seconds. */
export const VERIFICATION_EXPIRES_IN = 86_400;
/** Verification links in reminders to existing accounts, which people may open days later. */
export const REMINDER_EXPIRES_IN = 7 * 86_400;

export type AuthEmailKind =
	| "welcome"
	| "verify"
	| "reminder"
	| "change"
	| "reset";

const TEMPLATES: Record<
	AuthEmailKind,
	{ subject: string; description: string; action: string; expires: string }
> = {
	welcome: {
		subject: "Welcome to Mic Drop — verify your email",
		description:
			"Welcome to Mic Drop! Confirm your email address to finish setting up your account.",
		action: "Verify email",
		expires: "24 hours",
	},
	verify: {
		subject: "Confirm your Mic Drop email address",
		description:
			"Confirm this email address for your Mic Drop account. A verified address lets you recover your account and join bands.",
		action: "Verify email",
		expires: "24 hours",
	},
	reminder: {
		subject: "Confirm your Mic Drop email address",
		description:
			"Mic Drop now sends account email, so we ask everyone to confirm their address once. A verified address lets you recover your account and join bands.",
		action: "Verify email",
		expires: "7 days",
	},
	change: {
		subject: "Approve your new Mic Drop email address",
		description:
			"Someone asked to change the email address of your Mic Drop account to {newEmail}. Approve it, and we’ll send a confirmation link to the new address.",
		action: "Approve change",
		expires: "24 hours",
	},
	reset: {
		subject: "Reset your Mic Drop password",
		description:
			"Use the link below to choose a new password for your Mic Drop account.",
		action: "Reset password",
		expires: "one hour",
	},
};

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

export function authEmail(
	kind: AuthEmailKind,
	url: string,
	{ newEmail = "" }: { newEmail?: string } = {},
) {
	const template = TEMPLATES[kind];
	const description = template.description.replace("{newEmail}", newEmail);
	const footer = `This link expires in ${template.expires}. If you didn’t request this, you can ignore this email.`;
	return {
		subject: template.subject,
		text: `${description}\n\n${template.action}: ${url}\n\n${footer}`,
		html: `<h1>${template.subject}</h1><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(url)}">${template.action}</a></p><p>${footer}</p>`,
	};
}
