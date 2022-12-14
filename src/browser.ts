import { Browser, launch } from "puppeteer-core";

let browserInstance: Browser | undefined;

async function getBrowser() {
    if (browserInstance) {
        return browserInstance;
    }

    browserInstance = await launch({
        headless: true,
        executablePath: process.env.GOOGLE_CHROME_BIN,
        args: ['--js-flags="--max-old-space-size=1024"', '--no-sandbox', '--disable-setuid-sandbox', '--disable-3d-apis', '--disk-cache-dir=/tmp/ssr-cache']
    });
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
