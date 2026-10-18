// Builds the Sunday digest and emails it to the Owner (docs/adr/0008).
//   npm run digest              send it (needs RESEND_API_KEY and DEALFLOW_DIGEST_TO)
//   npm run digest -- --print   show it here instead, on your own machine only
// Uses the hosted database when DATABASE_URL is set, else the local one.
import { connect } from "@/db";
import { buildDigest } from "@/digest/digest";
import { ResendError, sendWithResend } from "@/digest/resend";

const print = process.argv.includes("--print");
const { RESEND_API_KEY: apiKey, DEALFLOW_DIGEST_TO: to, CI } = process.env;

if (print && CI) {
  console.error("--print would put company names into a public log. Run it on your own machine.");
  process.exit(1);
}
if (!print && (!apiKey || !to)) {
  console.error("Sending needs RESEND_API_KEY and DEALFLOW_DIGEST_TO. Set them with the setup wizard: ONLY=11");
  process.exit(1);
}

const { db, close } = await connect({ migrateHosted: false });
try {
  const digest = await buildDigest({
    db,
    now: () => new Date(),
    monthlyCapUsd: Number(process.env.DEALFLOW_MONTHLY_CAP_USD ?? 10),
    shabTermsAcceptedOn: process.env.SHAB_TERMS_ACCEPTED_ON ?? "",
    appUrl: process.env.DEALFLOW_APP_URL ?? "http://localhost:3000",
  });
  if (print) {
    console.log(`Subject: ${digest.subject}\n\n${digest.text}`);
  } else {
    await sendWithResend({ apiKey: apiKey!, to: to!, subject: digest.subject, text: digest.text });
    // Counts only: the CI log of a public repo never shows names (docs/adr/0007).
    console.log(`Digest sent with ${digest.problems} warning${digest.problems === 1 ? "" : "s"}.`);
  }
} catch (error) {
  if (!CI) console.error(error);
  else if (error instanceof ResendError) console.error(`Resend answered ${error.status}. Check the key and the address with the setup wizard: ONLY=11`);
  else console.error(`The digest broke off (${error instanceof Error ? error.name : "error"}).`);
  process.exitCode = 1;
} finally {
  await close();
}
