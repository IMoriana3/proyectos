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


def gmseus() -> dict:
    url="https://zenodo.org/api/records/21445384"
    try:
        info=json.loads(get(url,5_000_000,tries=3))
    except Exception as e:return {"verified_geometry":False,"status":"manifest-unavailable","error":str(e)[:450],"source":url}
    files=info.get("files") or []
    manifest=[{"key":f.get("key"),"size":f.get("size"),"checksum":f.get("checksum"),"self":(f.get("links") or {}).get("self") } for f in files]
    summary={"source":url,"manifest_checked":True,"files_count":len(manifest),"files":manifest,"verified_geometry":False}
    candidates=[f for f in manifest if f["key"] and "array" in f["key"].lower() and not any(x in f["key"].lower() for x in ["rooftop","readme","naip"]) and f["size"] and 300<f["size"]<=120_000_000 and (f["key"].lower().endswith((".zip",".csv",".gpkg")))]
    candidates.sort(key=lambda f:f["size"])
    summary["selected_candidate_keys"]=[f["key"] for f in candidates]
    for file in candidates[:2]:
        try:
            b=get(file["self"],121_000_000,timeout=170,tries=1)
            exp=file["checksum"] or ""
            if exp.startswith("md5:") and hashlib.md5(b).hexdigest()!=exp.split(":",1)[1]:raise ValueError("MD5 mismatch")
            # Small geometry samples via CSV fields or SQLite feature properties.
            samples=[]; members=[]
            if b.startswith(b"PK"):
                with zipfile.ZipFile(io.BytesIO(b)) as z:
                    members=[{"name":it.filename,"bytes":it.file_size} for it in z.infolist()[:35]]
                    targets=[n for n in z.namelist() if n.lower().endswith(".csv") and "array" in n.lower()]
                    if targets:
                        with z.open(targets[0]) as f:
                            header=f.readline().decode("utf-8-sig",errors="replace").strip().split(",")
                            for i in range(4):
                                line=f.readline().decode("utf-8",errors="replace")
                                if not line:break
                                vals=next(csv.reader([line]))
                                samples.append(dict(zip(header,vals)))
            elif b.startswith(b"SQLite format 3"):
                with tempfile.NamedTemporaryFile(suffix=".gpkg") as tmp:
                    tmp.write(b); tmp.flush()
                    import sqlite3
                    con=sqlite3.connect(tmp.name)
                    tables=con.execute("select table_name from gpkg_contents where data_type='features'").fetchall()
                    if tables:
                        t=tables[0][0]
                        valid=re.fullmatch(r"[a-zA-Z0-9_]+",t)
                        if valid:
                            columns=[x[1] for x in con.execute(f'pragma table_info("{t}")')]
                            geom=[x[0] for x in con.execute("select column_name from gpkg_geometry_columns where table_name=?",(t,))]
                            cols=[c for c in columns if c not in geom]
                            records=con.execute('select '+','.join('"'+c+'"' for c in cols[:35])+f' from "{t}" limit 4').fetchall()
                            samples=[dict(zip(cols,rec)) for rec in records]
                    con.close()
            elif b[:100].count(b",")>2 or file["key"].lower().endswith(".csv"):
                with io.StringIO(b[:800000].decode("utf-8-sig",errors="replace")) as ss:
                    samples=list(csv.DictReader(ss))[:4]
            geometry_fields=sorted({k for x in samples for k in x if re.search(r"geom|wkt|poly|shape|source|arrayid|mount|gcr|pitch|spacing|len|area",k,re.I)})
            summary.update({"sample_file":file["key"],"sample_file_sha256":hashlib.sha256(b).hexdigest(),"sample_records":samples,"geometry_relevant_columns":geometry_fields, "sample_zip_members":members[:15],"verified_geometry":bool(samples),"status":"sampled" if samples else "file-downloaded-no-parse"})
            if samples:break
        except Exception as e:
            summary.setdefault("candidate_errors",[]).append({"file":file["key"],"error":str(e)[:400]})
    summary.setdefault("status","manifest-only")
    return summary


def dnv_tests() -> dict:
    """Run upstream tests only if permitted in read-only isolated runner."""
    try:
        wd=OUT/"dnv-sdk"
        subprocess.run(["git","clone","--depth","1","https://github.com/dnv-opensource/solarfarmer-python-sdk.git",str(wd)],check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
        head=subprocess.run(["git","rev-parse","HEAD"],cwd=wd,capture_output=True,text=True,check=True).stdout.strip()
        install=subprocess.run(["python","-m","pip","install","-q","-e",str(wd),"pytest"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=160)
        if install.returncode:return {"status":"install-failed","upstream_sha":head,"pip_log_tail":install.stdout[-1800:]}
        run=subprocess.run(["python","-m","pytest","-q","-m","not integration","tests"],cwd=wd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env={**os.environ,"SF_API_KEY":""},timeout=190)
        return {"status":"passed" if not run.returncode else "failed", "upstream_sha":head,"returncode":run.returncode,"pytest_tail":run.stdout[-2200:],"note":"No commercial API simulations, integration tests deselected."}
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