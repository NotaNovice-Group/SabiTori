import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const app = resolve(__dirname, '..');
const cameraDir = resolve(createRequire(resolve(app, 'package.json')).resolve('@capacitor/camera/package.json'), '..');

describe('native photo configuration', () => {
  // On iOS the camera plugin refuses getPhoto at once (both camera and gallery) when any Info.plist key it checks is
  // missing. NSPhotoLibraryAddUsageDescription was missing: every photo ended in "Reading failed" on a real iPhone.
  it('Info.plist has every usage description the iOS camera plugin checks', () => {
    const types = readFileSync(resolve(cameraDir, 'ios/Sources/CameraPlugin/CameraTypes.swift'), 'utf8');
    const block = /enum CameraPropertyListKeys[\s\S]*?\n}/.exec(types)![0];
    const keys = [...block.matchAll(/case \w+ = "(NS\w+UsageDescription)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    const plist = readFileSync(resolve(app, 'ios/App/App/Info.plist'), 'utf8');
    for (const k of keys) expect(plist, k).toMatch(new RegExp(`<key>${k}</key>\\s*<string>[^<]{10,}</string>`));
  });
  // The app's own iOS plugins (SabiToriVision reads photos, SabiToriKokoro speaks) are registered only by
  // MainViewController. SceneDelegate once built a plain CAPBridgeViewController, so neither ever loaded on a phone.
  it('iOS starts MainViewController, which registers the app plugins', () => {
    const scene = readFileSync(resolve(app, 'ios/App/App/SceneDelegate.swift'), 'utf8');
    expect(scene).toMatch(/rootViewController\s*=\s*MainViewController\(\)/);
    expect(scene).not.toMatch(/=\s*CAPBridgeViewController\(/);
    const main = readFileSync(resolve(app, 'ios/App/App/MainViewController.swift'), 'utf8');
    for (const plugin of ['SabiToriVisionPlugin', 'SabiToriKokoroPlugin']) expect(main, plugin).toContain(`registerPluginInstance(${plugin}())`);
  });
  it('Android: the camera plugin\'s FileProvider authority and its Pictures folder are declared', () => {
    const manifest = readFileSync(resolve(app, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android:authorities="${applicationId}.fileprovider"');
    const paths = readFileSync(resolve(app, 'android/app/src/main/res/xml/file_paths.xml'), 'utf8');
    expect(paths).toMatch(/<external-files-path [^>]*path="Pictures\/"/);
    const java = readdirSync(resolve(cameraDir, 'android/src/main/java/com/capacitorjs/plugins/camera'));
    const utils = readFileSync(resolve(cameraDir, 'android/src/main/java/com/capacitorjs/plugins/camera', java.find((f) => f === 'CameraUtils.java')!), 'utf8');
    expect(utils).toContain('appId + ".fileprovider"');
    expect(utils).toContain('getExternalFilesDir(Environment.DIRECTORY_PICTURES)');
  });
});
