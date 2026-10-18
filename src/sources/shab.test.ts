import { describe, expect, test } from "vitest";
import { createShabSource } from "./shab";
import { exampleEntry, fakeShabHttp } from "./shab.testing";

describe("SHAB source", () => {
  test("turns a day's new entries into Sightings", async () => {
    const shab = createShabSource(fakeShabHttp({ "2026-10-16": [exampleEntry] }));

    expect(await shab.fetchSightings("2026-10-16")).toEqual([
      {
        source: "SHAB",
        externalId: "pub-robotik",
        publishedOn: "2026-10-16",
        url: "https://www.shab.ch/#!/search/publications/detail/pub-robotik",
        legalEntity: {
          name: "Beispiel Robotik AG",
          uid: "CHE-100.000.001",
          seat: "Zürich (ZH)",
          legalForm: "AG",
          purpose: "Entwicklung und Vertrieb von Robotern, die auf Baustellen Bewehrungseisen verlegen.",
          capitalChf: 100000,
        },
      },
    ]);
  });

  test("never passes on the people named in a publication", async () => {
    const shab = createShabSource(fakeShabHttp({ "2026-10-16": [exampleEntry] }));

    expect(JSON.stringify(await shab.fetchSightings("2026-10-16"))).not.toContain("Muster");
  });

  test("gives an entry without a stated purpose an empty purpose", async () => {
    const { purpose, ...withoutPurpose } = exampleEntry;
    const shab = createShabSource(fakeShabHttp({ "2026-10-16": [withoutPurpose] }));

    const [sighting] = await shab.fetchSightings("2026-10-16");

    expect(sighting.legalEntity.purpose).toBe("");
  });

  test("collects every entry of a day that spans several result pages", async () => {
    const day = ["a", "b", "c"].map((k) => ({ ...exampleEntry, id: `pub-${k}`, name: `Beispiel ${k} AG` }));
    const shab = createShabSource(fakeShabHttp({ "2026-10-16": day }), { pageSize: 2 });

    const names = (await shab.fetchSightings("2026-10-16")).map((s) => s.legalEntity.name);

    expect(names).toEqual(["Beispiel a AG", "Beispiel b AG", "Beispiel c AG"]);
  });
});
