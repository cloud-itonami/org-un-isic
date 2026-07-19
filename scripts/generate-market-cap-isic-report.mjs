#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const legacyActorRoot = path.join(projectRoot, 'legacy-actor-components');
const reportsDir = path.join(projectRoot, 'reports');
const outputJsonPath = path.join(reportsDir, 'market-cap-isic-top10.json');
const outputMdPath = path.join(reportsDir, 'market-cap-isic-top10.md');

const sectionNames = {
  A: 'Agriculture, forestry and fishing',
  B: 'Mining and quarrying',
  C: 'Manufacturing',
  D: 'Electricity, gas, steam and air conditioning supply',
  E: 'Water supply; sewerage, waste management and remediation activities',
  F: 'Construction',
  G: 'Wholesale and retail trade; repair of motor vehicles and motorcycles',
  H: 'Transportation and storage',
  I: 'Accommodation and food service activities',
  J: 'Information and communication',
  K: 'Financial and insurance activities',
  L: 'Real estate activities',
  M: 'Professional, scientific and technical activities',
  N: 'Administrative and support service activities',
  O: 'Public administration and defence; compulsory social security',
  P: 'Education',
  Q: 'Human health and social work activities',
  R: 'Arts, entertainment and recreation',
  S: 'Other service activities',
  T: 'Activities of households as employers',
  U: 'Activities of extraterritorial organizations and bodies',
};

function compactUsd(value) {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function normalizeNumber(raw) {
  if (!raw) return NaN;
  return Number(raw.replace(/_/g, ''));
}

function extractMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1] : null;
}

function isicSectionFromCode(code) {
  const normalized = String(code ?? '').trim();
  if (!/^\d{4}$/.test(normalized)) return 'Unknown';
  const division = Number(normalized.slice(0, 2));
  if (division >= 1 && division <= 3) return 'A';
  if (division >= 5 && division <= 9) return 'B';
  if (division >= 10 && division <= 33) return 'C';
  if (division === 35) return 'D';
  if (division >= 36 && division <= 39) return 'E';
  if (division >= 41 && division <= 43) return 'F';
  if (division >= 45 && division <= 47) return 'G';
  if (division >= 49 && division <= 53) return 'H';
  if (division >= 55 && division <= 56) return 'I';
  if (division >= 58 && division <= 63) return 'J';
  if (division >= 64 && division <= 66) return 'K';
  if (division === 68) return 'L';
  if (division >= 69 && division <= 75) return 'M';
  if (division >= 77 && division <= 82) return 'N';
  if (division === 84) return 'O';
  if (division === 85) return 'P';
  if (division >= 86 && division <= 88) return 'Q';
  if (division >= 90 && division <= 93) return 'R';
  if (division >= 94 && division <= 96) return 'S';
  if (division >= 97 && division <= 98) return 'T';
  if (division === 99) return 'U';
  return 'Unknown';
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function parseCompanyFromFile(filePath, text) {
  const ticker = extractMatch(text, /companyTicker\s*=\s*"([^"]+)"/);
  const name = extractMatch(text, /companyName\s*=\s*"([^"]+)"/);
  const mic = extractMatch(text, /exchangeMIC\s*=\s*"([^"]+)"/);
  const isic = extractMatch(text, /isicCode\s*=\s*"([^"]+)"/);
  const marketCapB = extractMatch(text, /MarketCapB:\s*([0-9_]+(?:\.[0-9_]+)?)/);
  const marketCapUSD = extractMatch(text, /MarketCapUSD:\s*([0-9_]+(?:\.[0-9_]+)?)/);
  const sector = extractMatch(text, /Sector:\s*"([^"]+)"/);
  const industry = extractMatch(text, /Industry:\s*"([^"]+)"/);

  if (!ticker || !name || !mic || !isic) return null;
  const cap = marketCapUSD ? normalizeNumber(marketCapUSD) : normalizeNumber(marketCapB) * 1e9;
  if (!Number.isFinite(cap) || cap <= 0) return null;

  return {
    kind: 'company',
    ticker,
    name,
    exchangeMic: mic,
    isicCode: isic,
    isicSection: isicSectionFromCode(isic),
    sector: sector ?? '',
    industry: industry ?? '',
    marketCapUsd: cap,
    sourcePath: path.relative(projectRoot, filePath),
  };
}

