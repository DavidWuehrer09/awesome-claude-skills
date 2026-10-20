"""Text extraction, segmentation and first-pass classification of materials.

Extraction never pretends to have succeeded: when a scan has no text layer and
no OCR engine is installed, the material is marked `needs_transcription` so
Claude (who can read images and PDFs visually) transcribes it and the user
checks the transcription in the editable preview.
"""

import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".heic", ".webp", ".tif", ".tiff"}
SEGMENT_CHARS = 6000
MIN_TEXT_CHARS_PER_PAGE = 40


# ---------------------------------------------------------------- docx

def _run_text(node):
    parts = []
    for el in node.iter():
        if el.tag == W + "t":
            parts.append(el.text or "")
        elif el.tag == W + "delText":
            parts.append(el.text or "")
        elif el.tag == W + "tab":
            parts.append("\t")
        elif el.tag in (W + "br", W + "cr"):
            parts.append("\n")
    return "".join(parts)


def _paragraph(p, comment_texts):
    style = p.find(f"{W}pPr/{W}pStyle")
    style = style.get(W + "val", "") if style is not None else ""
    numbered = p.find(f"{W}pPr/{W}numPr") is not None
    pieces = []
    for child in p:
        if child.tag == W + "r":
            pieces.append(_run_text(child))
        elif child.tag == W + "ins":
            text = _run_text(child)
            if text.strip():
                pieces.append(f"[[inserted: {text}]]")
        elif child.tag == W + "del":
            text = _run_text(child)
            if text.strip():
                pieces.append(f"[[deleted: {text}]]")
        elif child.tag == W + "hyperlink":
            pieces.append(_run_text(child))
        elif child.tag == W + "commentRangeStart":
            pieces.append("⟦")
        elif child.tag == W + "commentRangeEnd":
            cid = child.get(W + "id")
            note = comment_texts.get(cid)
            pieces.append(f"⟧[[teacher comment: {note}]]" if note else "⟧")
    text = "".join(pieces).replace("⟦", "").replace("⟧", "")
    if not text.strip():
        return ""
    m = re.match(r"(?i)heading\s*(\d)", style) or re.match(r"(?i)berschrift\s*(\d)", style)
    if m:
        return "#" * min(int(m.group(1)) + 1, 6) + " " + text.strip()
    if style.lower() == "title":
        return "# " + text.strip()
    if numbered:
        return "1. " + text.strip()
    return text


def _table(tbl, comment_texts):
    rows = []
    for tr in tbl.iter(W + "tr"):
        cells = []
        for tc in tr.findall(W + "tc"):
            cell = " ".join(filter(None, (_paragraph(p, comment_texts) for p in tc.iter(W + "p"))))
            cells.append(cell.replace("|", "\\|").replace("\n", " "))
        rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + " --- |" * width]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)


def extract_docx(path):
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        if "word/document.xml" not in names:
            raise ValueError("not a Word document (word/document.xml missing)")
        comment_texts = {}
        if "word/comments.xml" in names:
            croot = ET.fromstring(zf.read("word/comments.xml"))
            for c in croot.iter(W + "comment"):
                author = c.get(W + "author") or "unknown"
                body = " ".join(_run_text(p).strip() for p in c.iter(W + "p")).strip()
                comment_texts[c.get(W + "id")] = f"{body} (by {author})"
        root = ET.fromstring(zf.read("word/document.xml"))
    body = root.find(W + "body")
    blocks = []
    for child in body:
        if child.tag == W + "p":
            blocks.append(_paragraph(child, comment_texts))
        elif child.tag == W + "tbl":
            blocks.append(_table(child, comment_texts))
    text = "\n\n".join(b for b in blocks if b)
    notes = []
    if comment_texts:
        notes.append(f"{len(comment_texts)} Word comment(s) preserved inline as [[teacher comment: ...]]")
    if "[[inserted:" in text or "[[deleted:" in text:
        notes.append("tracked changes preserved as [[inserted: ...]] / [[deleted: ...]]")
    return text, "docx-xml", notes


