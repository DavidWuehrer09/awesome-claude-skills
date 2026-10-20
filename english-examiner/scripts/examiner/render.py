"""Render assessment reports and the progress dashboard as responsive HTML."""

from html import escape as _e
from pathlib import Path

from . import vocab as vb
from . import weaknesses as wk
from .assessment import DIMENSION_LABELS

ASSETS = Path(__file__).resolve().parents[2] / "assets"


def e(x):
    return _e("" if x is None else str(x))


def grade_for_points(p):
    """Bavarian Oberstufe: 15-13 = 1, 12-10 = 2, 9-7 = 3, 6-4 = 4, 3-1 = 5, 0 = 6."""
    if p == 0:
        return "6"
    grade = 6 - (p + 2) // 3
    suffix = {0: "+", 2: "", 1: "-"}[p % 3]
    return f"{grade}{suffix}"


def _page(title, body):
    css = (ASSETS / "report.css").read_text(encoding="utf-8")
    return (f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
            f"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">"
            f"<title>{e(title)}</title><style>{css}</style></head><body><main>{body}</main></body></html>")


def _scale(low, high, best):
    cells = []
    for p in range(16):
        cls = "in" if low <= p <= high else ""
        if best == p:
            cls += " best"
        cells.append(f'<span class="{cls}" title="{p} points = grade {grade_for_points(p)}">{p}</span>')
    return f'<div class="scale" role="img" aria-label="Estimated {low} to {high} points">{"".join(cells)}</div>'


STATUS_LABEL = {
    "incorrect": "Incorrect English", "unnatural": "Understandable but unnatural",
    "imprecise": "Correct but imprecise", "valid_less_effective": "Valid, less effective here",
    "excellent": "Already excellent", "not_language": "Content / reasoning",
}
BASIS_LABEL = {"teacher_rubric": "your teacher's rubric", "teacher_points_allocation": "teacher point allocation",
               "approximation": "approximation (no teacher point bands)"}
PROV_LABEL = {
    "teacher_explicit": "Teacher's documented criterion", "observed_pattern": "Pattern in your previous exams",
    "official_guidance": "Official guidance", "general_principle": "General assessment principle",
    "ai_suggestion": "AI suggestion",
}


