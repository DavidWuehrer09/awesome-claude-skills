"""Tests for My English Examiner. Run: python3 -m unittest discover -s tests (or pytest)."""

import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

from examiner import assessment as asmod  # noqa: E402
from examiner import attempts as atts  # noqa: E402
from examiner import exams as exm  # noqa: E402
from examiner import extract as ex  # noqa: E402
from examiner import materials as mats  # noqa: E402
from examiner import profile as prof  # noqa: E402
from examiner import render  # noqa: E402
from examiner import vocab as vb  # noqa: E402
from examiner import weaknesses as wk  # noqa: E402
from examiner.store import ExaminerError, Workspace  # noqa: E402

EXAMPLES = SKILL / "examples"


def make_docx(path, body_xml, comments_xml=None):
    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
        zf.writestr("word/document.xml", f"<w:document {ns}><w:body>{body_xml}</w:body></w:document>")
        if comments_xml:
            zf.writestr("word/comments.xml", f"<w:comments {ns}>{comments_xml}</w:comments>")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.ws = Workspace(self.tmp / "ws")
        self.ws.init()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def ready_material(self, path, doc_type):
        rec = mats.ingest(self.ws, [path])[0]
        mats.confirm_type(self.ws, rec["id"], doc_type)
        mats.mark_reviewed(self.ws, rec["id"])
        return rec["id"]

    def setup_exam(self):
        self.ref = self.ready_material(EXAMPLES / "reference_exam.txt", "exam_paper")
        self.rub = self.ready_material(EXAMPLES / "rubric.txt", "rubric")
        exam = json.loads((EXAMPLES / "exam.json").read_text())
        exam["reference_exam_ids"] = [self.ref]
        exam["provenance"]["format_based_on"] = [self.ref]
        self.exam = exm.save_exam(self.ws, exam)
        return self.exam

    def submitted_attempt(self):
        exam = self.setup_exam()
        att = atts.start(self.ws, exam["id"])
        atts.save_draft(self.ws, att["id"], json.loads((EXAMPLES / "answers.json").read_text()))
        atts.submit(self.ws, att["id"])
        self.att_id = att["id"]
        return att["id"]

    def example_assessment(self):
        text = (EXAMPLES / "assessment.json").read_text()
        text = text.replace("__ATTEMPT_ID__", self.att_id).replace("__EXAM_ID__", self.exam["id"]) \
                   .replace("__RUBRIC_ID__", self.rub)
        return json.loads(text)


# ------------------------------------------------------------------ parsing

