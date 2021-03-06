const puppeteer = require("puppeteer");
const express = require('express');
const app = express();
const config = require("./config.js");
const port = config.port || 7462;

const REQUESTS_TIMEOUT = config.requestsTimeout || 10000;
const REMOVE_SCRIPTS = config.removeScripts || true;
const CACHE_DURATION = config.cacheDuration || 60000;

const cache = {};
setInterval(()=>{
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
    browserInstance = await puppeteer.launch();
    browserInstance.on("disconnected", function () {
        if(browserInstance) browserInstance.close();
        browserInstance = null
    });
    closing = false;
    return browserInstance;
}

app.use(require("express-request-id")());

app.get('/', (req, res) => res.send('Hello World!'))

app.get("/render", (req, res) => {
    if (config.token) {
        if (!req.query.token && !req.headers.token) {
            res.sendStatus(401);
            return;
        }
        if (req.query.token && config.token !== req.query.token) {
            res.sendStatus(401);
            return;
        }
        if (req.headers.token && config.token !== req.headers.token) {
            res.sendStatus(401);
            return;
        }
    }

    if (closing) {
        console.log("Blocking request since browser is closing");
        res.sendStatus(503);
        return;
    }

    let url = req.query.url;
    console.log("Render request for " + url + " by " + req.headers["user-agent"]);
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
    makeBrowser().then(browser => {
        browserInUse++;
        browser.newPage().then(page => {
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

                    if (REMOVE_SCRIPTS) {
                        page.evaluate(() => {
                            let scripts = document.getElementsByTagName("script");
                            let i = scripts.length;
                            while (i--) {
                                scripts[i].parentNode.removeChild(scripts[i]);
                            }
                        }).then(pageCleanupDone).catch(err=>{
                            console.error(err);
                            page.close();
                            browserInUse--;
                        })
                    } else {
                        pageCleanupDone();
                    }
                }, REQUESTS_TIMEOUT);
            };
            page.on("requestfinished", requestCallback);
            page.goto(url).then(() => {
                console.debug("goto page done")
            }).catch(err=>{
                console.error(err);
                page.close();
                browserInUse--;
            })
        }).catch(err => console.error(err));
    });
});

app.listen(port, () => console.log(`SSR app listening at http://localhost:${ port }`))
