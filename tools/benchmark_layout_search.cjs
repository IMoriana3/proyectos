/* Existing parity corpus, all cases. Never assert that ML has won in advance.
 * Same number of outer evaluations; report TOTAL time including GP fitting.
 * This is a pilot benchmark, not independent field/energy validation.
 */
'use strict';
const {loadEngine,cases}=require('../tests/layout_search_cases.cjs');
const Search=require('../lib/layout-search.js');
const fs=require('fs');
const engine=loadEngine(), rows=[];
(async()=>{
  const budget=Number(process.env.LAYOUT_BUDGET||24);
  const seeds=(process.env.LAYOUT_SEEDS||'20260928').split(',').map(Number);
  for(const c of cases()) for(const seed of seeds){
    const row={case:c.name,seed,budget,results:{}};
    for(const method of ['gp','random']){
      const r=await Search.run(c.config,{method,seed,budget,compute:engine.compute,score:engine.puntuaLayout});
      row.results[method]={baselineScore:r.report.baselineScore,score:r.report.bestScore,
        baselineKwp:r.baseline.result.stats.kWp,kWp:r.best&&r.best.result.stats.kWp,
        elapsedMs:r.report.elapsedMs,evaluations:r.report.evaluations,improved:r.report.improved,
        invalid:r.report.trace.filter(t=>!t.valid).length,fallbackSteps:r.report.fallbackSteps};
    }
    rows.push(row);console.log(c.name+' · '+seed+' · '+JSON.stringify(row.results));
  }
  const comparable=rows.filter(r=>Number.isFinite(r.results.gp.score)&&Number.isFinite(r.results.random.score));
  const summary={runs:rows.length,comparable:comparable.length,noValidLayout:rows.length-comparable.length,
    gpBetter:comparable.filter(r=>r.results.gp.score>r.results.random.score+1e-8).length,
    randomBetter:comparable.filter(r=>r.results.random.score>r.results.gp.score+1e-8).length,
    ties:comparable.filter(r=>Math.abs(r.results.random.score-r.results.gp.score)<=1e-8).length,
    gpImprovesBaseline:rows.filter(r=>r.results.gp.improved).length};
  const crypto=require('crypto');
  const digest=path=>crypto.createHash('sha256').update(fs.readFileSync(require('path').join(__dirname,'..',path))).digest('hex');
  const out={schema:'factiun.layout-search-benchmark.v1',date:new Date().toISOString(),model:Search.VERSION,
    scope:'all '+cases().length+' cases from existing Python/browser parity corpus; online fit per case; no field or energy claim',
    environment:{node:process.version,platform:process.platform},
    provenance:{fixtureSha256:digest('tests/careo-layout.json'),optimizerSha256:digest('lib/layout-search.js')},summary,
    comparison:'same outer evaluation budget; baseline nested sweep cost and all fitting included in elapsedMs',rows};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
