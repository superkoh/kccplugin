#!/usr/bin/env bash
# kccplugin — embed plugins directly into a project.
#
#   curl -fsSL https://raw.githubusercontent.com/superkoh/kccplugin/main/install.sh \
#     | bash -s -- kcc-core kcc-dev-core
#
# Why this exists alongside the marketplace
# -----------------------------------------
# `claude plugin install --scope project` records a *subscription* in the
# project's settings.json — the files still live in ~/.claude and are fetched
# from GitHub. That's great for one person across many projects; it does not
# survive being handed to a teammate on a plane.
#
# This script instead **vendors** the plugin: it copies the plugin tree into
# `<project>/.claude/skills/<plugin>/`, which Claude Code natively loads as a
# project-scope plugin (`<plugin>@skills-dir`). Commit it and the plugin
# travels with the repo — offline, pinned, no marketplace trust prompt.
#
# Verified properties of that layout (measured, not assumed):
#   - hooks/hooks.json is honored: SessionStart and SubagentStart both fire.
#   - ${CLAUDE_PLUGIN_ROOT} resolves to the vendored directory.
#   - skills are namespaced `<plugin>:<skill>`, so they cannot collide with a
#     project's own plain skill of the same name. No manual prefixing needed.
#   - the directories only load after the workspace is trusted (see the
#     post-install banner).
#
# Design notes:
#   - All JSON + file-tree work happens in one embedded python3 program.
#     bash 3.2 (what macOS ships) has no associative arrays, which makes
#     per-file sha256 bookkeeping in shell far more error-prone than it is
#     worth. bash stays in charge of arg parsing and fetching only.
#   - Fetch is a codeload tarball, not `git clone`: no git required on the
#     target machine, and no credentials for a public repo.
#   - `--source-dir` installs from a local checkout. It is a real feature
#     (iterating on a plugin, air-gapped installs), and it is also what makes
#     the test suite hermetic.

set -euo pipefail

REPO="superkoh/kccplugin"
DEFAULT_REF="main"
MODE="install"
DRY="0"
SOURCE_DIR=""
PROJECT_DIR="$PWD"
SPECS=""

usage() {
  cat <<'KCC_USAGE'
Embed kccplugin plugins into a project (install + upgrade are the same command).

USAGE
  install.sh [options] <plugin>[@ref] ...

  <plugin>      Plugin directory name, e.g. kcc-core, kcc-dev-core
  @ref          Optional git ref — tag, branch, or commit sha. Default: main

OPTIONS
  --uninstall            Remove the named plugins instead of installing them
  --dry-run              Print what would change; touch nothing
  --source-dir DIR       Install from a local checkout instead of downloading
  --repo OWNER/REPO      Source repository (default: superkoh/kccplugin)
  --project-dir DIR      Target project root (default: current directory)
  -h, --help             Show this help

EXAMPLES
  # install or upgrade, straight from GitHub
  curl -fsSL https://raw.githubusercontent.com/superkoh/kccplugin/main/install.sh \
    | bash -s -- kcc-core kcc-dev-core

  # pin a version
  ./install.sh kcc-dev-core@v0.7.0

  # remove
  ./install.sh --uninstall kcc-core

WHAT IT WRITES
  <project>/.claude/skills/<plugin>/    the vendored plugin (commit this)
  <project>/.claude/kcc-vendor.json     install manifest (commit this)
  <project>/.claude/settings.json       disables <plugin>@kccplugin for this
                                        project, so a marketplace-installed
                                        copy cannot double-fire
KCC_USAGE
}

