"""Exam Blueprint, generated exam records, originality checks, Exam Room view."""

import difflib
import json
import re
from pathlib import Path

from . import materials as mats
from . import profile as prof
from .schema import validate_named
from .store import ExaminerError, new_id, now_iso
from .textutil import normalize, word_count

ASSETS = Path(__file__).resolve().parents[2] / "assets"

BLUEPRINT_DEFAULTS = {
    "topics": [],
    "source_material_ids": [],
    "reference_exam_ids": [],
    "exam_type": "Klausur",
    "difficulty": "realistic",
    "mode": "practice",
    "duration_minutes": 90,
    "task_count": 3,
    "target_words": None,
    "include_vocabulary": True,
    "follow_reference_closely": None,
    "focus_weaknesses": True,
    "match_teacher_format": True,
}

# --------------------------------------------------------------- blueprint


def save_blueprint(ws, spec):
    spec = dict(spec or {})
    unknown = set(spec) - set(BLUEPRINT_DEFAULTS) - {"notes"}
    if unknown:
        raise ExaminerError(f"unknown blueprint field(s): {', '.join(sorted(unknown))}")
    defaults_used = sorted(k for k in BLUEPRINT_DEFAULTS if k not in spec)
    bp = {**BLUEPRINT_DEFAULTS, **spec}
    bp.update({"id": new_id("blueprint"), "created": now_iso(), "defaults_used": defaults_used})
    errs = validate_named(bp, "blueprint")
    for mid in bp["reference_exam_ids"] + bp["source_material_ids"] + (
            [bp["follow_reference_closely"]] if bp["follow_reference_closely"] else []):
        rec = ws.load("material", mid)
        if not mats.usable(rec):
            errs.append(f"material {mid} is not confirmed+reviewed yet (see `materials pending`)")
    for mid in bp["reference_exam_ids"]:
        if ws.load("material", mid)["classification"].get("type") != "exam_paper":
            errs.append(f"reference exam {mid} is not classified as exam_paper")
    if bp["follow_reference_closely"] and bp["follow_reference_closely"] not in bp["reference_exam_ids"]:
        errs.append("follow_reference_closely must be one of reference_exam_ids")
    if errs:
        raise ExaminerError("blueprint rejected:\n  - " + "\n  - ".join(errs))
    return ws.save("blueprint", bp)


# --------------------------------------------------------------- validation


def _sentences(text):
    parts = re.split(r"(?<=[.!?])\s+|\n+", text or "")
    return [normalize(p) for p in parts if word_count(p) >= 6]


def _shingles(text, n=8):
    words = re.findall(r"\w+", normalize(text))
    return {" ".join(words[i:i + n]) for i in range(max(0, len(words) - n + 1))}


def originality(ws, exam):
    """Compare generated tasks and generated sources with the reference exams.

    Reusing the *format* (operator, word limit, sequence) is intended; reusing
    the *content* of an old question or text is not."""
    refs = []
    for mid in set(exam.get("reference_exam_ids", []) + exam.get("provenance", {}).get("format_based_on", [])):
        try:
            refs.append((mid, mats.get_text(ws, mid)))
        except ExaminerError:
            continue
    errors, warnings, details = [], [], []
    if not refs:
        return {"errors": errors, "warnings": ["no reference exams to compare against"], "details": details}
    ref_sentences = [(mid, s) for mid, t in refs for s in _sentences(t)]
    for task in exam.get("tasks", []):
        for sent in _sentences(task.get("instruction", "")):
            best, best_mid, best_ref = 0.0, None, ""
            for mid, ref in ref_sentences:
                r = difflib.SequenceMatcher(None, sent, ref, autojunk=False).quick_ratio()
                if r < 0.6:
                    continue
                r = difflib.SequenceMatcher(None, sent, ref, autojunk=False).ratio()
                if r > best:
                    best, best_mid, best_ref = r, mid, ref
            if best >= 0.75:
                details.append({"task": task.get("number"), "similarity": round(best, 2),
                                "material": best_mid, "generated": sent, "reference": best_ref})
                msg = f"task {task.get('number')}: {best:.0%} similar to a sentence in {best_mid}"
                (errors if best >= 0.9 and word_count(sent) >= 12 else warnings).append(msg)
    ref_shingles = {mid: _shingles(t) for mid, t in refs}
    for src in exam.get("sources", []):
        if src.get("kind") == "uploaded_material":
            continue
        sh = _shingles(src.get("text", ""))
        if not sh:
            continue
        for mid, rs in ref_shingles.items():
            overlap = len(sh & rs) / len(sh)
            if overlap >= 0.05:
                details.append({"source": src.get("id"), "material": mid, "shingle_overlap": round(overlap, 3)})
                msg = f"source {src.get('id')}: {overlap:.0%} of its 8-word sequences appear in {mid}"
                (errors if overlap >= 0.15 else warnings).append(msg)
    return {"errors": errors, "warnings": warnings, "details": details}


