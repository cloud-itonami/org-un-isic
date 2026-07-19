/**
 * Mirrors the com.etzhayyim.apps.openIsic.class Lexicon record shape.
 * Source: 00-contracts/lexicons/com/etzhayyim/apps/openIsic/class.json
 */
export interface IsicClass {
  /** ISIC Rev.4 4-digit class code (e.g. "0111", "2520"). */
  code: string;

  /** Canonical English name. */
  nameEn: string;

  /** ISIC section, 1 letter A–U (derived from `division`). */
  section: string;

  /** ISIC division, 2 digits = code.slice(0, 2). */
  division: string;

  /** ISIC group, 3 digits = code.slice(0, 3). */
  group: string;

  /** Free-text description as published by the UN ISIC Rev.4 source. */
  description?: string;

  /** Inclusions — activities explicitly covered by this class. */
  includes?: string[];

  /** Exclusions — activities deliberately routed to other classes. */
  excludes?: string[];

  /**
   * Optional CID of the ISIC Rev.4 handbook chapter PDF, set by the
   * seeder when blob-attached via `e.write({blobs: {handbook: pdfBlob}})`.
   */
  handbookCid?: string;

  /** ISO datetime when this class entry was published in the ISIC revision. */
  publishedAt: string;
}

/**
 * Pure helper: 4-digit ISIC code → section (1 letter A–U) per the UN
 * ISIC Rev.4 division → section mapping.
 *
 * Boundary ranges (division 2-digit → section):
 *   01–03 A   05–09 B   10–33 C   35    D    36–39 E
 *   41–43 F   45–47 G   49–53 H   55–56 I    58–63 J
 *   64–66 K   68    L    69–75 M   77–82 N    84    O
 *   85    P   86–88 Q   90–93 R   94–96 S    97–98 T
 *   99    U
 */
export function sectionForDivision(division: string): string {
  const d = Number(division);
  if (Number.isNaN(d) || d < 1 || d > 99) {
    throw new Error(`invalid ISIC division: ${division}`);
  }
  if (d <= 3) return "A";
  if (d <= 9) return "B";
  if (d <= 33) return "C";
  if (d === 35) return "D";
  if (d <= 39) return "E";
  if (d <= 43) return "F";
  if (d <= 47) return "G";
  if (d <= 53) return "H";
  if (d <= 56) return "I";
  if (d <= 63) return "J";
  if (d <= 66) return "K";
  if (d === 68) return "L";
  if (d <= 75) return "M";
  if (d <= 82) return "N";
  if (d === 84) return "O";
  if (d === 85) return "P";
  if (d <= 88) return "Q";
  if (d <= 93) return "R";
  if (d <= 96) return "S";
  if (d <= 98) return "T";
  return "U";
}

/** Derive (section, division, group) from a 4-digit code. */
export function hierarchyOf(code: string): {
  section: string;
  division: string;
  group: string;
} {
  if (code.length !== 4) throw new Error(`ISIC code must be 4 digits: ${code}`);
  const division = code.slice(0, 2);
  return {
    section: sectionForDivision(division),
    division,
    group: code.slice(0, 3),
  };
}
