"""Teacher-style grading records: validation, saving, disputes."""

import re

from . import attempts as atts
from . import materials as mats
from . import vocab as vb
from . import weaknesses as wk
from .schema import validate_named
from .store import ExaminerError, new_id, now_iso
from .textutil import contains_quote, quoted_spans

DIMENSIONS = [
    "task_fulfilment", "content", "argumentation", "structure", "source_analysis", "evidence",
    "vocabulary", "idiomaticity", "grammar", "register", "mechanics", "overall",
]
DIMENSION_LABELS = {
    "task_fulfilment": "Task fulfilment and relevance",
    "content": "Accuracy and depth of content",
    "argumentation": "Argumentation and reasoning",
    "structure": "Structure and coherence",
    "source_analysis": "Analysis of the source text",
    "evidence": "Use of textual evidence",
    "vocabulary": "Precision and range of vocabulary",
    "idiomaticity": "Naturalness and idiomaticity",
    "grammar": "Grammar and sentence construction",
    "register": "Register and academic style",
    "mechanics": "Spelling and punctuation",
    "overall": "Overall effectiveness and clarity",
}
# Dimensions that usually do not fit a task type (warning, not error).
NOT_TYPICAL = {
    "summary": {"argumentation", "source_analysis"},
    "reading_comprehension": {"argumentation"},
    "mediation": {"source_analysis"},
}
TEACHER_RUBRIC_TYPES = {"rubric", "exam_paper", "model_answer", "teacher_correction", "task_instruction"}

OVERCLAIM = [
    r"\bguarantee[sd]?\b",
    r"\bwill (definitely|certainly|surely) (get|receive|score|earn)\b",
    r"\byour teacher (would|will) (definitely |certainly )?(give|award|mark)\b",
    r"\bthis is (an|your) official (grade|mark|result)\b",
    r"\bexactly (as|what) your teacher\b",
]
PERCENT_RE = re.compile(r"\d{1,3}\s*(%|percent|prozent)", re.I)


def _all_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _all_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _all_strings(v)


