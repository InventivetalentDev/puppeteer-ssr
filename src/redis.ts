import { createClient, RedisClientType } from "redis";
import { Time } from "@inventivetalent/time";

let client: RedisClientType | undefined;


async function instance() {
    if (client) {
        return client;
    }
    client = createClient({
        url: process.env.REDISCLOUD_URL
    });
    client.on('error', (err) => console.log('Redis Client Error', err));
    await client.connect();
    return client;
}

function stripUrl(url: string): string {
    return url.replace(/[.:]/g, '');
}

export async function get(url: string) {
    return (await instance()).GET('ssr:renders:' + stripUrl(url));
}

export async function put(url: string, content: string) {
    return (await instance()).SET('ssr:renders:' + stripUrl(url), content, {
        PX: Time.minutes(Number(process.env.REDIS_CACHE_DURATION) || 15)
    });
}
