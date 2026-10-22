# Curriculum research record

Researched on 2026-10-22 for the Bavarian Gymnasium English course at erhöhtes Anforderungsniveau (eA, "Leistungsfach"), Jahrgangsstufen 12/13, Abitur from 2026 (G9).

## How the research was done, and its limits

The build environment's network policy **blocks** `www.lehrplanplus.bayern.de`, `www.isb.bayern.de` and `www.km.bayern.de`. Direct HTTP requests and page fetches both failed (proxy refusal / DNS failure). So **nobody has read the official documents in full for this build.**

What was possible: web searches whose results include summaries and short verbatim extracts of the official pages. Every claim below is labelled with how strong its evidence is:

| Label | Meaning |
| --- | --- |
| `search-extract` | A short verbatim German phrase from the official document appeared in a search result. Strong, but it has no surrounding context. |
| `search-summary` | A search engine's summary of an official document. Plausible, but unverified. |
| `third-party` | A publisher or tutoring site (Stark, SchulLV, noten-booster, abschluss-bayern), not an official source. |
| `interpretation` | Our own educational reading of the requirements. It is not an official rule. |

**No claim here is labelled `verified`.** The app stores the same labels (`src/lib/curriculum/sources.ts`) and shows them next to curriculum statements. The student can open each official URL on their own device, read it, and mark it verified in *Profile & Settings → Curriculum sources*, pasting the relevant passage. Verified passages are then added to the runtime tutor context.

## Sources

| # | Source | URL | Publisher | Used for |
| --- | --- | --- | --- | --- |
| S1 | LehrplanPLUS Gymnasium Englisch 12, erhöhtes Anforderungsniveau | https://www.lehrplanplus.bayern.de/fachlehrplan/gymnasium/12/englisch/erhoeht | ISB (official) | Competence expectations, eA differentiation |
| S2 | LehrplanPLUS Gymnasium Englisch 13, erhöhtes Anforderungsniveau | https://www.lehrplanplus.bayern.de/fachlehrplan/gymnasium/13/englisch/erhoeht | ISB (official) | Year 13 writing expectations |
| S3 | LehrplanPLUS Englisch 12 – Jahrgangsstufenprofil (grundlegende Kompetenzen) | https://www.lehrplanplus.bayern.de/jahrgangsstufenprofil/gymnasium/12/englisch | ISB (official) | gA vs eA distinction |
| S4 | Fachprofil Englisch (Gymnasium, 12) | https://www.lehrplanplus.bayern.de/fachprofil/gymnasium/englisch/auspraegung/englisch/12 | ISB (official) | Competence model |
| S5 | Informationen zum LehrplanPLUS der Profil- und Leistungsstufe Englisch | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Implementierung_LehrplanPLUS/Englisch.pdf | ISB (official) | Course hours, exam task structure, mediation text length, binding topic areas |
| S6 | Illustrierende Prüfungsaufgaben für die Abiturprüfung in Bayern ab 2026 – Übersichtsblatt Englisch (06/2025) | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/IlluPA/E/IlluPA_Englisch_Uebersichtsblatt_06_25.pdf | ISB (official) | Exam parts, times, weighting, source-text lengths |
| S7 | Illustrierende Prüfungsaufgaben Englisch (overview page) | https://www.isb.bayern.de/schularten/gymnasium/faecher/englisch/illustrierende-pruefungsaufgaben/ | ISB (official) | eA writing and mediation sample tasks with solution notes |
| S8 | IlluPA Englisch – Beispielaufgaben Sprachmittlung eA | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/IlluPA/E/IlluPA_Englisch_Beispielaufgaben_Sprachmittlung_eA.pdf | ISB (official) | Mediation task format |
| S9 | KMS "Moderne Fremdsprachen – Schriftliche Prüfungsformen in der Profil- und Leistungsstufe und im Abitur" | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/KMBek_und_KMS/Moderne_FS_-_Schriftliche_Pruefungsformen_in_der_Profil-_und_Leistungsstufe_und_im_Abitur.pdf | Kultusministerium (official) | Content : language weighting; content cap rule |
| S10 | Kontaktbrief Englisch 2025 | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Englisch/kontaktbrief_englisch_2025.pdf | ISB (official) | New operator set from the 2027 exam year; CEFR certificate threshold |
| S11 | ISB Bewertungsraster (Jgst. 11, B1+/B2), Textaufgabe and Sprachmittlung | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/Leistungserhebungen_und_Bewertungsraster/GYM_E11_Bewertungsraster_Textaufgabe_4_6_B1__B2.pdf | ISB (official) | Shape of the official rubrics: "Inhalt und Textstruktur" and "Sprache" columns |
| S12 | Leitfaden zur Erstellung von Leistungserhebungen, Oberstufe (Stand 14.07.2020) | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/Leistungserhebungen_und_Bewertungsraster/oberstufe_schriftliche_und_muendliche_leistungsnachweise_leitfaden_2020.pdf | ISB (official, G8 era) | Abitur rubrics used in the Oberstufe; CEFR B2/B2+ (older) |
| S13 | Ergänzende Informationen zum LehrplanPLUS – Leitfaden (04/25) | https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/Leistungserhebungen_und_Bewertungsraster/pulst_mod_fs_leistungsnachweise_leitfaden_04_25.pdf | ISB (official) | Current guide to Leistungsnachweise (content not retrieved) |
| T1 | Stark Verlag blog, "Das Englisch-Abitur in Bayern ab 2026" | https://www.stark-verlag.de/blog/das-englisch-abitur-in-bayern-ab-2026 | Publisher (third party) | Corroboration only |
| T2 | abschluss-bayern.de / noten-booster.de / SchulLV | various | Third party | Corroboration only; never treated as authoritative |

