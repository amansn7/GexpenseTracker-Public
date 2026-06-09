// @ts-nocheck
{
const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function hapticLight() {
  if (!motionOk) return;
  try {
    if (window.Haptics?.impact) {
      window.Haptics.impact({ style: 'Light' });
    } else {
      navigator.vibrate(10);
    }
  } catch (_) {}
}
function hapticHeavy() {
  if (!motionOk) return;
  try {
    if (window.Haptics?.impact) {
      window.Haptics.impact({ style: 'Heavy' });
    } else {
      navigator.vibrate([10, 50, 10]);
    }
  } catch (_) {}
}
Object.assign(window, { hapticLight, hapticHeavy });
}
