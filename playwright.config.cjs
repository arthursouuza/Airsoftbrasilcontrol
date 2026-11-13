const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({testDir:'./tests',use:{baseURL:'http://127.0.0.1:8000',launchOptions:{executablePath:process.env.ABC_CHROMIUM_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/chromium'),args:['--no-sandbox']}}});