## Findings

### F1 – Course status
- English eA is a five-lesson-per-week Leistungsfach in Years 12 and 13. *(S5, search-extract: "Wahl als Leistungsfach für die Jahrgangsstufen 12 sowie 13: fünfstündig")*
- The competences describe the outcome of a two-year learning process across 12/13. *(S1, search-summary)*

### F2 – What distinguishes eA from gA
- The basic competences apply at both levels. The difference lies in **higher task complexity and greater depth and breadth of content** at eA. *(S3, search-summary)*
- ISB names as distinguishing features: text length, complexity of structure and language, and **independence (Selbstständigkeit)** in solving tasks. *(S5, search-summary)*
- Reading (eA): students independently work out complex, demanding and longer authentic texts, including on more abstract topics; they "erkennen … explizite und implizite Aussagen" and "analysieren ihre Wirkungsabsicht". *(S1, search-summary + search-extract)*
- Listening (eA) includes implicit attitudes and relationships between speakers. *(S1, search-summary)*
- Writing (eA, 12): "planen Schreibprozesse durchgängig selbständig und setzen sie sprachlich korrekt sowie adressatengerecht um"; "verfassen komplexere Texte zu einem breiten Spektrum von Themen … setzen sich argumentativ, differenziert und nuanciert mit unterschiedlichen Positionen auseinander". *(S1, search-extract)*
- Writing (eA, 13): independent composition of complex argumentative texts adapted to addressee and situation. *(S2, search-summary)*
- Text and media competences (eA): analysis of literary and non-literary texts with textual evidence; the effect of media design features. *(S1, search-summary)*
- Speaking (eA): presentations "sehr klar strukturiert, flüssig und souverän", responding flexibly to follow-up questions. *(S1, search-extract)*