def check(ws, asm):
    errors = validate_named(asm, "assessment")
    warnings = []
    if errors:
        return {"errors": errors, "warnings": warnings}
    att = ws.load("attempt", asm["attempt_id"])
    if att["exam_id"] != asm["exam_id"]:
        errors.append("exam_id does not match the attempt")
    version = atts.load_version(ws, asm["attempt_id"], asm["version"])
    answers = version["answers"]
    exam = ws.load("exam", asm["exam_id"])
    source_text = "\n\n".join(s.get("text", "") for s in exam["sources"])

    def in_answer(task, text, where):
        if task not in answers:
            errors.append(f"{where}: unknown task {task!r}")
        elif not contains_quote(answers[task], text):
            errors.append(f"{where}: passage not found in the submitted answer to task {task}: {text[:70]!r}")

    def quotes_exist(text, where):
        for q in quoted_spans(text):
            if not contains_quote(source_text, q) and not any(contains_quote(a, q) for a in answers.values()):
                errors.append(f"{where}: quotation not found in the exam's sources: \"{q[:70]}\"")

    # -- comments
    ids = [c["id"] for c in asm["comments"]]
    if len(ids) != len(set(ids)):
        errors.append("comment ids must be unique")
    severities = {"major": 0, "moderate": 0, "minor": 0, "none": 0}
    for c in asm["comments"]:
        where = f"comment {c['id']}"
        in_answer(c["task"], c["original"], where)
        severities[c["severity"]] += 1
        status, cat = c["english_status"], c["category"]
        if status == "excellent":
            if c.get("alternative"):
                errors.append(f"{where}: an excellent passage must not get a 'correction'")
            if c["severity"] != "none":
                errors.append(f"{where}: excellent passages have severity 'none'")
        elif not c.get("alternative") or not c.get("why_better"):
            errors.append(f"{where}: criticism needs an alternative and an explanation why it is better")
        if cat == "language_error" and status != "incorrect":
            errors.append(f"{where}: 'language_error' is only for incorrect English (status={status})")
        if status == "incorrect" and cat in ("optional_refinement",):
            errors.append(f"{where}: incorrect English cannot be an optional refinement")
        if status in ("valid_less_effective",) and c["severity"] == "major":
            errors.append(f"{where}: a valid stylistic choice cannot be a major error")
        if status == "valid_less_effective" and cat == "language_error":
            errors.append(f"{where}: a valid choice is not a language error")
        for field in ("alternative", "why_better"):
            if c.get(field):
                quotes_exist(c[field], f"{where}.{field}")
    if severities["minor"] > 15 and severities["minor"] > 3 * (severities["major"] + severities["moderate"]):
        warnings.append("many minor comments relative to major ones: prioritise what affects marks most")
    for s in asm["strengths"]:
        in_answer(s["task"], s["original"], "strength")
    # -- dimensions
    keys = [d["key"] for d in asm["dimensions"]]
    if len(keys) != len(set(keys)):
        errors.append("dimension keys must be unique")
    if not any(d["applicable"] for d in asm["dimensions"]):
        errors.append("at least one dimension must be applicable")
    types = {t["number"]: t["type"] for t in exam["tasks"]}
    for d in asm["dimensions"]:
        if d["applicable"] and d.get("task") and d["key"] in NOT_TYPICAL.get(types.get(d["task"]), set()):
            warnings.append(f"dimension {d['key']} is unusual for a {types[d['task']]} task: is it really relevant?")
        if d["applicable"] and d["level"] == "not_assessed":
            errors.append(f"dimension {d['key']}: applicable but not assessed")
    # -- course-specific perspective
    cs = asm["course_specific"]
    for mid in cs.get("rubric_material_ids", []):
        rec = ws.load("material", mid)
        if not mats.usable(rec) or rec["classification"]["type"] not in TEACHER_RUBRIC_TYPES:
            errors.append(f"course_specific: {mid} is not a confirmed teacher/rubric document")
    if cs["rubric_basis"] != "none_available" and not cs.get("rubric_material_ids"):
        errors.append("course_specific: a teacher rubric basis needs rubric_material_ids")
    if cs["rubric_basis"] == "none_available" and not cs.get("insufficient_evidence_notes"):
        errors.append("course_specific: say what is missing when no teacher rubric is available")
    for crit in cs.get("applied_criteria", []):
        if crit["provenance"] == "teacher_explicit" and cs["rubric_basis"] == "none_available":
            errors.append(f"criterion '{crit['criterion'][:40]}': teacher_explicit without any teacher rubric")
    # -- estimate
    est = asm["estimate"]
    lo, hi, best = est["low"], est["high"], est.get("best")
    if lo > hi:
        errors.append("estimate: low > high")
    if best is not None and not lo <= best <= hi:
        errors.append("estimate: best must lie inside the range")
    if hi - lo >= 4 and best is not None:
        warnings.append("estimate: a wide range with a single best guess may overstate precision")
    if est["basis"] == "approximation" and not est["assumptions"]:
        errors.append("estimate: an approximation must list its assumptions")
    if est["basis"] in ("teacher_rubric", "teacher_points_allocation") and cs["rubric_basis"] == "none_available":
        errors.append("estimate: cannot claim a teacher basis without a teacher rubric")
    if est["basis"] != "teacher_rubric":
        for s in _all_strings(est):
            if PERCENT_RE.search(s) and re.search(r"(?i)points?|punkte?", s):
                errors.append("estimate: percentage-to-points conversion is only allowed when the teacher's "
                              "rubric provides it (basis 'teacher_rubric')")
                break
    if not est["limiting_factors"] or not est["most_valuable_changes"]:
        errors.append("estimate: name the limiting factors and the most valuable changes")
    # -- lab and model answer
    for i, item in enumerate(asm.get("lab", [])):
        in_answer(item["task"], item["original"], f"lab[{i}]")
        for lvl in ("level1_correct", "level2_stronger", "level3_high_level"):
            if item.get(lvl):
                quotes_exist(item[lvl], f"lab[{i}].{lvl}")
    ma = asm["model_answer"]
    for part in ma["per_task"]:
        if part["task"] not in types:
            errors.append(f"model answer: unknown task {part['task']}")
        quotes_exist(part["text"], f"model answer task {part['task']}")
    for comp in ma.get("comparisons", []):
        in_answer(comp["task"], comp["student"], "comparison")
    # -- weakness tags
    for w in asm["weakness_observations"]:
        if w["skill"] not in wk.TAXONOMY and not w["skill"].startswith("custom:"):
            errors.append(f"weakness skill {w['skill']!r} not in taxonomy (or prefix 'custom:')")
        for cid in w.get("comment_ids", []):
            if cid not in ids:
                errors.append(f"weakness {w['skill']}: unknown comment id {cid}")
    # -- over-claiming anywhere
    for s in _all_strings(asm):
        for pat in OVERCLAIM:
            if re.search(pat, s, re.I):
                errors.append(f"over-claim not allowed: {s[:90]!r}")
                break
    return {"errors": errors, "warnings": warnings}


