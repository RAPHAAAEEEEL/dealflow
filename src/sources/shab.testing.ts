import type { ShabHttp } from "./shab";

// Test double for the SHAB API. It serves list pages and publication XML in the real format,
// built from invented registrations. Real responses name the founders, so test data is never
// recorded from the live API (docs/adr/0003).

export type FakeRegistration = {
  id: string;
  name: string;
  uid: string;
  seat: string;
  legalFormCode: string;
  purpose?: string; // a few real entries come without one
  capital?: number;
  // People appear only inside the free publication text, as in the real data.
  persons?: string[];
};

// An invented robotics AG that tests vary with spreads.
export const exampleEntry: FakeRegistration = {
  id: "pub-robotik",
  name: "Beispiel Robotik AG",
  uid: "CHE-100.000.001",
  seat: "Zürich (ZH)",
  legalFormCode: "0106",
  purpose: "Entwicklung und Vertrieb von Robotern, die auf Baustellen Bewehrungseisen verlegen.",
  capital: 100000,
  persons: ["Muster, Max, deutscher Staatsangehöriger, in Zürich, Mitglied, mit Einzelunterschrift"],
};

export function fakeShabHttp(days: Record<string, FakeRegistration[]>): ShabHttp {
  return {
    async fetchNewRegistrations(date, page, size) {
      const all = days[date] ?? [];
      return JSON.stringify({
        content: all.slice(page * size, (page + 1) * size).map((r) => ({
          meta: {
            id: r.id,
            rubric: "HR",
            subRubric: "HR01",
            publicationDate: `${date}T00:00:00.000Z`,
            title: { de: `Neueintragung ${r.name}, ${r.seat}` },
          },
          links: [],
          content: null,
        })),
        total: all.length,
        pageRequest: { sortOrders: [], page, size },
      });
    },
    async fetchPublicationXml(id) {
      for (const [date, registrations] of Object.entries(days)) {
        const r = registrations.find((x) => x.id === id);
        if (r) return hr01Xml(r, date);
      }
      throw new Error(`Unknown publication ${id}`);
    },
  };
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hr01Xml(r: FakeRegistration, date: string): string {
  const capital = r.capital === undefined ? "" : `CHF ${r.capital.toLocaleString("de-CH")}.00. `;
  const people = r.persons?.length ? `Eingetragene Personen: ${r.persons.join("; ")}.` : "";
  const purpose = r.purpose === undefined ? "" : `Zweck: ${r.purpose} `;
  const text = `${r.name}, in ${r.seat}, ${r.uid}, Neueintragung. ${purpose}${capital}${people}`;
  return `<?xml version='1.0' encoding='UTF-8'?>
<HR01:publication xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:HR01="https://shab.ch/shab/HR01-export">
<meta>
  <id>${r.id}</id>
  <rubric>HR</rubric>
  <subRubric>HR01</subRubric>
  <language>de</language>
  <publicationNumber>HR01-${r.id}</publicationNumber>
  <publicationState>PUBLISHED</publicationState>
  <publicationDate>${date}</publicationDate>
  <title><de>${xml(`Neueintragung ${r.name}, ${r.seat}`)}</de></title>
</meta>
<content>
  <testImport>false</testImport>
  <publicationText>${xml(text)}</publicationText>
  <commonsNew>
    <company>
      <name>${xml(r.name)}</name>
      <uid>${r.uid}</uid>
      <seat>${xml(r.seat)}</seat>
      <legalForm>${r.legalFormCode}</legalForm>
      <noAddress>false</noAddress>
    </company>
    ${r.purpose === undefined ? "" : `<purpose>${xml(r.purpose)}</purpose>`}
    ${r.capital === undefined ? "" : `<capital><nominal>${r.capital.toFixed(2)}</nominal><paid>${r.capital.toFixed(2)}</paid></capital>`}
  </commonsNew>
  <transaction><registration>true</registration></transaction>
</content>
</HR01:publication>`;
}
