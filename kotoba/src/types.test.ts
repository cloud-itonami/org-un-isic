/**
 * Pure-helper tests — division→section mapping + hierarchyOf decomposition.
 *
 * These lock down the ISIC Rev.4 section boundaries (A–U) so the seeder
 * cannot silently mis-categorise a class. The mapping is a constitutional
 * fact of ISIC Rev.4 and only changes on a new revision (~10 yr cadence);
 * if these tests start failing, that's a deliberate revision update — not
 * a regression.
 */

import { describe, expect, it } from "vitest";

import { hierarchyOf, sectionForDivision } from "./types.js";

describe("sectionForDivision", () => {
  // Spot-check at each section boundary per the UN ISIC Rev.4 mapping.
  it.each([
    ["01", "A"],
    ["02", "A"],
    ["03", "A"],
    ["05", "B"],
    ["09", "B"],
    ["10", "C"],
    ["33", "C"],
    ["35", "D"],
    ["36", "E"],
    ["39", "E"],
    ["41", "F"],
    ["43", "F"],
    ["45", "G"],
    ["47", "G"],
    ["49", "H"],
    ["53", "H"],
    ["55", "I"],
    ["56", "I"],
    ["58", "J"],
    ["63", "J"],
    ["64", "K"],
    ["66", "K"],
    ["68", "L"],
    ["69", "M"],
    ["75", "M"],
    ["77", "N"],
    ["82", "N"],
    ["84", "O"],
    ["85", "P"],
    ["86", "Q"],
    ["88", "Q"],
    ["90", "R"],
    ["93", "R"],
    ["94", "S"],
    ["96", "S"],
    ["97", "T"],
    ["98", "T"],
    ["99", "U"],
  ])("division %s → section %s", (division, section) => {
    expect(sectionForDivision(division)).toBe(section);
  });

  it("throws on out-of-range division", () => {
    expect(() => sectionForDivision("00")).toThrow();
    expect(() => sectionForDivision("100")).toThrow();
    expect(() => sectionForDivision("foo")).toThrow();
  });
});

describe("hierarchyOf", () => {
  it("decomposes a 4-digit code into section / division / group", () => {
    expect(hierarchyOf("0111")).toEqual({
      section: "A",
      division: "01",
      group: "011",
    });
  });

  it("handles the weapons-manufacturing class (2520)", () => {
    expect(hierarchyOf("2520")).toEqual({
      section: "C",
      division: "25",
      group: "252",
    });
  });

  it("handles section-D edge (35 = electricity, gas, steam, air-con)", () => {
    expect(hierarchyOf("3530")).toEqual({
      section: "D",
      division: "35",
      group: "353",
    });
  });

  it("handles section-U edge (99 = extraterritorial orgs)", () => {
    expect(hierarchyOf("9900")).toEqual({
      section: "U",
      division: "99",
      group: "990",
    });
  });

  it("rejects non-4-digit codes", () => {
    expect(() => hierarchyOf("111")).toThrow(/4 digits/);
    expect(() => hierarchyOf("11111")).toThrow(/4 digits/);
  });
});
