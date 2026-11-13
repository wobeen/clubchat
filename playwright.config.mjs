import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:30000,
 reporter:'list',use:{baseURL:'http://127.0.0.1:4175',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
 webServer:{command:'node server.mjs',env:{PORT:'4175'},url:'http://127.0.0.1:4175/health',reuseExistingServer:!process.env.CI}
});
