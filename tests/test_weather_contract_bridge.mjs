#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const h=fs.readFileSync(path.join(ROOT,"weather-contract-bridge.html"),"utf8");
let ok=0,ko=0;
const check=(n,v)=>{if(v){ok++;console.log("OK   "+n)}else{ko++;console.log("FAIL "+n)}};

check("puente importa la autoridad WeatherContract",h.includes('loadActiveWeatherContract'));
check("autoriza explícitamente cobertura Workers",h.includes('https://cobertura-zigbee.imoriana3.workers.dev'));
check("autoriza explícitamente GitHub Pages",h.includes('https://imoriana3.github.io'));
check("solo relaja origen para localhost de desarrollo",h.includes('u.hostname==="127.0.0.1"')&&h.includes('u.hostname==="localhost"'));
check("no usa postMessage con wildcard",!h.includes('postMessage('+'{')||!h.includes(',"*")'));
check("postMessage recibe targetOrigin concreto",h.includes("postMessage({type:")&&h.includes("},targetOrigin)"));
check("la petición exige nonce",h.includes('d.nonce!==nonce'));
check("la respuesta devuelve el mismo nonce",h.includes('nonce,kind,...payload'));
check("tipos de contrato están en allowlist",h.includes('"forecast","historical","tmy","prepared"'));
check("rechaza esquema distinto de v2",h.includes('pkg.schema_version!=="2.0.0"'));
check("solo responde tras mensaje del consumidor",h.includes('factiun-weather-contract-request'));
check("transfiere el paquete completo, no una copia parcial",h.includes('reply(targetOrigin,{ok:true,pkg})'));
check("si no hay contrato activo falla con nombre",h.includes('No hay WeatherContract'));
check("cierra el popup tras transferir",h.includes('window.close()'));

console.log("");
console.log((ko?"FALLA":"TODO OK")+" — "+ok+" comprobaciones"+(ko?" · "+ko+" fallos":""));
process.exit(ko?1:0);
