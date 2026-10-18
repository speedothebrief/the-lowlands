#!/bin/sh
cd "$(dirname "$0")"
{
printf '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>The Lowlands</title>\n<style>html,body{margin:0;height:100%%;overflow:hidden;background:#0b0d10}canvas{display:block;cursor:default}</style></head>\n<body><canvas id="c"></canvas>\n<script>\n'
echo '/*SIM-BEGIN*/'
cat p1.js p2.js p3.js p8.js
echo '/*SIM-END*/'
cat p0client.js p4.js p5.js p6.js p9audio.js p7.js
printf '</script>\n</body></html>\n'
} > ../index.html
