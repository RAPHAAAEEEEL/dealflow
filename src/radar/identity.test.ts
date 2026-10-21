import { describe, expect, test } from "vitest";
import { nameKey, websiteDomain } from "./identity";

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
    ["not a website", null],
    [null, null],
  ])("matches websites by their domain: %s", (website, domain) => {
    expect(websiteDomain(website)).toBe(domain);
  });
});