### F3 – Written Abitur format (G9, from 2026)
- Part A listening (about 30 min), Part B writing, Part C mediation (German → English). *(S6, search-summary; corroborated by T1/T2)*
- Working time for writing + mediation: **285 min eA**, 255 min gA, plus the listening part. *(S6, search-summary)*
- Weighting: listening 20 %, writing 55 %, mediation 25 %. *(S6, search-summary; several third-party sources agree)*
- Source text for writing: up to **1000 words eA** (800 gA). *(S6, search-summary)*
- Writing: choose a non-literary **or** a literary task. Sub-tasks 1 and 2 are text comprehension and text analysis; sub-task 3 is a choice between a **Stellungnahme (comment)** and **gestaltendes Schreiben (creative/re-creative writing)**. *(S5/S7, search-summary)*
- Mediation: one or more German source texts, possibly discontinuous, of at most **650 words**. *(S5, search-summary; T1 agrees)*
- Writing topics come from a **binding list of topic areas (Themengebiete)** in the curriculum. *(S5, search-summary)* **The list itself could not be retrieved.** The app therefore does not enumerate official topics; the student can add them.
- eA and gA task formats are reportedly the same in type; eA puts more weight on Anforderungsbereiche II and III. *(S7, search-summary; treat as provisional)*

### F4 – Assessment
- Writing and mediation tasks are marked with **mandatory Bewertungsraster** (rubrics) from the ISB website, using **0–15 Notenpunkte**, with each sub-task marked separately. *(S9/S12 and Kontaktbriefe, search-summary)*
- Official rubrics are organised in two columns, **"Inhalt und Textstruktur"** and **"Sprache"**. The language column covers the repertoire (grammar, vocabulary, syntax, idiom, text-structuring devices) and accuracy. The content column covers full completion of the operator and grasp of the text's message. *(S11, Year-11 rubric, search-summary. The Abitur rubric wording itself was not retrieved.)*
- **Content : language = 40 % : 60 %**, and "Bei der Bildung der Gesamtnote kommt der sprachlichen Leistung die größere Bedeutung zu". A content mark below 3 points rules out more than 3 points for that sub-task. *(S9, search-summary with a verbatim fragment. This is strong but not fully verified, and could be older (Abitur ab 2020) wording; verify for 2027.)*
- The Abitur rubric tables are published each March as an annex to a KMS. *(Kontaktbrief, search-summary)*
- A new basic set of English operators applies from the **2027** exam year. *(S10, search-extract: "neuer Grundstock von Operatoren veröffentlicht, der ab dem Prüfungsjahr 2027 gilt")* **The operator list itself was not retrieved.** The app's operator descriptions are therefore labelled `interpretation`.
- A 2020 guide referred to CEFR B2/B2+ for the Oberstufe rubrics *(S12)*. This is from the G8 era. No current CEFR level for eA was confirmed, so the app does **not** claim "C1" as an official level.

## How the findings are used in the app

| Finding | Where it is used | Status shown to the student |
| --- | --- | --- |
| F2 eA differentiation | Assessment rubric descriptors, strict-mode criteria, `bavarian-english-leistungsfach` Skill | "Official (search extract)" or "Interpretation" |
| F3 exam format | Exam-simulation defaults (285 min shared between writing and mediation), task types offered | "Reported, unverified" |
| F4 content : language 40/60 and the content cap | Optional score combination rule (on by default, can be switched off) | "Reported in the KMS (unverified)" |
| F4 rubric columns | Grouping of the assessment dimensions into *Content & structure* and *Language* | "Official shape (Jgst. 11 rubric); Abitur wording unverified" |
| Operators | Operator guidance per task | "Interpretation (official 2027 list not retrieved)" |

## Open items for the student

1. Open S1/S2 and paste the **Kompetenzerwartungen** for Schreiben, Sprachmittlung and Text- und Medienkompetenzen into *Curriculum sources*.
2. Open S5 or S1 and add the **binding Themengebiete**.
3. Open S9 and the current Abitur Bewertungsraster, and confirm or correct the 40/60 rule.
4. Get the **2027 operator list** (S10 refers to it) and paste it.
5. Upload your teacher's marking scheme. Teacher-specific rules are kept separate from official ones.
