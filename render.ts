import { QueueItem } from "./typings";
import { Page } from "puppeteer";

const browser = require("./browser");
const cache = require("./cache");
const render = require("./render");
import * as logging from "./logging";

const queue: QueueItem[] = [];
let pending = 0;

async function enqueue(url: string, resolve: (v: string) => void) {
    queue.unshift({ url, resolve });
}


async function processNext() {
    if (queue.length <= 0) {
        return;
    }

    let start = Date.now();

    let { url, resolve } = queue.pop()!;
    pending++;

    logging.info("rendering " + url);

    const instance = await browser.getBrowser();

    const userAgent = await instance.userAgent();
    const page = await instance.newPage();
    await page.setUserAgent(userAgent + " " + (process.env.USER_AGENT || "InventivePrerender"));
    logging.log("Loading " + url);

    page.once("load", () => {
        logging.debug("page loaded!")
    });

    const domPromise = new Promise<void>(resolve => {
        page.once('domcontentloaded', () => resolve());
    });

    await page.goto(url, { timeout: Number(process.env.GOTO_TIMEOUT) || 30000 });
    logging.debug("goto page done");

    // wait for dom to load
    logging.debug("waiting for dom...");
    await domPromise;
    logging.log("domContentLoaded");

    // first round of removals
    await doRemovals(page);

    // let network requests finish
    await waitForNetworkRequests(page);

    // remove again
    await doRemovals(page);


    let content = await page.content();

    logging.info("took " + ((Date.now() - start) / 1000) + "s to render " + url);

    await page.close();

    return resolve(content);
}

async function waitForNetworkRequests(page: Page) {
    logging.debug("waiting for network...");
    return new Promise<void>(resolve => {
        let requestTimeout: NodeJS.Timeout | undefined;
        let handleRequest = () => {
            clearTimeout(requestTimeout);
            requestTimeout = setTimeout(() => {
                logging.debug("requestTimeout reached")
                page.off("requestfinished", handleRequest);

                resolve();
            }, Number(process.env.REQUESTS_TIMEOUT) || 500);
        };
        page.on("requestfinished", handleRequest);
    })
}

async function doRemovals(page: Page) {
    logging.debug("removing stuff")
    return page.evaluate((removeScripts: boolean, removeSelectors?: string[]) => {
        console.debug("eval")

        if (removeScripts) {
            let scripts = document.getElementsByTagName("script");
            let i = scripts.length;
            while (i--) {
                scripts[i].parentNode?.removeChild(scripts[i]);
            }
        }

        if (removeSelectors) {
            for (let sel of removeSelectors) {
                let elements = document.querySelectorAll(sel);
                let i = elements.length;
                while (i--) {
                    elements[i].parentNode?.removeChild(elements[i]);
                }
            }
        }

        let exclusions = document.getElementsByClassName("exclude-from-ssr");
        let i = exclusions.length;
        while (i--) {
            exclusions[i].parentNode?.removeChild(exclusions[i]);
        }

        console.debug("eval done")
    }, process.env.REMOVE_SCRIPTS === "true", process.env.REMOVE_SELECTORS?.split(",")).catch(err => {
        logging.warn("evail failed", err);
    })
}

setInterval(() => {
    try {
        processNext();
    } catch (e) {
        logging.warn(e);
    }
}, Number(process.env.PROCESSING_INTERVAL) || 500);

export { enqueue };
