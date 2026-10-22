// The Skill file is the canonical curriculum; the runtime data must mirror its keys (see SKILL.md §10).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRICULUM_SOURCES, DIMENSION_KEYS, TASK_TYPE_KEYS, TASK_TYPES, DIMENSIONS } from "@/lib/curriculum";
import { SKILL_KEYS } from "@/lib/learner/skills";

const skill = readFileSync(path.join(process.cwd(), ".claude/skills/bavarian-english-leistungsfach/SKILL.md"), "utf8");
const learnerSkill = readFileSync(path.join(process.cwd(), ".claude/skills/learner-modelling/SKILL.md"), "utf8");
const research = readFileSync(path.join(process.cwd(), "docs/CURRICULUM_RESEARCH.md"), "utf8");

function tableKeys(section: string) {
  return [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
}

describe("curriculum Skill ↔ runtime consistency", () => {
  it("task-type keys match §3", () => {
    const sec = skill.split("## 3.")[1].split("## 4.")[0];
    expect(tableKeys(sec).sort()).toEqual([...TASK_TYPE_KEYS].sort());
  });
  it("dimension keys match §4", () => {
    const sec = skill.split("## 4.")[1].split("## 5.")[0];
    expect(tableKeys(sec).sort()).toEqual([...DIMENSION_KEYS].sort());
  });
  it("weights in §4 match the runtime task types", () => {
    const sec = skill.split("Task-type weights")[1].split("## 5.")[0];
    const groupOf = (k: string) => DIMENSIONS[k as keyof typeof DIMENSIONS]?.group;
    for (const key of TASK_TYPE_KEYS) {
      const line = sec.split("\n").find((l) => l.startsWith(`- \`${key}\``));
      expect(line, `weights line for ${key}`).toBeTruthy();
      const contentPart = line!.split(":")[1].split("/")[0];
      for (const m of contentPart.matchAll(/([a-z_]+) (\d)/g)) {
        expect(groupOf(m[1])).toBe("content");
        expect(TASK_TYPES[key].weights[m[1] as keyof (typeof TASK_TYPES)[typeof key]["weights"]]).toBe(Number(m[2]));
      }
    }
  });
  it("skill catalogue in the learner-modelling Skill matches runtime skills", () => {
    const line = learnerSkill.split("## Skill catalogue")[1].split("\n").find((l) => l.startsWith("`"))!;
    const keys = [...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...SKILL_KEYS].sort());
  });
  it("every runtime source id and URL is recorded in the research document", () => {
    for (const s of CURRICULUM_SOURCES) {
      expect(research).toContain(`| ${s.id} |`);
      expect(research).toContain(s.url);
    }
  });
  it("nothing in the runtime is labelled as verified official guidance", () => {
    const all = JSON.stringify(TASK_TYPES);
    expect(all).not.toContain("official_verified");
  });
});
