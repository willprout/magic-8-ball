#!/usr/bin/env python3
"""Store a Jev API key locally without echoing it or adding it to shell history."""

import getpass
import json
import os
from pathlib import Path
import sys
import tempfile
import warnings


def main():
    if not sys.stdin.isatty():
        sys.exit("Run this script yourself in an interactive terminal.")

    target = Path(__file__).resolve().parents[1] / ".dev.vars"
    if target.exists():
        sys.exit("A local secret file already exists; it has been left unchanged.")

    warnings.simplefilter("error", getpass.GetPassWarning)
    try:
        key = getpass.getpass("Paste your Jev / TypeSafe API key (hidden): ").strip()
    except (getpass.GetPassWarning, EOFError, KeyboardInterrupt):
        sys.exit("\nCancelled. No key was saved.")

    if not key or any(character.isspace() for character in key):
        sys.exit("No key saved. Enter a nonempty key without whitespace.")

    temporary = None
    try:
        descriptor, temporary = tempfile.mkstemp(prefix=".dev.vars.", dir=target.parent)
        with os.fdopen(descriptor, "w") as handle:
            handle.write("TYPESAFE_API_KEY=" + json.dumps(key) + "\n")
        # Hard-link creation fails if another process created the target meanwhile.
        os.link(temporary, target)
    finally:
        if temporary is not None:
            os.unlink(temporary)

    print("Key saved to the Git-ignored .dev.vars file with owner-only permissions (0600).")
    print("The app backend can read it; it will not be bundled into the website.")


if __name__ == "__main__":
    main()
