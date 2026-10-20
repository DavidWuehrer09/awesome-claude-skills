# Bavarian context (verify before relying on it)

Status of this file: written on 2026-10-20. The official ISB pages could not be opened from the authoring environment, so everything under "Reported" comes from search-result summaries and is **unverified**. Before telling the student anything about Abitur requirements, open the official documents yourself, then record what you read:

```bash
python3 scripts/examiner.py profile guidance --title "<document title>" --url "<url>" --summary "<what it says>" --verified
```

Use `--verified` only if you actually read the document in this session.

## Points scale (Oberstufe)

Individual results use 0–15 Notenpunkte: 15/14/13 = 1+/1/1-, 12/11/10 = 2+/2/2-, 9/8/7 = 3+/3/3-, 6/5/4 = 4+/4/4-, 3/2/1 = 5+/5/5-, 0 = 6. `render.grade_for_points` implements this mapping.

How raw marks in a particular Klausur turn into Notenpunkte is set by the teacher's or school's Notenschlüssel (search results mention a KMK percentage key for the Oberstufe from the 2021 Abitur cohort onwards). Use it only if the teacher's key or an official document has been uploaded or verified. Otherwise estimate holistically and label the estimate an approximation.

Schulaufgaben in Years 5–10 use grades 1–6, not points. If the student practises a Mittelstufe Schulaufgabe, say how the 0–15 estimate maps to grades and that the mapping is approximate.

## Reported (unverified) – the Abitur from 2026 on (G9)

- English is offered at basic level (grundlegendes Anforderungsniveau, gA) and increased level (erhöhtes Anforderungsniveau, eA, "Leistungsfach"). eA is reportedly taught five lessons a week in Years 12 and 13.
- The written exam reportedly has listening comprehension (about 30 minutes) plus writing and mediation (reportedly 285 minutes eA / 255 minutes gA). One provider reports weighting of roughly listening 20 %, writing 55 %, mediation 25 %.
- Source-text length is reportedly up to about 1000 words (eA) / 800 words (gA).
- Permitted aid: reportedly a monolingual or bilingual print dictionary; no electronic dictionaries.
- Official starting points: the ISB overview "Illustrierende Prüfungsaufgaben für die Abiturprüfung in Bayern ab 2026" (Englisch Übersichtsblatt, 06/2025) and the ministry letter on written exam formats in modern foreign languages in the Profil- und Leistungsstufe and the Abitur, both on isb.bayern.de.

What this means for exam generation:
- `difficulty: abitur` exams must say in `provenance.assumptions` which format details are verified and which aren't. `exam save` warns if no verified guidance is recorded.
- The tool cannot run listening comprehension. Say so, and suggest the official ISB listening material instead of inventing audio.
- When an uploaded older exam (for example G8 format) conflicts with verified current guidance, follow the student's choice: "match my teacher's format" or "Abitur format". Show the conflict either way.

## Common operators (general practice, not a Bavarian rule)

| Operator | What it demands | Typical pitfalls |
| --- | --- | --- |
| summarise / outline | Main points in own words, simple present, no quotes, no opinion | Detail creep, quoting, interpretation |
| describe / point out | Neutral account of selected aspects | Evaluating |
| analyse / examine | Technique + example + effect + link to intention | Device lists without effect |
| characterise | Traits with evidence (direct/indirect characterisation) | Plot retelling |
| compare | Point-by-point similarities and differences with criteria | Two separate summaries |
| assess / evaluate | Weighed judgement with criteria | Unsupported opinion |
| comment / discuss | Position, developed arguments, counterargument, conclusion | No counterargument; listing |
| mediate | Purpose- and addressee-oriented transfer of selected content | Translating everything literally |
