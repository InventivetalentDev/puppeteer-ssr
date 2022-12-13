import { AsyncLoadingCache, AsyncMappingFunction } from "@inventivetalent/loading-cache";

const { Caches } = require("@inventivetalent/loading-cache");
const { Time } = require("@inventivetalent/time");
const cache: AsyncLoadingCache<string, string> = Caches.builder()
    .expireAfterWrite(Time.minutes(1))
    .recordStats(false)
    .buildAsync();

async function getOr(url: string, mappingFunction: AsyncMappingFunction<string, string>) {
    return cache.get(url, mappingFunction)
}

async function get(url: string) {
    return cache.getIfPresent(url);
}

async function put(url: string, content: string) {
    return cache.put(url, content);
}

export { get, getOr, put };