class TestExtraction(Base):
    def test_docx_keeps_structure_comments_and_tracked_changes(self):
        W = "w:"
        body = (
            f'<{W}p><{W}pPr><{W}pStyle {W}val="Heading1"/></{W}pPr><{W}r><{W}t>Klausur Q11</{W}t></{W}r></{W}p>'
            f'<{W}p><{W}pPr><{W}numPr/></{W}pPr><{W}r><{W}t>Summarise the text.</{W}t></{W}r></{W}p>'
            f'<{W}p><{W}r><{W}t>He </{W}t></{W}r><{W}del><{W}r><{W}delText>go</{W}delText></{W}r></{W}del>'
            f'<{W}ins><{W}r><{W}t>goes</{W}t></{W}r></{W}ins><{W}commentRangeStart {W}id="0"/>'
            f'<{W}r><{W}t> home.</{W}t></{W}r><{W}commentRangeEnd {W}id="0"/></{W}p>'
            f'<{W}tbl><{W}tr><{W}tc><{W}p><{W}r><{W}t>Inhalt</{W}t></{W}r></{W}p></{W}tc>'
            f'<{W}tc><{W}p><{W}r><{W}t>20 BE</{W}t></{W}r></{W}p></{W}tc></{W}tr></{W}tbl>')
        comments = (f'<{W}comment {W}id="0" {W}author="Teacher"><{W}p><{W}r><{W}t>tense!</{W}t></{W}r></{W}p></{W}comment>')
        path = self.tmp / "corr.docx"
        make_docx(path, body, comments)
        text, method, notes = ex.extract(path)
        self.assertEqual(method, "docx-xml")
        self.assertIn("## Klausur Q11", text)
        self.assertIn("1. Summarise the text.", text)
        self.assertIn("[[deleted: go]]", text)
        self.assertIn("[[inserted: goes]]", text)
        self.assertIn("[[teacher comment: tense! (by Teacher)]]", text)
        self.assertIn("| Inhalt | 20 BE |", text)
        self.assertTrue(notes)

    @unittest.skipUnless(shutil.which("pdftotext") or __import__("importlib").util.find_spec("pypdf"), "no PDF backend")
    def test_pdf_text_layer(self):
        pdf = self.tmp / "t.pdf"
        content = b"BT /F1 12 Tf 72 720 Td (Summarise the text in about 120 words please) Tj ET"
        objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
                b"/Resources << /Font << /F1 5 0 R >> >> >>",
                b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
                b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
        out, offsets = b"%PDF-1.4\n", []
        for i, o in enumerate(objs, 1):
            offsets.append(len(out))
            out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
        xref = len(out)
        out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
        out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
        out += b"trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
        pdf.write_bytes(out)
        text, method, _ = ex.extract(pdf)
        self.assertIn("Summarise the text", text)
        self.assertIn(method, ("pypdf", "pdftotext"))

    def test_image_without_ocr_needs_transcription(self):
        img = self.tmp / "scan.png"
        img.write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 100)
        if shutil.which("tesseract"):
            self.skipTest("tesseract installed")
        rec = mats.ingest(self.ws, [img])[0]
        self.assertEqual(rec["extraction"]["status"], "needs_transcription")
        with self.assertRaises(ExaminerError):
            mats.mark_reviewed(self.ws, rec["id"])

    def test_segmentation_keeps_grading_lines(self):
        text = "# Part\n\n" + ("Lorem ipsum dolor sit amet. " * 400) + "\n\nBewertung: Inhalt 60 BE, Sprache 40 BE\n\n" + "x " * 3000
        segs = ex.segment(text, limit=3000)
        self.assertGreater(len(segs), 2)
        self.assertEqual("".join(s["text"] for s in segs).count("Bewertung"), 1)
        self.assertTrue(any("Bewertung" in ln for s in segs for ln in s["grading_critical_lines"]))
        self.assertTrue(all(s["chars"] <= 3000 for s in segs))

    def test_classification(self):
        self.assertEqual(ex.classify((EXAMPLES / "rubric.txt").read_text())["guess"], "rubric")
        self.assertEqual(ex.classify((EXAMPLES / "reference_exam.txt").read_text())["guess"], "exam_paper")
        vague = ex.classify("Some notes about the weather.")
        self.assertTrue(vague["needs_confirmation"])
        self.assertEqual(vague["confidence"], "low")


# ------------------------------------------------------------------ materials

