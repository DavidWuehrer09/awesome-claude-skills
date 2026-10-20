"""My Weaknesses: recurring-error tracking and adaptive recommendations."""

from .store import now_iso

TAXONOMY = {
    "repetitive_analytical_phrasing": "Repetitive analytical phrasing",
    "vague_authorial_intention": "Vague claims about authorial intention",
    "insufficient_textual_evidence": "Insufficient textual evidence",
    "underdeveloped_counterarguments": "Underdeveloped counterarguments",
    "weak_transitions": "Weak paragraph transitions",
    "awkward_collocations": "Awkward collocations",
    "grammar_errors": "Grammar errors",
    "imprecise_vocabulary": "Imprecise vocabulary",
    "excessive_complexity": "Excessive sentence complexity",
    "inadequate_task_fulfilment": "Inadequate task fulfilment",
    "unclear_strong_ideas": "Strong ideas not expressed clearly enough",
    "device_spotting_without_effect": "Naming devices without explaining their effect",
    "summary_includes_opinion": "Personal opinion or detail in a summary",
    "mediation_too_literal": "Mediation translates instead of selecting and adapting",
    "register_slips": "Register slips (too informal / too ornate)",
    "spelling_punctuation": "Spelling and punctuation",
    "paragraph_structure": "Paragraph structure (topic sentence, development, link)",
    "word_count_control": "Word-count control",
}
SEVERITY_WEIGHT = {"major": 3, "moderate": 2, "minor": 1, "none": 0}
DIFFICULTIES = ["consolidation", "realistic", "stretch", "abitur"]


def _status(history):
    """history: chronological list of {present, severity}. Mastery is never
    inferred from one attempt: 'secure' needs >=3 consecutive clean attempts."""
    if not history:
        return "no_data"
    flags = [h["present"] for h in history]
    clean_run = 0
    for f in reversed(flags):
        if f:
            break
        clean_run += 1
    if clean_run >= 3:
        return "secure_provisional"
    if clean_run >= 1 and any(flags):
        return "improving"
    if clean_run >= 1:
        return "no_problem_seen_yet"
    last3 = flags[-3:]
    if sum(last3) >= 2:
        return "recurring"
    return "active"


def rebuild(ws):
    skills = {}
    for asm in ws.list("assessment"):
        for obs in asm.get("weakness_observations", []):
            entry = skills.setdefault(obs["skill"], {
                "label": TAXONOMY.get(obs["skill"], obs["skill"].removeprefix("custom:").replace("_", " ")),
                "history": []})
            entry["history"].append({"assessment_id": asm["id"], "attempt_id": asm["attempt_id"],
                                     "date": asm["created"], "present": bool(obs["present"]),
                                     "severity": obs.get("severity", "none") if obs["present"] else "none",
                                     "note": obs.get("note", "")})
    for entry in skills.values():
        entry["history"].sort(key=lambda h: h["date"])
        entry["status"] = _status(entry["history"])
        entry["observations"] = len(entry["history"])
        entry["times_present"] = sum(h["present"] for h in entry["history"])
    data = {"updated": now_iso(), "skills": skills}
    ws.write_json(ws.weaknesses_path, data)
    return data


def record(ws, asm, exam):
    return rebuild(ws)


def _priority(entry):
    score = 0.0
    for age, h in enumerate(reversed(entry["history"])):
        score += SEVERITY_WEIGHT.get(h["severity"], 0) * (0.6 ** age)
    if entry["status"] == "recurring":
        score *= 1.5
    return round(score, 2)


def progress(ws):
    rows = []
    exams = {}
    for asm in ws.list("assessment"):
        exam = exams.setdefault(asm["exam_id"], ws.load("exam", asm["exam_id"]))
        est = asm["estimate"]
        rows.append({
            "assessment_id": asm["id"], "attempt_id": asm["attempt_id"], "version": asm["version"],
            "date": asm["created"][:10], "exam": exam["title"], "difficulty": exam["difficulty"],
            "low": est["low"], "high": est["high"], "best": est.get("best"),
            "basis": est["basis"],
            "dimensions": {d["key"]: d["level"] for d in asm["dimensions"] if d["applicable"]},
            "major_issues": sum(1 for c in asm["comments"] if c["severity"] == "major" and not c.get("withdrawn")),
        })
    return rows


def recommend(ws):
    data = rebuild(ws)
    focus = sorted(
        ({"skill": k, "label": v["label"], "status": v["status"], "priority": _priority(v),
          "observations": v["observations"]}
         for k, v in data["skills"].items() if v["status"] in ("recurring", "active", "improving")),
        key=lambda x: -x["priority"])
    rows = [r for r in progress(ws) if r["version"] == 1]  # judge exams, not polished revisions
    advice, difficulty = [], "realistic"
    if not rows:
        advice.append("no assessed exams yet: start with a realistic exam to establish a baseline")
    else:
        mids = [(r["low"] + r["high"]) / 2 for r in rows[-3:]]
        last = rows[-1]
        cur = last["difficulty"]
        idx = DIFFICULTIES.index(cur) if cur in DIFFICULTIES else 1
        recurring_major = any(f["status"] == "recurring" and f["priority"] >= 4 for f in focus)
        if len(rows) >= 2 and all(m >= 12 for m in mids[-2:]) and not recurring_major:
            difficulty = DIFFICULTIES[min(idx + 1, len(DIFFICULTIES) - 1)]
            advice.append("two consecutive strong results without recurring major problems: raise the demand")
        elif len(mids) >= 2 and all(m < 7 for m in mids[-2:]):
            difficulty = DIFFICULTIES[max(idx - 1, 0)]
            advice.append("two consecutive results below 7 points: consolidate before raising difficulty")
        else:
            difficulty = cur
            advice.append("keep the current difficulty; target the focus skills")
        if len(rows) == 1:
            advice.append("only one assessed exam: these recommendations are provisional")
    drills_per_skill = {}
    for f in focus[:4]:
        drills_per_skill[f["skill"]] = 3 if f["status"] == "recurring" else 2 if f["status"] == "active" else 1
    return {"recommended_difficulty": difficulty, "focus": focus[:6], "drills_per_skill": drills_per_skill,
            "advice": advice,
            "secure_skills": [k for k, v in data["skills"].items() if v["status"] == "secure_provisional"]}
