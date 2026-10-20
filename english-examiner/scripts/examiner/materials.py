"""My Materials: upload, extract, review, classify, label, search, delete."""

import hashlib
import re
import shutil
from pathlib import Path

from . import extract as ex
from .store import (ALLOWED_UPLOAD_EXT, MAX_UPLOAD_BYTES, ExaminerError, new_id, now_iso)

IMPORTANCE = ["low", "normal", "high", "essential"]
LABEL_KEYS = {"topic", "date", "exam_type", "year_level", "importance", "tags", "title"}


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _clean_labels(labels):
    out = {}
    for key, value in (labels or {}).items():
        if key not in LABEL_KEYS:
            raise ExaminerError(f"unknown label '{key}' (allowed: {', '.join(sorted(LABEL_KEYS))})")
        if key in ("topic", "tags"):
            value = [v.strip() for v in (value if isinstance(value, list) else str(value).split(",")) if v.strip()]
        elif key == "importance" and value not in IMPORTANCE:
            raise ExaminerError(f"importance must be one of {IMPORTANCE}")
        out[key] = value
    return out


def _write_text(ws, mat_id, text):
    d = ws.record_dir("material", mat_id)
    (d / "extracted.md").write_text(text, encoding="utf-8")
    segs = ex.segment(text)
    ws.write_json(d / "segments.json", segs)
    return segs


