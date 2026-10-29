#!/usr/bin/env bash
# Seed a RAG cache directory with the vectors from the latest published
# release, so the next build embeds only chunks whose text changed.
#
#   scripts/seed-rag-cache.sh <cache-dir> [provider]
#
# provider: gemini (default), openai, or azure-openai; selects the release
# asset prebuilt-rag-index-<provider>-<version>.tar.gz.
# Needs `gh` with GH_TOKEN. Skips (exit 0) when the directory already holds a
# complete cache or no matching release asset exists; a seed is an
# optimization only.
set -euo pipefail

cache_dir="${1:?usage: seed-rag-cache.sh <cache-dir> [provider]}"
provider="${2:-gemini}"
repo="${GITHUB_REPOSITORY:-yushulx/simple-dynamsoft-mcp}"
mkdir -p "$cache_dir"

# Only a complete cache (header + vectors) counts; a leftover partial
# checkpoint from an interrupted run must not block seeding.
for header in "$cache_dir"/rag-"$provider"-*.json; do
  [[ -e "$header" && "$header" != *.checkpoint.json && -f "${header%.json}.f32" ]] || continue
  echo "[seed] $cache_dir already has a complete cache ($(basename "$header")); not seeding"
  exit 0
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pattern="prebuilt-rag-index-${provider}-*.tar.gz"
if ! gh release download --repo "$repo" --pattern "$pattern" --dir "$work" 2>"$work/err.log"; then
  echo "[seed] no previous release index for $provider: $(tr '\n' ' ' < "$work/err.log")"
  exit 0
fi

archive="$(find "$work" -maxdepth 1 -name "$pattern" | head -n 1)"
mkdir -p "$work/extract"
tar -xzf "$archive" -C "$work/extract"
copied=0
while IFS= read -r file; do
  cp "$file" "$cache_dir/"
  copied=$((copied + 1))
done < <(find "$work/extract" -type f -name "rag-${provider}-*" ! -name '*.checkpoint.*')
echo "[seed] copied $copied file(s) from $(basename "$archive") into $cache_dir"
