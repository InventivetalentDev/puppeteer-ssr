interface QueueItem {
    url: string;
    resolve: (v: string | undefined) => void
}

export { QueueItem };
