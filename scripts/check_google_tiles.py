"""CI smoke test using the APK's actual package and signing identity. Never log URLs."""
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import urllib.parse

key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
if not key:
    sys.exit("GOOGLE_MAPS_API_KEY repository secret is missing")
sdk = Path(os.environ.get("ANDROID_HOME", os.environ.get("ANDROID_SDK_ROOT", "/usr/local/lib/android/sdk")))
signers = sorted(sdk.glob("build-tools/*/apksigner"), key=lambda p: (p.parent.name != "35.0.0", p.parent.name))
if not signers:
    sys.exit("Android APK signature verifier is unavailable")
result = subprocess.run([
    str(signers[0]), "verify", "--min-sdk-version", "23", "--verbose", "--print-certs", "android/app/build/outputs/apk/debug/app-debug.apk",
], capture_output=True, text=True)
match = re.search(r"Signer #1 certificate SHA-1 digest: ([0-9a-fA-F]{40})", result.stdout)
if result.returncode or not match:
    print("APK signature verifier diagnostics:")
    print(result.stdout)
    print(result.stderr)
    sys.exit("Could not verify the APK signing certificate")
sha = match.group(1).upper()
fingerprint = ":".join(re.findall("..", sha))
headers = {"X-Android-Package": "com.apexgolf.caddie", "X-Android-Cert": sha}

def request(path, query=None, body=None):
    url = "https://tile.googleapis.com" + path + "?" + urllib.parse.urlencode({"key": key, **(query or {})})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={**headers, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return response.read()
    except Exception as error:
        # The exception URL can include credentials. Print only the status code.
        sys.exit("Google satellite check failed: HTTP " + str(getattr(error, "code", "network unavailable")))

session = json.loads(request("/v1/createSession", body={
    "mapType": "satellite", "language": "en-AU", "region": "AU",
    "imageFormat": "jpeg", "scale": "scaleFactor2x", "highDpi": True,
}))["session"]
lat, lon, zoom = -23.1457524, 150.7199949, 19
metadata = json.loads(request("/tile/v1/viewport", {
    "session": session, "zoom": zoom, "north": lat+.002, "south": lat-.002,
    "east": lon+.002, "west": lon-.002,
}))
if not metadata.get("copyright") or not metadata.get("maxZoomRects"):
    sys.exit("Google satellite attribution or coverage metadata missing")
levels = [r["maxZoom"] for r in metadata["maxZoomRects"]
          if r["south"] <= lat <= r["north"] and r["west"] <= lon <= r["east"]]
if not levels:
    sys.exit("Google satellite coverage missing at Yeppoon")
zoom = min(zoom, max(levels))
x = int((lon+180)/360 * 2**zoom)
y = int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2 * 2**zoom)
picture = request(f"/v1/2dtiles/{zoom}/{x}/{y}", {"session": session})
if not picture.startswith(b"\xff\xd8"):
    sys.exit("Google satellite check did not return a JPEG")
print(f"Google satellite session, viewport and JPEG verified at Yeppoon, zoom {zoom}.")
notes = f"""Google satellite APK for owner testing

Verified a live satellite JPEG and coverage metadata at Yeppoon in CI.
Google imagery is online only and is not saved or passed to the art converter.
Move red / green dots, then Save positions to lock them.
Saved dots update centre distances without moving hazards or the satellite picture.
Google Maps and Data sources now sit below the hole picture.
Check the same Yeppoon hole on the S24 before wider course testing.

Before publishing this draft, restrict the Google key to Android apps:
Package: com.apexgolf.caddie
SHA-1: {fingerprint}
Keep the API restriction set to Map Tiles API.
This fingerprint belongs to this test APK. Future debug builds may use another certificate.
"""
Path("google-build-notes.txt").write_text(notes)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(notes)