def save(ws, asm):
    asm = dict(asm)
    asm.setdefault("id", new_id("assessment"))
    asm.setdefault("created", now_iso())
    asm.setdefault("disputes", [])
    asm.setdefault("unhelpful", [])
    asm.setdefault("vocab_usage", [])
    if any(a["attempt_id"] == asm["attempt_id"] and a["version"] == asm["version"] and a["id"] != asm["id"]
           for a in ws.list("assessment")):
        raise ExaminerError("this attempt version is already assessed; dispute or revise instead")
    result = check(ws, asm)
    if result["errors"]:
        raise ExaminerError("assessment rejected:\n  - " + "\n  - ".join(result["errors"]))
    asm["validation_warnings"] = result["warnings"]
    ws.record_dir("assessment", asm["id"]).mkdir(parents=True, exist_ok=True)
    ws.save("assessment", asm)
    exam = ws.load("exam", asm["exam_id"])
    wk.record(ws, asm, exam)
    vb.record_assessed_usage(ws, asm.get("vocab_usage", []))
    return asm


def _find_comment(asm, comment_id):
    for c in asm["comments"]:
        if c["id"] == comment_id:
            return c
    raise ExaminerError(f"no comment {comment_id}")


def dispute(ws, asm_id, comment_id, argument):
    asm = ws.load("assessment", asm_id)
    _find_comment(asm, comment_id)
    d = {"id": f"d{len(asm['disputes']) + 1}", "comment_id": comment_id, "argument": argument,
         "status": "open", "created": now_iso()}
    asm["disputes"].append(d)
    ws.save("assessment", asm)
    return d


def resolve_dispute(ws, asm_id, dispute_id, outcome, response, revision=None):
    """outcome: 'upheld' (comment stands), 'revised' (comment changed),
    'withdrawn' (comment removed from the report and weakness tracking)."""
    if outcome not in ("upheld", "revised", "withdrawn"):
        raise ExaminerError("outcome must be upheld, revised or withdrawn")
    asm = ws.load("assessment", asm_id)
    d = next((x for x in asm["disputes"] if x["id"] == dispute_id), None)
    if not d:
        raise ExaminerError(f"no dispute {dispute_id}")
    comment = _find_comment(asm, d["comment_id"])
    if outcome == "revised":
        if not revision:
            raise ExaminerError("a revised outcome needs the revised comment fields")
        protected = {"id", "task", "original"}
        comment.setdefault("history", []).append({k: v for k, v in comment.items() if k != "history"})
        comment.update({k: v for k, v in revision.items() if k not in protected})
    elif outcome == "withdrawn":
        comment["withdrawn"] = True
        for w in asm["weakness_observations"]:
            if comment["id"] in w.get("comment_ids", []):
                w["comment_ids"].remove(comment["id"])
                if not w["comment_ids"]:
                    w["present"] = False
    d.update({"status": outcome, "response": response, "resolved": now_iso()})
    result = check(ws, asm)
    if result["errors"]:
        raise ExaminerError("resolution would make the assessment invalid:\n  - " + "\n  - ".join(result["errors"]))
    ws.save("assessment", asm)
    wk.rebuild(ws)
    return d


def mark_unhelpful(ws, asm_id, comment_id, reason):
    asm = ws.load("assessment", asm_id)
    _find_comment(asm, comment_id)
    asm["unhelpful"].append({"comment_id": comment_id, "reason": reason, "created": now_iso()})
    ws.save("assessment", asm)
    return asm["unhelpful"][-1]


def feedback_preferences(ws):
    """All 'unhelpful' flags, so future grading can avoid the same kind of comment."""
    out = []
    for a in ws.list("assessment"):
        for u in a.get("unhelpful", []):
            c = next((c for c in a["comments"] if c["id"] == u["comment_id"]), {})
            out.append({"assessment": a["id"], "comment": c.get("problem", ""), "category": c.get("category"),
                        "reason": u["reason"]})
    return out
