import { Request, Response } from "express";

import express from 'express';

const port = process.env.PORT || 80;
const app = express();

import * as cache from "./cache";
import * as render from "./render";

import * as logging from "./logging";
import * as os from "os";

function getIp(req: Request) {
    return req.get('cf-connecting-ip') || req.get('x-forwarded-for') || req.get("x-real-ip") || req.connection.remoteAddress || req.ip;
}


function runServer() {
    app.get('/', (req: Request, res: Response) => {
        res.redirect("https://github.com/InventivetalentDev/puppeteer-ssr");
    })

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
        logging.log(`Render request for ${ url } by "${ req.header("user-agent") }" from ${ getIp(req) }`);

        if (!!req.header("user-agent") && req.header("user-agent")?.includes("HeadlessChrome") && req.header("user-agent")?.includes("InventivePrerender")) {
            logging.warn("render loop");
            return;
        }
        url = url.replace(/_escaped_fragment_/g, ''); // remove that or it'll redirect loop and never load the actual page

        res.header("Cache-Control", "public, max-age=2629746");

        res.header("X-Prerender-Server", os.hostname());

        let rendered = await cache.getOr(url, (key: string) => {
            return new Promise<string>(resolve => {
                render.enqueue(key, resolve);
            })
        });

        res.send(rendered);

        res.end();
    });

    app.listen(port, () => logging.log(`app listening on port ${ port }`))

}

export { runServer };
