/** Native Zarr v2 -> existing Meteo adapter. Offline data only. */
/* `assert` viene del portón: misma superficie, pero publica una línea `OK`
   por comprobación. `tests/correr.sh` saca su veredicto de ese recuento, no
   del código de salida, así que un banco que calla al pasar cuenta cero. */
import {assert, veredicto} from "./porton.mjs";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const code=fs.readFileSync(path.join(here,"../lib/meteo.js"),"utf8");
const WX=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const RUN="weathernext_3_0_0_statistics/zarr/2026_to_present/20261019_06hr_01_preds/predictions.zarr";
function payload(hours=72,{interim=false,p50only=false}={}){
  const when=interim?"2026-10-19T07:00:00Z":"2026-10-19T06:00:00Z";
  const first=Date.parse(when);
  const samples=Array.from({length:hours},(_,i)=>{
    const native={
      temperature_2m_p10:278.15,temperature_2m_p50:280.15,temperature_2m_p90:282.15,
      wind_speed_10m_p10:3,wind_speed_10m_p50:5,wind_speed_10m_p90:7,
      surface_solar_radiation_downwards_1hr_p10:180000,
      surface_solar_radiation_downwards_1hr_p50:360000,
      surface_solar_radiation_downwards_1hr_p90:540000,
      total_cloud_cover_p10:.1,total_cloud_cover_p50:.4,total_cloud_cover_p90:.8
    };
    if(p50only)for(const name of Object.keys(native))
      if(!name.endsWith("_p50"))delete native[name];
    return {lead_hour:i+1,
      valid_time_utc:new Date(first+(i+1)*3600000).toISOString(),
      native_values:native};
  });
  return {
    transport_schema:"weathernext3-zarr-point-v2",
    type:"raw_model_forecast_not_field_measurement",
    source:"Google WeatherNext 3 Statistics",unit_conversions_applied:false,
    run_class:interim?"interim":"synoptic",
    run_max_hours:interim?48:360,requested_hours:hours,returned_hours:hours,
    requested_fields:["temperature_2m_p50","wind_speed_10m_p50"],
    available_fields:["temperature_2m_p50","wind_speed_10m_p50"],
    missing_upstream_fields:p50only?["total_cloud_cover_p90"]:[],
    run_prefix:interim?RUN.replace("_06hr_","_07hr_"):RUN,
    init_time_utc:when,requested_grid_point:{lat:40,lon:-3},
    selected_grid_point:{lat:40.0,lon_360:357},
    raw_units:{"temperature_2m_p50":"K"},samples
  };
}
const close=(got,want)=>assert.ok(got!=null&&Math.abs(got-want)<1e-6,String(got)+" != "+String(want));
const out=WX.fromWeatherNextTransport(payload());
assert.equal(out.length,72);assert.equal(out[0].source,"weathernext3");
close(out[0].temp_c,7);close(out[0].wind_ms,5);close(out[0].ghi_wm2,100);
close(out[0].p10.temp_c,5);close(out[0].p90.temp_c,9);
close(out[0].p10.ghi_wm2,50);close(out[0].p90.ghi_wm2,150);
close(out[0].p10.wind_ms,3);close(out[0].p90.wind_ms,7);
assert.equal(out[0].precip_mm,null);assert.equal(out[0].fdir_wm2,null);
assert.equal(out[0].provenance.surface,"GCS");
assert.equal(out[0].provenance.mode,"native-zarr-import");
assert.equal(out[0].provenance.measurement,false);
assert.equal(out[0].provenance.init_time,"2026-10-19T06:00:00.000Z");
assert.equal(out[0].provenance.forecast_hour,1);
assert.equal(out[0].provenance.grid_lon_360,357);
assert.equal(out[71].timestamp,"2026-10-22T06:00:00.000Z");

const long=WX.fromWeatherNextTransport(payload(360));
assert.equal(long.length,360);assert.equal(long.at(-1).provenance.forecast_hour,360);
const shortWindow=WX.forecastOperationalSummary(long,{hours:72});
assert.equal(shortWindow.hours,72);assert.equal(shortWindow.end_utc,long[71].timestamp);
const longWindow=WX.forecastOperationalSummary(long,{hours:360});
assert.equal(longWindow.hours,360);assert.equal(longWindow.end_utc,long[359].timestamp);

const interim=WX.fromWeatherNextTransport(payload(48,{interim:true}));
assert.equal(interim.length,48);
const p50=WX.fromWeatherNextTransport(payload(3,{p50only:true}));
assert.equal(p50[0].p10,null);assert.equal(p50[0].p90,null);
close(p50[0].p50.ghi_wm2,100);
const zero=payload(1);zero.samples[0].native_values.surface_solar_radiation_downwards_1hr_p50=0;
assert.equal(WX.fromWeatherNextTransport(zero)[0].ghi_wm2,0);
const missing=payload(1);missing.samples[0].native_values.total_cloud_cover_p90=null;
assert.equal(WX.fromWeatherNextTransport(missing)[0].p90.cloud_total,null);
const noWind=payload(1);noWind.samples[0].native_values.wind_speed_10m_p50=null;
assert.throws(()=>WX.fromWeatherNextTransport(noWind),/temperatura o viento P50/);
for(const bad of [
  {...payload(1),unit_conversions_applied:true},
  {...payload(1),transport_schema:"unknown"},
  {...payload(1),requested_hours:73},
  {...payload(49,{interim:true})},
  (()=>{const p=payload(3);p.samples[1].lead_hour=3;return p;})(),
  (()=>{const p=payload(3);p.samples[1].valid_time_utc="2026-01-01T00:00:00Z";return p;})()
])assert.throws(()=>WX.fromWeatherNextTransport(bad));
console.log("PASS: native Zarr v2, quantiles, exact 72/360h, null/zero and time guards");

veredicto();
