// Runtime mirror of docs/CURRICULUM_RESEARCH.md and SKILL.md §1.
// Evidence status is deliberately conservative: nothing is "official_verified" until the
// student pastes the passage from the official document (stored in curriculum_notes).

export const PROVENANCE = [
  "official_verified",
  "official_reported",
  "teacher_specific",
  "interpretation",
  "ai_suggestion",
] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  official_verified: "Official (verified)",
  official_reported: "Official, reported (unverified)",
  teacher_specific: "Your teacher",
  interpretation: "Educational interpretation",
  ai_suggestion: "Tutor suggestion",
};

export type CurriculumSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  official: boolean;
  usedFor: string;
};

export const CURRICULUM_SOURCES: CurriculumSource[] = [
  { id: "S1", title: "LehrplanPLUS Gymnasium Englisch 12 – erhöhtes Anforderungsniveau", url: "https://www.lehrplanplus.bayern.de/fachlehrplan/gymnasium/12/englisch/erhoeht", publisher: "ISB Bayern", official: true, usedFor: "Competence expectations; eA differentiation" },
  { id: "S2", title: "LehrplanPLUS Gymnasium Englisch 13 – erhöhtes Anforderungsniveau", url: "https://www.lehrplanplus.bayern.de/fachlehrplan/gymnasium/13/englisch/erhoeht", publisher: "ISB Bayern", official: true, usedFor: "Year 13 writing expectations" },
  { id: "S3", title: "LehrplanPLUS Englisch 12 – Jahrgangsstufenprofil", url: "https://www.lehrplanplus.bayern.de/jahrgangsstufenprofil/gymnasium/12/englisch", publisher: "ISB Bayern", official: true, usedFor: "gA vs eA distinction" },
  { id: "S4", title: "Fachprofil Englisch (Gymnasium 12)", url: "https://www.lehrplanplus.bayern.de/fachprofil/gymnasium/englisch/auspraegung/englisch/12", publisher: "ISB Bayern", official: true, usedFor: "Competence model" },
  { id: "S5", title: "Informationen zum LehrplanPLUS der Profil- und Leistungsstufe Englisch", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Implementierung_LehrplanPLUS/Englisch.pdf", publisher: "ISB Bayern", official: true, usedFor: "Course hours; exam task structure; mediation length; binding topic areas" },
  { id: "S6", title: "Illustrierende Prüfungsaufgaben ab 2026 – Übersichtsblatt Englisch (06/2025)", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/IlluPA/E/IlluPA_Englisch_Uebersichtsblatt_06_25.pdf", publisher: "ISB Bayern", official: true, usedFor: "Exam parts, times, weighting, source-text lengths" },
  { id: "S7", title: "Illustrierende Prüfungsaufgaben Englisch (overview)", url: "https://www.isb.bayern.de/schularten/gymnasium/faecher/englisch/illustrierende-pruefungsaufgaben/", publisher: "ISB Bayern", official: true, usedFor: "eA sample tasks and solution notes" },
  { id: "S8", title: "IlluPA Englisch – Beispielaufgaben Sprachmittlung eA", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/IlluPA/E/IlluPA_Englisch_Beispielaufgaben_Sprachmittlung_eA.pdf", publisher: "ISB Bayern", official: true, usedFor: "Mediation task format" },
  { id: "S9", title: "KMS Moderne Fremdsprachen – Schriftliche Prüfungsformen in der Profil- und Leistungsstufe und im Abitur", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/KMBek_und_KMS/Moderne_FS_-_Schriftliche_Pruefungsformen_in_der_Profil-_und_Leistungsstufe_und_im_Abitur.pdf", publisher: "Bayerisches Staatsministerium für Unterricht und Kultus", official: true, usedFor: "Content : language weighting; content cap" },
  { id: "S10", title: "Kontaktbrief Englisch 2025", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Englisch/kontaktbrief_englisch_2025.pdf", publisher: "ISB Bayern", official: true, usedFor: "New operator set from 2027" },
  { id: "S11", title: "ISB Bewertungsraster Englisch Jgst. 11 (B1+/B2)", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/Leistungserhebungen_und_Bewertungsraster/GYM_E11_Bewertungsraster_Textaufgabe_4_6_B1__B2.pdf", publisher: "ISB Bayern", official: true, usedFor: "Rubric structure: Inhalt und Textstruktur / Sprache" },
  { id: "S12", title: "Leitfaden zur Erstellung von Leistungserhebungen, Oberstufe (2020)", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/Leistungserhebungen_und_Bewertungsraster/oberstufe_schriftliche_und_muendliche_leistungsnachweise_leitfaden_2020.pdf", publisher: "ISB Bayern", official: true, usedFor: "Abitur rubrics used in the Oberstufe (G8 era)" },
  { id: "S13", title: "Ergänzende Informationen zum LehrplanPLUS – Leitfaden (04/25)", url: "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Moderne_Fremdsprachen/Leistungserhebungen_und_Bewertungsraster/pulst_mod_fs_leistungsnachweise_leitfaden_04_25.pdf", publisher: "ISB Bayern", official: true, usedFor: "Current guide to assessments (content not retrieved)" },
];

export const RESEARCH_LIMITATION =
  "The official Bavarian sites could not be opened from the build environment. Requirements marked " +
  "'Official, reported' come from search-result extracts and summaries of these documents and have not been " +
  "read in full. Verify them by opening the source and pasting the passage under Profile → Curriculum sources.";
