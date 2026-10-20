"""Exam attempts: drafts, the locked submission, and later revisions."""

import difflib
import os
import stat

from . import vocab as vb
from .store import ExaminerError, new_id, now_iso
from .textutil import word_count

MAX_ANSWER_CHARS = 60000


def start(ws, exam_id, timed=True):
    exam = ws.load("exam", exam_id)
    att = {
        "id": new_id("attempt"),
        "exam_id": exam_id,
        "created": now_iso(),
        "status": "in_progress",
        "timed": bool(timed),
        "duration_minutes": exam["duration_minutes"],
        "draft": {"answers": {t["number"]: "" for t in exam["tasks"]}, "saved": now_iso()},
        "timing": {},
        "versions": [],
    }
    ws.record_dir("attempt", att["id"]).mkdir(parents=True)
    return ws.save("attempt", att)


def _clean_answers(exam, answers):
    numbers = {t["number"] for t in exam["tasks"]}
    if not isinstance(answers, dict):
        raise ExaminerError("answers must be an object {task number: text}")
    unknown = set(answers) - numbers
    if unknown:
        raise ExaminerError(f"answers for unknown task(s): {sorted(unknown)}")
    out = {}
    for n in sorted(numbers, key=str):
        text = answers.get(n, "")
        if not isinstance(text, str):
            raise ExaminerError(f"answer to task {n} must be text")
        if len(text) > MAX_ANSWER_CHARS:
            raise ExaminerError(f"answer to task {n} exceeds {MAX_ANSWER_CHARS} characters")
        out[n] = text.replace("\r\n", "\n")
    return out


def save_draft(ws, attempt_id, answers, timing=None):
    att = ws.load("attempt", attempt_id)
    if att["status"] != "in_progress":
        raise ExaminerError("attempt already submitted; use `attempt revise` for a new version")
    exam = ws.load("exam", att["exam_id"])
    merged = {**att["draft"]["answers"], **_clean_answers(exam, answers)}
    att["draft"] = {"answers": merged, "saved": now_iso()}
    if timing:
        att["timing"] = timing
    return ws.save("attempt", att)


def import_room_file(ws, data):
    """Accept the JSON downloaded/copied from the Exam Room page."""
    attempt_id = data.get("attempt_id")
    att = ws.load("attempt", attempt_id)
    if data.get("exam_id") != att["exam_id"]:
        raise ExaminerError("this answer file belongs to a different exam")
    att = save_draft(ws, attempt_id, data.get("answers", {}), data.get("timing"))
    if data.get("submitted"):
        att = submit(ws, attempt_id)
    return att


def _version_path(ws, attempt_id, n):
    return ws.record_dir("attempt", attempt_id) / f"v{n}.json"


def _write_version(ws, att, kind, answers, note):
    n = len(att["versions"]) + 1
    path = _version_path(ws, att["id"], n)
    if path.exists():
        raise ExaminerError(f"version {n} already exists; versions are never overwritten")
    version = {
        "attempt_id": att["id"], "n": n, "kind": kind, "created": now_iso(), "note": note,
        "parent": n - 1 if n > 1 else None,
        "answers": answers,
        "word_counts": {k: word_count(v) for k, v in answers.items()},
    }
    ws.write_json(path, version)
    os.chmod(path, stat.S_IRUSR | stat.S_IRGRP)  # read-only: locked
    att["versions"].append({"n": n, "kind": kind, "created": version["created"], "note": note,
                            "word_counts": version["word_counts"]})
    return version


def submit(ws, attempt_id):
    att = ws.load("attempt", attempt_id)
    if att["status"] != "in_progress":
        raise ExaminerError("attempt already submitted")
    exam = ws.load("exam", att["exam_id"])
    answers = att["draft"]["answers"]
    if not any(v.strip() for v in answers.values()):
        raise ExaminerError("nothing to submit: every answer is empty")
    _write_version(ws, att, "submission", answers, "original submission (locked)")
    att["status"] = "submitted"
    att["submitted"] = now_iso()
    att["unanswered"] = [k for k, v in answers.items() if not v.strip()]
    att["vocab_used"] = vb.detect_usage(ws, exam, answers)
    return ws.save("attempt", att)


def revise(ws, attempt_id, answers, note="revision"):
    att = ws.load("attempt", attempt_id)
    if att["status"] == "in_progress":
        raise ExaminerError("submit the attempt before revising it")
    exam = ws.load("exam", att["exam_id"])
    latest = load_version(ws, attempt_id)["answers"]
    merged = {**latest, **_clean_answers(exam, answers)}
    version = _write_version(ws, att, "revision", merged, note)
    ws.save("attempt", att)
    return version


def load_version(ws, attempt_id, n=None):
    att = ws.load("attempt", attempt_id)
    if not att["versions"]:
        raise ExaminerError("attempt has no submitted version yet")
    n = n or att["versions"][-1]["n"]
    path = _version_path(ws, attempt_id, n)
    if not path.exists():
        raise ExaminerError(f"version {n} not found")
    return ws.read_json(path)


def compare(ws, attempt_id, a=1, b=None):
    va, vb_ = load_version(ws, attempt_id, a), load_version(ws, attempt_id, b)
    out = {"from": va["n"], "to": vb_["n"], "tasks": {}}
    for task in va["answers"]:
        old, new = va["answers"].get(task, ""), vb_["answers"].get(task, "")
        diff = list(difflib.unified_diff(old.splitlines(), new.splitlines(),
                                         f"v{va['n']}", f"v{vb_['n']}", lineterm="", n=1))
        out["tasks"][task] = {"words": [word_count(old), word_count(new)], "changed": old != new, "diff": diff}
    return out
