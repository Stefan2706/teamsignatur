#!/usr/bin/env bash
# Baut die XPI aus src/, berechnet die Prüfsumme und trägt die Version in updates.json ein.
# Aufruf:  ./scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="Stefan2706/teamsignatur"
ID="teamsignatur@ts-scherer.com"
VERSION=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
XPI="teamsignatur-${VERSION}.xpi"

mkdir -p dist
rm -f "dist/${XPI}"
(cd src && zip -qr -X "../dist/${XPI}" manifest.json background.js lib page icons _locales)
HASH=$(sha256sum "dist/${XPI}" | cut -d' ' -f1)

python3 - "$VERSION" "$HASH" "$REPO" "$ID" "$XPI" << 'PY'
import json, sys, os
version, sha, repo, addon_id, xpi = sys.argv[1:]
path = "updates.json"
data = json.load(open(path)) if os.path.exists(path) else {"addons": {addon_id: {"updates": []}}}
updates = data["addons"].setdefault(addon_id, {"updates": []})["updates"]
updates[:] = [u for u in updates if u["version"] != version]
updates.append({
    "version": version,
    "update_link": f"https://github.com/{repo}/releases/download/v{version}/{xpi}",
    "update_hash": f"sha256:{sha}",
    "applications": {"gecko": {"strict_min_version": "128.0"}},
})
json.dump(data, open(path, "w"), indent=2)
PY

echo "Fertig: dist/${XPI}"
echo "SHA-256: ${HASH}"
echo
echo "Nächste Schritte:"
echo "  1. CHANGELOG.md ergänzen"
echo "  2. git add -A && git commit -m \"Version ${VERSION}\" && git push"
echo "  3. Auf GitHub: Releases → Draft a new release → Tag v${VERSION}"
echo "     → dist/${XPI} als Datei anhängen → Publish release"
echo "  Wichtig: Der Release muss veröffentlicht sein, bevor Tester das Update bekommen."