# ---------------------------------------------------------------- pdf / images

def _ocr_available():
    return shutil.which("tesseract") is not None


def _tesseract(image_path):
    proc = subprocess.run(
        ["tesseract", str(image_path), "stdout", "-l", "eng+deu"],
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        proc = subprocess.run(["tesseract", str(image_path), "stdout"],
                              capture_output=True, text=True, timeout=300)
    return proc.stdout if proc.returncode == 0 else ""


def extract_pdf(path):
    text, method, pages = "", None, 0
    try:
        import pypdf  # optional
        reader = pypdf.PdfReader(str(path))
        pages = len(reader.pages)
        text = "\n\n".join(f"<!-- page {i + 1} -->\n" + (pg.extract_text() or "")
                           for i, pg in enumerate(reader.pages))
        method = "pypdf"
    except ImportError:
        if shutil.which("pdftotext"):
            proc = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                                  capture_output=True, text=True, timeout=300)
            raw = proc.stdout
            page_texts = raw.split("\f")
            pages = len([p for p in page_texts if p is not None]) or 1
            text = "\n\n".join(f"<!-- page {i + 1} -->\n{p}" for i, p in enumerate(page_texts) if p.strip())
            method = "pdftotext"
    except Exception as exc:  # damaged PDF
        return "", "failed", [f"PDF text extraction failed: {exc}"]
    plain = re.sub(r"<!-- page \d+ -->", "", text).strip()
    if method and len(plain) >= MIN_TEXT_CHARS_PER_PAGE * max(pages, 1) / 2:
        return text, method, []
    # Little or no text layer: probably a scan.
    if _ocr_available() and shutil.which("pdftoppm"):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["pdftoppm", "-r", "300", "-png", str(path), f"{tmp}/p"],
                           check=False, timeout=600)
            pngs = sorted(Path(tmp).glob("p*.png"))
            ocr = [f"<!-- page {i + 1} (OCR) -->\n{_tesseract(p)}" for i, p in enumerate(pngs)]
        if any(o.strip() for o in ocr):
            return "\n\n".join(ocr), "tesseract-ocr", ["scanned PDF: text produced by OCR, check carefully"]
    return text, "needs_transcription", [
        "PDF has no usable text layer and no OCR engine is installed; Claude should transcribe it visually"]


def extract_image(path):
    if _ocr_available():
        text = _tesseract(path)
        if text.strip():
            return text, "tesseract-ocr", ["text produced by OCR, check handwriting and annotations carefully"]
    return "", "needs_transcription", [
        "image: Claude should transcribe it visually (including handwritten teacher annotations)"]


def _read_text_file(path):
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def extract(path):
    """Return (text, method, notes)."""
    ext = Path(path).suffix.lower()
    if ext in (".txt", ".md"):
        return _read_text_file(path), "plain-text", []
    if ext == ".docx":
        return extract_docx(path)
    if ext == ".pdf":
        return extract_pdf(path)
    if ext in IMAGE_EXT:
        return extract_image(path)
    return "", "needs_transcription", [f"no automatic extractor for {ext}; transcribe or convert"]


# ---------------------------------------------------------------- segmentation

CRITICAL_RE = re.compile(
    r"(?i)\b(punkte?|points?|BE\b|bewertung|bewertungs\w*|kriteri\w*|criteria|rubric|"
    r"erwartungshorizont|marks?|notenschl\w*|grading|assessment|gewichtung|weighting|"
    r"inhalt\s*:|sprache\s*:|language\s*:|content\s*:|word limit|wörter|words?\b\s*\))"
)


