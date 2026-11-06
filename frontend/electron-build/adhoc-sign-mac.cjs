// electron-builder afterPack hook: ad-hoc sign the macOS app.
//
// There is no Apple certificate (mac.identity is null), so electron-builder leaves the app unsigned. Packing
// (asar, Info.plist, icon) breaks the signature Electron ships with, and on Apple silicon macOS then calls the
// downloaded app "damaged" and offers only Move to Trash. An ad-hoc signature (codesign -s -) is valid but
// anonymous: macOS instead says the developer cannot be verified, which right-click → Open (or System
// Settings → Privacy & Security → Open Anyway) gets past.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSignMac(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed ${app}`);
};
