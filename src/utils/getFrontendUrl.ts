/**
 * Resolves the public frontend URL for outbound emails, invitations, and verification links.
 *
 * Links dispatched to external recipient inboxes (invitations, registration, password resets,
 * device approvals, etc.) must ALWAYS resolve to the official domain (https://meccomputerclub.org),
 * never 'http://localhost:3000', even when testing locally, so that users can click and open them.
 */
export function getEmailFrontendUrl(): string {
  const customEmailUrl = process.env.EMAIL_FRONTEND_URL?.trim();
  if (customEmailUrl) return customEmailUrl.replace(/\/+$/, "");

  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (
    frontendUrl &&
    !frontendUrl.includes("localhost") &&
    !frontendUrl.includes("127.0.0.1")
  ) {
    return frontendUrl.replace(/\/+$/, "");
  }

  return "https://meccomputerclub.org";
}
