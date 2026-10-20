"""Small text helpers shared by validators."""

import re

_QUOTES = str.maketrans({"‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"',
                         "„": '"', "«": '"', "»": '"', "–": "-", "—": "-",
                         " ": " ", "…": "..."})


def normalize(text):
    text = (text or "").translate(_QUOTES).lower()
    text = re.sub(r"-\s*\n\s*", "", text)  # re-join words hyphenated across lines
    text = re.sub(r"\[\.\.\.\]|\(\.\.\.\)", " ... ", text)
    return re.sub(r"\s+", " ", text).strip()


def contains_quote(haystack, quote):
    """True if `quote` occurs in `haystack`, ignoring case, whitespace and
    typographic quote styles. An ellipsis inside a quote ("a ... b") is
    honoured: each part must occur, in order."""
    hay = normalize(haystack)
    parts = [p.strip(" .,;:!?\"'") for p in normalize(quote).split("...")]
    parts = [p for p in parts if p]
    if not parts:
        return False
    pos = 0
    for part in parts:
        idx = hay.find(part, pos)
        if idx < 0:
            return False
        pos = idx + len(part)
    return True


def word_count(text):
    return len(re.findall(r"[A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*", text or ""))


def quoted_spans(text, min_words=3):
    """Direct quotations ("...") of at least `min_words` words inside text."""
    text = (text or "").translate(_QUOTES)
    spans = re.findall(r'"([^"\n]{3,400})"', text)
    return [s for s in spans if word_count(s) >= min_words]
