"""Personal vocabulary: import lists, pick targets for exams, track active use."""

import csv
import io
import re

from .store import ExaminerError, now_iso


def _load(ws):
    return ws.read_json(ws.vocab_path)


def _save(ws, data):
    ws.write_json(ws.vocab_path, data)


def import_list(ws, text, topic=None, source_material_id=None):
    """Import `term<sep>meaning[<sep>example]` lines (CSV, TSV, ';' or ' - ')."""
    data = _load(ws)
    known = {i["term"].lower() for i in data["items"]}
    sample = text[:2000]
    if "\t" in sample:
        rows = list(csv.reader(io.StringIO(text), delimiter="\t"))
    elif ";" in sample:
        rows = list(csv.reader(io.StringIO(text), delimiter=";"))
    elif "," in sample and not re.search(r"\s[-–=]\s", sample):
        rows = list(csv.reader(io.StringIO(text)))
    else:
        rows = [re.split(r"\s+[-–=]\s+", line, maxsplit=2) for line in text.splitlines()]
    added, skipped = [], 0
    for row in rows:
        row = [c.strip() for c in row if c is not None]
        if not row or not row[0] or row[0].lower() in ("term", "word", "vokabel", "english"):
            continue
        term = row[0]
        if term.lower() in known or len(term) > 80:
            skipped += 1
            continue
        item = {"term": term, "meaning": row[1] if len(row) > 1 else "",
                "example": row[2] if len(row) > 2 else "", "topic": topic,
                "source_material_id": source_material_id, "added": now_iso(),
                "times_targeted": 0, "times_used": 0, "times_used_naturally": 0, "last_used": None}
        data["items"].append(item)
        known.add(term.lower())
        added.append(term)
    _save(ws, data)
    return {"added": len(added), "skipped_duplicates": skipped, "total": len(data["items"])}


def suggest(ws, n=8, topic=None):
    """Least actively mastered items first (recognised != usable)."""
    items = _load(ws)["items"]
    if topic:
        on_topic = [i for i in items if (i.get("topic") or "").lower() == topic.lower()]
        items = on_topic or items
    items = sorted(items, key=lambda i: (i["times_used_naturally"], i["times_targeted"], i["term"].lower()))
    return items[:n]


def mark_targeted(ws, terms):
    data = _load(ws)
    wanted = {t.lower() for t in terms}
    for i in data["items"]:
        if i["term"].lower() in wanted:
            i["times_targeted"] += 1
    _save(ws, data)


def _pattern(term):
    words = [re.escape(w) for w in term.split()]
    if not words:
        return None
    # allow simple inflections on the last word (s, es, ed, d, ing, ly)
    words[-1] = words[-1] + r"(?:s|es|ed|d|ing|ly)?"
    return re.compile(r"\b" + r"\s+".join(words) + r"\b", re.I)


def detect_usage(ws, exam, answers):
    targets = exam.get("hidden", {}).get("vocabulary_targets", [])
    text = "\n".join(answers.values())
    used = []
    for term in targets:
        pat = _pattern(term)
        if pat and pat.search(text):
            used.append(term)
    return {"targets": targets, "used": used}


def record_assessed_usage(ws, usage):
    """usage: [{term, used, natural}] judged by Claude in the assessment."""
    data = _load(ws)
    by_term = {i["term"].lower(): i for i in data["items"]}
    for u in usage:
        item = by_term.get(u["term"].lower())
        if not item:
            continue
        if u.get("used"):
            item["times_used"] += 1
            item["last_used"] = now_iso()
            if u.get("natural"):
                item["times_used_naturally"] += 1
    _save(ws, data)


def stats(ws):
    items = _load(ws)["items"]
    if not items:
        return {"total": 0}
    return {
        "total": len(items),
        "never_targeted": sum(1 for i in items if i["times_targeted"] == 0),
        "targeted_not_used": sum(1 for i in items if i["times_targeted"] and not i["times_used"]),
        "used_naturally_at_least_twice": sum(1 for i in items if i["times_used_naturally"] >= 2),
    }


def require_terms_known(ws, terms):
    known = {i["term"].lower() for i in _load(ws)["items"]}
    missing = [t for t in terms if t.lower() not in known]
    if missing:
        raise ExaminerError(f"vocabulary targets not in your list: {missing}")
