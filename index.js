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

setInterval(() => {
    if (browserInstance) {
        browserInstance.close();
        browserInstance = null;
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
            page.on("requestfinished", request => {
                clearTimeout(requestTimeout);
                requestTimeout = setTimeout(() => {
                    console.debug("all requests done!")
                    page.off("requestfinished");

                    let pageCleanupDone =() => {
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
                        })
                    };

                    if(REMOVE_SCRIPTS) {
                        page.evaluate(() => {
                            let scripts = document.getElementsByTagName("script");
                            let i = scripts.length;
                            while (i--) {
                                scripts[i].parentNode.removeChild(scripts[i]);
                            }
                        }).then(pageCleanupDone)
                    }else{
                        pageCleanupDone();
                    }
                }, REQUESTS_TIMEOUT);
            });
            page.goto(url).then(() => {
                console.debug("goto page done")
            })
        })
    });
});

app.listen(port, () => console.log(`SSR app listening at http://localhost:${ port }`))
