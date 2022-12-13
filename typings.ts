interface QueueItem {
    url: string;
    resolve: (v: string) => void
}

export { QueueItem };
