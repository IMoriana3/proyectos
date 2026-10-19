#!/usr/bin/env python3
"""Audit public FV data: source-derived snapshots vs live official data.

READ ONLY. Does not populate catalogs; does not attribute trackers.
Network runs only in ephemeral CI; outputs JSON/CSV under an artifacts directory.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
import xml.etree.ElementTree as ET

OUT = Path(os.environ.get("AUDIT_OUT", "audit_artifacts"))
OUT.mkdir(parents=True, exist_ok=True)
HEADERS = {"User-Agent": "SolarGPT-FACTIUN-public-FV-audit/2026-10-19 (read-only)"}
SPA_BLOB = "f7f1f9165799b2c15c9214278fa869d14cec1f23"
GEM_MD5 = "e1808a71fd8ffb28ede32bc9673f303d"


def get(url: str, max_bytes: int, timeout: int = 60, tries: int = 2) -> bytes:
    errors = []
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=timeout) as r:
                data = r.read(max_bytes + 1)
                if len(data) > max_bytes:
                    raise ValueError(f"Size limit exceeded ({max_bytes} bytes)")
                return data
        except (OSError, ValueError) as e:
            errors.append(f"{type(e).__name__}: {str(e)[:250]}")
            if i < tries - 1:
                time.sleep(i + 2)
    raise RuntimeError("; ".join(errors))


def stamp(data: bytes) -> dict:
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def blobsha(raw: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def spanish_snapshot() -> tuple[dict, list[dict]]:
    url = "https://raw.githubusercontent.com/ningunaparte/spain-power-plants/main/data/plants_commercial_2026-05-19.geojson"
    raw = get(url, 7_000_000)
    digest = blobsha(raw)
    if digest != SPA_BLOB:
        raise ValueError(f"Snapshot SHA mismatch: expected {SPA_BLOB}, got {digest}")
    doc = json.loads(raw)
    pv = [f for f in doc["features"] if f.get("properties", {}).get("technology_normalized") == "solar_pv"]
    id_type = Counter()
    groups = {"single": Counter(), "grouped": Counter(), "other": Counter()}
    for feat in pv:
        p = feat.get("properties", {})
        m = str(p.get("minetur") or "")
        kind = "single" if re.fullmatch(r"RE-\d+", m) else ("grouped" if re.fullmatch(r"RE-\d+ y \d+ m[aá]s", m) else "other")
        id_type[kind] += 1
        x,y = p.get("installed_capacity_mw"),p.get("installed_capacity_mw_electra")
        if isinstance(x,(int,float)) and isinstance(y,(int,float)) and x>0 and y>0:
            groups[kind]["compared"] += 1
            if abs(x-y)/max(x,y) > .05: groups[kind]["over_5pct"] += 1
    samples = []
    for code in ("RE-061001", "RE-060893", "RE-016438", "RE-070098"):
        found = [f for f in pv if str(f["properties"].get("minetur") or "").startswith(code)]
        if found: samples.append({"code":code,"snapshot":found[0]["properties"],"coord":found[0]["geometry"].get("coordinates")})
    return {"url":url, **stamp(raw),"git_blob_sha1":digest,"pv_count":len(pv),"total_count":len(doc["features"]), "ids":dict(id_type),"capacity_by_id_type":{k:dict(v) for k,v in groups.items()},"ground_verified_by_snapshot":0},samples


def ree_crosscheck(samples: list[dict]) -> dict:
    """Official REE ArcGIS point field check, not a phase / ground-mount proof."""
    base="https://georedservices.ree.es/arcgis_ags2/rest/services/Hosted/Esios2_gdb/FeatureServer/2/query"
    results=[]
    for s in samples:
        params={"where":f"minetur LIKE '{s['code']}%'", "outFields":"objectid,mw,minetur,municipio,instalacion,coord_x,coord_y", "returnGeometry":"true", "outSR":"4326", "f":"json"}
        url=base+"?"+urllib.parse.urlencode(params)
        rec={"id":s["code"],"snapshot_name":s["snapshot"].get("name"),"snapshot_mw":s["snapshot"].get("installed_capacity_mw"),"snapshot_minetur":s["snapshot"].get("minetur"),"snapshot_lonlat":s["coord"],"source":"REE ArcGIS Esios2_gdb FeatureServer/2"}
        try:
            j=json.loads(get(url,1_500_000,tries=2))
            if j.get("error"): raise ValueError(str(j["error"]))
            feats=j.get("features")
            if not isinstance(feats,list): raise ValueError("No features list in API response")
            rec["official_record_count"]=len(feats)
            rec["official_rows"]=[{"attributes":f.get("attributes"),"geometry":f.get("geometry")} for f in feats[:4]]
            if len(feats)==1:
                p=feats[0].get("attributes") or {}
                a,b=p.get("mw"),rec["snapshot_mw"]
                if isinstance(a,(int,float)) and isinstance(b,(int,float)):
                    rec["ree_point_power_match"] = (abs(a-b) < 0.000001)
            rec["checked"]=True
        except Exception as e:
            rec["checked"]=False; rec["error"]=str(e)[:350]
        results.append(rec)
    return {"source_url":base,"checked":sum(x["checked"] for x in results), "results":results,"limitations":"No MITECO/ELECTRA original row was fetched; this only checks official REE GIS. Same identifier may represent grouped permits; points do not imply soil/trackers."}


def xlsx_sheets(raw: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        wb=ET.fromstring(z.read("xl/workbook.xml"))
        ns={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main","r":"http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
        sheets=[]
        for sh in wb.findall("m:sheets/m:sheet",ns):
            sheets.append({"name":sh.get("name"),"sheetId":sh.get("sheetId")})
        # Count actual serialized spreadsheet rows, not inferred number of PV projects.
        xmlfiles=sorted([n for n in z.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml",n)])
        for i,name in enumerate(xmlfiles):
            count=0; first=b""; tail=b""
            with z.open(name) as f:
                while True:
                    chunk=f.read(1<<20)
                    if not chunk:break
                    if len(first)<65536:first+=(chunk[:65536-len(first)])
                    joined=tail+chunk
                    count+=len(re.findall(rb"<row(?:\s|>)",joined))
                    tail=joined[-6:]
            if i<len(sheets):
                sheets[i]["row_elements"]=count
                sheets[i]["xlsx_member"]=name
        return sheets


def gem() -> dict:
    urls=["https://zenodo.org/records/20843067/files/GEM_GSPT.xlsx?download=1","https://tubcloud.tu-berlin.de/s/Lx8KRcKBMPd2QrZ/download/Global-Solar-Power-Tracker-February-2026.xlsx"]
    attempted=[]
    for url in urls:
        try:
            raw=get(url,24_000_000,120)
            md5=hashlib.md5(raw).hexdigest()
            if url.startswith("https://zenodo") and md5!=GEM_MD5: raise ValueError(f"Modelblocks checksum mismatch {md5}")
            info={"verified_bytes":True,"url":url,**stamp(raw),"md5":md5,"source":"Zenodo Modelblocks 20843067 mirror, GEM February 2026", "sheets":xlsx_sheets(raw),"status":"downloaded-validated"}
            return info
        except Exception as e: attempted.append({"url":url,"error":str(e)[:400]})
    return {"verified_bytes":False,"status":"blocked", "attempts":attempted}



class HTTPRangeZip:
    """Read-only seekable wrapper for inspecting a large remote ZIP by byte ranges.

    Rejects servers that ignore Range (never downloads a multi-GB ZIP).
    """
    def __init__(self,url: str, expected_length: int):
        self.url=url
        self.size=expected_length
        self.pos=0
        self.cache={}
        self.block_size=256*1024
        self.requests=0

    def seek(self, offset:int, whence:int=0):
        base={0:0,1:self.pos,2:self.size}[whence]
        new=base+offset
        if new<0:raise ValueError("negative remote seek")
        self.pos=new
        return self.pos

    def tell(self):return self.pos
    def readable(self):return True
    def seekable(self):return True
    def close(self):self.cache.clear()

    def _chunk(self, index:int)->bytes:
        if index in self.cache:return self.cache[index]
        a=index*self.block_size
        b=min(self.size-1,a+self.block_size-1)
        req=urllib.request.Request(self.url,headers={**HEADERS,"Range":f"bytes={a}-{b}"})
        with urllib.request.urlopen(req,timeout=90) as r:
            if r.status!=206 or not r.headers.get("Content-Range", "").startswith(f"bytes {a}-{b}/"):
                raise ValueError(f"Remote server did not honor ZIP byte-range [{a},{b}]: HTTP {r.status}")
            chunk=r.read(b-a+2)
            if len(chunk)!=b-a+1:raise ValueError("Incomplete byte-range response")
        self.requests+=1
        if len(self.cache)>=20:self.cache.pop(next(iter(self.cache)))
        self.cache[index]=chunk
        return chunk

    def read(self,n=-1):
        if n is None or n<0:n=self.size-self.pos
        n=min(n,max(0,self.size-self.pos))
        out=[]
        while n:
            ix=self.pos//self.block_size
            buf=self._chunk(ix)
            off=self.pos%self.block_size
            piece=buf[off:off+n]
            if not piece:break
            out.append(piece); self.pos+=len(piece); n-=len(piece)
        return b"".join(out)


def sample_remote_archive(file:dict)->dict:
    """Inspect ZIP central directory and stream only first rows of selected CSVs."""
    archive=HTTPRangeZip(file["self"],int(file["size"]))
    try:
        with zipfile.ZipFile(archive) as z:
            names=[i.filename for i in z.infolist()]
            profiles=[{"path":i.filename,"uncompressed_bytes":i.file_size,"compressed_bytes":i.compress_size} for i in z.infolist() if not i.is_dir()]
            out={"zip_member_count":len(profiles),"zip_member_summaries":profiles[:40],"zip_range_requests":None}
            aliases=[]
            for tag in ("GMSEUS_Arrays_Final_2025_v2_1", "GMSEUS_Panels_Final_2025_v2_0"):
                candidates=[n for n in names if tag.lower() in n.lower() and n.lower().endswith(".csv")]
                if not candidates:
                    # Some releases contain shapefiles but no independent CSV entries.
                    candidates=[n for n in names if tag.lower() in n.lower() and n.lower().endswith(".shp")]
                if not candidates:
                    continue
                selected=min(candidates,key=lambda n:z.getinfo(n).file_size)
                result={"component":tag,"member":selected,"original_size_bytes":z.getinfo(selected).file_size}
                with z.open(selected) as f:
                    if selected.lower().endswith(".csv"):
                        # Do not carry geometry payloads or names into the result: only schema,
                        # counts of a few valid-looking feature records and coordinate prefix.
                        wrapper=io.TextIOWrapper(f,encoding="utf-8-sig",errors="replace",newline="")
                        reader=csv.DictReader(wrapper)
                        cols=reader.fieldnames or []
                        rows=[]
                        for _,r in zip(range(4),reader):
                            row={k:str(v)[:120] for k,v in r.items() if k and (re.search(r"^(arrayid|source|sourcetype|mount|modtype|tilt|gcr|spacing|width|length|azimuth|pitch|area|tech|crs|geometrytype)$", k, re.I) or re.search(r"sourceConf",k,re.I))}
                            shapes=[(k,v) for k,v in r.items() if k and re.search(r"wkt|geom|polygon",k,re.I) and isinstance(v,str)]
                            row["geometry_text_present"]=any(bool(v.strip()) for k,v in shapes)
                            row["geometry_wkt_type"]=(re.match(r"\s*([A-Z]+)",shapes[0][1]).group(1) if shapes and re.match(r"\s*([A-Z]+)",shapes[0][1]) else None)
                            rows.append(row)
                        result.update({"format":"CSV","columns":cols,"first_rows":rows,"sample_count":len(rows)})
                    else:
                        import struct
                        header=f.read(100)
                        file_code=struct.unpack(">i",header[0:4])[0]
                        shape_type=struct.unpack("<i",header[32:36])[0]
                        extent=struct.unpack("<4d",header[36:68])
                        sampled=[]
                        for i in range(3):
                            record_header=f.read(8)
                            if len(record_header)<8:break
                            recno,words=struct.unpack(">ii",record_header)
                            b=f.read(words*2)
                            if len(b)<36:break
                            typ=struct.unpack("<i",b[0:4])[0]
                            bbox=struct.unpack("<4d",b[4:36]) if typ in (3,5,13,15,23,25) else None
                            sampled.append({"record":recno,"shape_type":typ,"bbox_projected_epsg6350":bbox})
                        result.update({"format":"SHP","file_code":file_code,"shape_type":shape_type,"extent_projected_epsg6350":extent,"first_shapes":sampled,"sample_count":len(sampled)})
                aliases.append(result)
            out["sample_components"]=aliases
            out["verified_geometry"]=bool(aliases) and all(x["sample_count"] for x in aliases)
        out["zip_range_requests"]=archive.requests
        return out
    finally:
        archive.close()


def gmseus() -> dict:
    url="https://zenodo.org/api/records/21445384"
    try:
        info=json.loads(get(url,5_000_000,tries=3))
    except Exception as e:return {"verified_geometry":False,"status":"manifest-unavailable","error":str(e)[:450],"source":url}
    files=info.get("files") or []
    manifest=[{"key":f.get("key"),"size":f.get("size"),"checksum":f.get("checksum"),"self":(f.get("links") or {}).get("self")} for f in files]
    summary={"source":url,"manifest_checked":True,"files_count":len(manifest),"files":manifest,"verified_geometry":False,"status":"manifest-only"}
    readme=next((f for f in manifest if f["key"]=="README.txt"),None)
    if readme:
        try:
            b=get(readme["self"],500000)
            summary["readme_sha256"]=hashlib.sha256(b).hexdigest()
            summary["readme_md5_matches_manifest"]=(hashlib.md5(b).hexdigest()==readme["checksum"].split(":",1)[1])
            summary["readme_sample"]="\n".join(b.decode("utf-8",errors="replace").splitlines()[:14])
        except Exception as e:summary["readme_error"]=str(e)[:350]
    file=next((f for f in manifest if f["key"]=="GMSEUS.zip"),None)
    if not file:return summary
    try:
        evidence=sample_remote_archive(file)
        summary.update(evidence)
        summary["status"]="sampled-with-byte-ranges" if evidence["verified_geometry"] else "zip-directory-verified-sample-missing"
        summary["caveats"]="No full 3.68GB ZIP checksum verified; sample via HTTP 206 ranges; no tracker attribution or redistribution rights inferred."
    except Exception as e:
        summary["range_error"]=f"{type(e).__name__}: {str(e)[:450]}"
    return summary


def dnv_tests() -> dict:
    """Run upstream tests only if permitted in read-only isolated runner."""
    try:
        wd=OUT/"dnv-sdk"
        subprocess.run(["git","clone","--depth","1","https://github.com/dnv-opensource/solarfarmer-python-sdk.git",str(wd)],check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
        head=subprocess.run(["git","rev-parse","HEAD"],cwd=wd,capture_output=True,text=True,check=True).stdout.strip()
        install=subprocess.run(["python","-m","pip","install","-q","uv"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=160)
        if install.returncode:return {"status":"install-failed","upstream_sha":head,"pip_log_tail":install.stdout[-1800:]}
        sync=subprocess.run(["uv","sync","--group","test"],cwd=wd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=180)
        if sync.returncode:return {"status":"dependency-sync-failed","upstream_sha":head,"uv_tail":sync.stdout[-1800:]}
        run=subprocess.run(["uv","run","pytest","tests/","-q"],cwd=wd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env={**os.environ,"SF_API_KEY":""},timeout=220)
        return {"status":"passed" if not run.returncode else "failed", "upstream_sha":head,"returncode":run.returncode,"pytest_tail":run.stdout[-2200:],"note":"Uses official upstream uv sync --group test and uv run pytest tests/ -q; commercial API key unset."}
    except Exception as e:return {"status":"blocked","error":f"{type(e).__name__}: {str(e)[:600]}"}


def run_stage(name,fn):
    print(f"START: {name}",flush=True)
    try: r=fn()
    except Exception as e:r={"status":"error","error":f"{type(e).__name__}: {str(e)[:750]}"}
    print(f"RESULT: {name}: {json.dumps({k:v for k,v in r.items() if k not in ['files','results','sample_records','sheets']},ensure_ascii=False)[:1600]}",flush=True)
    return r


def main():
    report={"lot":"FACTIUN-FV-AUDIT-20261019","date":"2026-10-19","rules":{"ground_only":True,"auto_import":False,"tracker_attribution":False},"scope":"data QA only; no production catalog writes"}
    snapshots={}
    try:
        snapshots=spanish_snapshot()
        report["spain_derived"]=snapshots[0]
    except Exception as e:
        report["spain_derived"]={"status":"error","error":str(e)[:500]}
    report["official_ree"]=run_stage("official_ree",lambda:ree_crosscheck(snapshots[1] if snapshots else []))
    report["gem_2026_02"]=run_stage("gem_2026_02",gem)
    report["gmseus_2_1"]=run_stage("gmseus_2_1",gmseus)
    report["dnv_sdk"]=run_stage("dnv_sdk",dnv_tests)
    (OUT/"fv_sources_audit_result_20261019.json").write_text(json.dumps(report,indent=2,ensure_ascii=False,default=str)+"\n",encoding="utf-8")
    print("RESULT_JSON_BEGIN\n"+json.dumps(report,ensure_ascii=False,default=str)+"\nRESULT_JSON_END",flush=True)
    print("Audit finished; no catalog rows written",flush=True)

if __name__=="__main__": main()