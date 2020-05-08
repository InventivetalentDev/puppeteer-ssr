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

async function makeBrowser() {
    if (browserInstance) {
        return browserInstance;
    }
    browserInstance = await puppeteer.launch();
    browserInstance.on("disconnected", function () {
        browserInstance = null
    });
    return browserInstance;
}

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
    if (cache.hasOwnProperty(url)) {
        res.send(cache[url].content);
        return;
    }
    makeBrowser().then(browser => {
        browser.newPage().then(page => {
            console.log("Loading " + url);
            page.once("load", () => {
                console.log("page loaded!")
            });
            page.on("domcontentloaded", () => {
                console.log("domContentLoaded")
            })
            let requestTimeout;
            page.on("requestfinished", request => {
                clearTimeout(requestTimeout);
                requestTimeout = setTimeout(() => {
                    console.log("all requests done!")

                    let pageCleanupDone =() => {
                        page.content().then(content => {
                            res.send(content);
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
                console.log("goto page done")
            })
        })
    });
});

app.listen(port, () => console.log(`SSR app listening at http://localhost:${ port }`))