def ingest(ws, paths, labels=None, doc_type=None):
    """Ingest several files as one upload session. Returns the new records.

    Validation happens for every file before anything is copied, so a bad
    file in the batch never leaves a half-finished session behind."""
    labels = _clean_labels(labels)
    if doc_type and doc_type not in ex.DOC_TYPES:
        raise ExaminerError(f"type must be one of {ex.DOC_TYPES}")
    files = []
    for raw in paths:
        p = Path(raw).expanduser()
        if not p.is_file():
            raise ExaminerError(f"file not found: {raw}")
        if p.is_symlink():
            raise ExaminerError(f"refusing symlink: {raw}")
        ext = p.suffix.lower()
        if ext not in ALLOWED_UPLOAD_EXT:
            raise ExaminerError(f"unsupported file type {ext} for {p.name}")
        size = p.stat().st_size
        if size > MAX_UPLOAD_BYTES:
            raise ExaminerError(f"{p.name} is {size // (1024 * 1024)} MB; limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
        if size == 0:
            raise ExaminerError(f"{p.name} is empty")
        files.append(p)
    existing = {m.get("sha256"): m["id"] for m in ws.list("material")}
    session = "upl_" + now_iso().replace(":", "").replace("-", "")[:15]
    created = []
    for p in files:
        digest = _sha256(p)
        mat_id = new_id("material")
        d = ws.record_dir("material", mat_id)
        d.mkdir(parents=True)
        stored = d / ("original" + p.suffix.lower())
        shutil.copyfile(p, stored)
        try:
            text, method, notes = ex.extract(stored)
        except Exception as exc:  # corrupt upload: keep the file, flag it
            text, method, notes = "", "failed", [f"extraction failed: {exc}"]
        status = "needs_transcription" if method in ("needs_transcription", "failed") or not text.strip() else "needs_review"
        cls = ex.classify(text, p.name)
        record = {
            "id": mat_id,
            "created": now_iso(),
            "upload_session": session,
            "filename": p.name,
            "original": stored.name,
            "sha256": digest,
            "bytes": stored.stat().st_size,
            "duplicate_of": existing.get(digest),
            "extraction": {"method": method, "status": status, "notes": notes},
            "classification": {
                "type": doc_type,  # confirmed type; None until confirmed
                "confirmed_by_user": bool(doc_type),
                "guess": cls["guess"],
                "guess_confidence": cls["confidence"],
                "needs_confirmation": not doc_type,
            },
            "labels": labels,
            "text_history": [],
        }
        segs = _write_text(ws, mat_id, text)
        (d / "extracted.original.md").write_text(text, encoding="utf-8")
        record["segments"] = len(segs)
        record["chars"] = len(text)
        ws.save("material", record)
        existing[digest] = mat_id
        created.append(record)
    return created


def get_text(ws, mat_id):
    ws.load("material", mat_id)
    return (ws.record_dir("material", mat_id) / "extracted.md").read_text(encoding="utf-8")


def get_segments(ws, mat_id):
    ws.load("material", mat_id)
    return ws.read_json(ws.record_dir("material", mat_id) / "segments.json")


def set_text(ws, mat_id, text, note="user correction"):
    """Replace the extracted text (user correction or Claude transcription)."""
    rec = ws.load("material", mat_id)
    d = ws.record_dir("material", mat_id)
    history_dir = d / "history"
    history_dir.mkdir(exist_ok=True)
    n = len(rec["text_history"]) + 1
    shutil.copyfile(d / "extracted.md", history_dir / f"v{n}.md")
    rec["text_history"].append({"version": n, "replaced": now_iso(), "note": note})
    segs = _write_text(ws, mat_id, text)
    rec["segments"], rec["chars"] = len(segs), len(text)
    rec["extraction"]["status"] = "needs_review" if "transcri" in note.lower() else "reviewed"
    return ws.save("material", rec)


def mark_reviewed(ws, mat_id):
    rec = ws.load("material", mat_id)
    if rec["extraction"]["status"] == "needs_transcription":
        raise ExaminerError("no text yet: transcribe it first (materials set-text)")
    rec["extraction"]["status"] = "reviewed"
    return ws.save("material", rec)


def confirm_type(ws, mat_id, doc_type):
    if doc_type not in ex.DOC_TYPES:
        raise ExaminerError(f"type must be one of {ex.DOC_TYPES}")
    rec = ws.load("material", mat_id)
    rec["classification"].update({"type": doc_type, "confirmed_by_user": True, "needs_confirmation": False})
    return ws.save("material", rec)


def update_labels(ws, mat_id, labels):
    rec = ws.load("material", mat_id)
    rec["labels"].update(_clean_labels(labels))
    return ws.save("material", rec)


def usable(rec):
    """A material may feed profiles, exams and grading only when the user has
    confirmed what it is and the text has been reviewed."""
    return bool(rec["classification"].get("confirmed_by_user")) and rec["extraction"]["status"] == "reviewed"


def pending(ws):
    out = []
    for rec in ws.list("material"):
        reasons = []
        if rec["classification"].get("needs_confirmation"):
            c = rec["classification"]
            reasons.append(f"confirm type (guess: {c['guess']}, {c['guess_confidence']} confidence)")
        st = rec["extraction"]["status"]
        if st == "needs_transcription":
            reasons.append("transcribe (no text extracted)")
        elif st == "needs_review":
            reasons.append("review extracted text")
        if rec.get("duplicate_of"):
            reasons.append(f"possible duplicate of {rec['duplicate_of']}")
        if reasons:
            out.append({"id": rec["id"], "filename": rec["filename"], "todo": reasons})
    return out


def search(ws, query="", doc_type=None, topic=None, exam_type=None, year_level=None, importance=None, limit=20):
    terms = [t.lower() for t in re.findall(r"\w[\w'-]*", query or "")]
    hits = []
    for rec in ws.list("material"):
        c = rec["classification"]
        effective_type = c.get("type") or c.get("guess")
        labels = rec.get("labels", {})
        if doc_type and effective_type != doc_type:
            continue
        if topic and not any(topic.lower() in t.lower() for t in labels.get("topic", [])):
            continue
        if exam_type and labels.get("exam_type") != exam_type:
            continue
        if year_level and str(labels.get("year_level")) != str(year_level):
            continue
        if importance and labels.get("importance") != importance:
            continue
        snippets, score = [], 0
        if terms:
            haystack_meta = " ".join([rec["filename"], str(labels)]).lower()
            score += sum(3 for t in terms if t in haystack_meta)
            for seg in get_segments(ws, rec["id"]):
                low = seg["text"].lower()
                for t in terms:
                    for m in re.finditer(re.escape(t), low):
                        score += 1
                        if len(snippets) < 3:
                            a, b = max(0, m.start() - 80), min(len(low), m.end() + 80)
                            snippets.append({"segment": seg["index"],
                                             "text": seg["text"][a:b].replace("\n", " ")})
            if score == 0:
                continue
        hits.append({"id": rec["id"], "filename": rec["filename"], "type": effective_type,
                     "type_confirmed": c.get("confirmed_by_user", False), "labels": labels,
                     "status": rec["extraction"]["status"], "score": score, "snippets": snippets})
    hits.sort(key=lambda h: (-h["score"], h["filename"]))
    return hits[:limit]
