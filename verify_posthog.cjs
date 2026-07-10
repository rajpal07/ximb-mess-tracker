const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  let pageviewFired = false;

  page.on('request', request => {
    const url = request.url();
    if (url.includes('posthog') && (url.includes('/e/') || url.includes('/capture'))) {
      const postData = request.postData();
      if (postData) {
        try {
          // Posthog sends payloads in base64 sometimes if it's GET or form urlencoded, 
          // but for POST /e/ it's often JSON or a URL parameter 'data'
          // We can just log that a request was made
          if (postData.includes('$pageview')) {
            pageviewFired = true;
            console.log('SUCCESS: $pageview event detected in network request payload!');
          }
        } catch (e) {}
      }
      
      const urlObj = new URL(url);
      const dataParam = urlObj.searchParams.get('data');
      if (dataParam) {
        const decoded = Buffer.from(dataParam, 'base64').toString('utf8');
        if (decoded.includes('$pageview')) {
          pageviewFired = true;
          console.log('SUCCESS: $pageview event detected in query param data!');
        }
      }
    }
  });

  console.log('Navigating to site...');
  await page.goto('https://ximb-mess-tracker.vercel.app', { waitUntil: 'networkidle2' });
  
  await new Promise(r => setTimeout(r, 3000));
  
  if (!pageviewFired) {
    console.log('FAILURE: $pageview event was NOT detected.');
  }
  
  await browser.close();
})();
