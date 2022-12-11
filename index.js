const puppeteer = require("puppeteer");
const express = require('express');
const app = express();
const config = require("./config.js");
const port = process.env.PORT || config.port || 7462;

const TOKEN = process.env.TOKEN || config.token || "12345";
const REQUESTS_TIMEOUT = process.env.REQUESTS_TIMEOUT || config.requestsTimeout || 600;
const REMOVE_SCRIPTS = process.env.REMOVE_SCRIPTS || config.removeScripts || true;
const REMOVE_SELECTORS = process.env.REMOVE_SELECTORS?.split(',') || config.removeSelectors || [];
const CACHE_DURATION = process.env.CACHE_DURATION || config.cacheDuration || 60000;
const MAX_CONCURRENT = process.env.MAX_CONCURRENT || config.maxConcurrent || 5;

const cache = {};
setInterval(() => {
    for (let k in cache) {
        if (Date.now() - cache[k].time > CACHE_DURATION) {
            delete cache[k];
        }
    }
}, 10000);

let browserInstance;
let browserInUse = 0;
let closing = false;
let pending = 0;

setInterval(() => {
    if (browserInstance) {
        console.log("Browser in use: " + browserInUse);
        let tryCounter = 0;
        let browserCloseTry = () => {
            closing = true;
            if (browserInUse > 0 && tryCounter++ < 20) { // wait
                console.log("Browser close try #" + tryCounter);
                setTimeout(browserCloseTry, 1000);
            } else { // close it!
                if (browserInstance) browserInstance.close();
                browserInstance = null;
                browserInUse = 0;
                closing = false;
            }
        }
        browserCloseTry();
    }
}, 120000);

async function makeBrowser() {
    if (browserInstance) {
        return browserInstance;
    }
    browserInstance = await puppeteer.launch({headless: true, args: ['--js-flags="--max-old-space-size=1024"', '--no-sandbox', '--disable-setuid-sandbox', '--disk-cache-dir=/tmp/ssr-cache']});
    browserInstance.on("disconnected", function () {
        if (browserInstance) browserInstance.close();
        browserInstance = null
    });
    closing = false;
    return browserInstance;
}


function getIp(req) {
    return req.get('cf-connecting-ip') || req.get('x-forwarded-for') || req.get("x-real-ip") || req.connection.remoteAddress || req.ip;
}

app.use(require("express-request-id")());

app.get('/', (req, res) => res.send('Hello World!'))

app.get("/render", (req, res) => {
    if (TOKEN) {
        if (!req.query.token && !req.headers.token) {
            console.warn("unauthorized from " + getIp(req));
            res.sendStatus(401);
            return;
        }
        if (req.query.token && TOKEN !== req.query.token) {
            console.warn("unauthorized from " + getIp(req));
            res.sendStatus(401);
            return;
        }
        if (req.headers.token && TOKEN !== req.headers.token) {
            console.warn("unauthorized from " + getIp(req));
            res.sendStatus(401);
            return;
        }
    }

    if (closing) {
        console.log("Blocking request since browser is closing");
        res.sendStatus(503);
        return;
    }

    res.header("Cache-Control", "public, max-age=2629746");

    let url = req.query.url;
    console.log("Render request for " + url + " by \"" + req.header("user-agent") + "\"");
    if (!!req.header("user-agent") && req.header("user-agent").includes("HeadlessChrome") && req.header("user-agent").includes("InventivePrerender")) {
        console.warn("render loop");
        return;
    }
    url = url.replace(/_escaped_fragment_/g, ''); // remove that or it'll redirect loop and never load the actual page
    if (cache.hasOwnProperty(url)) {
        let cached = cache[url];
        if (cached.content) { // Only send if content is available
            console.debug("Returning cached content for " + url);
            res.send(cache[url].content);
        } else { // add to render queue
            console.debug("Adding request for " + url + " to render queue");
            cached.waitingForRender[req.id] = res;
        }
        return;
    }
    if (pending > MAX_CONCURRENT) {
        res.status(503).end();
        return;
    }
    pending++;
    console.log("pending", pending)
    // put into cache to prevent loading the same url multiple times
    let waiting = {};
    waiting[req.id] = res;
    cache[url] = {
        time: Date.now(),
        waitingForRender: waiting
    };
    makeBrowser().then(async browser => {
        browserInUse++;
        const userAgent = await browser.userAgent();
        browser.newPage().then(page => {
            page.setUserAgent(userAgent + " InventivePrerender");
            console.log("Loading " + url);
            page.once("load", () => {
                console.debug("page loaded!")
            });

            function doRemovals() {
                return page.evaluate((removeScripts, removeSelectors) => {
                    console.debug("eval")

                    if (removeScripts) {
                        let scripts = document.getElementsByTagName("script");
                        let i = scripts.length;
                        while (i--) {
                            scripts[i].parentNode.removeChild(scripts[i]);
                        }
                    }

                    for (let sel of removeSelectors) {
                        let elements = document.querySelectorAll(sel);
                        let i = elements.length;
                        while (i--) {
                            elements[i].parentNode.removeChild(elements[i]);
                        }
                    }

                    let exclusions = document.getElementsByClassName("exclude-from-ssr");
                    let i = exclusions.length;
                    while (i--) {
                        exclusions[i].parentNode.removeChild(exclusions[i]);
                    }

                    console.debug("eval done")
                }, REMOVE_SCRIPTS, REMOVE_SELECTORS).catch(err => {
                    console.error(err);
                })
            }

            let requestTimeout;
            // Similar to prerender.io, listen for network requests and use that to decide when the page finished loading
            let requestCallback = request => {
                clearTimeout(requestTimeout);
                requestTimeout = setTimeout(() => {
                    console.debug("requestTimeout reached")
                    page.off("requestfinished", requestCallback);

                    let pageCleanupDone = () => {
                        console.debug("pageCleanupDone")
                        page.content().then(content => {
                            if (cache.hasOwnProperty(url)) {
                                let cached = cache[url];
                                // Send to all waiting requests
                                for (let reqId in cached.waitingForRender) {
                                    cached.waitingForRender[reqId].send(content);
                                    delete cached.waitingForRender[reqId];
                                }
                            } else {
                                res.send(content);
                            }
                            console.log("took " + ((Date.now() - cache[url].time) / 1000) + "s to load " + url);
                            cache[url] = {
                                time: Date.now(),
                                content: content
                            };
                            pending--;
                            browserInUse--;
                            page.close().catch(e => {
                                console.warn(e)
                            });
                        }).catch(err => {
                            console.warn(err);
                            browserInUse--;
                            page.close().catch(e => {
                                console.warn(e)
                            });
                        })
                    };

                    doRemovals().then(() => pageCleanupDone());

                }, REQUESTS_TIMEOUT);
            };


            page.once("domcontentloaded", () => {
                console.debug("domContentLoaded");

                doRemovals().then(() => {
                    console.log("eval done")
                    page.on("requestfinished", () => requestCallback());
                });
            });


            page.goto(url, {timeout: 30000}).then(() => {
                console.debug("goto page done")
            }).catch(err => {
                console.warn(err);
                browserInUse--;
                page.close().catch(e => {
                    console.warn(e);
                })
            })
        }).catch(err => console.error(err));
    });
});

app.listen(port, () => console.log(`SSR app listening at http://localhost:${ port }`))