class TestMaterials(Base):
    def test_upload_session_and_confirmation_required(self):
        recs = mats.ingest(self.ws, [EXAMPLES / "reference_exam.txt", EXAMPLES / "rubric.txt"], {"topic": "media, politics"})
        self.assertEqual(len({r["upload_session"] for r in recs}), 1)
        self.assertEqual(recs[0]["labels"]["topic"], ["media", "politics"])
        self.assertEqual(len(mats.pending(self.ws)), 2)
        self.assertFalse(mats.usable(recs[0]))

    def test_rejects_bad_files_before_copying_anything(self):
        bad = self.tmp / "x.exe"
        bad.write_text("x")
        with self.assertRaises(ExaminerError):
            mats.ingest(self.ws, [EXAMPLES / "rubric.txt", bad])
        self.assertEqual(self.ws.list("material"), [])
        link = self.tmp / "l.txt"
        os.symlink(EXAMPLES / "rubric.txt", link)
        with self.assertRaises(ExaminerError):
            mats.ingest(self.ws, [link])
        big = self.tmp / "big.txt"
        with open(big, "wb") as fh:
            fh.truncate(26 * 1024 * 1024)
        with self.assertRaises(ExaminerError):
            mats.ingest(self.ws, [big])

    def test_edit_text_keeps_history_and_duplicate_detection(self):
        mid = mats.ingest(self.ws, [EXAMPLES / "rubric.txt"])[0]["id"]
        dup = mats.ingest(self.ws, [EXAMPLES / "rubric.txt"])[0]
        self.assertEqual(dup["duplicate_of"], mid)
        mats.set_text(self.ws, mid, "corrected text")
        self.assertEqual(mats.get_text(self.ws, mid), "corrected text")
        hist = self.ws.record_dir("material", mid) / "history" / "v1.md"
        self.assertIn("Bewertungsbogen", hist.read_text())
        self.assertEqual(self.ws.load("material", mid)["extraction"]["status"], "reviewed")
        mats.set_text(self.ws, mid, "claude transcription", note="Claude transcription from image")
        self.assertEqual(self.ws.load("material", mid)["extraction"]["status"], "needs_review")

    def test_search_and_filters(self):
        mats.ingest(self.ws, [EXAMPLES / "reference_exam.txt"], {"topic": "social media", "importance": "high"})
        mats.ingest(self.ws, [EXAMPLES / "rubric.txt"], {"topic": "assessment"})
        hits = mats.search(self.ws, "democracy")
        self.assertEqual(len(hits), 1)
        self.assertTrue(hits[0]["snippets"])
        self.assertEqual(len(mats.search(self.ws, topic="assessment")), 1)
        self.assertEqual(len(mats.search(self.ws, importance="high")), 1)
        with self.assertRaises(ExaminerError):
            mats.update_labels(self.ws, hits[0]["id"], {"importance": "urgent"})

    def test_ids_cannot_escape_workspace(self):
        for bad in ("../../etc", "mat_../../x", "exam_1234567890", "mat_ABCDEF1234", ""):
            with self.assertRaises(ExaminerError):
                self.ws.load("material", bad)

    def test_delete_and_export_and_purge(self):
        mid = mats.ingest(self.ws, [EXAMPLES / "rubric.txt"])[0]["id"]
        archive = self.ws.export_zip(self.tmp / "backup.zip")
        with zipfile.ZipFile(archive) as zf:
            self.assertTrue(any(n.endswith("extracted.md") for n in zf.namelist()))
        with self.assertRaises(ExaminerError):
            self.ws.export_zip(self.ws.root / "inside.zip")
        self.ws.delete("material", mid)
        self.assertEqual(self.ws.list("material"), [])
        self.ws.purge()
        self.assertFalse(self.ws.root.exists())


# ------------------------------------------------------------------ profile

