"""Command-line interface. Every command prints JSON so Claude can parse it."""

import argparse
import json
import sys
from pathlib import Path

from . import assessment as asmod
from . import attempts as atts
from . import exams as exm
from . import materials as mats
from . import profile as prof
from . import render
from . import vocab as vb
from . import weaknesses as wk
from .store import ExaminerError, Workspace


def _json_arg(path):
    if path == "-":
        return json.load(sys.stdin)
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        raise ExaminerError(f"file not found: {path}")
    except json.JSONDecodeError as exc:
        raise ExaminerError(f"{path} is not valid JSON: {exc}")


def _labels(a):
    out = {}
    for key in ("topic", "date", "exam_type", "year_level", "importance", "tags", "title"):
        val = getattr(a, key, None)
        if val is not None:
            out[key] = val
    return out


def _brief_material(m):
    c = m["classification"]
    return {"id": m["id"], "filename": m["filename"], "type": c.get("type"), "guess": c.get("guess"),
            "guess_confidence": c.get("guess_confidence"), "status": m["extraction"]["status"],
            "method": m["extraction"]["method"], "notes": m["extraction"]["notes"], "labels": m["labels"],
            "chars": m.get("chars"), "segments": m.get("segments"), "duplicate_of": m.get("duplicate_of")}


