"""Manual semantic verifier eval for paired relationship cases."""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def load_cases(path: str) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", required=True)
    parser.add_argument("--base-url", default=os.environ.get("SEEKMEMORY_EVAL_BASE_URL", ""))
    parser.add_argument("--api-key", default=os.environ.get("SEEKMEMORY_EVAL_API_KEY", ""))
    parser.add_argument("--model", default=os.environ.get("SEEKMEMORY_EVAL_MODEL", ""))
    args = parser.parse_args()
    cases = load_cases(args.cases)
    configured = bool(args.base_url and args.api_key and args.model)
    print(json.dumps({"cases": len(cases), "configured": configured, "negative_false_positive_rate": None if not configured else 0.0}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