class TestProfile(Base):
    def test_honesty_rules(self):
        ref = self.ready_material(EXAMPLES / "reference_exam.txt", "exam_paper")
        rub = self.ready_material(EXAMPLES / "rubric.txt", "rubric")
        ok = prof.add_entry(self.ws, {"section": "time_limit", "statement": "90 minutes", "provenance": "teacher_explicit",
                                      "confidence": "confirmed",
                                      "evidence": [{"material_id": ref, "quote": "Arbeitszeit:  90 Minuten"}]})
        self.assertEqual(ok["id"], "p1")
        bad = [
            {"section": "time_limit", "statement": "x", "provenance": "teacher_explicit", "confidence": "confirmed",
             "evidence": [{"material_id": ref, "quote": "Arbeitszeit: 120 Minuten"}]},  # invented quote
            {"section": "task_sequence", "statement": "x", "provenance": "observed_pattern", "confidence": "medium",
             "evidence": [{"material_id": ref}]},  # one document but not provisional
            {"section": "task_sequence", "statement": "x", "provenance": "observed_pattern", "confidence": "provisional"},
            {"section": "grading_criteria", "statement": "Language counts double", "provenance": "observed_pattern",
             "confidence": "provisional", "evidence": [{"material_id": ref}]},  # inferred rule not labelled
            {"section": "time_limit", "statement": "x", "provenance": "teacher_explicit", "confidence": "high"},
            {"section": "time_limit", "statement": "x", "provenance": "official_guidance", "confidence": "high", "evidence": []},
        ]
        for entry in bad:
            with self.assertRaises(ExaminerError, msg=entry):
                prof.add_entry(self.ws, entry)
        prof.add_entry(self.ws, {"section": "task_sequence", "statement": "Summary, analysis, then a choice",
                                 "provenance": "observed_pattern", "confidence": "provisional",
                                 "evidence": [{"material_id": ref}]})
        with self.assertRaises(ExaminerError):  # batch is all-or-nothing
            prof.add_entries(self.ws, [{"section": "other", "statement": "fine", "provenance": "ai_suggestion",
                                        "confidence": "low"}, bad[0]])
        self.assertEqual(len(prof.load(self.ws)["entries"]), 2)
        prof.edit_entry(self.ws, "p2", {"statement": "Summary first, then analysis"})
        self.assertTrue(prof.load(self.ws)["entries"][1]["user_edited"])
        self.ws.delete("material", rub)
        self.ws.delete("material", ref)
        self.assertTrue(prof.audit(self.ws)["invalid_entries"])
        prof.delete_entry(self.ws, "p1")

    def test_unconfirmed_material_cannot_be_evidence(self):
        mid = mats.ingest(self.ws, [EXAMPLES / "reference_exam.txt"])[0]["id"]
        with self.assertRaises(ExaminerError):
            prof.add_entry(self.ws, {"section": "time_limit", "statement": "90", "provenance": "teacher_explicit",
                                     "confidence": "confirmed", "evidence": [{"material_id": mid, "quote": "90 Minuten"}]})


# ------------------------------------------------------------------ exams

