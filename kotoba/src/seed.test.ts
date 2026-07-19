/**
 * Pure-helper test for the seeder's source-record → IsicClass converter.
 * No SDK / network — locks down the conversion contract independently of
 * any PDS roundtrip.
 */

import { describe, expect, it } from "vitest";

import { toIsicClass } from "./seed.js";

describe("toIsicClass", () => {
  it("derives section / division / group from code; defaults publishedAt", () => {
    const out = toIsicClass({
      code: "0111",
      nameEn: "Growing of cereals (except rice), leguminous crops and oil seeds",
      group: "011",
      description: "This class includes …",
      includes: ["growing of cereals such as: wheat…"],
      excludes: ["growing of rice, see 0112"],
    });
    expect(out.code).toBe("0111");
    expect(out.section).toBe("A");
    expect(out.division).toBe("01");
    expect(out.group).toBe("011");
    expect(out.publishedAt).toBe("2008-01-01T00:00:00Z");
    expect(out.includes).toHaveLength(1);
    expect(out.excludes).toHaveLength(1);
  });

  it("preserves source implementedAt as publishedAt", () => {
    const out = toIsicClass({
      code: "2520",
      nameEn: "Manufacture of weapons and ammunition",
      implementedAt: "2026-04-15T00:00:00Z",
    });
    expect(out.publishedAt).toBe("2026-04-15T00:00:00Z");
    expect(out.section).toBe("C");
  });

  it("treats absent includes/excludes as undefined (not empty arrays)", () => {
    const out = toIsicClass({code: "3530", nameEn: "Steam and air conditioning supply"});
    expect(out.includes).toBeUndefined();
    expect(out.excludes).toBeUndefined();
    expect(out.section).toBe("D");
  });
});
