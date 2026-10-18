// Sends an email through Resend's HTTP API. Without a verified domain, Resend's test sender delivers
// only to the address the Resend account was opened with, which is all the one Owner needs (docs/adr/0008).
const SENDER = "Dealflow <onboarding@resend.dev>";

// Resend's error texts can contain the recipient's address, so public logs may show only the status.
export class ResendError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Resend answered ${status}: ${body}`);
  }
}

export async function sendWithResend({ apiKey, to, subject, text }: { apiKey: string; to: string; subject: string; text: string }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER, to: [to], subject, text }),
  });
  if (!response.ok) throw new ResendError(response.status, await response.text());
}