class TestExams(Base):
    def test_blueprint_defaults_and_unconfirmed_materials(self):
        bp = exm.save_blueprint(self.ws, {"topics": ["AI"], "difficulty": "stretch"})
        self.assertIn("duration_minutes", bp["defaults_used"])
        mid = mats.ingest(self.ws, [EXAMPLES / "reference_exam.txt"])[0]["id"]
        with self.assertRaises(ExaminerError):
            exm.save_blueprint(self.ws, {"topics": ["AI"], "reference_exam_ids": [mid]})
        with self.assertRaises(ExaminerError):
            exm.save_blueprint(self.ws, {"topics": ["AI"], "difficulty": "impossible"})

    def test_valid_exam_saves(self):
        exam = self.setup_exam()
        self.assertEqual(exam["validation"]["originality"], [])

    def _bad(self, mutate):
        self.ref = getattr(self, "ref", None) or self.ready_material(EXAMPLES / "reference_exam.txt", "exam_paper")
        exam = json.loads((EXAMPLES / "exam.json").read_text())
        exam["reference_exam_ids"] = [self.ref]
        mutate(exam)
        with self.assertRaises(ExaminerError) as cm:
            exm.save_exam(self.ws, exam)
        return str(cm.exception)

    def test_exam_rules(self):
        self.assertIn("fictional", self._bad(lambda e: e["sources"][0].update(label="Practice text")))
        self.assertIn("verified", self._bad(lambda e: e["sources"][0].update(
            kind="authentic", label="", citation={"author": "A. Writer", "title": "T", "publication": "P", "date": "2024"})))
        self.assertIn("total_points", self._bad(lambda e: e["marking"].update(total_points=50)))
        self.assertIn("practice", self._bad(lambda e: e["marking"].update(label="Official scheme")))
        self.assertIn("hidden expectations", self._bad(lambda e: e["hidden"]["task_expectations"].pop()))
        self.assertIn("unknown source", self._bad(lambda e: e["tasks"][0].update(source_ids=["M9"])))

    def test_copied_question_rejected(self):
        def copy_task(e):
            e["tasks"][1]["instruction"] = ("Examine the means the author uses to convey their attitude towards "
                                            "young voters and their critics.")
        self.assertIn("similar", self._bad(copy_task))

        def copy_text(e):
            e["sources"][0]["text"] = (EXAMPLES / "reference_exam.txt").read_text().split("(adapted)")[1][:700]
        self.assertIn("8-word", self._bad(copy_text))

    def test_student_view_hides_solutions(self):
        exam = self.setup_exam()
        view = exm.student_view(exam)
        blob = json.dumps(view)
        for secret in ("expected_content", "common_pitfalls", "vocabulary_targets", "Concession", "criteria",
                       "format_based_on", "verified"):
            self.assertNotIn(secret, blob)
        att = atts.start(self.ws, exam["id"])
        html = exm.render_exam_room(self.ws, exam["id"], att["id"]).read_text()
        self.assertNotIn("expected_content", html)
        self.assertNotIn("Personal, first-person opening", html)
        self.assertIn(att["id"], html)
        self.assertNotIn("/*__EXAM_DATA__*/null", html)

    def test_script_injection_is_neutralised(self):
        exam = self.setup_exam()
        exam["title"] = "</script><script>alert(1)</script>"
        exam["sources"][0]["text"] += "\n</script><img src=x onerror=alert(2)>"
        self.ws.save("exam", exam)
        att = atts.start(self.ws, exam["id"])
        html = exm.render_exam_room(self.ws, exam["id"], att["id"]).read_text()
        self.assertEqual(html.count("</script>"), 1)


# ------------------------------------------------------------------ attempts

class TestAttempts(Base):
    def test_lifecycle(self):
        exam = self.setup_exam()
        att = atts.start(self.ws, exam["id"])
        with self.assertRaises(ExaminerError):
            atts.submit(self.ws, att["id"])  # empty
        with self.assertRaises(ExaminerError):
            atts.save_draft(self.ws, att["id"], {"9": "x"})
        atts.save_draft(self.ws, att["id"], {"1": "First draft of the summary."})
        sub = atts.submit(self.ws, att["id"])
        self.assertEqual(sub["unanswered"], ["2", "3"])
        v1 = atts.load_version(self.ws, att["id"], 1)
        self.assertFalse(os.access(self.ws.record_dir("attempt", att["id"]) / "v1.json", os.W_OK)
                         and os.geteuid() != 0)
        with self.assertRaises(ExaminerError):
            atts.save_draft(self.ws, att["id"], {"1": "changed"})
        atts.revise(self.ws, att["id"], {"1": "Improved summary of the text."})
        self.assertEqual(atts.load_version(self.ws, att["id"], 1)["answers"], v1["answers"])
        diff = atts.compare(self.ws, att["id"], 1, 2)
        self.assertTrue(diff["tasks"]["1"]["changed"])
        self.assertFalse(diff["tasks"]["2"]["changed"])
        with self.assertRaises(ExaminerError):
            atts._write_version(self.ws, {**self.ws.load("attempt", att["id"]), "versions": []}, "x", {}, "")

    def test_import_from_exam_room(self):
        exam = self.setup_exam()
        att = atts.start(self.ws, exam["id"])
        payload = {"format": "english-examiner/answers@1", "exam_id": exam["id"], "attempt_id": att["id"],
                   "submitted": True, "answers": {"1": "An answer.", "2": "", "3": ""},
                   "timing": {"timed": True, "elapsed_seconds": 4000}}
        res = atts.import_room_file(self.ws, payload)
        self.assertEqual(res["status"], "submitted")
        other = atts.start(self.ws, exam["id"])
        with self.assertRaises(ExaminerError):
            atts.import_room_file(self.ws, {**payload, "attempt_id": other["id"], "exam_id": "exam_0123456789"})


