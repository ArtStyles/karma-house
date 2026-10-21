// When Android replaces MainActivity inside a living process, React Native can drop the old
// instance's onHostDestroy: ReactHostImpl only forwards it for the current activity, and Expo's
// ReactActivityDelegateWrapper posts onDestroy to a coroutine that often runs after the new
// instance has resumed. That happens when the old instance is destroyed after the new one
// resumes (a clear-task relaunch) and also when it is destroyed just before the new one is
// created (reopening from the launcher after the old instance finished while the process was
// frozen; seen in logcat on 2026-10-21). Expo waits for that call to re-register its activity
// result launchers, so expo-image-picker rejects with "Attempting to launch an unregistered
// ActivityResultLauncher" until the process dies. Measured on a Pixel 7 Pro, Android 17,
// expo-modules-core 57.0.18 (the latest for SDK 57).
//
// The fix tells the React host about the previous instance from the new one's onCreate, while
// the previous one is still the current activity, so Expo marks the host as destroyed and
// registers the launchers again on the next resume. If the host already handled that instance,
// ReactHostImpl ignores the call.
const { withMainActivity } = require('expo/config-plugins');

const MARK = '// karmahouse: activity recreation fix';
const CLASS = 'class MainActivity : ReactActivity() {';
const CREATE = 'super.onCreate(null)';

function patchMainActivity(source) {
  if (source.includes(MARK)) return source;
  if (!source.includes(CLASS) || !source.includes(CREATE)) {
    throw new Error('withActivityRecreationFix: the MainActivity template changed; review the plugin.');
  }
  return source
    .replace(CLASS, `${CLASS}
  ${MARK}
  companion object { private var live: java.lang.ref.WeakReference<MainActivity>? = null }
`)
    .replace(CREATE, `${MARK}
    live?.get()?.takeIf { it !== this }?.let { previous -> reactHost?.onHostDestroy(previous) }
    live = java.lang.ref.WeakReference(this)
    ${CREATE}`);
}

function withActivityRecreationFix(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('withActivityRecreationFix expects a Kotlin MainActivity.');
    mod.modResults.contents = patchMainActivity(mod.modResults.contents);
    return mod;
  });
}

module.exports = withActivityRecreationFix;
module.exports.patchMainActivity = patchMainActivity;
