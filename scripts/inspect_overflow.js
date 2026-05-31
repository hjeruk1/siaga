const { spawn } = require('child_process');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function getAdminToken() {
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipe: 'staff', username: 'admin', password: 'admin123' })
  });
  const data = await res.json();
  return data.token;
}

async function inspectPage(width) {
  console.log(`\n================ Inspecting Viewport: ${width}px ================`);
  const token = await getAdminToken();
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    `--window-size=${width},844`
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const list = await listRes.json();
    const page = list.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    
    return new Promise((resolve) => {
      let msgId = 1;
      const call = (method, params = {}) => new Promise((resCall) => {
        const id = msgId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resCall(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
      
      ws.onopen = async () => {
        await call('Page.enable');
        await call('Runtime.enable');

        await call('Emulation.setDeviceMetricsOverride', {
          width: width,
          height: 844,
          deviceScaleFactor: 3,
          mobile: true,
          fitWindow: true
        });

        // 1. Set Auth Token & Navigate
        await call('Page.navigate', { url: 'http://localhost:5173/' });
        await new Promise(r => setTimeout(r, 1000));
        await call('Runtime.evaluate', {
          expression: `localStorage.setItem('siaga_token', '${token}')`
        });
        await call('Page.navigate', { url: 'http://localhost:5173/?view=guru&tab=daily' });
        await new Promise(r => setTimeout(r, 3000));

        const listOverflow = await call('Runtime.evaluate', {
          expression: `
            (function() {
              const elements = [];
              document.querySelectorAll('*').forEach(el => {
                if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
                  const style = window.getComputedStyle(el);
                  elements.push({
                    tagName: el.tagName,
                    id: el.id,
                    className: el.className,
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                    overflowX: style.overflowX
                  });
                }
              });
              return elements;
            })()
          `,
          returnByValue: true
        });
        console.log('--- List View Elements with scrollWidth > clientWidth ---');
        console.log(JSON.stringify(listOverflow.result.value, null, 2));

        // 2. Open Editor Drawer
        await call('Runtime.evaluate', {
          expression: `
            (function() {
              const cards = document.querySelectorAll('[role="button"]');
              if (cards.length > 0) {
                cards[0].click();
                return 'clicked';
              }
              return 'no cards';
            })()
          `
        });
        await new Promise(r => setTimeout(r, 1500));

        const editorOverflow = await call('Runtime.evaluate', {
          expression: `
            (function() {
              const elements = [];
              document.querySelectorAll('*').forEach(el => {
                if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
                  const style = window.getComputedStyle(el);
                  elements.push({
                    tagName: el.tagName,
                    id: el.id,
                    className: el.className,
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                    overflowX: style.overflowX
                  });
                }
              });
              return elements;
            })()
          `,
          returnByValue: true
        });
        console.log('--- Editor Drawer Open Elements with scrollWidth > clientWidth ---');
        console.log(JSON.stringify(editorOverflow.result.value, null, 2));

        // 3. Switch to Absensi tab
        await call('Runtime.evaluate', {
          expression: `
            (function() {
              const absensiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Absensi'));
              if (absensiBtn) {
                absensiBtn.click();
                return 'clicked absensi';
              }
              return 'absensi btn not found';
            })()
          `
        });
        await new Promise(r => setTimeout(r, 1500));

        const absensiOverflow = await call('Runtime.evaluate', {
          expression: `
            (function() {
              const elements = [];
              document.querySelectorAll('*').forEach(el => {
                if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
                  const style = window.getComputedStyle(el);
                  elements.push({
                    tagName: el.tagName,
                    id: el.id,
                    className: el.className,
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                    overflowX: style.overflowX
                  });
                }
              });
              return elements;
            })()
          `,
          returnByValue: true
        });
        console.log('--- Absensi Tab Elements with scrollWidth > clientWidth ---');
        console.log(JSON.stringify(absensiOverflow.result.value, null, 2));

        ws.close();
        chromeProcess.kill();
        resolve();
      };
    });
  } catch(e) {
    console.error(e);
    chromeProcess.kill();
  }
}

async function main() {
  await inspectPage(320);
  await inspectPage(390);
  process.exit(0);
}

main();