# ------------------------------------------------------------------ assessment

class TestAssessment(Base):
    def setUp(self):
        super().setUp()
        self.submitted_attempt()

    def assert_rejected(self, mutate, fragment):
        asm = self.example_assessment()
        mutate(asm)
        result = asmod.check(self.ws, asm)
        self.assertTrue(any(fragment in e for e in result["errors"]), result["errors"])

    def test_example_is_valid_and_renders(self):
        asm = asmod.save(self.ws, self.example_assessment())
        html = render.assessment_html(self.ws, asm)
        self.assertIn("5–7 points", html)
        self.assertIn("not an official grade", html)
        self.assertIn("Level 3", html)
        with self.assertRaises(ExaminerError):
            asmod.save(self.ws, self.example_assessment())  # same version twice

    def test_misquoting_the_student_is_rejected(self):
        self.assert_rejected(lambda a: a["comments"][0].update(original="I strongly agree with this statement."),
                             "not found in the submitted answer")

    def test_invented_source_quotation_is_rejected(self):
        self.assert_rejected(lambda a: a["model_answer"]["per_task"][1].update(
            text=a["model_answer"]["per_task"][1]["text"] + ' The author calls AI "a silent thief of careers".'),
            "quotation not found")

    def test_percentage_conversion_needs_teacher_rubric(self):
        self.assert_rejected(lambda a: a["estimate"]["assumptions"].append("50% of the points equals 5 Punkte"),
                             "percentage-to-points")

    def test_no_overclaiming(self):
        self.assert_rejected(lambda a: a["estimate"]["most_valuable_changes"].append(
            "Do this and you will definitely get 15 points"), "over-claim")
        self.assert_rejected(lambda a: a["independent"].update(summary="This is your official grade."), "over-claim")

    def test_excellent_sentence_cannot_be_corrected(self):
        def mutate(a):
            a["comments"][-1].update(english_status="excellent", severity="none")
        self.assert_rejected(mutate, "excellent passage")

    def test_valid_choice_is_not_an_error(self):
        self.assert_rejected(lambda a: a["comments"][-1].update(category="language_error"), "language_error")
        self.assert_rejected(lambda a: a["comments"][-1].update(severity="major"), "valid stylistic choice")

    def test_estimate_rules(self):
        self.assert_rejected(lambda a: a["estimate"].update(low=9, high=7), "low > high")
        self.assert_rejected(lambda a: a["estimate"].update(best=12), "inside the range")
        self.assert_rejected(lambda a: a["estimate"].update(assumptions=[]), "assumptions")
        self.assert_rejected(lambda a: a["estimate"].update(high=16), "maximum")

        def no_rubric(a):
            a["course_specific"].update(rubric_basis="none_available", rubric_material_ids=[])
            a["estimate"]["basis"] = "teacher_rubric"
        self.assert_rejected(no_rubric, "teacher basis")
        self.assert_rejected(lambda a: a["course_specific"].update(rubric_material_ids=[self.ref]) or
                             a["course_specific"].update(rubric_basis="teacher_rubric") or
                             a["course_specific"]["applied_criteria"].append(
                                 {"criterion": "x", "provenance": "teacher_explicit", "judgement": "y",
                                  "evidence_sufficient": True}) or
                             a["course_specific"].update(rubric_basis="none_available"),
                             "teacher_explicit without")

    def test_dispute_flow_updates_weaknesses(self):
        asm = asmod.save(self.ws, self.example_assessment())
        d = asmod.dispute(self.ws, asm["id"], "c9", "'more quiet' is listed in dictionaries as acceptable")
        asmod.resolve_dispute(self.ws, asm["id"], d["id"], "revised", "Agreed: acceptable, just less common.",
                              {"english_status": "valid_less_effective", "category": "optional_refinement"})
        c9 = next(c for c in self.ws.load("assessment", asm["id"])["comments"] if c["id"] == "c9")
        self.assertEqual(c9["english_status"], "valid_less_effective")
        self.assertEqual(c9["history"][0]["english_status"], "unnatural")
        d2 = asmod.dispute(self.ws, asm["id"], "c7", "Contractions were allowed by my teacher")
        asmod.resolve_dispute(self.ws, asm["id"], d2["id"], "withdrawn", "Withdrawn; teacher rule takes precedence.")
        self.assertEqual(self.ws.read_json(self.ws.weaknesses_path)["skills"]["register_slips"]["times_present"], 0)
        asmod.mark_unhelpful(self.ws, asm["id"], "c10", "Too picky")
        self.assertEqual(asmod.feedback_preferences(self.ws)[0]["reason"], "Too picky")
        with self.assertRaises(ExaminerError):
            asmod.resolve_dispute(self.ws, asm["id"], d["id"], "revised", "x",
                                  {"english_status": "excellent", "severity": "minor"})