def assessment_html(ws, asm):
    exam = ws.load("exam", asm["exam_id"])
    est = asm["estimate"]
    lo, hi, best = est["low"], est["high"], est.get("best")
    head = (f"<p class=\"eyebrow\">My Results · {e(exam['exam_type'])} · {e(exam['difficulty'])} · "
            f"attempt {e(asm['attempt_id'])} v{asm['version']}</p><h1>{e(exam['title'])}</h1>")
    estimate = [
        '<section class="card hero"><h2>Indicative estimate</h2>',
        f'<p class="big">{lo}–{hi} points' + (f' <small>(best estimate {best})</small>' if best is not None else "") +
        f'</p><p class="muted">≈ grade {grade_for_points(lo)} to {grade_for_points(hi)} · basis: '
        f'{BASIS_LABEL[est["basis"]]}</p>',
        _scale(lo, hi, best),
        f'<p class="disclaimer">{e(est["disclaimer"])}</p>',
    ]
    if est["assumptions"]:
        estimate.append("<details><summary>Assumptions</summary><ul>" +
                        "".join(f"<li>{e(a)}</li>" for a in est["assumptions"]) + "</ul></details>")
    estimate.append("<details open><summary>Why this range</summary><ul>" +
                    "".join(f"<li>{e(a)}</li>" for a in est["evidence"]) + "</ul></details>")
    estimate.append('<div class="two"><div><h3>What limits a higher score</h3><ol>' +
                    "".join(f"<li>{e(a)}</li>" for a in est["limiting_factors"]) +
                    '</ol></div><div><h3>Changes most likely to raise it</h3><ol>' +
                    "".join(f"<li>{e(a)}</li>" for a in est["most_valuable_changes"]) + "</ol></div></div></section>")

    cs, ind = asm["course_specific"], asm["independent"]
    limited = ' <span class="tag warn">limited evidence</span>'
    crit = "".join(
        f'<tr><td>{e(c["criterion"])}<br><span class="tag">{e(PROV_LABEL[c["provenance"]])}</span></td>'
        f'<td>{e(c["judgement"])}{"" if c["evidence_sufficient"] else limited}</td></tr>'
        for c in cs.get("applied_criteria", []))
    perspectives = (
        '<section class="two"><div class="card"><h2>A · Course-specific assessment</h2>'
        f'<p class="muted">{"Based on your teacher&#39;s documented criteria" if cs["rubric_basis"] != "none_available" else "No teacher rubric available: course-specific judgement is limited"}</p>'
        f'<p>{e(cs["summary"])}</p>' + (f'<table class="tbl"><tbody>{crit}</tbody></table>' if crit else "") +
        ("<h3>Where the evidence is insufficient</h3><ul>" +
         "".join(f"<li>{e(n)}</li>" for n in cs["insufficient_evidence_notes"]) + "</ul>"
         if cs.get("insufficient_evidence_notes") else "") +
        '</div><div class="card"><h2>B · Independent academic assessment</h2>'
        f'<p>{e(ind["summary"])}</p>' + (f'<p class="muted">{e(ind.get("standards_note"))}</p>' if ind.get("standards_note") else "") +
        "</div></section>")

    dims = "".join(
        f"<tr><td>{e(DIMENSION_LABELS[d['key']])}{' · task ' + e(d['task']) if d.get('task') else ''}</td>"
        f'<td><span class="lvl {e(d["level"])}">{e(d["level"].replace("_", " "))}</span></td><td>{e(d["comment"])}</td></tr>'
        for d in asm["dimensions"] if d["applicable"])
    dims = f'<section class="card"><h2>Breakdown by dimension</h2><table class="tbl dims"><tbody>{dims}</tbody></table></section>'

    strengths = "".join(f'<li><blockquote>{e(s["original"])}</blockquote>{e(s["why_strong"])}</li>'
                        for s in asm["strengths"])
    strengths = f'<section class="card ok"><h2>What already works</h2><ul class="plain">{strengths}</ul></section>' if strengths else ""

    order = {"major": 0, "moderate": 1, "minor": 2, "none": 3}
    disputes = {d["comment_id"]: d for d in asm.get("disputes", [])}
    items = []
    for c in sorted(asm["comments"], key=lambda c: (order[c["severity"]], c["task"])):
        if c.get("withdrawn"):
            continue
        d = disputes.get(c["id"])
        items.append(
            f'<article class="comment sev-{e(c["severity"])}" id="{e(c["id"])}">'
            f'<header><span class="sev">{e(c["severity"])}</span><span class="tag">{e(STATUS_LABEL[c["english_status"]])}</span>'
            f'<span class="tag">{e(c["category"].replace("_", " "))}</span><span class="tag">{e(PROV_LABEL[c["provenance"]])}</span>'
            f'<span class="cid">task {e(c["task"])} · {e(c["id"])}</span></header>'
            f'<blockquote>{e(c["original"])}</blockquote><p><b>Problem:</b> {e(c["problem"])}</p>'
            f'<p><b>Why it costs you:</b> {e(c["why_weakens"])}</p>' +
            (f'<p class="alt"><b>Better:</b> {e(c["alternative"])}</p><p><b>Why:</b> {e(c["why_better"])}</p>' if c.get("alternative") else "") +
            (f'<p class="muted">Disputed ({e(d["status"])}): {e(d.get("response", d["argument"]))}</p>' if d else "") +
            f'<p class="ask">Disagree? Ask Claude: <code>Why did you mark {e(c["id"])}?</code></p></article>')
    comments = f'<section class="card"><h2>Feedback, most important first</h2>{"".join(items)}</section>'

    plan = "".join(f"<li><b>{e(p['focus'])}</b>: {e(p['action'])}</li>"
                   for p in sorted(asm["improvement_plan"], key=lambda p: p["priority"]))
    plan = f'<section class="card"><h2>Your improvement plan</h2><ol>{plan}</ol></section>'

    lab_items = []
    for i, item in enumerate(asm.get("lab", [])):
        ex = item["explanation"]
        lab_items.append(
            f'<article class="lab"><h3>Passage {i + 1} · task {e(item["task"])}</h3>'
            f'<div class="levels"><div><span class="lv">Your version</span><p>{e(item["original"])}</p></div>'
            f'<div><span class="lv">Level 1 · Correct</span><p>{e(item["level1_correct"])}</p></div>'
            f'<div><span class="lv">Level 2 · Stronger</span><p>{e(item["level2_stronger"])}</p></div>' +
            (f'<div><span class="lv">Level 3 · High-level</span><p>{e(item["level3_high_level"])}</p></div>' if item.get("level3_high_level") else "") +
            f'</div><dl><dt>Why it works</dt><dd>{e(ex["effective"])}</dd><dt>Nuance</dt><dd>{e(ex["nuance"])}</dd>'
            f'<dt>Improves</dt><dd>{e(", ".join(ex["improves"]))}</dd><dt>Why here</dt><dd>{e(ex["why_in_context"])}</dd>'
            f'<dt>Watch out</dt><dd>{e(ex["risks"])}</dd></dl>'
            f'<div class="exercise"><b>Practise it yourself:</b> {e(item["exercise"]["instruction"])}' +
            (f'<p>{e(item["exercise"]["material"])}</p>' if item["exercise"].get("material") else "") +
            (f'<details><summary>Possible answer</summary><p>{e(item["exercise"]["answer_key"])}</p></details>'
             if item["exercise"].get("answer_key") else "") + "</div></article>")
    lab = f'<section class="card"><h2>15-Point Improvement Lab</h2>{"".join(lab_items)}</section>' if lab_items else ""

    ma = asm["model_answer"]
    model = "".join(
        f'<article><h3>Task {e(p["task"])}</h3><div class="model">' +
        "".join(f"<p>{e(par)}</p>" for par in p["text"].split("\n\n")) +
        '</div><h4>Why these choices work</h4><ul>' + "".join(f"<li>{e(w)}</li>" for w in p["why_effective"]) + "</ul></article>"
        for p in ma["per_task"])
    if ma.get("alternative_interpretations"):
        model += "<h3>Other defensible approaches</h3><ul>" + "".join(
            f"<li>{e(a)}</li>" for a in ma["alternative_interpretations"]) + "</ul>"
    if ma.get("comparisons"):
        model += "<h3>Side by side</h3>" + "".join(
            f'<div class="levels"><div><span class="lv">You · task {e(c["task"])}</span><p>{e(c["student"])}</p></div>'
            f'<div><span class="lv">Model</span><p>{e(c["model"])}</p></div></div>'
            f'<p><b>Already strong:</b> {e(c["already_strong"])}</p><p><b>Difference:</b> {e(c["difference"])}</p>'
            for c in ma["comparisons"])
    model = (f'<section class="card"><h2>Model answer</h2><p class="muted">One strong possibility, not the only '
             f'acceptable solution.</p>{model}</section>')
    body = head + "".join(estimate) + perspectives + dims + strengths + comments + plan + lab + model
    return _page(f"Assessment · {exam['title']}", body)


