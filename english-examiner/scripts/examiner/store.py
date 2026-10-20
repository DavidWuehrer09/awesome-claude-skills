"""Workspace storage for My English Examiner.

All data lives in one private directory (the "workspace"). Every record is a
JSON file; uploaded originals are copied in unchanged. IDs are generated here
and validated on every lookup so a crafted ID can never escape the workspace.
"""

import json
import os
import re
import secrets
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ID_RE = re.compile(r"^[a-z]{2,4}_[0-9a-z]{8,32}$")

KINDS = {
    "material": ("mat", "materials"),
    "blueprint": ("bp", "blueprints"),
    "exam": ("exam", "exams"),
    "attempt": ("att", "attempts"),
    "assessment": ("asm", "assessments"),
}

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_UPLOAD_EXT = {
    ".pdf", ".docx", ".txt", ".md", ".rtf", ".odt",
    ".png", ".jpg", ".jpeg", ".heic", ".webp", ".tif", ".tiff",
}


class ExaminerError(Exception):
    """A user-facing error: printed without a traceback by the CLI."""


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def new_id(kind):
    prefix = KINDS[kind][0]
    return f"{prefix}_{secrets.token_hex(5)}"


def check_id(kind, record_id):
    prefix = KINDS[kind][0]
    if not isinstance(record_id, str) or not ID_RE.match(record_id) or not record_id.startswith(prefix + "_"):
        raise ExaminerError(f"invalid {kind} id: {record_id!r}")
    return record_id


def default_home():
    env = os.environ.get("EXAMINER_HOME")
    return Path(env).expanduser() if env else Path.cwd() / "english-examiner-data"


class Workspace:
    def __init__(self, root=None):
        self.root = Path(root or default_home()).expanduser().resolve()

    # ---- layout -------------------------------------------------------
    def init(self):
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.root, 0o700)
        except OSError:
            pass
        for _, folder in KINDS.values():
            (self.root / folder).mkdir(exist_ok=True)
        (self.root / "reports").mkdir(exist_ok=True)
        if not self.profile_path.exists():
            from .profile import empty_profile
            self.write_json(self.profile_path, empty_profile())
        if not self.weaknesses_path.exists():
            self.write_json(self.weaknesses_path, {"updated": now_iso(), "skills": {}})
        if not self.vocab_path.exists():
            self.write_json(self.vocab_path, {"items": []})
        return self.root

    def require(self):
        if not (self.root / "materials").is_dir():
            raise ExaminerError(f"no workspace at {self.root}; run `examiner.py init` first")
        return self

    @property
    def profile_path(self):
        return self.root / "profile.json"

    @property
    def weaknesses_path(self):
        return self.root / "weaknesses.json"

    @property
    def vocab_path(self):
        return self.root / "vocabulary.json"

    def folder(self, kind):
        return self.root / KINDS[kind][1]

    def record_dir(self, kind, record_id):
        check_id(kind, record_id)
        path = (self.folder(kind) / record_id).resolve()
        if path.parent != self.folder(kind).resolve():
            raise ExaminerError("path escapes workspace")
        return path

    def record_path(self, kind, record_id):
        return self.record_dir(kind, record_id) / "record.json"

    # ---- json io ------------------------------------------------------
    @staticmethod
    def read_json(path):
        try:
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        except FileNotFoundError:
            raise ExaminerError(f"not found: {path.name if hasattr(path, 'name') else path}")
        except json.JSONDecodeError as exc:
            raise ExaminerError(f"corrupt JSON in {path}: {exc}")

    @staticmethod
    def write_json(path, data):
        """Atomic write: a crash never leaves half a record behind."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
                fh.write("\n")
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def load(self, kind, record_id):
        path = self.record_path(kind, record_id)
        if not path.exists():
            raise ExaminerError(f"{kind} {record_id} not found")
        return self.read_json(path)

    def save(self, kind, record):
        self.write_json(self.record_path(kind, record["id"]), record)
        return record

    def list(self, kind):
        out = []
        folder = self.folder(kind)
        if not folder.is_dir():
            return out
        for child in sorted(folder.iterdir()):
            rec = child / "record.json"
            if child.is_dir() and ID_RE.match(child.name) and rec.exists():
                out.append(self.read_json(rec))
        out.sort(key=lambda r: r.get("created", ""))
        return out

    def delete(self, kind, record_id):
        path = self.record_dir(kind, record_id)
        if not path.exists():
            raise ExaminerError(f"{kind} {record_id} not found")
        shutil.rmtree(path)

    def export_zip(self, dest):
        dest = Path(dest).expanduser().resolve()
        if dest.is_relative_to(self.root):
            raise ExaminerError("export destination must be outside the workspace")
        base = str(dest)[:-4] if str(dest).endswith(".zip") else str(dest)
        return shutil.make_archive(base, "zip", root_dir=self.root)

    def purge(self):
        if (self.root / "materials").is_dir():
            shutil.rmtree(self.root)