def check_exam(ws, exam):
    errors = validate_named(exam, "exam")
    warnings = []
    if errors:
        return {"errors": errors, "warnings": warnings}
    src_ids = {s["id"] for s in exam["sources"]}
    if len(src_ids) != len(exam["sources"]):
        errors.append("duplicate source ids")
    for s in exam["sources"]:
        kind = s["kind"]
        if kind == "fictional_practice":
            if "fictional" not in (s.get("label") or "").lower():
                errors.append(f"source {s['id']}: generated texts must carry a label containing 'fictional'")
            if s.get("citation"):
                errors.append(f"source {s['id']}: a fictional text must not carry publication details")
        elif kind == "authentic":
            c = s.get("citation") or {}
            missing = [k for k in ("author", "title", "publication", "date") if not c.get(k)]
            if missing:
                errors.append(f"source {s['id']}: authentic source needs citation fields {missing}")
            if not c.get("verified"):
                errors.append(f"source {s['id']}: authentic citation must be verified (set citation.verified "
                              "after checking the source exists) or use a fictional practice text")
            if not c.get("url") and not c.get("isbn"):
                warnings.append(f"source {s['id']}: no url/isbn, the student cannot look the source up")
        elif kind == "uploaded_material":
            mid = s.get("material_id")
            try:
                rec = ws.load("material", mid)
                if not mats.usable(rec):
                    errors.append(f"source {s['id']}: material {mid} not confirmed+reviewed")
            except ExaminerError:
                errors.append(f"source {s['id']}: material {mid!r} not found")
    numbers = [t["number"] for t in exam["tasks"]]
    if len(set(numbers)) != len(numbers):
        errors.append("task numbers must be unique")
    for t in exam["tasks"]:
        for sid in t.get("source_ids", []):
            if sid not in src_ids:
                errors.append(f"task {t['number']}: unknown source id {sid}")
    pointed = [t for t in exam["tasks"] if t.get("points") is not None]
    marking = exam["marking"]
    if pointed:
        if len(pointed) != len(exam["tasks"]):
            errors.append("either every task has points or none does")
        if marking.get("total_points") != sum(t["points"] for t in pointed):
            errors.append("marking.total_points must equal the sum of task points")
        if marking["origin"] == "ai_practice" and "practice" not in (marking.get("label") or "").lower():
            errors.append("an AI-generated marking scheme must be labelled as a practice scheme")
        if marking["origin"] in ("teacher_provided", "official") and not marking.get("source_material_ids") \
                and not marking.get("source_url"):
            errors.append("teacher/official marking origin needs source_material_ids or source_url")
    elif marking.get("total_points") is not None:
        errors.append("total_points given but tasks have no points")
    minutes = sum(t.get("suggested_minutes") or 0 for t in exam["tasks"])
    if minutes > exam["duration_minutes"]:
        warnings.append(f"suggested times add up to {minutes} min, more than the {exam['duration_minutes']} min limit")
    hidden_tasks = {h["task"] for h in exam["hidden"]["task_expectations"]}
    for n in numbers:
        if n not in hidden_tasks:
            errors.append(f"task {n}: no hidden expectations (needed for grading)")
    if exam["difficulty"] == "abitur":
        guidance = prof.load(ws).get("official_guidance_checked", [])
        if not any(g.get("verified") for g in guidance):
            warnings.append("Abitur difficulty but no verified official guidance recorded in the profile: "
                            "label the format as 'based on unverified assumptions' or check ISB guidance first")
    orig = originality(ws, exam)
    errors += orig["errors"]
    warnings += orig["warnings"]
    return {"errors": errors, "warnings": warnings, "originality": orig["details"]}


def save_exam(ws, exam):
    exam = dict(exam)
    exam.setdefault("id", new_id("exam"))
    exam.setdefault("created", now_iso())
    if exam.get("blueprint_id"):
        ws.load("blueprint", exam["blueprint_id"])
    result = check_exam(ws, exam)
    if result["errors"]:
        raise ExaminerError("exam rejected:\n  - " + "\n  - ".join(result["errors"]))
    exam["validation"] = {"checked": now_iso(), "warnings": result["warnings"],
                          "originality": result.get("originality", [])}
    ws.save("exam", exam)
    return exam


# --------------------------------------------------------------- exam room

STUDENT_SOURCE_FIELDS = ("id", "title", "label", "citation", "text", "line_numbered", "kind")
STUDENT_TASK_FIELDS = ("number", "type", "instruction", "source_ids", "expected_length", "suggested_minutes", "points")


def student_view(exam):
    """Whitelist what a student may see during the exam. Anything not listed
    here (hidden expectations, marking criteria, vocab targets, provenance)
    stays out by construction."""
    sources = []
    for s in exam["sources"]:
        item = {k: s[k] for k in STUDENT_SOURCE_FIELDS if k in s}
        if item.get("citation"):
            item["citation"] = {k: v for k, v in item["citation"].items() if k != "verified"}
        sources.append(item)
    tasks = [{k: t[k] for k in STUDENT_TASK_FIELDS if k in t} for t in exam["tasks"]]
    return {
        "exam_id": exam["id"],
        "title": exam["title"],
        "topic": exam["topic"],
        "exam_type": exam["exam_type"],
        "duration_minutes": exam["duration_minutes"],
        "permitted_resources": exam.get("permitted_resources", []),
        "general_instructions": exam.get("general_instructions", ""),
        "total_points": exam["marking"].get("total_points"),
        "marking_label": exam["marking"].get("label") if exam["marking"].get("total_points") else None,
        "sources": sources,
        "tasks": tasks,
    }


def render_exam_room(ws, exam_id, attempt_id, out_path=None):
    exam = ws.load("exam", exam_id)
    view = student_view(exam)
    view["attempt_id"] = attempt_id
    template = (ASSETS / "exam_room.html").read_text(encoding="utf-8")
    payload = json.dumps(view, ensure_ascii=False).replace("</", "<\\/").replace("<!--", "<\\!--")
    title = re.sub(r"[<>&\"]", "", exam["title"])[:120]
    html = template.replace("/*__EXAM_DATA__*/null", payload).replace("__EXAM_TITLE__", title)
    out = Path(out_path) if out_path else ws.record_dir("attempt", attempt_id) / "exam_room.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out
