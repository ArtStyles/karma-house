// When Android replaces MainActivity inside a living process and resumes the new instance
// before it destroys the old one (a clear-task relaunch, or reopening right after leaving with
// Back), React Native drops the old instance's onHostDestroy: ReactHostImpl only forwards it
// for the current activity. Expo waits for that call to re-register its activity result
// launchers, so expo-image-picker rejects with "Attempting to launch an unregistered
// ActivityResultLauncher" until the process dies. Measured on a Pixel 7 Pro, Android 17,
// expo-modules-core 57.0.18 (the latest for SDK 57).
//
// The fix tells the React host about the previous instance from the new one's onCreate, while
// the previous one is still the current activity, so Expo marks the host as destroyed and
// registers the launchers again on the next resume.
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
    live?.get()?.takeIf { it !== this && !it.isDestroyed }?.let { previous -> reactHost?.onHostDestroy(previous) }
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
