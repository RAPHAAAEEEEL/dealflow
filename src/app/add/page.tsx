import { headers } from "next/headers";
import { getTriage } from "../db";
import { Nav, SourceNote } from "../nav";
import { requireOwner } from "../owner";
import { QuickAddForm } from "./quick-add-form";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  await requireOwner();
  const waiting = (await (await getTriage()).queue()).length;
  const origin = `https://${(await headers()).get("host") ?? "dealflow-snowy.vercel.app"}`;

  return (
    <>
      <Nav current="add" waiting={waiting} />
      <main className="main feed">
        <h2 className="feed-title">Quick Add</h2>
        <p className="muted small">
          Share a link or paste some text, for example a LinkedIn post. Claude drafts which startup it is about; you check
          the draft and add it. LinkedIn itself is never opened, and the text you share is never stored.
        </p>
        <QuickAddForm />
        <details className="card small">
          <summary>
            <b>Set up sharing from the iPhone</b>
          </summary>
          <ol>
            <li>Open the Shortcuts app (Kurzbefehle), tap +, and name the shortcut Dealflow.</li>
            <li>Tap the info button and turn on Show in Share Sheet (Im Share-Sheet anzeigen). Accept URLs and Text.</li>
            <li>Add URL Encode (URL codieren) with the Shortcut Input (Kurzbefehleingabe).</li>
            <li>Add Get Clipboard (Zwischenablage abrufen), then URL Encode (URL codieren) with the Clipboard.</li>
            <li>
              Add Text with <code>{origin}/add#share=</code>, the first encoded result, <code>&amp;text=</code> and the second encoded
              result, all in one line.
            </li>
            <li>Add Open URLs (URLs öffnen) with that text.</li>
          </ol>
          <p>
            Then in LinkedIn: copy a post&apos;s text if Claude should read it, tap Share and choose Dealflow. Claude&apos;s draft
            appears here; check it and add it. What you share stays in the address after #, which never reaches the server.
            Safari has to be signed in once with GitHub.
          </p>
        </details>
        <SourceNote />
      </main>
    </>
  );
}
