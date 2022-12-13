import { Browser } from "puppeteer";

const puppeteer = require("puppeteer");

let browserInstance: Browser | undefined;

async function getBrowser() {
    if (browserInstance) {
        return browserInstance;
    }

    browserInstance = await puppeteer.launch({ headless: true, args: ['--js-flags="--max-old-space-size=1024"', '--no-sandbox', '--disable-setuid-sandbox', '--disk-cache-dir=/tmp/ssr-cache'] });
    browserInstance!.on("disconnected", function () {
        if (browserInstance) {
            try {
                browserInstance.close();
            } catch (ignored) {
            }
        }
        browserInstance = undefined;
    });
    return browserInstance;
}

export { getBrowser };
