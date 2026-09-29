// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

// Only the pure transform is loaded; the plugin entry needs expo/config-plugins at prebuild time.
const source = `class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}`;

test('the MainActivity patch reports the previous instance to the React host, once', () => {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const load = Module._load;
  Module._load = (request, ...rest) => request === 'expo/config-plugins' ? { withMainActivity: () => {} } : load(request, ...rest);
  let patchMainActivity;
  try { ({ patchMainActivity } = require('../plugins/withActivityRecreationFix.cjs')); } finally { Module._load = load; }

  const patched = patchMainActivity(source);
  assert.ok(patched.includes('companion object { private var live: java.lang.ref.WeakReference<MainActivity>? = null }'));
  assert.ok(patched.includes('reactHost?.onHostDestroy(previous)'));
  assert.ok(patched.indexOf('reactHost?.onHostDestroy(previous)') < patched.indexOf('super.onCreate(null)'), 'the host hears about the old activity before the new one is created');
  assert.ok(patched.indexOf('live = java.lang.ref.WeakReference(this)') < patched.indexOf('super.onCreate(null)'));
  assert.equal(patchMainActivity(patched), patched, 'running prebuild twice does not patch twice');
  assert.throws(() => patchMainActivity('class Other {}'), /template changed/);
});