def progress_html(ws):
    rows = wk.progress(ws)
    rec = wk.recommend(ws)
    weak = ws.read_json(ws.weaknesses_path)["skills"]
    vstats = vb.stats(ws)
    body = ['<p class="eyebrow">My English Examiner</p><h1>Progress</h1>']
    if rows:
        w, h, pad = 640, 220, 32
        n = len(rows)
        step = (w - 2 * pad) / max(n - 1, 1)
        y = lambda p: h - pad - p * (h - 2 * pad) / 15  # noqa: E731
        grid = "".join(f'<line x1="{pad}" x2="{w - pad}" y1="{y(p):.1f}" y2="{y(p):.1f}" class="grid"/>'
                       f'<text x="{pad - 6}" y="{y(p) + 4:.1f}" class="axis" text-anchor="end">{p}</text>'
                       for p in (0, 5, 10, 15))
        bars = []
        for i, r in enumerate(rows):
            x = pad + i * step if n > 1 else w / 2
            bars.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{y(r["low"]):.1f}" y2="{y(r["high"]):.1f}" class="range">'
                        f'<title>{e(r["date"])} {e(r["exam"])} v{r["version"]}: {r["low"]}–{r["high"]}</title></line>')
            mid = r["best"] if r["best"] is not None else (r["low"] + r["high"]) / 2
            bars.append(f'<circle cx="{x:.1f}" cy="{y(mid):.1f}" r="4" class="{"rev" if r["version"] > 1 else "pt"}"/>')
        body.append(f'<section class="card"><h2>Estimated points per attempt</h2>'
                    f'<svg viewBox="0 0 {w} {h}" class="chart" role="img" aria-label="Point ranges per attempt">{grid}{"".join(bars)}</svg>'
                    '<p class="muted">Bars are ranges; filled dots are original submissions, hollow dots revisions. '
                    'Estimates are indicative, not official grades.</p>'
                    '<table class="tbl"><thead><tr><th>Date</th><th>Exam</th><th>Level</th><th>Version</th><th>Points</th><th>Major issues</th></tr></thead><tbody>' +
                    "".join(f"<tr><td>{e(r['date'])}</td><td>{e(r['exam'])}</td><td>{e(r['difficulty'])}</td><td>v{r['version']}</td>"
                            f"<td>{r['low']}–{r['high']}</td><td>{r['major_issues']}</td></tr>" for r in rows) +
                    "</tbody></table></section>")
    else:
        body.append('<section class="card"><p>No assessed attempts yet.</p></section>')
    body.append('<section class="card"><h2>Recommended next</h2>'
                f'<p>Difficulty: <b>{e(rec["recommended_difficulty"])}</b></p><ul>' +
                "".join(f"<li>{e(a)}</li>" for a in rec["advice"]) + "</ul></section>")
    if weak:
        body.append('<section class="card"><h2>My Weaknesses</h2><table class="tbl"><thead><tr><th>Skill</th><th>Status</th>'
                    '<th>Seen</th><th>Trend</th></tr></thead><tbody>' +
                    "".join(f'<tr><td>{e(v["label"])}</td><td><span class="st {e(v["status"])}">{e(v["status"].replace("_", " "))}</span></td>'
                            f"<td>{v['times_present']}/{v['observations']}</td><td>" +
                            "".join("●" if h_["present"] else "○" for h_ in v["history"][-8:]) + "</td></tr>"
                            for v in sorted(weak.values(), key=lambda v: v["status"])) +
                    '</tbody></table><p class="muted">● problem present · ○ not present. "Secure" needs three clean '
                    'attempts in a row and is still provisional.</p></section>')
    if vstats.get("total"):
        body.append(f'<section class="card"><h2>Vocabulary in active use</h2><p>{vstats["total"]} items · '
                    f'{vstats["used_naturally_at_least_twice"]} used naturally at least twice · '
                    f'{vstats["targeted_not_used"]} targeted but not yet used</p></section>')
    return _page("My English Examiner · Progress", "".join(body))
