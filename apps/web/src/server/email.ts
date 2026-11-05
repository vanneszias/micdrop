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

export const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** Brand colours from styles.css, as hex because mail clients ignore oklch. */
const BRAND = {
	amber: "#df911a",
	ink: "#281606",
	text: "#1a1512",
	muted: "#5d5751",
	page: "#faf9f6",
	border: "#e0deda",
};
const FONT =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Table layout with inline styles, the only markup every mail client renders alike. */
function layout({
	origin,
	title,
	body,
	action,
	url,
	footer,
}: {
	origin: string;
	title: string;
	body: string;
	action: string;
	url: string;
	footer: string;
}) {
	const href = escapeHtml(url);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:${BRAND.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};font-family:${FONT};color:${BRAND.text};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;"><a href="${escapeHtml(origin)}" style="text-decoration:none;color:${BRAND.text};"><img src="${escapeHtml(origin)}/icon-192.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px;"> <span style="vertical-align:middle;font-size:17px;font-weight:600;">Mic Drop</span></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;padding:32px 28px;">
<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;font-weight:600;">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.text};">${body}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${BRAND.amber};"><a href="${href}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:${BRAND.ink};text-decoration:none;border-radius:10px;">${escapeHtml(action)}</a></td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(footer)}</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};word-break:break-all;">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:${BRAND.muted};">${href}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">Mic Drop · Your chord sheets, in your key.<br><a href="${escapeHtml(origin)}" style="color:${BRAND.muted};">${escapeHtml(new URL(origin).host)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function authEmail(
	kind: AuthEmailKind,
	url: string,
	{ newEmail = "" }: { newEmail?: string } = {},
) {
	const template = TEMPLATES[kind];
	const description = template.description.replace("{newEmail}", newEmail);
	const footer = `This link expires in ${template.expires}. If you didn’t request this, you can ignore this email.`;
	// Links point at the deployment that sent them, so previews brand with their own assets.
	const origin = new URL(url).origin;
	return {
		subject: template.subject,
		text: `${description}\n\n${template.action}: ${url}\n\n${footer}\n\n— Mic Drop\n${origin}`,
		html: layout({
			origin,
			title: template.subject,
			body: escapeHtml(description),
			action: template.action,
			url,
			footer,
		}),
	};
}
