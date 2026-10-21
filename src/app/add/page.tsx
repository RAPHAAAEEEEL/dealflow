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
          Share a link or paste some text, for example a LinkedIn post. Claude drafts which company it is about; you check
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
            <li>Add the action URL Encode (URL codieren) with the Shortcut Input (Kurzbefehleingabe).</li>
            <li>
              Add the action Text with: <code>{origin}/add#url=</code> followed by the encoded result.
            </li>
            <li>Add the action Open URLs (URLs öffnen) with that text.</li>
          </ol>
          <p>
            Then in LinkedIn: copy a post&apos;s text if you want Claude to read it, tap Share, and choose Dealflow. Here, tap
            Paste copied text. Safari has to be signed in once with GitHub.
          </p>
        </details>
        <SourceNote />
      </main>
    </>
  );
}
