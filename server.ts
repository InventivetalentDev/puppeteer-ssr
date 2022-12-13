import { Request, Response } from "express";

const express = require('express');
const port = process.env.PORT || 80;
const app = express();

const browser = require("./browser");
const cache = require("./cache");
const render = require("./render");

import * as logging from "./logging";

function getIp(req: Request) {
    return req.get('cf-connecting-ip') || req.get('x-forwarded-for') || req.get("x-real-ip") || req.connection.remoteAddress || req.ip;
}


function runServer() {
    app.use(require("express-request-id")());

    app.get('/', (req: Request, res: Response) => res.send('Hello World!'))

    app.get("/render", async (req: Request, res: Response) => {
        if (process.env.TOKEN) {
            if (!req.query.token && !req.headers.token) {
                logging.warn("unauthorized from " + getIp(req));
                res.sendStatus(401);
                return;
            }
            if (req.query.token && process.env.TOKEN !== req.query.token) {
                logging.warn("unauthorized from " + getIp(req));
                res.sendStatus(401);
                return;
            }
            if (req.headers.token && process.env.TOKEN !== req.headers.token) {
                logging.warn("unauthorized from " + getIp(req));
                res.sendStatus(401);
                return;
            }
        }


        let url = req.query.url as string;
        logging.log("Render request for " + url + " by \"" + req.header("user-agent") + "\"");

        if (!!req.header("user-agent") && req.header("user-agent")?.includes("HeadlessChrome") && req.header("user-agent")?.includes("InventivePrerender")) {
            logging.warn("render loop");
            return;
        }
        url = url.replace(/_escaped_fragment_/g, ''); // remove that or it'll redirect loop and never load the actual page

        res.header("Cache-Control", "public, max-age=2629746");

        let rendered = await cache.getOr(url, (key: string) => {
            return new Promise<string>(resolve => {
                render.enqueue(key, resolve);
            })
        });

        res.send(rendered);

    });

    app.listen(port, () => logging.log(`app listening on port ${ port }`))

}

export { runServer };