def cmd(ws, a):  # noqa: C901 - a flat dispatcher is easiest to read here
    g, s = a.group, getattr(a, "sub", None)
    if g == "init":
        return {"workspace": str(ws.init())}
    ws.require()
    if g == "status":
        recs = {k: len(ws.list(k)) for k in ("material", "blueprint", "exam", "attempt", "assessment")}
        open_attempts = [x["id"] for x in ws.list("attempt") if x["status"] == "in_progress"]
        assessed = {x["attempt_id"] for x in ws.list("assessment")}
        unassessed = [x["id"] for x in ws.list("attempt") if x["status"] == "submitted" and x["id"] not in assessed]
        return {"workspace": str(ws.root), "counts": recs, "materials_pending": mats.pending(ws),
                "profile": prof.audit(ws), "attempts_in_progress": open_attempts,
                "submitted_not_assessed": unassessed}

    if g == "materials":
        if s == "add":
            return [_brief_material(m) for m in mats.ingest(ws, a.files, _labels(a), a.type)]
        if s == "pending":
            return mats.pending(ws)
        if s == "list":
            return [_brief_material(m) for m in ws.list("material")
                    if not a.type or (m["classification"].get("type") or m["classification"]["guess"]) == a.type]
        if s == "search":
            return mats.search(ws, a.query, a.type, a.topic, a.exam_type, a.year_level, a.importance, a.limit)
        if s == "show":
            rec = ws.load("material", a.id)
            out = _brief_material(rec)
            if a.segment is not None:
                segs = mats.get_segments(ws, a.id)
                if not 0 <= a.segment < len(segs):
                    raise ExaminerError(f"segment must be 0..{len(segs) - 1}")
                out["segment"] = segs[a.segment]
            else:
                text = mats.get_text(ws, a.id)
                out["text"] = text if a.full or len(text) <= 12000 else text[:12000]
                out["truncated"] = not a.full and len(text) > 12000
                out["grading_critical_lines"] = [ln for sg in mats.get_segments(ws, a.id)
                                                 for ln in sg["grading_critical_lines"]]
            out["original_path"] = str(ws.record_dir("material", a.id) / rec["original"])
            out["editable_text_path"] = str(ws.record_dir("material", a.id) / "extracted.md")
            return out
        if s == "set-text":
            text = Path(a.file).read_text(encoding="utf-8")
            return _brief_material(mats.set_text(ws, a.id, text, a.note))
        if s == "reviewed":
            return _brief_material(mats.mark_reviewed(ws, a.id))
        if s == "classify":
            return _brief_material(mats.confirm_type(ws, a.id, a.doc_type))
        if s == "label":
            return _brief_material(mats.update_labels(ws, a.id, _labels(a)))
        if s == "delete":
            if not a.yes:
                raise ExaminerError("deleting is permanent: repeat with --yes")
            ws.delete("material", a.id)
            return {"deleted": a.id, "profile_check": prof.audit(ws)}

    if g == "profile":
        if s == "show":
            return prof.load(ws)
        if s == "audit":
            return prof.audit(ws)
        if s == "add":
            data = _json_arg(a.json)
            entries = data if isinstance(data, list) else [data]
            return prof.add_entries(ws, entries)
        if s == "edit":
            return prof.edit_entry(ws, a.id, _json_arg(a.json), by_user=not a.by_claude)
        if s == "delete":
            prof.delete_entry(ws, a.id)
            return {"deleted": a.id}
        if s == "student":
            fields = {k: v for k, v in vars(a).items()
                      if k in ("year_level", "course_level", "target", "preferred_exam_format", "school") and v is not None}
            return prof.set_student(ws, **fields)["student"]
        if s == "guidance":
            return prof.record_guidance(ws, a.title, a.url, a.summary, a.verified)["official_guidance_checked"]

    if g == "blueprint":
        if s == "create":
            return exm.save_blueprint(ws, _json_arg(a.json))
        if s == "show":
            return ws.load("blueprint", a.id)
        if s == "list":
            return ws.list("blueprint")

    if g == "exam":
        if s == "check":
            exam = _json_arg(a.json)
            exam.setdefault("id", "exam_0000000000")
            exam.setdefault("created", "")
            return exm.check_exam(ws, exam)
        if s == "save":
            exam = exm.save_exam(ws, _json_arg(a.json))
            targets = exam["hidden"].get("vocabulary_targets", [])
            if targets:
                vb.mark_targeted(ws, targets)
            return {"id": exam["id"], "warnings": exam["validation"]["warnings"],
                    "originality": exam["validation"]["originality"]}
        if s == "show":
            exam = ws.load("exam", a.id)
            return exm.student_view(exam) if a.student else exam
        if s == "list":
            return [{"id": x["id"], "title": x["title"], "difficulty": x["difficulty"], "created": x["created"]}
                    for x in ws.list("exam")]

    if g == "attempt":
        if s == "start":
            att = atts.start(ws, a.exam_id, timed=not a.untimed)
            path = exm.render_exam_room(ws, a.exam_id, att["id"], a.out)
            return {"attempt_id": att["id"], "exam_room": str(path)}
        if s == "room":
            att = ws.load("attempt", a.id)
            return {"exam_room": str(exm.render_exam_room(ws, att["exam_id"], a.id, a.out))}
        if s == "draft":
            att = atts.save_draft(ws, a.id, _json_arg(a.json))
            return {"id": att["id"], "saved": att["draft"]["saved"]}
        if s == "import":
            att = atts.import_room_file(ws, _json_arg(a.file))
            return {"id": att["id"], "status": att["status"], "versions": att["versions"]}
        if s == "submit":
            att = atts.submit(ws, a.id)
            return {"id": att["id"], "status": att["status"], "versions": att["versions"],
                    "unanswered": att["unanswered"], "vocab_used": att["vocab_used"]}
        if s == "revise":
            return atts.revise(ws, a.id, _json_arg(a.json), a.note)
        if s == "show":
            att = ws.load("attempt", a.id)
            if att["versions"]:
                att["version_detail"] = atts.load_version(ws, a.id, a.version)
            return att
        if s == "compare":
            return atts.compare(ws, a.id, a.from_v, a.to_v)
        if s == "list":
            return [{"id": x["id"], "exam_id": x["exam_id"], "status": x["status"], "versions": len(x["versions"])}
                    for x in ws.list("attempt")]

    if g == "assess":
        if s == "check":
            return asmod.check(ws, _json_arg(a.json))
        if s == "save":
            asm = asmod.save(ws, _json_arg(a.json))
            out = ws.root / "reports" / f"{asm['id']}.html"
            out.write_text(render.assessment_html(ws, asm), encoding="utf-8")
            return {"id": asm["id"], "report": str(out), "warnings": asm["validation_warnings"]}
        if s == "show":
            return ws.load("assessment", a.id)
        if s == "report":
            asm = ws.load("assessment", a.id)
            out = Path(a.out) if a.out else ws.root / "reports" / f"{asm['id']}.html"
            out.write_text(render.assessment_html(ws, asm), encoding="utf-8")
            return {"report": str(out)}
        if s == "dispute":
            return asmod.dispute(ws, a.id, a.comment_id, a.argument)
        if s == "resolve":
            revision = _json_arg(a.revision) if a.revision else None
            d = asmod.resolve_dispute(ws, a.id, a.dispute_id, a.outcome, a.response, revision)
            asm = ws.load("assessment", a.id)
            (ws.root / "reports" / f"{asm['id']}.html").write_text(render.assessment_html(ws, asm), encoding="utf-8")
            return d
        if s == "unhelpful":
            return asmod.mark_unhelpful(ws, a.id, a.comment_id, a.reason)
        if s == "preferences":
            return asmod.feedback_preferences(ws)
        if s == "list":
            return [{"id": x["id"], "attempt_id": x["attempt_id"], "version": x["version"],
                     "estimate": [x["estimate"]["low"], x["estimate"]["high"]]} for x in ws.list("assessment")]

    if g == "weakness":
        if s == "show":
            return wk.rebuild(ws)
        if s == "recommend":
            return wk.recommend(ws)

    if g == "progress":
        if a.html:
            out = ws.root / "reports" / "progress.html"
            out.write_text(render.progress_html(ws), encoding="utf-8")
            return {"dashboard": str(out)}
        return wk.progress(ws)

    if g == "vocab":
        if s == "import":
            return vb.import_list(ws, Path(a.file).read_text(encoding="utf-8"), a.topic)
        if s == "from-material":
            return vb.import_list(ws, mats.get_text(ws, a.id), a.topic, a.id)
        if s == "suggest":
            return vb.suggest(ws, a.n, a.topic)
        if s == "stats":
            return vb.stats(ws)

    if g == "export":
        return {"archive": ws.export_zip(a.dest)}
    if g == "purge":
        if not a.yes or a.confirm != ws.root.name:
            raise ExaminerError(f"this deletes everything; repeat with --yes --confirm {ws.root.name}")
        ws.purge()
        return {"purged": str(ws.root)}
    raise ExaminerError("unknown command; use --help")


