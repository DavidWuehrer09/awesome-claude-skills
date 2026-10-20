"""My Course Profile: an editable, evidence-linked description of the course.

Every entry says where its claim comes from (provenance) and how sure we are.
`check()` enforces the honesty rules mechanically so an inferred pattern can
never quietly turn into a "teacher rule".
"""

from . import materials as mats
from .store import ExaminerError, now_iso
from .textutil import contains_quote

SECTIONS = [
    "course", "exam_length", "time_limit", "task_types", "task_sequence", "answer_length",
    "source_genres", "topics", "assessed_skills", "grading_criteria", "task_wording",
    "recurring_feedback", "structure_expectations", "argument_and_evidence",
    "language_expectations", "formatting_conventions", "restrictions", "other",
]
PROVENANCE = ["teacher_explicit", "observed_pattern", "official_guidance", "general_principle", "ai_suggestion"]
CONFIDENCE = ["confirmed", "high", "medium", "low", "provisional"]
TEACHER_DOC_TYPES = {"exam_paper", "rubric", "teacher_correction", "task_instruction", "model_answer"}
PATTERN_DOC_TYPES = TEACHER_DOC_TYPES | {"student_answer", "source_text"}


def empty_profile():
    return {
        "version": 1,
        "updated": now_iso(),
        "student": {
            "school": "Gymnasium (Bavaria)",
            "year_level": None,
            "course_level": None,
            "target": "15 points (1+)",
            "preferred_exam_format": None,
        },
        "entries": [],
        "official_guidance_checked": [],
    }


def load(ws):
    return ws.read_json(ws.profile_path)


def save(ws, profile):
    profile["updated"] = now_iso()
    ws.write_json(ws.profile_path, profile)
    return profile


def _next_entry_id(profile):
    nums = [int(e["id"][1:]) for e in profile["entries"] if e["id"][1:].isdigit()]
    return f"p{(max(nums) + 1) if nums else 1}"


def check_entry(ws, entry):
    """Return a list of problems with one profile entry."""
    errs = []
    for key in ("section", "statement", "provenance", "confidence"):
        if not entry.get(key):
            errs.append(f"missing '{key}'")
    if errs:
        return errs
    if entry["section"] not in SECTIONS:
        errs.append(f"section must be one of {SECTIONS}")
    if entry["provenance"] not in PROVENANCE:
        errs.append(f"provenance must be one of {PROVENANCE}")
    if entry["confidence"] not in CONFIDENCE:
        errs.append(f"confidence must be one of {CONFIDENCE}")
    evidence = entry.get("evidence") or []
    prov = entry["provenance"]
    material_ids = set()
    exam_like = set()
    for i, ev in enumerate(evidence):
        if ev.get("url"):
            continue
        mid = ev.get("material_id")
        try:
            rec = ws.load("material", mid)
        except ExaminerError:
            errs.append(f"evidence[{i}]: material {mid!r} does not exist")
            continue
        material_ids.add(mid)
        doc_type = rec["classification"].get("type")
        if not rec["classification"].get("confirmed_by_user"):
            errs.append(f"evidence[{i}]: material {mid} type not confirmed by the user yet")
        if doc_type in ("exam_paper", "task_instruction"):
            exam_like.add(mid)
        quote = ev.get("quote")
        if quote and not contains_quote(mats.get_text(ws, mid), quote):
            errs.append(f"evidence[{i}]: quote not found in {mid}: {quote[:60]!r}")
        if prov == "teacher_explicit" and doc_type not in TEACHER_DOC_TYPES:
            errs.append(f"evidence[{i}]: a {doc_type} cannot prove an explicit teacher rule")
    if prov == "teacher_explicit":
        if not any(ev.get("quote") and ev.get("material_id") for ev in evidence):
            errs.append("teacher_explicit needs at least one verbatim quote from a teacher document")
    elif prov == "observed_pattern":
        if not material_ids:
            errs.append("observed_pattern needs evidence from uploaded materials")
        elif len(material_ids) < 2 and entry["confidence"] != "provisional":
            errs.append("a pattern seen in only one document must have confidence 'provisional'")
        elif len(material_ids) < 3 and entry["confidence"] in ("high", "confirmed"):
            errs.append("'high' confidence for a pattern needs at least 3 documents")
        if entry["confidence"] == "confirmed":
            errs.append("an observed pattern is never 'confirmed'; only teacher_explicit entries are")
    elif prov == "official_guidance":
        if not any(ev.get("url") for ev in evidence):
            errs.append("official_guidance needs a source url")
    elif prov in ("general_principle", "ai_suggestion") and entry["confidence"] == "confirmed":
        errs.append(f"{prov} entries cannot be 'confirmed'")
    if entry["section"] == "grading_criteria" and prov in ("observed_pattern", "ai_suggestion"):
        if "inferred" not in entry["statement"].lower() and "suggest" not in entry["statement"].lower():
            errs.append("grading_criteria from patterns/suggestions must say 'inferred' or 'suggested' in the statement")
    return errs


