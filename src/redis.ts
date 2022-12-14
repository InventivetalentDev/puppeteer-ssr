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

export async function get(url: string) {
    return (await instance()).GET('ssr:renders:' + url);
}

export async function put(url: string, content: string) {
    return (await instance()).SET('ssr:renders:' + url, content, {
        PX: Time.minutes(Number(process.env.REDIS_CACHE_DURATION) || 120)
    });
}
