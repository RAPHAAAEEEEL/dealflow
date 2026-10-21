import { describe, expect, test } from "vitest";
import { matchStartup, nameKey, websiteDomain } from "./identity";

describe("Startup identity", () => {
  test.each([
    ["Volt Mover GmbH", "volt mover"],
    ["VOLT MOVER", "volt mover"],
    ["Volt-Mover UG (haftungsbeschränkt)", "volt mover"],
    ["Beispiel Prüf AG", "beispiel pruf"],
    ["Beispiel Robotik GmbH & Co. KG", "beispiel robotik"],
    ["Werkstatt e.U.", "werkstatt"],
    ["Solinea Sàrl", "solinea"],
    ["AG", "ag"],
  ])("matches names without their legal form: %s", (name, key) => {
    expect(nameKey(name)).toBe(key);
  });

  test.each([
    ["https://www.volt-mover.de/about", "volt-mover.de"],
    ["volt-mover.de", "volt-mover.de"],
    ["https://www.linkedin.com/company/volt-mover", null],
    ["https://lnkd.in/abc123", null],
    ["https://linktr.ee/voltmover", null],
    ["https://www.deutsche-startups.de/2026/10/20/volt-mover/", null],
    ["not a website", null],
    [null, null],
  ])("matches websites by their domain: %s", (website, domain) => {
    expect(websiteDomain(website)).toBe(domain);
  });

  const kranAG = { id: "1", name: "Beispiel Kran AG", website: null, entities: [{ name: "Beispiel Kran AG", uid: "CHE-100.000.001" }] };

  test("takes the same name without its legal form as the same startup", () => {
    expect(matchStartup([kranAG], { name: "Beispiel Kran", website: null, uid: null, legalName: null })?.id).toBe("1");
  });

  test("takes the same name on two different Legal Entities as two companies", () => {
    expect(matchStartup([kranAG], { name: "Beispiel Kran AG", website: null, uid: "CHE-100.000.999", legalName: "Beispiel Kran AG" })).toBeNull();
  });

  test("never matches a name made only of punctuation", () => {
    const dots = { id: "2", name: "…", website: null, entities: [] };
    expect(matchStartup([dots], { name: "–", website: null, uid: null, legalName: null })).toBeNull();
  });
});