def add_entries(ws, entries):
    """Validate every entry first, then add all of them, or none."""
    entries = [dict(e, evidence=e.get("evidence") or []) for e in entries]
    problems = []
    for i, entry in enumerate(entries):
        problems += [f"entry {i} ({str(entry.get('statement', ''))[:40]!r}): {err}" for err in check_entry(ws, entry)]
    if problems:
        raise ExaminerError("profile entries rejected (nothing was added):\n  - " + "\n  - ".join(problems))
    profile = load(ws)
    for entry in entries:
        entry["id"] = _next_entry_id(profile)
        entry["created"] = entry["updated"] = now_iso()
        entry.setdefault("user_edited", False)
        profile["entries"].append(entry)
    save(ws, profile)
    return entries


def add_entry(ws, entry):
    return add_entries(ws, [entry])[0]


def edit_entry(ws, entry_id, changes, by_user=True):
    profile = load(ws)
    for i, e in enumerate(profile["entries"]):
        if e["id"] == entry_id:
            updated = {**e, **changes, "id": entry_id}
            errs = check_entry(ws, updated)
            if errs:
                raise ExaminerError("edit rejected:\n  - " + "\n  - ".join(errs))
            updated["updated"] = now_iso()
            updated["user_edited"] = by_user or e.get("user_edited", False)
            profile["entries"][i] = updated
            save(ws, profile)
            return updated
    raise ExaminerError(f"no profile entry {entry_id}")


def delete_entry(ws, entry_id):
    profile = load(ws)
    before = len(profile["entries"])
    profile["entries"] = [e for e in profile["entries"] if e["id"] != entry_id]
    if len(profile["entries"]) == before:
        raise ExaminerError(f"no profile entry {entry_id}")
    save(ws, profile)


def set_student(ws, **fields):
    profile = load(ws)
    for k, v in fields.items():
        if k not in profile["student"]:
            raise ExaminerError(f"unknown student field {k}")
        profile["student"][k] = v
    return save(ws, profile)


def record_guidance(ws, title, url, summary, verified):
    profile = load(ws)
    profile["official_guidance_checked"].append(
        {"title": title, "url": url, "summary": summary, "verified": bool(verified), "checked": now_iso()})
    return save(ws, profile)


def audit(ws):
    """Re-check every entry (materials may have been edited or deleted)."""
    profile = load(ws)
    report = []
    for e in profile["entries"]:
        errs = check_entry(ws, e)
        if errs:
            report.append({"id": e["id"], "statement": e["statement"][:80], "problems": errs})
    exams = [m for m in ws.list("material") if m["classification"].get("type") == "exam_paper"
             and m["classification"].get("confirmed_by_user")]
    notes = []
    if len(exams) < 2:
        notes.append(f"only {len(exams)} confirmed exam paper(s): all teacher-style patterns are provisional")
    return {"invalid_entries": report, "notes": notes, "confirmed_exam_papers": len(exams)}
