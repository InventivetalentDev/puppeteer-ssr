import { QueueItem } from "./typings";
import { Page } from "puppeteer-core";

import { getBrowser } from "./browser";
import * as logging from "./logging";

const queue: QueueItem[] = [];
let pending = 0;

function logStats() {
    logging.log("queue size: " + queue.length);
    logging.log("pending: " + pending);
}

async function enqueue(url: string, resolve: (v: string | undefined) => void) {
    queue.unshift({ url, resolve });

    logStats();
}

async function doRender(url: string, resolve: (v: string | undefined) => void) {
    let start = Date.now();
    pending++;

    logging.info("rendering " + url);

    const instance = await getBrowser();
    const page = await instance.newPage();

    let content = undefined;

    try {
        const userAgent = await instance.userAgent();
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


        content = await page.content();

        logging.info("took " + ((Date.now() - start) / 1000) + "s to render " + url);

        await page.close();
    } catch (e) {
        console.warn(e);
        try {
            page.close();
        } catch (e) {
        }
    }

    pending--;

    logStats();

    return resolve(content);
}

async function processNext() {
    if (queue.length <= 0) {
        return;
    }

    if (pending > (Number(process.env.MAX_CONCURRENT) || 5)) {
        logStats();
        console.warn("render might be stuck, attempting to restart!")
        process.exit(1);
        return;
    }

    let { url, resolve } = queue.pop()!;

    let resolved = false;
    let timeout = setTimeout(() => {
        resolved = true;
        resolve(undefined);
        logging.warn("render request timed out");
    }, Number(process.env.RENDER_TIMEOUT) || 30000);
    try {
        return doRender(url, (s: string | undefined) => {
            if (resolved) return;
            resolve(s);
            resolved = true;
            clearTimeout(timeout);
        }).catch(e => {
            console.warn(e);
            resolve(undefined);
        });
    } catch (e) {
        logging.warn(e);
    }
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

        setTimeout(() => handleRequest(), Number(process.env.REQUESTS_TIMEOUT) || 500);
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
        processNext().catch(e => {
            console.warn(e);
        });
    } catch (e) {
        logging.warn(e);
    }
}, Number(process.env.PROCESSING_INTERVAL) || 500);

export { enqueue };