def segment(text, limit=SEGMENT_CHARS):
    """Split into segments at headings/paragraphs, never mid-paragraph unless a
    single paragraph exceeds the limit. Lines that look grading-critical are
    listed per segment so they can never be silently dropped."""
    paras = re.split(r"\n\s*\n", text)
    segments, buf = [], []

    def flush():
        if buf:
            segments.append("\n\n".join(buf))
            buf.clear()

    for para in paras:
        if not para.strip():
            continue
        if para.lstrip().startswith("#") and sum(len(b) for b in buf) > limit * 0.5:
            flush()
        while len(para) > limit:
            flush()
            cut = para.rfind(" ", 0, limit)
            cut = cut if cut > limit * 0.5 else limit
            segments.append(para[:cut])
            para = para[cut:].lstrip()
        if sum(len(b) + 2 for b in buf) + len(para) > limit:
            flush()
        buf.append(para)
    flush()
    out = []
    for i, seg in enumerate(segments):
        critical = [ln.strip() for ln in seg.splitlines() if CRITICAL_RE.search(ln)]
        out.append({"index": i, "chars": len(seg), "text": seg, "grading_critical_lines": critical[:50]})
    return out


# ---------------------------------------------------------------- classification

DOC_TYPES = [
    "exam_paper", "source_text", "task_instruction", "model_answer",
    "teacher_correction", "rubric", "vocabulary", "student_answer", "other",
]

_SIGNALS = {
    "exam_paper": [r"schulaufgabe", r"klausur", r"\bname\s*:", r"\bpoints?\b", r"\bBE\b",
                   r"\btask\s*\d", r"\b(summari[sz]e|analy[sz]e|comment on|discuss|mediat)",
                   r"time\s*(allowed|limit)|arbeitszeit|minutes", r"hilfsmittel|dictionary"],
    "source_text": [r"\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+", r"\(adapted\)|abridged|source\s*:",
                    r"published|the guardian|new york times|bbc|economist", r"\bline\s*\d+|\bl\.\s*\d+"],
    "task_instruction": [r"^\s*\d[\.\)]\s*(summari[sz]e|outline|analy[sz]e|examine|comment|discuss|assess)",
                         r"\bin about \d+ words\b|\bwords\)"],
    "model_answer": [(r"musterl[öo]sung|model answer|erwartungshorizont|sample answer|lösungsvorschlag", 3)],
    "teacher_correction": [r"\[\[teacher comment", r"\[\[(inserted|deleted)", r"\bsp\b|\bgr\b|\bexpr\b|\bwo\b",
                           r"korrektur|correction|well done|good point|unclear"],
    "rubric": [(r"bewertungs(raster|bogen|kriterien)|rubric|grading (scheme|criteria)|assessment criteria", 3),
               r"notenschlüssel|punkteverteilung|gewichtung|inhalt\s*/\s*sprache|content.*language"],
    "vocabulary": [(r"vokabel|vocabulary|word list|wordbank|glossary", 2), r"^\s*\w[\w ]*\s[-–=]\s\w.*$\n^\s*\w[\w ]*\s[-–=]\s\w"],
    "student_answer": [r"my answer|mein[e]? (lösung|antwort)|\bI think\b"],
}


def classify(text, filename=""):
    """Return {guess, confidence, scores, needs_confirmation}."""
    sample = (filename + "\n" + text[:20000])
    scores = {}
    for doc_type, patterns in _SIGNALS.items():
        score = 0
        for p in patterns:
            p, weight = p if isinstance(p, tuple) else (p, 1)
            score += weight if re.search(p, sample, flags=re.I | re.M) else 0
        scores[doc_type] = score
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best, best_score = ranked[0]
    second = ranked[1][1]
    if best_score == 0:
        return {"guess": "other", "confidence": "low", "scores": scores, "needs_confirmation": True}
    margin = best_score - second
    confidence = "high" if best_score >= 3 and margin >= 2 else "medium" if margin >= 1 else "low"
    return {"guess": best, "confidence": confidence, "scores": scores,
            "needs_confirmation": confidence != "high"}