die() {
  echo "install.sh: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) MODE="uninstall" ;;
    --dry-run) DRY="1" ;;
    --source-dir)
      [ $# -ge 2 ] || die "--source-dir needs a directory"
      SOURCE_DIR="$2"; shift ;;
    --repo)
      [ $# -ge 2 ] || die "--repo needs OWNER/REPO"
      REPO="$2"; shift ;;
    --project-dir)
      [ $# -ge 2 ] || die "--project-dir needs a directory"
      PROJECT_DIR="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *) SPECS="$SPECS $1" ;;
  esac
  shift
done

[ -n "$SPECS" ] || { usage >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || die "python3 is required but was not found on PATH"
[ -d "$PROJECT_DIR" ] || die "project directory does not exist: $PROJECT_DIR"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

if [ -n "$SOURCE_DIR" ]; then
  [ -d "$SOURCE_DIR" ] || die "source directory does not exist: $SOURCE_DIR"
  SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"
fi

TMPDIR_KCC=""
# Must end on a zero status: an EXIT trap's exit code becomes the script's,
# so a bare `[ -n "$x" ] && ...` here would fail every --source-dir run.
cleanup() {
  if [ -n "$TMPDIR_KCC" ]; then rm -rf "$TMPDIR_KCC"; fi
  return 0
}
trap cleanup EXIT

# Download <ref> once and echo the extracted root. Repeated calls for the same
# ref reuse the extraction, so `install.sh a b c` costs one download.
fetch_ref() {
  ref="$1"
  safe="$(printf '%s' "$ref" | tr '/' '_')"
  if [ -z "$TMPDIR_KCC" ]; then
    TMPDIR_KCC="$(mktemp -d "${TMPDIR:-/tmp}/kcc-install.XXXXXX")"
  fi
  dest="$TMPDIR_KCC/$safe"
  if [ ! -d "$dest" ]; then
    command -v curl >/dev/null 2>&1 || die "curl is required but was not found on PATH"
    command -v tar >/dev/null 2>&1 || die "tar is required but was not found on PATH"
    mkdir -p "$dest"
    echo "  fetching $REPO@$ref ..." >&2
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$ref" \
      | tar -xz --strip-components=1 -C "$dest" \
      || die "could not download $REPO@$ref — check the plugin ref and your network"
  fi
  printf '%s' "$dest"
}

# Resolve a ref to its commit sha so the manifest records exactly what landed.
# Best-effort: a rate-limited or offline API must not fail an otherwise good
# install, so a miss degrades to an empty commit field.
resolve_commit() {
  ref="$1"
  curl -fsSL "https://api.github.com/repos/$REPO/commits/$ref" 2>/dev/null \
    | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("sha",""))
except Exception: print("")' 2>/dev/null || printf ''
}

read_marketplace_name() {
  root="$1"
  python3 -c 'import json,sys
try:
    with open(sys.argv[1], encoding="utf-8") as f: print(json.load(f).get("name",""))
except Exception: print("")' "$root/.claude-plugin/marketplace.json"
}

# ---------------------------------------------------------------------------
# The worker. Everything that mutates the project lives here.
# ---------------------------------------------------------------------------
apply() {
  KCC_MODE="$1" \
  KCC_PROJECT="$PROJECT_DIR" \
  KCC_PLUGIN="$2" \
  KCC_SRC="${3:-}" \
  KCC_VERSION="${4:-}" \
  KCC_REPO="$REPO" \
  KCC_REF="${5:-}" \
  KCC_COMMIT="${6:-}" \
  KCC_MARKETPLACE="${7:-}" \
  KCC_SOURCE_KIND="${8:-}" \
  KCC_DRY="$DRY" \
  python3 - <<'PYEOF'
import hashlib
import json
import os
import shutil
import sys

# Only these top-level directories are vendored. `tests/` and `evals/` are
# development-time artifacts of this marketplace and would be pure noise in a
# consuming project. Keep in sync with test/lib/discover.mjs's conventions —
# test/unit/install.test.mjs asserts they agree.
COMPONENT_DIRS = (
    ".claude-plugin",
    "agents",
    "commands",
    "context",
    "hooks",
    "scripts",
    "skills",
)

IGNORED_NAMES = {".DS_Store", "__pycache__"}

MODE = os.environ["KCC_MODE"]
PROJECT = os.environ["KCC_PROJECT"]
PLUGIN = os.environ["KCC_PLUGIN"]
SRC = os.environ.get("KCC_SRC", "")
DRY = os.environ.get("KCC_DRY") == "1"

CLAUDE_DIR = os.path.join(PROJECT, ".claude")
TARGET = os.path.join(CLAUDE_DIR, "skills", PLUGIN)
MANIFEST_PATH = os.path.join(CLAUDE_DIR, "kcc-vendor.json")
SETTINGS_PATH = os.path.join(CLAUDE_DIR, "settings.json")


def die(msg):
    sys.stderr.write("install.sh: %s\n" % msg)
    sys.exit(1)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except ValueError:
        die("%s is not valid JSON — refusing to overwrite it" % path)


def dump_json(path, obj):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def backup(path):
    """Preserve a locally-modified file before it is overwritten or pruned.

    The chosen upgrade policy is 'never block, never silently lose': an
    upgrade always lands, and anything the user edited is recoverable from
    the .kcc.bak sibling.
    """
    shutil.copy2(path, path + ".kcc.bak")


def prune_empty_dirs(root):
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        if dirpath == root:
            continue
        if not dirnames and not filenames:
            os.rmdir(dirpath)


def source_files():
    """Map of relpath -> absolute source path, restricted to the whitelist."""
    found = {}
    for comp in COMPONENT_DIRS:
        comp_dir = os.path.join(SRC, comp)
        if not os.path.isdir(comp_dir):
            continue
        for dirpath, dirnames, filenames in os.walk(comp_dir):
            dirnames[:] = [d for d in dirnames if d not in IGNORED_NAMES]
            for name in filenames:
                if name in IGNORED_NAMES:
                    continue
                abs_path = os.path.join(dirpath, name)
                found[os.path.relpath(abs_path, SRC)] = abs_path
    return found


def settings_key(manifest_entry):
    return manifest_entry.get("disabledMarketplacePlugin") or ""


def do_install():
    manifest = load_json(MANIFEST_PATH, {"schema": 1, "plugins": {}})
    manifest.setdefault("plugins", {})
    previous = manifest["plugins"].get(PLUGIN)

    # A directory we did not put there belongs to the user. Overwriting it
    # would be the one unrecoverable thing this script could do.
    if os.path.exists(TARGET) and previous is None:
        die(
            "%s already exists but is not in %s.\n"
            "  Refusing to overwrite something this installer did not create.\n"
            "  Move it aside, or re-run with --project-dir pointing elsewhere."
            % (TARGET, MANIFEST_PATH)
        )

    new_files = source_files()
    if not new_files:
        die("no installable components found in %s" % SRC)

    prev_files = (previous or {}).get("files", {})

    backups, written, pruned = [], [], []

    for rel in sorted(new_files):
        src_path = new_files[rel]
        dst_path = os.path.join(TARGET, rel)
        if os.path.exists(dst_path):
            current = sha256(dst_path)
            if current == sha256(src_path):
                continue  # already up to date — nothing to write, nothing to protect
            # About to overwrite. If the bytes on disk are not the ones we
            # recorded last time, the user edited them: keep a copy.
            if prev_files.get(rel) != current:
                backups.append(rel)
                if not DRY:
                    backup(dst_path)
        written.append(rel)
        if not DRY:
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(src_path, dst_path)

    # Files the previous version shipped and this one doesn't. Leaving them
    # behind would let a deleted hook keep firing.
    for rel in sorted(prev_files):
        if rel in new_files:
            continue
        stale = os.path.join(TARGET, rel)
        if not os.path.exists(stale):
            continue
        pruned.append(rel)
        if not DRY:
            if sha256(stale) != prev_files[rel]:
                backups.append(rel)
                backup(stale)
            os.remove(stale)

    if not DRY:
        prune_empty_dirs(TARGET)

    marketplace = os.environ.get("KCC_MARKETPLACE", "")
    disabled_key = "%s@%s" % (PLUGIN, marketplace) if marketplace else ""

    entry = {
        "version": os.environ.get("KCC_VERSION", ""),
        "source": {
            "kind": os.environ.get("KCC_SOURCE_KIND", "remote"),
            "repo": os.environ.get("KCC_REPO", ""),
            "ref": os.environ.get("KCC_REF", ""),
            "commit": os.environ.get("KCC_COMMIT", ""),
        },
        "files": {},
        "disabledMarketplacePlugin": disabled_key,
    }
    for rel in sorted(new_files):
        entry["files"][rel] = sha256(new_files[rel])

    if not DRY:
        manifest["plugins"][PLUGIN] = entry
        dump_json(MANIFEST_PATH, manifest)

        # Shadow the marketplace copy for this project only. Merge, never
        # replace: settings.json is the user's file and holds far more than
        # plugin toggles. Project scope beats user scope in Claude Code's
        # settings precedence, so `false` here wins over a global `true`.
        if disabled_key:
            settings = load_json(SETTINGS_PATH, {})
            settings.setdefault("enabledPlugins", {})[disabled_key] = False
            dump_json(SETTINGS_PATH, settings)

    prefix = "would " if DRY else ""
    print("  %s %s" % (PLUGIN, entry["version"] or "(no version)"))
    print("    %swrite   %d file(s) -> .claude/skills/%s/" % (prefix, len(written), PLUGIN))
    if backups:
        print("    %sback up %d locally-modified file(s) as *.kcc.bak:" % (prefix, len(backups)))
        for rel in backups:
            print("              %s" % rel)
    if pruned:
        print("    %sprune   %d file(s) no longer shipped:" % (prefix, len(pruned)))
        for rel in pruned:
            print("              %s" % rel)
    if disabled_key:
        print("    %sdisable %s in .claude/settings.json" % (prefix, disabled_key))
    else:
        print("    (no marketplace name in source — skipping settings.json patch)")


def do_uninstall():
    manifest = load_json(MANIFEST_PATH, {"schema": 1, "plugins": {}})
    manifest.setdefault("plugins", {})
    entry = manifest["plugins"].get(PLUGIN)
    if entry is None:
        die(
            "%s is not recorded in %s — nothing to uninstall."
            % (PLUGIN, MANIFEST_PATH)
        )

    prefix = "would " if DRY else ""
    print("  %s" % PLUGIN)
    print("    %sremove  .claude/skills/%s/" % (prefix, PLUGIN))

    key = settings_key(entry)
    if not DRY:
        if os.path.isdir(TARGET):
            shutil.rmtree(TARGET)

        # Only retract the toggle we own; anything else in settings.json is
        # somebody else's decision.
        if key and os.path.exists(SETTINGS_PATH):
            settings = load_json(SETTINGS_PATH, {})
            enabled = settings.get("enabledPlugins")
            if isinstance(enabled, dict) and key in enabled:
                del enabled[key]
                if not enabled:
                    del settings["enabledPlugins"]
            if settings:
                dump_json(SETTINGS_PATH, settings)
            else:
                os.remove(SETTINGS_PATH)

        del manifest["plugins"][PLUGIN]
        if manifest["plugins"]:
            dump_json(MANIFEST_PATH, manifest)
        else:
            os.remove(MANIFEST_PATH)

    if key:
        print("    %sre-enable %s in .claude/settings.json" % (prefix, key))


if MODE == "install":
    do_install()
else:
    do_uninstall()
PYEOF
}

# ---------------------------------------------------------------------------
# Drive one plugin spec (`name` or `name@ref`) through the worker.
# ---------------------------------------------------------------------------
if [ "$MODE" = "uninstall" ]; then
  echo "Uninstalling from $PROJECT_DIR"
else
  echo "Installing into $PROJECT_DIR"
fi

INSTALLED_ANY="0"

for spec in $SPECS; do
  case "$spec" in
    *@*) plugin="${spec%@*}"; ref="${spec##*@}" ;;
    *)   plugin="$spec";      ref="$DEFAULT_REF" ;;
  esac

  if [ "$MODE" = "uninstall" ]; then
    apply uninstall "$plugin"
    continue
  fi

  if [ -n "$SOURCE_DIR" ]; then
    src_root="$SOURCE_DIR"
    commit=""
    source_kind="local"
    ref="$SOURCE_DIR"
  else
    src_root="$(fetch_ref "$ref")"
    commit="$(resolve_commit "$ref")"
    source_kind="remote"
  fi

  src_plugin="$src_root/plugins/$plugin"
  [ -d "$src_plugin" ] || die "unknown plugin \"$plugin\" — no plugins/$plugin in $REPO@$ref"
  [ -f "$src_plugin/.claude-plugin/plugin.json" ] \
    || die "plugins/$plugin has no .claude-plugin/plugin.json — not a valid plugin"

  version="$(python3 -c 'import json,sys
