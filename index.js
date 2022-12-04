const puppeteer = require("puppeteer");
const express = require('express');
const app = express();
const config = require("./config.js");
const port = config.port || 7462;

const REQUESTS_TIMEOUT = config.requestsTimeout || 10000;
const REMOVE_SCRIPTS = config.removeScripts || true;
const CACHE_DURATION = config.cacheDuration || 60000;

const cache = {};
setInterval(() => {
    for (let k in cache) {
        if (Date.now() - cache[k].time > CACHE_DURATION) {
            delete cache[k];
        }
    }
}, 30000);

let browserInstance;
let browserInUse = 0;
let closing = false;

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
    browserInstance = await puppeteer.launch({headless: true, args: ['--js-flags="--max-old-space-size=1024"']});
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
    if (config.token) {
        if (!req.query.token && !req.headers.token) {
            console.warn("unauthorized from " + getIp(req));
            res.sendStatus(401);
            return;
        }
        if (req.query.token && config.token !== req.query.token) {
            console.warn("unauthorized from " + getIp(req));
            res.sendStatus(401);
            return;
        }
        if (req.headers.token && config.token !== req.headers.token) {
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
    if (req.header("user-agent").includes("HeadlessChrome") && req.header("user-agent").includes("InventivePrerender")) {
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
            page.once("domcontentloaded", () => {
                console.debug("domContentLoaded")
            });
            let requestTimeout;
            // Similar to prerender.io, listen for network requests and use that to decide when the page finished loading
            let requestCallback = request => {
                clearTimeout(requestTimeout);
                requestTimeout = setTimeout(() => {
                    console.debug("all requests done!")
                    page.off("requestfinished", requestCallback);

                    let pageCleanupDone = () => {
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
                            page.close();
                            browserInUse--;
                        }).catch(err => {
                            console.error(err);
                            page.close();
                            browserInUse--;
                        })
                    };

                    page.evaluate((removeScripts) => {
                        console.log("eval done")
                        if (removeScripts) {
                            let scripts = document.getElementsByTagName("script");
                            let i = scripts.length;
                            while (i--) {
                                scripts[i].parentNode.removeChild(scripts[i]);
                            }
                        }

                        let exclusions = document.getElementsByClassName("exclude-from-ssr");
                        let i = exclusions.length;
                        while (i--) {
                            exclusions[i].parentNode.removeChild(exclusions[i]);
                        }
                    }, REMOVE_SCRIPTS).then(pageCleanupDone).catch(err => {
                        console.error(err);
                        page.close();
                        browserInUse--;
                    })


                }, REQUESTS_TIMEOUT);
            };
            page.on("requestfinished", requestCallback);
            page.goto(url, {timeout: 30000}).then(() => {
                console.debug("goto page done")
            }).catch(err => {
                console.error(err);
                page.close();
                browserInUse--;
            })
        }).catch(err => console.error(err));
    });
});

app.listen(port, () => console.log(`SSR app listening at http://localhost:${ port }`))
