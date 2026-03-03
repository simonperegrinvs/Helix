import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lcovPath = resolve(process.cwd(), process.argv[2] ?? "apps/server/coverage/lcov.info");
const minOverall = Number(process.env.HELIX_COVERAGE_MIN_OVERALL ?? 80);
const minDomain = Number(process.env.HELIX_COVERAGE_MIN_DOMAIN ?? 90);
const minApplication = Number(process.env.HELIX_COVERAGE_MIN_APPLICATION ?? 85);

const text = readFileSync(lcovPath, "utf8");
const lines = text.split(/\r?\n/);

const records = [];
let current = null;

for (const line of lines) {
  if (line.startsWith("SF:")) {
    if (current) {
      records.push(current);
    }
    current = { file: line.slice(3), total: 0, covered: 0 };
    continue;
  }

  if (line.startsWith("DA:") && current) {
    const [lineNo, hits] = line.slice(3).split(",");
    if (!lineNo || !hits) {
      continue;
    }

    current.total += 1;
    if (Number(hits) > 0) {
      current.covered += 1;
    }
    continue;
  }

  if (line === "end_of_record" && current) {
    records.push(current);
    current = null;
  }
}

if (current) {
  records.push(current);
}

const normalized = records
  .map((record) => ({
    ...record,
    file: record.file.replace(/\\/g, "/").replace(/^\.\//, ""),
  }))
  .map((record) => ({
    ...record,
    canonicalFile: record.file.startsWith("src/") ? `apps/server/${record.file}` : record.file,
  }))
  .filter(
    (record) =>
      record.canonicalFile.includes("apps/server/src/") &&
      !record.canonicalFile.includes("/tests/") &&
      !record.canonicalFile.includes("/contracts/") &&
      !record.canonicalFile.includes("/shared/testing/") &&
      !record.canonicalFile.endsWith(".test.ts"),
  );

const aggregate = (predicate) => {
  const selected = normalized.filter((record) => predicate(record.canonicalFile));
  const total = selected.reduce((sum, record) => sum + record.total, 0);
  const covered = selected.reduce((sum, record) => sum + record.covered, 0);
  const pct = total === 0 ? 100 : (covered / total) * 100;
  return { total, covered, pct, n: selected.length };
};

const overall = aggregate(() => true);
const domain = aggregate((record) => record.includes("/domain/"));
const application = aggregate((record) => record.includes("/application/"));

const checks = [
  { name: "overall", value: overall.pct, min: minOverall, total: overall.total, files: overall.n },
  { name: "domain", value: domain.pct, min: minDomain, total: domain.total, files: domain.n },
  {
    name: "application",
    value: application.pct,
    min: minApplication,
    total: application.total,
    files: application.n,
  },
];

console.log("Coverage thresholds");
for (const check of checks) {
  const status = check.value >= check.min ? "PASS" : "FAIL";
  const suffix = check.total === 0 ? "(no files matched)" : "";
  console.log(
    `- ${check.name}: ${check.value.toFixed(2)}% (min ${check.min}%) ${status} ${suffix}`,
  );
}

const failures = checks.filter((check) => check.value < check.min);
if (overall.total === 0 || failures.length > 0) {
  process.exit(1);
}
