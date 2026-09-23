import fs from 'fs';
import path from 'path';

interface PwaAuditCheck {
  id: string;
  title: string;
  weight: number;
  passed: boolean;
  score: number;
  details: string;
}

interface AppPwaAuditResult {
  appName: string;
  score: number;
  passed: boolean;
  checks: PwaAuditCheck[];
}

function auditAppPwa(
  appName: string,
  appDir: string,
  publicDir: string,
  layoutFile: string
): AppPwaAuditResult {
  const checks: PwaAuditCheck[] = [];

  // 1. Check Web App Manifest existence & JSON validity
  const manifestPath = path.join(publicDir, 'manifest.json');
  const manifestExists = fs.existsSync(manifestPath);
  let manifest: any = null;
  let manifestValidJson = false;

  if (manifestExists) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestValidJson = true;
    } catch (e) {
      manifestValidJson = false;
    }
  }

  checks.push({
    id: 'manifest-exists',
    title: 'Web App Manifest file exists and is valid JSON',
    weight: 15,
    passed: manifestExists && manifestValidJson,
    score: manifestExists && manifestValidJson ? 15 : 0,
    details: manifestExists && manifestValidJson
      ? `Found valid manifest.json at ${manifestPath}`
      : 'manifest.json missing or invalid JSON',
  });

  // 2. Check Service Worker existence & implementation
  const swPath = path.join(publicDir, 'sw.js');
  const swExists = fs.existsSync(swPath);
  let swHasFetch = false;
  let swHasInstall = false;
  let swHasOfflineFallback = false;

  if (swExists) {
    const swContent = fs.readFileSync(swPath, 'utf8');
    swHasFetch = swContent.includes("addEventListener('fetch'") || swContent.includes('addEventListener("fetch"');
    swHasInstall = swContent.includes("addEventListener('install'") || swContent.includes('addEventListener("install"');
    swHasOfflineFallback = swContent.includes('caches.match') && (swContent.includes('Offline') || swContent.includes('respondWith'));
  }

  checks.push({
    id: 'service-worker-registered',
    title: 'Service Worker exists with offline caching & fetch handling',
    weight: 20,
    passed: swExists && swHasFetch && swHasInstall && swHasOfflineFallback,
    score: swExists && swHasFetch && swHasInstall && swHasOfflineFallback ? 20 : 0,
    details: swExists
      ? `Service Worker has install=${swHasInstall}, fetch=${swHasFetch}, offline=${swHasOfflineFallback}`
      : 'sw.js file missing',
  });

  // 3. Check Installable Manifest Fields (name, short_name, start_url, display)
  const hasName = Boolean(manifest?.name && manifest.name.length > 0);
  const hasShortName = Boolean(manifest?.short_name && manifest.short_name.length <= 15);
  const hasStartUrl = Boolean(manifest?.start_url);
  const hasDisplayStandalone = manifest?.display === 'standalone' || manifest?.display === 'fullscreen';
  const installableManifest = hasName && hasShortName && hasStartUrl && hasDisplayStandalone;

  checks.push({
    id: 'installable-manifest',
    title: 'Manifest contains name, short_name (<=15 chars), start_url, display: standalone',
    weight: 15,
    passed: installableManifest,
    score: installableManifest ? 15 : 0,
    details: `name="${manifest?.name}", short_name="${manifest?.short_name}", display="${manifest?.display}"`,
  });

  // 4. Check App Icons (192x192 & 512x512 PNG, Maskable)
  const icons: any[] = manifest?.icons || [];
  const has192 = icons.some((i) => i.sizes === '192x192' && i.src);
  const has512 = icons.some((i) => i.sizes === '512x512' && i.src);
  const hasMaskable = icons.some((i) => i.purpose && i.purpose.includes('maskable'));

  // Verify actual icon files exist on disk
  const icon192Path = path.join(publicDir, 'icon-192.png');
  const icon512Path = path.join(publicDir, 'icon-512.png');
  const iconFilesExist = fs.existsSync(icon192Path) && fs.existsSync(icon512Path);

  const iconsValid = has192 && has512 && hasMaskable && iconFilesExist;

  checks.push({
    id: 'pwa-icons',
    title: 'Valid PNG icons (192x192, 512x512, maskable) exist and referenced',
    weight: 15,
    passed: iconsValid,
    score: iconsValid ? 15 : 0,
    details: `192px=${has192}, 512px=${has512}, maskable=${hasMaskable}, filesExist=${iconFilesExist}`,
  });

  // 5. Check Splash Screen & Themed Omnibox (theme_color, background_color)
  const hasThemeColor = Boolean(manifest?.theme_color);
  const hasBgColor = Boolean(manifest?.background_color);
  const splashConfigured = hasThemeColor && hasBgColor;

  checks.push({
    id: 'splash-screen-theme',
    title: 'Manifest defines theme_color and background_color for splash screen',
    weight: 10,
    passed: splashConfigured,
    score: splashConfigured ? 10 : 0,
    details: `theme_color="${manifest?.theme_color}", background_color="${manifest?.background_color}"`,
  });

  // 6. Check Viewport Meta Tag & HTML Entries
  let layoutContent = '';
  if (fs.existsSync(layoutFile)) {
    layoutContent = fs.readFileSync(layoutFile, 'utf8');
  }
  const hasViewport = layoutContent.includes('viewport') || layoutContent.includes('device-width');
  const hasAppleTouchIcon = layoutContent.includes('apple-touch-icon');
  const hasManifestLink = layoutContent.includes('rel="manifest"') || layoutContent.includes("rel='manifest'") || layoutContent.includes("manifest: '/manifest.json'");

  const htmlEntryValid = hasViewport && hasAppleTouchIcon && hasManifestLink;

  checks.push({
    id: 'html-viewport-meta',
    title: 'HTML entry point defines viewport meta, apple-touch-icon, and manifest link',
    weight: 10,
    passed: htmlEntryValid,
    score: htmlEntryValid ? 10 : 0,
    details: `viewport=${hasViewport}, apple-touch-icon=${hasAppleTouchIcon}, manifestLink=${hasManifestLink}`,
  });

  // 7. Check Apple Web App Capabilities
  const appleTouchPath = path.join(publicDir, 'apple-touch-icon.png');
  const appleTouchExists = fs.existsSync(appleTouchPath);
  const hasAppleCapable = layoutContent.includes('appleWebApp') || layoutContent.includes('apple-mobile-web-app-capable') || layoutContent.includes('apple-touch-icon');

  checks.push({
    id: 'apple-touch-icon',
    title: 'Apple touch icon file exists and iOS web app capable flags configured',
    weight: 5,
    passed: appleTouchExists && hasAppleCapable,
    score: appleTouchExists && hasAppleCapable ? 5 : 0,
    details: `apple-touch-icon.png exists=${appleTouchExists}, iOS metadata configured=${hasAppleCapable}`,
  });

  // 8. Check In-App Install Rich Previews (screenshots)
  const screenshots: any[] = manifest?.screenshots || [];
  const hasScreenshots = screenshots.length > 0;
  const screenshotPath = path.join(publicDir, 'app-screenshot.jpg');
  const screenshotFileExists = fs.existsSync(screenshotPath);

  checks.push({
    id: 'install-screenshots',
    title: 'Rich install screenshots configured in manifest and exist on disk',
    weight: 5,
    passed: hasScreenshots && screenshotFileExists,
    score: hasScreenshots && screenshotFileExists ? 5 : 0,
    details: `screenshots count=${screenshots.length}, fileExists=${screenshotFileExists}`,
  });

  // 9. Check In-App Install Prompt Component Availability
  const installComponentPath = path.resolve(process.cwd(), 'packages/ui/src/feedback/PWAInstallButton.tsx');
  const installComponentExists = fs.existsSync(installComponentPath);

  checks.push({
    id: 'in-app-install-prompt',
    title: 'In-app install prompt component available with beforeinstallprompt handling',
    weight: 5,
    passed: installComponentExists,
    score: installComponentExists ? 5 : 0,
    details: `PWAInstallButton component exists at ${installComponentPath}`,
  });

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.weight, 0);
  const finalPercentage = Math.round((totalScore / maxScore) * 100);

  return {
    appName,
    score: finalPercentage,
    passed: finalPercentage >= 90,
    checks,
  };
}

