/* Previsión frente a medida (lib/meteo-verificacion.js): alineación horaria
   de las medidas, lectura de la respuesta de Open-Meteo con varios modelos,
   elección del modelo fino y estadísticos de verificación. */
import {assert, veredicto} from "./porton.mjs";
import {horasMedidas,periodoMedidas,urlPrevisionArchivada,leePrevision,verifica,seriesGrafica,MODELOS} from "../lib/meteo-verificacion.js";

const rec=(t,variable,value,extra={})=>({t,plant:"El Burgo I",ncu:"1",sensor:"HSU 230",variable,unit:"m/s",value,...extra});
const R=[
  rec("2026-10-02T09:40:00Z","wind_speed",4),   // → 10:00 (media centrada)
  rec("2026-10-02T10:20:00Z","wind_speed",6),   // → 10:00
  rec("2026-10-02T10:40:00Z","wind_speed",8),   // → 11:00
  rec("2026-10-02T10:10:00Z","wind_peak",9),    // → 11:00 (máximo de la hora previa)
  rec("2026-10-02T10:50:00Z","wind_peak",12),   // → 11:00
  rec("2026-10-02T11:00:00Z","wind_peak",7),    // → 11:00 (fin incluido)
  rec("2026-10-02T10:30:00Z","irradiance_raw",900,{unit:"raw"}),
  rec("2026-10-02T10:30:00Z","wind_speed",50,{plant:"Otra"})
];
const media=horasMedidas(R,{plant:"El Burgo I",magnitud:"wind_speed"});
assert.deepStrictEqual(media.map(x=>[x.t,x.valor]),[["2026-10-02T10:00Z",5],["2026-10-02T11:00Z",8]],"viento medio: media centrada en la hora, solo la planta elegida");
const racha=horasMedidas(R,{plant:"El Burgo I",magnitud:"wind_peak"});
assert.deepStrictEqual(racha.map(x=>[x.t,x.valor]),[["2026-10-02T11:00Z",12]],"racha: máximo de (H−1 h, H]");
assert.strictEqual(horasMedidas([rec("2026-10-02T10:00:00Z","wind_speed",3,{unit:"km/h"})],{magnitud:"wind_speed"}).length,0,"no mezcla unidades distintas de m/s");
assert.deepStrictEqual(periodoMedidas(media),{inicio:"2026-10-02",fin:"2026-10-02"},"periodo de las medidas");

const u=new URL(urlPrevisionArchivada({lat:41.57634,lon:-0.79814,inicio:"2026-10-02",fin:"2026-10-08",magnitud:"wind_peak"}));
assert.strictEqual(u.host,"historical-forecast-api.open-meteo.com","usa la previsión archivada, no la vigente");
assert.ok(u.searchParams.get("hourly")==="wind_gusts_10m"&&u.searchParams.get("wind_speed_unit")==="ms"&&u.searchParams.get("timezone")==="GMT","racha en m/s y horas UTC");
assert.strictEqual(u.searchParams.get("models"),MODELOS.map(m=>m.id).join(","),"pide el modelo grueso y los finos");

const t=["2026-10-02T10:00","2026-10-02T11:00","2026-10-02T12:00"];
const conArome=leePrevision({hourly:{time:t,wind_speed_10m_ecmwf_ifs025:[4,7,null],wind_speed_10m_meteofrance_arome_france_hd:[5,8,6],wind_speed_10m_knmi_harmonie_arome_europe:[1,1,1]}});
assert.ok(conArome.gruesa.modelo.id==="ecmwf_ifs025"&&conArome.fina.modelo.id==="meteofrance_arome_france_hd","fino: AROME HD si tiene datos");
assert.deepStrictEqual(conArome.gruesa.serie.map(x=>x.valor),[4,7,null],"conserva los huecos del modelo");
const sinArome=leePrevision({hourly:{time:t,wind_speed_10m_ecmwf_ifs025:[4,7,6],wind_speed_10m_meteofrance_arome_france_hd:[null,null,null],wind_speed_10m_knmi_harmonie_arome_europe:[5,6,7]}});
assert.strictEqual(sinArome.fina.modelo.id,"knmi_harmonie_arome_europe","si AROME no cubre el sitio, HARMONIE Europa");
const soloGruesa=leePrevision({hourly:{time:t,wind_speed_10m_ecmwf_ifs025:[4,7,6]}});
assert.ok(soloGruesa.gruesa&&soloGruesa.fina===null,"sin modelo fino, solo la gruesa");

const v=verifica(media,conArome.fina.serie);
assert.strictEqual(v.n,2,"compara solo las horas en común");
assert.ok(Math.abs(v.sesgo-0)<1e-12&&Math.abs(v.mae-0)<1e-12,"previsión exacta: sesgo y error 0");
const v2=verifica(media,conArome.gruesa.serie);
assert.ok(Math.abs(v2.sesgo-(-1))<1e-12&&Math.abs(v2.mae-1)<1e-12&&Math.abs(v2.rmse-1)<1e-12,"sesgo = previsto − medido");
assert.strictEqual(verifica([],conArome.gruesa.serie).n,0,"sin medidas, sin estadísticos inventados");

const g=seriesGrafica(media,conArome);
assert.ok(g.eje.length===3&&g.medida[2]===null&&g.fina[2]===6,"eje común con huecos donde no hay medida");
veredicto();
