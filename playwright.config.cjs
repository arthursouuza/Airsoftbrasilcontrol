const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({testDir:'./tests',use:{baseURL:'http://127.0.0.1:8000',launchOptions:{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}},webServer:{command:'python3 -m http.server 8000 --bind 127.0.0.1',url:'http://127.0.0.1:8000',reuseExistingServer:true}});
