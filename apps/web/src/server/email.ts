/** Server-only transactional mail. Cloudflare simulates delivery during local development. */
export function sendEmail(
	binding: SendEmail,
	message: { to: string; subject: string; text: string; html: string },
) {
	return binding.send({ ...message, from: "welcome@micdrop.day" });
}

export function authEmail(kind: "verification" | "reset", url: string) {
	const verification = kind === "verification";
	const subject = verification
		? "Welcome to Mic Drop — verify your email"
		: "Reset your Mic Drop password";
	const description = verification
		? "Welcome to Mic Drop! Confirm your email address to finish setting up your account."
		: "Use the link below to choose a new password for your Mic Drop account.";
	const action = verification ? "Verify email" : "Reset password";
	const footer =
		"This link expires in one hour. If you didn’t request this, you can ignore this email.";
	const safeUrl = url.replace(
		/[&<>"']/g,
		(character) => `&#${character.charCodeAt(0)};`,
	);
	return {
		subject,
		text: `${description}\n\n${action}: ${url}\n\n${footer}`,
		html: `<h1>${subject}</h1><p>${description}</p><p><a href="${safeUrl}">${action}</a></p><p>${footer}</p>`,
	};
}
