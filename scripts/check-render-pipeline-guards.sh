#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

STRICT="${STRICT_PIPELINE_GUARDS:-0}"
FORBIDDEN='SceneManifest|sceneManifest|scene_manifest|deriveCanvasManifest|buildManifestFromDna|validateManifest|songDna|song_dna|SongDna|SongDNA|generate-scene-manifest'
TARGETS=(src supabase)

echo "[guard] checking forbidden legacy identifiers..."
if rg -n "$FORBIDDEN" "${TARGETS[@]}" --glob '!node_modules' >/tmp/legacy_hits.txt; then
  if [[ "$STRICT" == "1" ]]; then
    echo "[guard] ❌ legacy identifiers found (strict mode):"
    cat /tmp/legacy_hits.txt
    exit 1
  fi
  echo "[guard] ⚠ legacy identifiers still present (non-strict mode)."
  echo "[guard] Set STRICT_PIPELINE_GUARDS=1 to fail on these."
fi

echo "[guard] checking presetDerivation usage..."
REQUIRED='deriveFrameState|getTypography|getPhysics|getParticles'
if rg -n "$REQUIRED" src --glob '!node_modules' >/tmp/preset_hits.txt; then
  echo "[guard] ✅ presetDerivation functions are referenced"
else
  if [[ "$STRICT" == "1" ]]; then
    echo "[guard] ❌ no presetDerivation function usage detected in src/"
    exit 1
  fi
  echo "[guard] ⚠ no presetDerivation usage detected (non-strict mode)."
fi

if rg -n 'from "@/engine/presetDerivation"|from "./presetDerivation"|from "../engine/presetDerivation"' src --glob '!node_modules' >/tmp/preset_imports.txt; then
  echo "[guard] ✅ presetDerivation imports are present"
else
  if [[ "$STRICT" == "1" ]]; then
    echo "[guard] ❌ no presetDerivation imports detected in src/"
    exit 1
  fi
  echo "[guard] ⚠ no presetDerivation imports detected (non-strict mode)."
fi

echo "[guard] done"
