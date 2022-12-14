import { AsyncLoadingCache, AsyncMappingFunction } from "@inventivetalent/loading-cache";

import { Caches } from "@inventivetalent/loading-cache";
import { Time } from "@inventivetalent/time";
import * as redis from "./redis";

const cache: AsyncLoadingCache<string, string> = Caches.builder()
    .expireAfterWrite(Time.seconds(Number(process.env.MEMORY_CACHE_DURATION) || 60)) // seconds
    .recordStats(false)
    .buildAsync();

async function getOr(url: string, mappingFunction: AsyncMappingFunction<string, string>) {
    if (process.env.REDISCLOUD_URL) {
        let originalMapping = mappingFunction;
        mappingFunction = async (key: string) => {
            // try to get from redis first, otherwise fall back to original mapping function
            let redisValue = await redis.get(key);
            if (redisValue) {
                return redisValue;
            }
            return originalMapping(key)
                .then(value => { // intercept the mapped value & store in redis
                    if (value) {
                        redis.put(key, value);
                    }
                    return value;
                })
        };
    }
    return cache.get(url, mappingFunction);
}


export { getOr };
