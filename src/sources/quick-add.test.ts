import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { entryNamed, runShabDay } from "@/jobs/shab-job.testing";
import { createRadar } from "@/radar/radar";
import { fakeJudge, inLane } from "@/screening/judge.testing";
import { createTriage } from "@/triage/triage";
import { createQuickAdd, QuickAddError, type QuickAddDraft } from "./quick-add";
import { fakeStartupReader, fakePages } from "./quick-add.testing";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

const NOW = "2026-10-21T09:00:00Z";

function quickAdd({ reader = fakeStartupReader([{}]).reader, pages = fakePages().fetcher, monthlyCapUsd = 10 } = {}) {
  return createQuickAdd(db, {
    reader,
    pages,
    criteria: { version: 2, text: "Lanes." },
    monthlyCapUsd,
    now: () => new Date(NOW),
  });
}

const draft = (overrides: Partial<QuickAddDraft> = {}): QuickAddDraft => ({
  name: "Volt Mover",
  website: "https://volt-mover.de",
  country: "DE",
  hq: "Berlin",
  lane: "robotics",
  secondaryLane: null,
  oneLiner: "Autonomous electric tugs that move trailers around logistics yards.",
  stage: "Pre-seed",
  link: "https://www.linkedin.com/company/volt-mover",
  note: "",
  ...overrides,
});

describe("Quick Add preview", () => {
  test("drafts the startup Claude reads from what the Owner shared", async () => {
    const { reader, calls } = fakeStartupReader([{}]);

    const { draft: preview } = await quickAdd({ reader }).preview({ text: "Volt Mover just launched its yard robot.", url: "" });

    expect({ preview, toClaude: calls[0].text }).toEqual({
      preview: {
        name: "Volt Mover",
        website: null,
        country: "DE",
        hq: "Berlin",
        lane: "robotics",
        secondaryLane: null,
        oneLiner: "Autonomous electric tugs that move trailers around logistics yards.",
        stage: "Pre-seed",
        link: null,
        note: "",
      },
      toClaude: "Volt Mover just launched its yard robot.",
    });
  });

  test("reads the startup's website once Claude names it, and drafts from both", async () => {
    const { reader, calls } = fakeStartupReader([{ website: "https://volt-mover.de" }, { website: "https://volt-mover.de", city: "Hamburg" }]);
    const { fetcher, fetched } = fakePages({ "https://volt-mover.de": "Volt Mover builds yard tugs. Based in Hamburg." });

    const { draft: preview } = await quickAdd({ reader, pages: fetcher }).preview({ text: "Volt Mover is hiring.", url: "" });

    expect({ fetched, pagesGivenToClaude: calls.map((c) => c.pages.map((p) => p.url)), hq: preview.hq }).toEqual({
      fetched: ["https://volt-mover.de"],
      pagesGivenToClaude: [[], ["https://volt-mover.de"]],
      hq: "Hamburg",
    });
  });

  test("opens a shared link that isn't LinkedIn, such as an article", async () => {
    const { reader, calls } = fakeStartupReader([{}]);
    const { fetcher } = fakePages({ "https://news.example/volt-mover": "Volt Mover raises a pre-seed round." });

    const { draft: preview } = await quickAdd({ reader, pages: fetcher }).preview({ text: "", url: "https://news.example/volt-mover" });

    expect({ pages: calls[0].pages, link: preview.link }).toEqual({
      pages: [{ url: "https://news.example/volt-mover", text: "Volt Mover raises a pre-seed round." }],
      link: "https://news.example/volt-mover",
    });
  });

  test.each([
    ["https://www.linkedin.com/company/volt-mover/", "volt-mover", "https://www.linkedin.com/company/volt-mover"],
    ["https://www.linkedin.com/in/max-muster-123/", null, null],
    ["https://www.linkedin.com/posts/max-muster_yard-robots-activity-7300000000000000000-abcd", null, null],
  ])("never opens LinkedIn, and keeps only company pages as the link (%s)", async (url, companyHint, link) => {
    const { reader, calls } = fakeStartupReader([{}]);
    const { fetcher, fetched } = fakePages();

    const { draft: preview } = await quickAdd({ reader, pages: fetcher }).preview({ text: "Volt Mover is building yard robots.", url });

    expect({ fetched, hint: calls[0].linkedinCompany, link: preview.link }).toEqual({ fetched: [], hint: companyHint, link });
  });

  test("tells the Owner when the radar already knows the startup, before anything is added", async () => {
    await runShabDay(db, "2026-10-16", { entries: [entryNamed("Volt Mover AG")], judge: fakeJudge({ otherwise: inLane("robotics", 70, "Yard robots.") }) });

    const { known } = await quickAdd().preview({ text: "Volt Mover builds yard robots.", url: "" });

    expect(known).toEqual({ name: "Volt Mover AG", status: "Candidate" });
  });

  test("passes on Claude's caveat when the startup looks past the Stage Rule", async () => {
    const { reader } = fakeStartupReader([{ pastStageRule: true, reason: "Raised a €12M Series A in 2025." }]);

    expect((await quickAdd({ reader }).preview({ text: "Volt Mover closes Series A.", url: "" })).draft.note).toBe(
      "Probably past the Stage Rule: Raised a €12M Series A in 2025.",
    );
  });

  test("says what's missing when Claude can't tell which startup it is", async () => {
    const { reader } = fakeStartupReader([{ found: false, reason: "The post names no company." }]);

    await expect(quickAdd({ reader }).preview({ text: "Great week at the conference!", url: "" })).rejects.toThrow(
      new QuickAddError("Claude couldn't tell which startup this is: The post names no company. Add its name or website and try again."),
    );
  });

  test("refuses an empty share", async () => {
    await expect(quickAdd().preview({ text: "  ", url: "" })).rejects.toThrow(QuickAddError);
  });

  test("stops before the month's Claude budget is spent", async () => {
    const { reader } = fakeStartupReader([{}], 0.001);
    const add = quickAdd({ reader, monthlyCapUsd: 0.0015 });
    await add.preview({ text: "Volt Mover", url: "" });

    await expect(add.preview({ text: "Volt Mover", url: "" })).rejects.toThrow("The month's Claude budget is used up");
  });
});