try:
    with open(sys.argv[1], encoding="utf-8") as f: print(json.load(f).get("version",""))
except Exception: print("")' "$src_plugin/.claude-plugin/plugin.json")"
  marketplace="$(read_marketplace_name "$src_root")"

  apply install "$plugin" "$src_plugin" "$version" "$ref" "$commit" "$marketplace" "$source_kind"
  INSTALLED_ANY="1"
done

# ---------------------------------------------------------------------------
# Post-install advisories. Both were measured, not guessed: vendored plugins
# stay unloaded until the workspace is trusted, and a `.claude/`-ignoring
# .gitignore silently defeats the entire point of vendoring.
# ---------------------------------------------------------------------------
if [ "$DRY" = "1" ]; then
  echo ""
  echo "Dry run — nothing was written."
  exit 0
fi

if [ "$INSTALLED_ANY" = "1" ]; then
  echo ""
  echo "Next steps"
  echo "  1. Trust this workspace when Claude Code asks, then run /reload-plugins"
  echo "     (or restart). Project plugins under .claude/skills/ stay unloaded"
  echo "     until the trust dialog is accepted."
  echo "  2. Verify with:  claude plugin list"
  echo "  3. Commit .claude/skills/ and .claude/kcc-vendor.json so the plugins"
  echo "     travel with the repo."

  if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$PROJECT_DIR" check-ignore -q "$PROJECT_DIR/.claude/skills" 2>/dev/null; then
      echo ""
      echo "WARNING: .claude/skills/ is git-ignored in this project, so the"
      echo "         vendored plugins cannot be committed or shared. Consider:"
      echo ""
      echo "             .claude/*"
      echo "             !.claude/skills/"
      echo ""
      echo "         (this installer does not edit your .gitignore)"
    fi
  fi

  echo ""
  echo "Tip: add *.kcc.bak to .gitignore — upgrades park your local edits there."
fi
