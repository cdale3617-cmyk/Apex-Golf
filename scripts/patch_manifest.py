from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET

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
s = re.sub(r'android:icon="[^"]+"', 'android:icon="@drawable/apex_compass"', s)
s = re.sub(r'android:roundIcon="[^"]+"', 'android:roundIcon="@drawable/apex_compass"', s)
s = re.sub(r'android:windowSoftInputMode="[^"]+"', 'android:windowSoftInputMode="adjustResize"', s)
if 'android:windowSoftInputMode=' not in s:
    s = s.replace('<activity', '<activity android:windowSoftInputMode="adjustResize"', 1)
p.write_text(s)
drawable = Path("android/app/src/main/res/drawable")
drawable.mkdir(parents=True, exist_ok=True)
shutil.copyfile("scripts/apex_compass.xml", drawable / "apex_compass.xml")
styles_path = Path("android/app/src/main/res/values/styles.xml")
styles = ET.parse(styles_path)
launch = styles.find(".//style[@name='AppTheme.NoActionBarLaunch']")
if launch is not None:
    for name, value in {
        "windowSplashScreenAnimatedIcon": "@drawable/apex_compass",
        "windowSplashScreenBackground": "#141922",
        "postSplashScreenTheme": "@style/AppTheme.NoActionBar",
    }.items():
        item = launch.find("item[@name='%s']" % name)
        if item is None:
            item = ET.SubElement(launch, "item", name=name)
        item.text = value
    styles.write(styles_path, encoding="unicode")
print("Manifest patched")
