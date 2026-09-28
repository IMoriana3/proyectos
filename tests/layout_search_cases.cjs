'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
function loadEngine(){
  const html=fs.readFileSync(path.join(root,'generador-layout.html'),'utf8');
  const match=html.match(/MOTOR DE LAYOUT — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ MOTOR DE LAYOUT — fin/);
  if(!match)throw new Error('Missing production layout engine');
  const ctx={console,module:{exports:{}},performance};vm.createContext(ctx);vm.runInContext(match[1],ctx);
  return ctx.LAY;
}
function cases(){
  const fix=JSON.parse(fs.readFileSync(path.join(__dirname,'careo-layout.json'),'utf8'));
  const toLL=pts=>pts.map(p=>[fix.lon+p[0]/(111320*Math.cos(fix.lat*Math.PI/180)),fix.lat+p[1]/110540]);
  return fix.casos.map(c=>{
    const g=c.cfg;
    return {name:c.nombre,config:{
      coords:c.poly_lonlat||toLL(c.poly),holes:c.poly_lonlat?(c.holes_lonlat||[]):(c.holes||[]).map(toLL),
      exclusions:c.excl_lonlat||[],mount:g.mount_type==='fija'?'fija':'tracker',table:g.table_type,
      mods:Array.isArray(g.mods_per_struct)?g.mods_per_struct:[g.mods_per_struct],
      modLen:g.mod_len,modWid:g.mod_wid,moduleWp:fix.module_wp,pitch:g.pitch_m,setback:g.setback_m,
      panelAz:g.panel_az_deg,bifila:g.bifila,gapModules:g.gap_modules,gapMotor:g.mount_type==='fija'?g.gap_modules:g.gap_motor,
      gapNs:g.mount_type==='fija'?g.gap_modules:g.gap_ns,roadEvery:g.road_every,roadW:g.road_w,
      roadNsEvery:g.road_ns_every,roadNsW:g.road_ns_w,mode:g.layout_mode,minStructs:g.min_structs_per_row,
      rowOffset:'none',alignGrid:g.align_to_grid,center:true
    }};
  });
}
module.exports={loadEngine,cases};
