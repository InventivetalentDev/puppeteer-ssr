import { AsyncLoadingCache, AsyncMappingFunction } from "@inventivetalent/loading-cache";

import { Caches } from "@inventivetalent/loading-cache";
import { Time } from "@inventivetalent/time";
import * as redis from "./redis";
import * as logging from "./logging";

const cache: AsyncLoadingCache<string, string> = Caches.builder()
    .expireAfterWrite(Time.seconds(Number(process.env.MEMORY_CACHE_DURATION) || 60)) // seconds
    .recordStats(false)
    .buildAsync();

async function getOr(url: string, mappingFunction: AsyncMappingFunction<string, string>): Promise<string> {
    let cached = await cache.getIfPresent(url);
    if (cached) {
        logging.debug("got cached content for " + url);
        return cached;
    }

    if (process.env.REDISCLOUD_URL) {
        let originalMapping = mappingFunction;
        mappingFunction = async (key: string) => {
            // try to get from redis first, otherwise fall back to original mapping function
            try {
                let redisValue = await redis.get(key);
                if (redisValue) {
                    logging.debug("got redis content for " + url);
                    return redisValue;
                }
            } catch (e) {
                console.warn(e);
            }
            let value = await originalMapping(key);
            if (value) { // intercept the mapped value & store in redis
                try {
                    await redis.put(key, value);
                } catch (e) {
                    console.warn(e);
                }
            }
            return value;
        };
    }

    logging.debug("getting live content for " + url);
    return await cache.get(url, mappingFunction);
}


export { getOr };
