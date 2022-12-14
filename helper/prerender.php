<?php
// PHP helper script to rewrite crawler requests to the SSR server
// Change settings in prerender_config.php
include "./prerender_config.php";

header("X-Prerendered: true");

$ch = curl_init(PRERENDER_HOST . "/render?token=" . PRERENDER_TOKEN . "&url=" . urlencode("https://" . $_SERVER["HTTP_HOST"] . $_SERVER["REQUEST_URI"]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER["HTTP_USER_AGENT"]);
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    "X-Prerender-Connecting-IP: " . $_SERVER['HTTP_CF_CONNECTING_IP']
));
$res = curl_exec($ch);
list($header, $content) = explode("\r\n\r\n", $res, 2);
curl_close($ch);

foreach (explode(PHP_EOL, $header) as $line) {
    header($line);
}

echo $content;
