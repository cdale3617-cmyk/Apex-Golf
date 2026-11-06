from pathlib import Path

p = Path("android/app/src/main/AndroidManifest.xml")
s = p.read_text()
wanted = [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.RECORD_AUDIO",
]
add = ""
for q in wanted:
    if q not in s:
        add += '    <uses-permission android:name="%s" />\n' % q
if "RecognitionService" not in s:
    add += '    <queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n        </intent>\n    </queries>\n'
s = s.replace("</manifest>", add + "</manifest>")
p.write_text(s)
print("Manifest patched")
