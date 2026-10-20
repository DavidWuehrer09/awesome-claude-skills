#!/usr/bin/env python3
"""My English Examiner: workspace tool. Run `python3 examiner.py --help`."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from examiner.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