def build_parser():
    p = argparse.ArgumentParser(prog="examiner.py", description="My English Examiner workspace tool")
    p.add_argument("--home", help="workspace directory (default: $EXAMINER_HOME or ./english-examiner-data)")
    top = p.add_subparsers(dest="group", required=True)
    top.add_parser("init")
    top.add_parser("status")

    def labels(sp):
        sp.add_argument("--topic"), sp.add_argument("--date"), sp.add_argument("--exam-type", dest="exam_type")
        sp.add_argument("--year-level", dest="year_level"), sp.add_argument("--importance")
        sp.add_argument("--tags"), sp.add_argument("--title")

    m = top.add_parser("materials").add_subparsers(dest="sub", required=True)
    x = m.add_parser("add"); x.add_argument("files", nargs="+"); x.add_argument("--type"); labels(x)
    m.add_parser("pending")
    x = m.add_parser("list"); x.add_argument("--type")
    x = m.add_parser("search"); x.add_argument("query", nargs="?", default=""); x.add_argument("--type")
    x.add_argument("--topic"); x.add_argument("--exam-type", dest="exam_type"); x.add_argument("--year-level", dest="year_level")
    x.add_argument("--importance"); x.add_argument("--limit", type=int, default=20)
    x = m.add_parser("show"); x.add_argument("id"); x.add_argument("--segment", type=int); x.add_argument("--full", action="store_true")
    x = m.add_parser("set-text"); x.add_argument("id"); x.add_argument("--file", required=True)
    x.add_argument("--note", default="user correction")
    x = m.add_parser("reviewed"); x.add_argument("id")
    x = m.add_parser("classify"); x.add_argument("id"); x.add_argument("doc_type")
    x = m.add_parser("label"); x.add_argument("id"); labels(x)
    x = m.add_parser("delete"); x.add_argument("id"); x.add_argument("--yes", action="store_true")

    pr = top.add_parser("profile").add_subparsers(dest="sub", required=True)
    pr.add_parser("show"); pr.add_parser("audit")
    x = pr.add_parser("add"); x.add_argument("--json", required=True)
    x = pr.add_parser("edit"); x.add_argument("id"); x.add_argument("--json", required=True)
    x.add_argument("--by-claude", action="store_true")
    x = pr.add_parser("delete"); x.add_argument("id")
    x = pr.add_parser("student")
    for f in ("year-level", "course-level", "target", "preferred-exam-format", "school"):
        x.add_argument("--" + f, dest=f.replace("-", "_"))
    x = pr.add_parser("guidance"); x.add_argument("--title", required=True); x.add_argument("--url", required=True)
    x.add_argument("--summary", required=True); x.add_argument("--verified", action="store_true")

    b = top.add_parser("blueprint").add_subparsers(dest="sub", required=True)
    x = b.add_parser("create"); x.add_argument("--json", required=True)
    x = b.add_parser("show"); x.add_argument("id")
    b.add_parser("list")

    e = top.add_parser("exam").add_subparsers(dest="sub", required=True)
    x = e.add_parser("check"); x.add_argument("--json", required=True)
    x = e.add_parser("save"); x.add_argument("--json", required=True)
    x = e.add_parser("show"); x.add_argument("id"); x.add_argument("--student", action="store_true")
    e.add_parser("list")

    t = top.add_parser("attempt").add_subparsers(dest="sub", required=True)
    x = t.add_parser("start"); x.add_argument("exam_id"); x.add_argument("--untimed", action="store_true"); x.add_argument("--out")
    x = t.add_parser("room"); x.add_argument("id"); x.add_argument("--out")
    x = t.add_parser("draft"); x.add_argument("id"); x.add_argument("--json", required=True)
    x = t.add_parser("import"); x.add_argument("file")
    x = t.add_parser("submit"); x.add_argument("id")
    x = t.add_parser("revise"); x.add_argument("id"); x.add_argument("--json", required=True); x.add_argument("--note", default="revision")
    x = t.add_parser("show"); x.add_argument("id"); x.add_argument("--version", type=int)
    x = t.add_parser("compare"); x.add_argument("id"); x.add_argument("--from", dest="from_v", type=int, default=1)
    x.add_argument("--to", dest="to_v", type=int)
    t.add_parser("list")

    s = top.add_parser("assess").add_subparsers(dest="sub", required=True)
    x = s.add_parser("check"); x.add_argument("--json", required=True)
    x = s.add_parser("save"); x.add_argument("--json", required=True)
    x = s.add_parser("show"); x.add_argument("id")
    x = s.add_parser("report"); x.add_argument("id"); x.add_argument("--out")
    x = s.add_parser("dispute"); x.add_argument("id"); x.add_argument("comment_id"); x.add_argument("--argument", required=True)
    x = s.add_parser("resolve"); x.add_argument("id"); x.add_argument("dispute_id")
    x.add_argument("--outcome", required=True, choices=["upheld", "revised", "withdrawn"])
    x.add_argument("--response", required=True); x.add_argument("--revision")
    x = s.add_parser("unhelpful"); x.add_argument("id"); x.add_argument("comment_id"); x.add_argument("--reason", required=True)
    s.add_parser("preferences"); s.add_parser("list")

    w = top.add_parser("weakness").add_subparsers(dest="sub", required=True)
    w.add_parser("show"); w.add_parser("recommend")
    x = top.add_parser("progress"); x.add_argument("--html", action="store_true")

    v = top.add_parser("vocab").add_subparsers(dest="sub", required=True)
    x = v.add_parser("import"); x.add_argument("file"); x.add_argument("--topic")
    x = v.add_parser("from-material"); x.add_argument("id"); x.add_argument("--topic")
    x = v.add_parser("suggest"); x.add_argument("--n", type=int, default=8); x.add_argument("--topic")
    v.add_parser("stats")

    x = top.add_parser("export"); x.add_argument("dest")
    x = top.add_parser("purge"); x.add_argument("--yes", action="store_true"); x.add_argument("--confirm")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    ws = Workspace(args.home)
    try:
        result = cmd(ws, args)
    except ExaminerError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0
