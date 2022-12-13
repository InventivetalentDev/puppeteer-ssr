module.exports = {
    apps: [{
        name: "ssr",
        script: "dist/index.js",
        args: ["--color", "--time"],
        time: true,
        interpreter: "node@19.2.0",
        max_memory_restart: "300M",
        env: {
            PORT: 7462,
            TOKEN: "12345",
            GOOGLE_CHROME_BIN: ""
        }
    }]
}