describe("Quick Add", () => {
  test("puts the confirmed startup on the radar as a Candidate at the front of the queue", async () => {
    await runShabDay(db, "2026-10-16", { entries: [entryNamed("Beispiel Kran AG")], judge: fakeJudge({ otherwise: inLane("robotics", 90, "Cranes.") }) });

    await quickAdd().add(draft());

    const [first] = await createTriage(db, { now: () => new Date(NOW) }).queue();
    expect(first).toMatchObject({
      name: "Volt Mover",
      lane: "robotics",
      stage: "Pre-seed",
      status: "Candidate",
      hq: "Berlin",
      country: "DE",
      website: "https://volt-mover.de",
      firstSeen: "2026-10-21",
      latestSignal: {
        date: "2026-10-21",
        source: "Quick Add",
        text: "Added by the Owner: Autonomous electric tugs that move trailers around logistics yards.",
        url: "https://www.linkedin.com/company/volt-mover",
      },
    });
  });

  test("adds a Signal to a startup the radar already knows by its name without the legal form", async () => {
    await runShabDay(db, "2026-10-16", {
      entries: [entryNamed("Volt Mover AG")],
      judge: fakeJudge({ otherwise: inLane("robotics", 70, "Yard robots.") }),
    });

    const { known, startupId } = await quickAdd().add(draft());

    const profile = await createRadar(db).profile(startupId);
    expect({ known, startups: (await createRadar(db).list()).length, signals: profile?.timeline.map((t) => t.kind === "signal" && t.source) }).toEqual({
      known: true,
      startups: 1,
      signals: ["Quick Add", "SHAB"],
    });
  });

  test("never stores a LinkedIn profile or post as the link, even if one is sent back", async () => {
    const { startupId } = await quickAdd().add(draft({ link: "https://www.linkedin.com/in/max-muster-123/" }));

    expect((await createRadar(db).profile(startupId))?.latestSignal?.url).toBeNull();
  });

  test.each([
    [{ name: " " }, "A Quick Add needs the startup's name."],
    [{ lane: null }, "Choose the Lane it is closest to."],
    [{ country: "" }, "Choose the country of its headquarters."],
    [{ oneLiner: "" }, "Add a one-line description."],
    [{ stage: "Series A" as never }, "Choose its stage."],
  ] as const)("refuses an incomplete draft (%o)", async (overrides, message) => {
    await expect(quickAdd().add(draft(overrides))).rejects.toThrow(new QuickAddError(message));
  });
});
