import Link from "next/link";

export function Nav({ current, waiting }: { current: "feed" | "startups"; waiting: number }) {
  return (
    <header className="top">
      <h1>Dealflow</h1>
      <nav className="tabs">
        <Link href="/feed" className={`tab ${current === "feed" ? "on" : ""}`}>
          Feed {waiting > 0 && <span className="count">{waiting}</span>}
        </Link>
        <Link href="/" className={`tab ${current === "startups" ? "on" : ""}`}>
          All startups
        </Link>
      </nav>
    </header>
  );
}

export function SourceNote() {
  return (
    <footer>
      Registration data comes from the Swiss Official Gazette of Commerce (
      <a href="https://www.shab.ch" target="_blank" rel="noreferrer">
        SHAB, Amtsblattportal
      </a>
      ). This is not an official publication. Text quoted from SHAB is shown with a grey bar. Lanes, one-liners and
      priorities are Dealflow&apos;s assessment; Scorecards and Calls are the Owner&apos;s.
    </footer>
  );
}