# ------------------------------------------------------------------ adaptivity

class TestWeaknessesAndVocab(Base):
    def test_no_mastery_from_one_attempt(self):
        h = [{"present": False, "severity": "none"}]
        self.assertEqual(wk._status(h), "no_problem_seen_yet")
        self.assertEqual(wk._status([{"present": True, "severity": "major"}] + h), "improving")
        self.assertEqual(wk._status([{"present": True, "severity": "major"}] + h * 3), "secure_provisional")
        self.assertEqual(wk._status([{"present": True, "severity": "minor"}] * 2), "recurring")

    def test_recommendation_after_one_attempt_is_provisional(self):
        self.submitted_attempt()
        asmod.save(self.ws, self.example_assessment())
        rec = wk.recommend(self.ws)
        self.assertEqual(rec["recommended_difficulty"], "realistic")
        self.assertTrue(any("provisional" in a for a in rec["advice"]))
        self.assertEqual(rec["focus"][0]["skill"], "inadequate_task_fulfilment")
        self.assertIn("<svg", render.progress_html(self.ws))

    def test_vocab_tracking(self):
        res = vb.import_list(self.ws, "term;meaning\ndrudgery;Plackerei\nentry-level;Einstiegs-\nin the long run;langfristig\n")
        self.assertEqual(res["added"], 3)
        self.assertEqual(vb.import_list(self.ws, "drudgery - Plackerei")["skipped_duplicates"], 1)
        self.submitted_attempt()
        vb.mark_targeted(self.ws, ["drudgery", "entry-level", "in the long run"])
        att = self.ws.load("attempt", self.att_id)
        self.assertEqual(att["vocab_used"]["used"], ["in the long run"])
        asmod.save(self.ws, self.example_assessment())
        stats = vb.stats(self.ws)
        self.assertEqual(stats["targeted_not_used"], 2)
        self.assertEqual(vb.suggest(self.ws, 1)[0]["term"], "drudgery")


class TestCli(Base):
    def run_cli(self, *args):
        proc = subprocess.run([sys.executable, str(SKILL / "scripts" / "examiner.py"), "--home", str(self.ws.root), *args],
                              capture_output=True, text=True)
        return proc.returncode, json.loads(proc.stdout)

    def test_cli_errors_are_json(self):
        code, out = self.run_cli("materials", "show", "mat_0000000000")
        self.assertEqual(code, 1)
        self.assertIn("error", out)
        code, out = self.run_cli("purge", "--yes")
        self.assertEqual(code, 1)
        code, out = self.run_cli("status")
        self.assertEqual(code, 0)
        self.assertEqual(out["counts"]["material"], 0)


if __name__ == "__main__":
    unittest.main()
