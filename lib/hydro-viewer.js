/* Visor de inundabilidad integrado en el Generador de Implantaciones.
   Three.js local (sin CDN); misma rejilla MDT y huellas del layout.
   Render 3D = representación, no motor hidráulico ni fuente independiente. */
(function (root) {
  "use strict";
  function create(host, onPick) {
    if (!root.THREE || !root.THREE.OrbitControls)
      throw new Error("La librería 3D local no está disponible");
    var T = root.THREE, scene = new T.Scene();
    scene.background = new T.Color(0x0e1923);
    var camera = new T.PerspectiveCamera(46, 1, 0.2, 25000);
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.7));
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    host.appendChild(renderer.domElement);
    scene.add(new T.HemisphereLight(0xb4dbff, 0x293525, 1.15));
    var sun = new T.DirectionalLight(0xfff3cf, 1.1);
    sun.position.set(-100, 230, -70); scene.add(sun);
    var controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI * .48;
    controls.addEventListener("change", render);
    var ground = null, water = null, structures = null, dem = null, res = null;
    var originLat = 0, originLon = 0, mLon = 1, mLat = 111195, z0 = 0, exaggeration = 1.7;
    var ray = new T.Raycaster(), mouse = new T.Vector2(), started = null;
    function render() {
      var w = Math.max(host.clientWidth || 600, 320), h = Math.max(host.clientHeight || 420, 250);
      if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) ||
          renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    }
    function lonX(lon) { return (lon - originLon) * mLon; }
    function latZ(lat) { return -(lat - originLat) * mLat; }
    function yElev(z) { return (z - z0) * exaggeration; }
    function groundAt(lon, lat) {
      if (!res || !root.FactiunHydro) return z0;
      var s = root.FactiunHydro.sample(res, lon, lat, 0);
      return s ? s.elevation_m : z0;
    }
    function free(mesh) {
      if (!mesh) return;
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    }
    function setTerrain(result) {
      if (!result || !result.dem) throw new Error("Simula primero la tormenta con un MDT");
      res = result; dem = result.dem; free(ground); free(water); free(structures);
      ground = water = structures = null;
      originLat = (dem.lats[0] + dem.lats[dem.rows - 1]) / 2;
      originLon = (dem.lons[0] + dem.lons[dem.cols - 1]) / 2;
      mLon = 111320 * Math.cos(originLat * Math.PI / 180);
      z0 = Math.min.apply(null, Array.from(dem.z));
      var zMax = Math.max.apply(null, Array.from(dem.z));
      var positions = [], colors = [], indices = [], span = Math.max(zMax - z0, 0.01);
      for (var r = 0; r < dem.rows; r++) for (var c = 0; c < dem.cols; c++) {
        var i = r * dem.cols + c, z = dem.z[i], t = Math.min(1, (z - z0) / span);
        positions.push(lonX(dem.lons[c]), yElev(z), latZ(dem.lats[r]));
        // Verde olivar en cotas bajas, arena en altas.
        colors.push(0.28 + .31 * t, 0.37 + .21 * t, .26 + .11 * t);
        if (r + 1 < dem.rows && c + 1 < dem.cols) {
          var a = i, b = i + 1, d = i + dem.cols, e = d + 1;
          if (dem.lats[1] > dem.lats[0]) indices.push(a,b,d, b,e,d);
          else indices.push(a,d,b, b,d,e);
        }
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices); geo.computeVertexNormals();
      ground = new T.Mesh(geo, new T.MeshStandardMaterial({
        vertexColors: true, roughness: 1, metalness: 0, side: T.DoubleSide }));
      scene.add(ground);
      water = new T.Mesh(new T.BufferGeometry(), new T.MeshPhongMaterial({
        vertexColors: true, transparent: true, opacity: .79, side: T.DoubleSide,
        depthWrite: false, shininess: 80 }));
      water.renderOrder = 3; scene.add(water);
      var width = Math.abs(lonX(dem.lons[dem.cols-1]) - lonX(dem.lons[0]));
      var height = Math.abs(latZ(dem.lats[dem.rows-1]) - latZ(dem.lats[0]));
      var range = Math.max(width, height, 50);
      camera.position.set(range * .77, Math.max(range * .67, (zMax-z0)*exaggeration*3), range * .78);
      controls.target.set(0, (zMax - z0) * exaggeration * .5, 0);
      controls.minDistance = Math.max(Math.min(dem.dx, dem.dy), 2);
      controls.maxDistance = range * 9;
      controls.update();
      setFrame(0);
    }
    function setStructures(features) {
      free(structures); structures = null;
      if (!dem || !Array.isArray(features)) return;
      var pos = [];
      for (var k = 0; k < features.length; k++) {
        var ring = features[k].lonlat;
        if (!ring || ring.length < 4) continue;
        var p = ring.slice(0, 4).map(function (v) {
          return [lonX(v[0]), yElev(groundAt(v[0],v[1])) + 1.3, latZ(v[1])];
        });
        // Quad: dos triángulos, sin mutar geometrías de ingeniería.
        [0,1,2,0,2,3].forEach(function (j) { pos.push(p[j][0], p[j][1], p[j][2]); });
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      structures = new T.Mesh(geo, new T.MeshBasicMaterial({
        color: 0x36d399, side: T.DoubleSide, transparent: true, opacity: .82, depthWrite: false }));
      structures.renderOrder = 2; scene.add(structures); render();
    }
    function setFrame(idx) {
      if (!water || !res) return;
      var f = res.frames[Math.max(0, Math.min(res.frames.length-1, idx | 0))], d = f.depth_m;
      var pos = [], cols = [], g = res.dem;
      function pt(r,c) {
        var i = r * g.cols + c, dd = d[i];
        return [lonX(g.lons[c]), yElev(g.z[i] + dd) + .25, latZ(g.lats[r]), dd];
      }
      for (var r = 0; r < g.rows-1; r++) for (var c = 0; c < g.cols-1; c++) {
        var a = pt(r,c), b = pt(r,c+1), cc = pt(r+1,c+1), dd = pt(r+1,c);
        var avg = (a[3]+b[3]+cc[3]+dd[3])*.25;
        if (avg < .008) continue;
        var tri = g.lats[1] > g.lats[0] ? [a,b,dd,b,cc,dd] : [a,dd,b,b,dd,cc];
        var deep = Math.min(1, Math.sqrt(avg / .4));
        tri.forEach(function (p) {
          pos.push(p[0], p[1], p[2]);
          cols.push(.11 + .06 * deep, .61 - .28 * deep, 1 - .10 * deep);
        });
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals(); water.geometry.dispose(); water.geometry = geo;
      render();
    }
    function onPointerDown(e) { started = { x: e.clientX, y: e.clientY }; }
    function onPointerUp(e) {
      if (!started || Math.hypot(e.clientX - started.x, e.clientY - started.y) > 5) { started = null; return; }
      started = null;
      if (!dem || !ground || !onPick) return;
      var box = renderer.domElement.getBoundingClientRect();
      mouse.x = (e.clientX - box.left) / box.width * 2 - 1;
      mouse.y = -(e.clientY - box.top) / box.height * 2 + 1;
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObject(ground, false);
      if (hits.length) {
        var p = hits[0].point;
        onPick({ lon: originLon + p.x/mLon, lat: originLat - p.z/mLat });
      }
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    var observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(render) : null;
    if (observer) observer.observe(host);
    root.addEventListener("resize", render);
    function dispose() {
      root.removeEventListener("resize", render);
      if (observer) observer.disconnect();
      controls.dispose();
      free(ground); free(water); free(structures);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    render();
    return { setTerrain: setTerrain, setStructures: setStructures,
      setFrame: setFrame, render: render, dispose: dispose };
  }
  root.FactiunHydroViewer = { create: create, version: "1.0.0" };
})(typeof globalThis !== "undefined" ? globalThis : this);
