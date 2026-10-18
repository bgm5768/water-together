# Locked-screen notification sound

Confirmed user observation (2026-10-18): the push arrives and the phone's default
notification sound plays; the can-and-pour recording only plays with the app open.
This is not a scheduler or delivery failure.

The service worker calls `showNotification` with `silent: false`, `renotify: true`
and vibration. The recording is decoded by the page's AudioContext after a user
gesture. The worker only posts an audio message to a visible app client. When the
phone is locked, Android renders the notification and selects its channel sound.
There is no supported standard `sound` URL option on showNotification that can
replace this with the app's MP3. Do not add obsolete `sound` fields or silent
background playback workarounds.

The settings panel now explains the two behaviors and exposes a direct MP3
download. On supported Android phones, users can copy it to Notifications and
select it in their app/site notification category. The web app cannot read or
change that OS preference. Samsung menu availability varies by One UI version.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
- https://support.google.com/android/answer/9079661?hl=ko
- https://www.samsung.com/ph/support/mobile-devices/how-to-set-a-music-file-as-a-notification-sound-for-apps-on-your-galaxy-phone/