function parseExchangeFromFile(filePath, text) {
  const mic = extractMatch(text, /exchangeMIC\s*=\s*"([^"]+)"/);
  const name = extractMatch(text, /exchangeName\s*=\s*"([^"]+)"/);
  const marketCapUSD = extractMatch(text, /MarketCapUSD:\s*([0-9_]+(?:\.[0-9_]+)?)/);
  const totalListed = extractMatch(text, /TotalListed:\s*([0-9_]+)/);
  if (!mic || !name || !marketCapUSD) return null;

  const cap = normalizeNumber(marketCapUSD);
  if (!Number.isFinite(cap) || cap <= 0) return null;

  return {
    kind: 'exchange',
    mic,
    name,
    totalListed: totalListed ? Number(totalListed) : null,
    marketCapUsd: cap,
    sourcePath: path.relative(projectRoot, filePath),
  };
}

function sectionLabel(section) {
  if (section === 'Unknown') return 'Unknown';
  return `${section} ${sectionNames[section] ?? ''}`.trim();
}

function tableHeader(columns) {
  return `| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |`;
}

function renderCompanyRows(entries) {
  return entries
    .map((entry, index) => [
      index + 1,
      escapeMarkdown(entry.name),
      escapeMarkdown(entry.ticker),
      escapeMarkdown(entry.exchangeMic),
      escapeMarkdown(entry.isicCode),
      compactUsd(entry.marketCapUsd),
      escapeMarkdown(entry.sector || '-'),
      escapeMarkdown(entry.industry || '-'),
    ])
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function renderExchangeRows(entries) {
  return entries
    .map((entry, index) => [
      index + 1,
      escapeMarkdown(entry.name),
      escapeMarkdown(entry.mic),
      compactUsd(entry.marketCapUsd),
      entry.totalListed == null ? '-' : entry.totalListed.toLocaleString('en-US'),
    ])
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

async function main() {
  const files = await walk(legacyActorRoot);
  const companyEntries = [];
  const exchangeEntries = [];

  for (const filePath of files) {
    if (!filePath.endsWith('/main.go')) continue;
    const text = await fs.readFile(filePath, 'utf8');
    if (filePath.includes('-org-co-')) {
      const company = parseCompanyFromFile(filePath, text);
      if (company) companyEntries.push(company);
    } else if (filePath.includes('-org-exchange-')) {
      const exchange = parseExchangeFromFile(filePath, text);
      if (exchange) exchangeEntries.push(exchange);
    }
  }

  const companiesByKey = new Map();
  for (const company of companyEntries) {
    const key = `${company.exchangeMic}:${company.ticker}`;
    const previous = companiesByKey.get(key);
    if (!previous || previous.marketCapUsd < company.marketCapUsd) {
      companiesByKey.set(key, company);
    }
  }

  const exchangesByKey = new Map();
  for (const exchange of exchangeEntries) {
    const previous = exchangesByKey.get(exchange.mic);
    if (!previous || previous.marketCapUsd < exchange.marketCapUsd) {
      exchangesByKey.set(exchange.mic, exchange);
    }
  }

  const companies = [...companiesByKey.values()].sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  const exchanges = [...exchangesByKey.values()].sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  const allEntities = [
    ...companies.map((entry) => ({ ...entry, entityKind: 'company' })),
    ...exchanges.map((entry) => ({ ...entry, entityKind: 'exchange' })),
  ].sort((a, b) => b.marketCapUsd - a.marketCapUsd);

  const sections = {};
  for (const company of companies) {
    if (!sections[company.isicSection]) sections[company.isicSection] = [];
    sections[company.isicSection].push(company);
  }
  for (const section of Object.keys(sections)) {
    sections[section].sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  }

  const sectionOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];
  const sectionCoverage = sectionOrder.map((section) => {
    const count = sections[section]?.length ?? 0;
    return {
      section,
      sectionName: sectionNames[section] ?? '',
      implemented: Math.min(10, count),
      available: count,
      coverage: `${Math.min(10, count)}/10`,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'projects/etzhayyim-project-public-companies',
    methodology: {
      marketCapSource: 'Seeded market-cap fields in legacy actor component main.go files',
      coverageDefinition: 'Implemented slots in the repo for each ISIC section top-10 ranking',
      note: 'This is a repo-implementation report, not a live market-data feed.',
    },
    counts: {
      companyEntries: companies.length,
      exchangeEntries: exchanges.length,
      allMarketCapEntities: allEntities.length,
    },
    sectionCoverage,
    sections: sectionOrder.map((section) => ({
      section,
      sectionName: sectionNames[section] ?? '',
      coverage: `${Math.min(10, sections[section]?.length ?? 0)}/10`,
      entries: (sections[section] ?? []).slice(0, 10).map((entry) => ({
        ticker: entry.ticker,
        name: entry.name,
        exchangeMic: entry.exchangeMic,
        isicCode: entry.isicCode,
        marketCapUsd: entry.marketCapUsd,
        sector: entry.sector,
        industry: entry.industry,
        sourcePath: entry.sourcePath,
      })),
    })),
    allMarketCapEntities: allEntities.map((entry) => ({
      entityKind: entry.entityKind,
      ticker: entry.ticker ?? null,
      name: entry.name,
      exchangeMic: entry.exchangeMic ?? entry.mic ?? null,
      isicCode: entry.isicCode ?? null,
      marketCapUsd: entry.marketCapUsd,
      sourcePath: entry.sourcePath,
    })),
    exchanges: exchanges.map((entry) => ({
      mic: entry.mic,
      name: entry.name,
      marketCapUsd: entry.marketCapUsd,
      totalListed: entry.totalListed,
      sourcePath: entry.sourcePath,
    })),
  };

  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [];
  lines.push('# Market Cap / ISIC Coverage Report');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push('');
  lines.push('Methodology: seeded market-cap fields in repo component files; coverage is measured as implemented slots in the repo for each ISIC section top-10 ranking.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Company entries with market cap: ${companies.length}`);
  lines.push(`- Non-company market-cap entities: ${exchanges.length}`);
  lines.push(`- Total market-cap-bearing entities: ${allEntities.length}`);
  lines.push('');
  lines.push('## ISIC Section Coverage');
  lines.push('');
  lines.push(tableHeader(['Section', 'Name', 'Implemented', 'Coverage']));
  for (const row of sectionCoverage) {
    lines.push(`| ${row.section} | ${escapeMarkdown(row.sectionName)} | ${row.available} | ${row.coverage} |`);
  }
  lines.push('');
  lines.push('## All Market-Cap-Bearing Entities');
  lines.push('');
  lines.push(tableHeader(['Rank', 'Kind', 'Entity', 'MIC', 'ISIC', 'Market Cap', 'Source']));
  allEntities.slice(0, 50).forEach((entry, index) => {
    lines.push(`| ${index + 1} | ${entry.entityKind} | ${escapeMarkdown(entry.name)} | ${escapeMarkdown(entry.exchangeMic ?? entry.mic ?? '-')} | ${escapeMarkdown(entry.isicCode ?? '-')} | ${compactUsd(entry.marketCapUsd)} | ${escapeMarkdown(entry.sourcePath)} |`);
  });
  if (allEntities.length > 50) {
    lines.push(`| ... | ... | ${allEntities.length - 50} more entries omitted | ... | ... | ... | ... |`);
  }
  lines.push('');
  lines.push('## ISIC Top 10 By Section');
  lines.push('');
  for (const section of sectionOrder) {
    const entries = (sections[section] ?? []).slice(0, 10);
    lines.push(`### ${sectionLabel(section)}`);
    lines.push('');
    lines.push(`Coverage: ${Math.min(10, sections[section]?.length ?? 0)}/10`);
    lines.push('');
    if (entries.length === 0) {
      lines.push('_No company entries with market cap in this section._');
      lines.push('');
      continue;
    }
    lines.push(tableHeader(['Rank', 'Company', 'Ticker', 'MIC', 'ISIC', 'Market Cap', 'Sector', 'Industry']));
    lines.push(renderCompanyRows(entries));
    lines.push('');
  }
  lines.push('## Non-Company Market Cap Entities');
  lines.push('');
  if (exchanges.length === 0) {
    lines.push('_No non-company market-cap entities were found._');
  } else {
    lines.push(tableHeader(['Rank', 'Entity', 'MIC', 'Market Cap', 'Total Listed']));
    lines.push(renderExchangeRows(exchanges));
  }
  lines.push('');

  await fs.writeFile(outputMdPath, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`Wrote ${path.relative(projectRoot, outputJsonPath)} and ${path.relative(projectRoot, outputMdPath)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
