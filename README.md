# APEX Golf

An Android golf caddie with one shared shot state. The map, distances, club call and spoken answer use the same ball position and target.

## Playing a hole

1. Choose your course and start a round. The caddie starts at the mapped tee or the saved card distance.
2. Set your ball using **Use my GPS** or **Ball and map tools → Set ball on map**. Tell the caddie your lie when it is unknown.
3. Move the yellow target to explore a shot. The caddie checks mapped water and bunkers against estimated carry, variation and rollout, and can choose a shorter layup.
4. Tap **Shot played** once after each stroke. At the next ball, update its position. The app does not detect a physical golf swing automatically.

Remaining distance can also be typed or spoken (for example, “150 metres, heavy rough”). Manual distance alone cannot establish hazard clearance or aim. Carry logs train club recommendations after three logged carries; GPS measurements include roll and are excluded from carry learning.

## Maps and data

Only mapped features and your own hazard marks are drawn. Missing geometry is shown as unavailable. GPS requires the hole's geographic reference and a fresh fix with accuracy of 25 metres or better. Old saved maps are refreshed once per opening to recover that reference when possible; offline play can use existing geometry and manual ball placement.

The caddie does not know every hazard. OpenStreetMap coverage can be incomplete, imported tee locations may differ from the tee you use, and lie and course conditions need your confirmation. Weather older than 45 minutes is excluded. Tee-to-green elevation is excluded after the tee shot because the slope from the current ball is unknown. Estimates use simple wind/lie adjustments, 10% carry variation and bag rollout; they are not a physical ball-flight model.

Saved artwork is available as a reference view. It has no geographic calibration, so markers are shown on the mapped view rather than placed arbitrarily over the artwork. The built-in photo converter remains available.

Rounds, bag, scores, ball state and hazard marks stay on the phone. Course search, map refresh and weather require a connection. On-device speech input availability depends on the Android speech service and installed language resources. Native Android text-to-speech uses the phone's audio output, including connected earbuds.

## Build and validation

- `npm ci`
- `npm test` — decision scenarios and React integration tests for shared ball/target state, hole changes and saved state.
- `npm run build` — TypeScript check and production web bundle.
- GitHub Actions creates the Android project, syncs GPS/speech plugins, builds a debug APK and publishes a separate release for the exact commit. Previous releases are retained.

Open [the latest release](https://github.com/cdale3617-cmyk/Apex-Golf/releases/latest) and download **APEX-Golf.apk**. The Android package must still be tested on the S24 for GPS permissions, touch layout, microphone and audio; passing code tests does not verify those device behaviours.
