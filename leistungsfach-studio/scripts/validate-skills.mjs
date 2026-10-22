// Validates every .claude/skills/*/SKILL.md: YAML frontmatter, name/description rules, non-trivial body.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = join(process.cwd(), ".claude", "skills");
const required = [
  "bavarian-english-leistungsfach",
  "essay-assessment",
  "essay-revision",
  "learner-modelling",
  "adaptive-tutoring",
  "progress-evaluation",
];
const errors = [];
const dirs = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];

for (const name of required) if (!dirs.includes(name)) errors.push(`missing skill directory: ${name}`);

for (const dir of dirs) {
  const file = join(root, dir, "SKILL.md");
  if (!existsSync(file)) { errors.push(`${dir}: SKILL.md missing`); continue; }
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) { errors.push(`${dir}: no YAML frontmatter delimited by ---`); continue; }
  let fm;
  try { fm = parse(m[1]); } catch (e) { errors.push(`${dir}: invalid YAML: ${e.message}`); continue; }
  if (!fm || typeof fm !== "object") { errors.push(`${dir}: frontmatter is not a mapping`); continue; }
  if (fm.name !== dir) errors.push(`${dir}: name "${fm.name}" must equal directory name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(fm.name ?? ""))) errors.push(`${dir}: name must be lowercase kebab-case`);
  if (typeof fm.description !== "string" || fm.description.length < 80) errors.push(`${dir}: description missing or too short`);
  else if (fm.description.length > 1024) errors.push(`${dir}: description exceeds 1024 characters (${fm.description.length})`);
  if (fm.description && !/\bUse (when|whenever)\b/.test(fm.description)) errors.push(`${dir}: description should say when to use the skill`);
  const extra = Object.keys(fm).filter((k) => !["name", "description", "license", "allowed-tools", "metadata"].includes(k));
  if (extra.length) errors.push(`${dir}: unexpected frontmatter keys: ${extra.join(", ")}`);
  const body = m[2];
  if (body.split(/\s+/).length < 250) errors.push(`${dir}: body is too short to be a useful skill`);
  if (!/^#\s/m.test(body)) errors.push(`${dir}: body needs a top-level heading`);
  if (!/example/i.test(body)) errors.push(`${dir}: body should contain at least one example`);
  if (dir !== "bavarian-english-leistungsfach" && !body.includes("bavarian-english-leistungsfach")) errors.push(`${dir}: should reference the foundation skill instead of duplicating it`);
  // Every repository path a Skill mentions must exist, so Skills never describe code that isn't there.
  for (const m of body.matchAll(/`((?:src|tests|docs|scripts|drizzle)\/[^`\s*]+?)`/g)) {
    const ref = m[1].replace(/[),.:]+$/, "");
    if (!existsSync(join(process.cwd(), ref))) errors.push(`${dir}: referenced path does not exist: ${ref}`);
  }
  for (const m of String(fm.description ?? "").matchAll(/\b((?:src|tests)\/[\w./-]*\w)/g)) {
    if (!existsSync(join(process.cwd(), m[1]))) errors.push(`${dir}: description mentions a path that does not exist: ${m[1]}`);
  }
  for (const m of body.matchAll(/`npm (?:run )?([a-z0-9:-]+)/g)) {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    if (m[1] !== "test" && !pkg.scripts[m[1]]) errors.push(`${dir}: referenced npm script does not exist: ${m[1]}`);
  }
  console.log(`✓ checked ${dir} (${body.split(/\s+/).length} words, description ${fm.description?.length ?? 0} chars)`);
}

if (errors.length) { console.error("\nSkill validation failed:\n- " + errors.join("\n- ")); process.exit(1); }
console.log(`\nAll ${dirs.length} skills valid.`);
