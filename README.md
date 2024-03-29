# Puppeteer SSR

A simple serverside rendering express app using [Puppeteer](https://github.com/puppeteer/puppeteer)


[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/InventivetalentDev/puppeteer-ssr)

`docker pull inventivetalent/puppeteer-ssr` [![Docker Pulls](https://img.shields.io/docker/pulls/inventivetalent/puppeteer-ssr)](https://hub.docker.com/r/inventivetalent/puppeteer-ssr)

## Usage

* Clone this repo
* cd into the directory
* install dependencies

```shell script
git clone https://github.com/InventivetalentDev/puppeteer-ssr.git
cd puppeteer-ssr
npm install
npm run build
```

* Set environment variables (see app.json)

* Start the server
```shell script
# Run in shell
npm run start

# Run in background via pm2
npm run start-pm2
```


* Make render requests to your server!
  
  
* Configure your frontend server to auto-redirect crawlers to the render server
  * Copy files in [/helper](https://github.com/InventivetalentDev/puppeteer-ssr/tree/master/helper) to your website's root directory (adjust your .htaccess if you already have one)
  * Update `prerender_config.php` with the address of your render server & the token
