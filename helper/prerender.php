<?php
// PHP helper script to rewrite crawler requests to the SSR server
// Change settings in prerender_config.php
include "prerender_config.php";

$ch = curl_init(PRERENDER_HOST . "/render?token=" . PRERENDER_TOKEN . "&url=" . urlencode("https://" . $_SERVER["HTTP_HOST"] . $_SERVER["REQUEST_URI"]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$res = curl_exec($ch);
$header = curl_getinfo($ch);
curl_close($ch);

echo $res;