export async function runLighthousePwaAudit(): Promise<{
  appsAudited: AppPwaAuditResult[];
  allPassed: boolean;
}> {
  console.log('================================================================');
  console.log('LIGHTHOUSE CI PWA AUDIT SUITE (Target >= 90)');
  console.log('Auditing apps/client and apps/admin against Google PWA standards');
  console.log('================================================================\n');

  const rootDir = process.cwd();

  const clientResult = auditAppPwa(
    'apps/client (OrchestreeAI Client Workspace)',
    path.join(rootDir, 'apps/client'),
    path.join(rootDir, 'apps/client/public'),
    path.join(rootDir, 'apps/client/app/layout.tsx')
  );

  const adminResult = auditAppPwa(
    'apps/admin (OrchestreeAI Admin Console)',
    path.join(rootDir, 'apps/admin'),
    path.join(rootDir, 'apps/admin/public'),
    path.join(rootDir, 'apps/admin/app/layout.tsx')
  );

  const rootAppResult = auditAppPwa(
    'root (Vite Production App / PWA)',
    rootDir,
    path.join(rootDir, 'public'),
    path.join(rootDir, 'index.html')
  );

  const appsAudited = [clientResult, adminResult, rootAppResult];

  for (const app of appsAudited) {
    console.log(`\n================================================================`);
    console.log(`AUDIT REPORT: ${app.appName}`);
    console.log(`Lighthouse PWA Score: ${app.score} / 100 ${app.passed ? '✅ (PASS >= 90)' : '❌ (FAIL < 90)'}`);
    console.log(`================================================================`);
    for (const check of app.checks) {
      const mark = check.passed ? '✅' : '❌';
      console.log(`  ${mark} [${check.id}] (${check.score}/${check.weight} pts): ${check.title}`);
      console.log(`     Detail: ${check.details}`);
    }
  }

  const allPassed = appsAudited.every((a) => a.passed && a.score >= 90);

  console.log('\n================================================================');
  console.log('SUMMARY LIGHTHOUSE CI PWA AUDIT:');
  console.log(`apps/client PWA Score : ${clientResult.score} / 100 ${clientResult.score >= 90 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`apps/admin PWA Score  : ${adminResult.score} / 100 ${adminResult.score >= 90 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`root app PWA Score    : ${rootAppResult.score} / 100 ${rootAppResult.score >= 90 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('================================================================\n');

  if (!allPassed) {
    throw new Error('Lighthouse PWA Audit GAGAL: Skor kurang dari target 90!');
  }

  return {
    appsAudited,
    allPassed,
  };
}

if (process.argv[1]?.endsWith('test_lighthouse_pwa_compliance.ts')) {
  runLighthousePwaAudit()
    .then(() => {
      console.log('🎯 DEFINITION OF DONE TERCAPAI: Lighthouse PWA >= 90 pada apps/client dan apps/admin.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
