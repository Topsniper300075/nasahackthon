const canvas = document.getElementById("marsCanvas");
const ctx = canvas.getContext("2d");
const terrainCanvas = document.getElementById("terrainCanvas");
const profileCanvas = document.getElementById("profileCanvas");
const profileCtx = profileCanvas.getContext("2d");
const mapWrap = document.querySelector(".map-wrap");
const state = { zoom: 1, offsetX: 0, offsetY: 0, seed: 8, route: [], nasaWeather: null, nasaImage: null, pitch: 1, bearing: 0, playing: false, progress: 0, molaReady: false, mola: null, molaGrid: null, routeGeo: [], weightMatrix: null, routeCost: 0 };
const waypoints = [
  ["Aurelia Base", "0.0 km", "LOW", false], ["Delta Ridge", "2.8 km", "LOW", false],
  ["Strata Point", "5.4 km", "MODERATE", false], ["Murray Buttes", "8.9 km", "LOW", false],
  ["Vera Rubin Ridge", "13.2 km", "MODERATE", false], ["Mount Sharp Goal", "18.6 km", "TARGET", true]
];
const hazards = { terrain: true, radiation: true, dust: true, seismic: false };

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = rect.width * scale; canvas.height = rect.height * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0); drawMars();
  resizeTerrain(); resizeProfile();
}
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + state.seed) * 43758.5453;
  return n - Math.floor(n);
}
const terrainGL = terrainCanvas.getContext("webgl", { antialias: true, alpha: false });
let terrainProgram, terrainPosition, terrainColor, terrainCount;
function resizeTerrain() {
  const rect = terrainCanvas.getBoundingClientRect(), scale = window.devicePixelRatio || 1;
  terrainCanvas.width = rect.width * scale; terrainCanvas.height = rect.height * scale;
  if (terrainGL) { terrainGL.viewport(0, 0, terrainCanvas.width, terrainCanvas.height); drawTerrain(); }
}
function resizeProfile() {
  const rect = profileCanvas.getBoundingClientRect(), scale = window.devicePixelRatio || 1;
  profileCanvas.width = rect.width * scale; profileCanvas.height = rect.height * scale;
  profileCtx.setTransform(scale, 0, 0, scale, 0, 0); drawProfile();
}
function drawProfile() {
  const w = profileCanvas.clientWidth, h = profileCanvas.clientHeight;
  profileCanvas.style.transform = state.view === "side" ? `scale(${state.zoom})` : "";
  profileCanvas.style.transformOrigin = "50% 50%";
  profileCtx.clearRect(0, 0, w, h);
  profileCtx.fillStyle = "#171015"; profileCtx.fillRect(0, 0, w, h);
  if (!state.routeGeo.length) return;
  const values = state.routeGeo.map(point => point.elev), min = Math.min(...values), max = Math.max(...values), pad = Math.max(100, (max - min) * .12);
  const low = min - pad, high = max + pad;
  const xFor = i => 42 + (.5 + (i / Math.max(1, values.length - 1) - .5) * state.zoom) * (w - 74);
  const yFor = elevation => 22 + (1 - (elevation - low) / (high - low)) * (h - 52);
  profileCtx.font = "10px DM Mono, monospace"; profileCtx.lineWidth = 1;
  const band = Math.max(500, Math.round((high-low)/6/500)*500);
  for (let elevation = Math.ceil(low / band) * band; elevation <= high; elevation += band) {
    const y = yFor(elevation); profileCtx.strokeStyle = "rgba(255,190,126,.18)"; profileCtx.beginPath(); profileCtx.moveTo(38,y); profileCtx.lineTo(w-20,y); profileCtx.stroke();
    profileCtx.fillStyle = "#9e8170"; profileCtx.fillText(`${Math.round(elevation).toLocaleString()} m`, 5, y + 3);
  }
  profileCtx.beginPath(); values.forEach((value,i) => i ? profileCtx.lineTo(xFor(i), yFor(value)) : profileCtx.moveTo(xFor(i), yFor(value))); profileCtx.lineTo(xFor(values.length-1),h-30); profileCtx.lineTo(xFor(0),h-30); profileCtx.closePath(); profileCtx.fillStyle = "rgba(240,126,78,.22)"; profileCtx.fill();
  profileCtx.beginPath(); values.forEach((value,i) => i ? profileCtx.lineTo(xFor(i), yFor(value)) : profileCtx.moveTo(xFor(i), yFor(value))); profileCtx.strokeStyle = "#ff9464"; profileCtx.lineWidth = 3; profileCtx.stroke();
  [0, values.length - 1].forEach((index, markerIndex) => { const x=xFor(index),y=yFor(values[index]); profileCtx.fillStyle=markerIndex ? "#cbb9ff" : "#ffd09d"; profileCtx.beginPath(); profileCtx.arc(x,y,5,0,Math.PI*2); profileCtx.fill(); profileCtx.fillStyle="#e9c09a"; profileCtx.fillText(markerIndex ? "MOUNT SHARP GOAL" : "AURELIA BASE", Math.min(w-140, x+8), y-10); });
  profileCtx.fillStyle="#9e8170"; profileCtx.fillText("DISTANCE ALONG MOLA ROUTE", w/2-65, h-8);
}
function terrainShader(type, source) {
  const shader = terrainGL.createShader(type); terrainGL.shaderSource(shader, source); terrainGL.compileShader(shader);
  if (!terrainGL.getShaderParameter(shader, terrainGL.COMPILE_STATUS)) throw new Error(terrainGL.getShaderInfoLog(shader));
  return shader;
}
function initTerrain() {
  if (!terrainGL) return;
  const vertex = terrainShader(terrainGL.VERTEX_SHADER, "attribute vec3 p; attribute vec3 c; uniform mat4 m; varying vec3 color; void main(){gl_Position=m*vec4(p,1.0); color=c;}");
  const fragment = terrainShader(terrainGL.FRAGMENT_SHADER, "precision mediump float; varying vec3 color; void main(){gl_FragColor=vec4(color,1.0);}");
  terrainProgram = terrainGL.createProgram(); terrainGL.attachShader(terrainProgram, vertex); terrainGL.attachShader(terrainProgram, fragment); terrainGL.linkProgram(terrainProgram);
  terrainPosition = terrainGL.getAttribLocation(terrainProgram, "p"); terrainColor = terrainGL.getAttribLocation(terrainProgram, "c");
}
function matrixForTerrain() {
  const w = terrainCanvas.width, h = terrainCanvas.height, scale = .8 * state.zoom;
  const yaw = state.bearing, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const tx = state.offsetX / Math.max(1, w) * .8, ty = state.offsetY / Math.max(1, h) * .8;
  return new Float32Array([
    cy * scale, 0, -sy * .35, 0,
    0, scale * state.pitch, 0, 0,
    sy * scale, .95 * scale, cy * scale, 0,
    tx, ty - .04, 0, 1
  ]);
}
function drawTerrain() {
  if (!terrainGL || !terrainProgram || !state.mola) return;
  const gl = terrainGL; gl.clearColor(.025,.018,.018,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
  gl.useProgram(terrainProgram); gl.uniformMatrix4fv(gl.getUniformLocation(terrainProgram, "m"), false, matrixForTerrain());
  gl.bindBuffer(gl.ARRAY_BUFFER, state.mola.positionBuffer); gl.enableVertexAttribArray(terrainPosition); gl.vertexAttribPointer(terrainPosition, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.mola.colorBuffer); gl.enableVertexAttribArray(terrainColor); gl.vertexAttribPointer(terrainColor, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, terrainCount);
}
function loadMOLA() {
  if (!terrainGL) return;
  initTerrain();
  fetch("data/mola/mola-topography-16ppd.img").then(response => {
    if (!response.ok) throw new Error("MOLA elevation file unavailable");
    return response.arrayBuffer();
  }).then(buffer => {
    const data = new DataView(buffer), cols = 5760, rows = 2880, lon0 = 134, lon1 = 141, lat0 = -9, lat1 = -2, step = .12;
    const positions = [], colors = [], sample = (lat, lon) => {
      const row = Math.max(0, Math.min(rows - 1, Math.round((90 - lat) * 16)));
      const col = Math.max(0, Math.min(cols - 1, Math.round(lon * 16)));
      return data.getInt16((row * cols + col) * 2, false);
    };
    const points = [];
    for (let lat = lat0; lat <= lat1 + step; lat += step) for (let lon = lon0; lon <= lon1 + step; lon += step) points.push({ lat, lon, elev: sample(lat, lon) });
    const colsLocal = Math.round((lon1-lon0)/step)+1;
    state.molaGrid = { points, cols: colsLocal, rows: Math.floor(points.length / colsLocal), lon0, lon1, lat0, lat1, step };
    buildWeightMatrix(state.molaGrid);
    state.routeGeo = planRoute(state.molaGrid);
    updateRouteProfile();
    updateGeographicLabels();
    const height = p => Math.max(-.12, Math.min(.25, p.elev / 9000));
    const color = p => { const n = Math.max(0, Math.min(1, (p.elev + 3000) / 8500)); return [.25 + n*.45, .11 + n*.24, .07 + n*.15]; };
    for (let y=0; y<colsLocal-1; y++) for (let x=0; x<Math.floor(points.length/colsLocal)-1; x++) {
      const a=points[y*colsLocal+x], b=points[y*colsLocal+x+1], c=points[(y+1)*colsLocal+x], d=points[(y+1)*colsLocal+x+1];
      [[a,b,c],[b,d,c]].forEach(triangle => triangle.forEach(p => { positions.push((p.lon-137.5)/3.5, height(p), (p.lat+5.5)/3.5); colors.push(...color(p)); }));
    }
    const positionBuffer=terrainGL.createBuffer(), colorBuffer=terrainGL.createBuffer();
    terrainGL.bindBuffer(terrainGL.ARRAY_BUFFER, positionBuffer); terrainGL.bufferData(terrainGL.ARRAY_BUFFER, new Float32Array(positions), terrainGL.STATIC_DRAW);
    terrainGL.bindBuffer(terrainGL.ARRAY_BUFFER, colorBuffer); terrainGL.bufferData(terrainGL.ARRAY_BUFFER, new Float32Array(colors), terrainGL.STATIC_DRAW);
    state.mola={positionBuffer,colorBuffer}; terrainCount=positions.length/3; state.molaReady=true;
    document.querySelector(".map-footer span:first-child").innerHTML='<i class="live-dot"></i> MOLA 16 PPD ELEVATION';
    document.querySelector(".map-footer span:nth-child(2) b").textContent="~463 M/CELL";
    drawMars(); resizeTerrain();
  }).catch(error => console.warn("MOLA terrain unavailable; retaining imagery mode.", error));
}
function drawMars() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (state.view === "side") {
    drawSideHud(w, h);
    return;
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(state.bearing);
  ctx.scale(state.zoom, state.pitch);
  ctx.translate(-w / 2, -h / 2);
  const hasNASAImage = state.nasaImage && state.nasaImage.complete && !state.molaReady;
  if (hasNASAImage) {
    const scale = Math.max(w / state.nasaImage.naturalWidth, h / state.nasaImage.naturalHeight);
    const imageWidth = state.nasaImage.naturalWidth * scale;
    const imageHeight = state.nasaImage.naturalHeight * scale;
    ctx.drawImage(state.nasaImage, (w - imageWidth) / 2 + state.offsetX, (h - imageHeight) / 2 + state.offsetY, imageWidth, imageHeight);
    ctx.fillStyle = "rgba(12, 8, 8, .26)";
    ctx.fillRect(0, 0, w, h);
  } else if (state.molaReady && state.nasaImage && state.nasaImage.complete) {
    const imageScale = Math.max(w / state.nasaImage.naturalWidth, h / state.nasaImage.naturalHeight);
    const imageWidth = state.nasaImage.naturalWidth * imageScale;
    const imageHeight = state.nasaImage.naturalHeight * imageScale;
    ctx.globalAlpha = .18;
    ctx.drawImage(state.nasaImage, (w - imageWidth) / 2, (h - imageHeight) / 2, imageWidth, imageHeight);
    ctx.globalAlpha = 1;
  } else if (!state.molaReady) {
    ctx.fillStyle = "#1a1110";
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h); grad.addColorStop(0, "#8c5138"); grad.addColorStop(1, "#42251f");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    const step = Math.max(12, 24 / state.zoom);
    for (let y = -step; y < h + step; y += step) for (let x = -step; x < w + step; x += step) {
      const n = (noise(x / 80, y / 80) + noise(x / 34, y / 34) * .55) / 1.55;
      ctx.fillStyle = `rgba(${125 + n * 75},${62 + n * 48},${38 + n * 38},${.14 + n * .2})`;
      ctx.beginPath(); ctx.arc(x + (noise(y, x) - .5) * 22, y + (noise(x, y) - .5) * 22, step * (.45 + n * 1.1), 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 50; i++) {
      const x = (noise(i, 2) * w + state.offsetX) % w, y = (noise(i, 6) * h + state.offsetY) % h;
      const r = 5 + noise(i, 9) * (i % 5 === 0 ? 34 : 13);
      ctx.strokeStyle = `rgba(39,20,18,${.16 + noise(i, 3) * .2})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * .42, noise(i, 1) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(227,164,106,.11)"; ctx.beginPath(); ctx.ellipse(x - 2, y - 2, r * .75, r * .3, noise(i, 1) * 3, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (hazards.terrain) {
    drawWeightMatrix(w, h);
    drawElevationContours(w, h);
  }
  drawHazardZones(w, h);
  if (hazards.radiation) { const r = ctx.createRadialGradient(w * .77, h * .35, 10, w * .77, h * .35, w * .34); r.addColorStop(0, "rgba(168,141,243,.22)"); r.addColorStop(1, "rgba(168,141,243,0)"); ctx.fillStyle = r; ctx.fillRect(0, 0, w, h); }
  if (hazards.dust) { ctx.fillStyle = "rgba(238,117,64,.1)"; ctx.beginPath(); ctx.ellipse(w * .2, h * .72, w * .28, h * .13, -.15, 0, Math.PI * 2); ctx.fill(); }
  if (hazards.seismic) { ctx.strokeStyle = "rgba(108,155,242,.5)"; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.arc(w * .52, h * .56, 80, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  drawRoute(w, h);
  drawRover(w, h);
  ctx.restore();
  if (state.view === "side") drawSideHud(w, h);
}
function drawSideHud(w, h) {
  ctx.fillStyle = "rgba(10,8,12,.2)"; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = "#e8b28a"; ctx.font = "10px DM Mono, monospace"; ctx.fillText("MOLA SIDE PROFILE / ELEVATION", 18, 22);
  ctx.fillStyle = "#9e8170"; ctx.fillText("Gale Crater → Mount Sharp", 18, 38);
}
function drawRoute(w, h) {
  const points = state.routeGeo.length ? state.routeGeo.map(point => geoToScreen(point.lon, point.lat, w, h)) : [{ x: w * .17, y: h * .71 }, { x: w * .82, y: h * .25 }];
  const directStart = points[0], directEnd = points[points.length - 1];
  ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(172,184,194,.58)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(directStart.x,directStart.y); ctx.lineTo(directEnd.x,directEnd.y); ctx.stroke(); ctx.restore();
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(255,206,159,.25)"; ctx.lineWidth = 8; ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
  ctx.strokeStyle = "#ff9464"; ctx.lineWidth = 2; ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
  points.slice(1,-1).forEach(p=>{ctx.fillStyle="#ffb36b";ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill()});
  const goal = points[points.length - 1];
  const start = points[0];
  ctx.fillStyle = "rgba(255,154,88,.25)"; ctx.beginPath(); ctx.arc(start.x, start.y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffe0b0"; ctx.strokeStyle = "#f07e4e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(start.x, start.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(168,141,243,.25)"; ctx.beginPath(); ctx.arc(goal.x, goal.y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d9c9ff"; ctx.strokeStyle = "#a88df3"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(goal.x, goal.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function drawHazardZones(w, h) {
  const zones = [
    { lon: 136.0, lat: -5.15, rx: .65, ry: .42, color: "rgba(231,88,104,.20)", label: "STEEP RIM / SLOPE" },
    { lon: 137.72, lat: -5.72, rx: .48, ry: .28, color: "rgba(231,88,104,.16)", label: "HIGH RELIEF" },
    { lon: 138.55, lat: -4.25, rx: .56, ry: .34, color: "rgba(231,88,104,.16)", label: "EXPOSURE WATCH" }
  ];
  zones.forEach(zone => {
    const p = geoToScreen(zone.lon, zone.lat, w, h), rx = zone.rx / 7 * w, ry = zone.ry / 7 * h;
    ctx.save(); ctx.fillStyle=zone.color; ctx.strokeStyle="rgba(231,88,104,.62)"; ctx.setLineDash([4,4]); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="#f08a91"; ctx.font="9px DM Mono, monospace"; ctx.fillText(zone.label,p.x-rx*.7,p.y-ry-6); ctx.restore();
  });
}
function geoToScreen(lon, lat, w, h) {
  const grid = state.molaGrid || { lon0: 134, lon1: 141, lat0: -9, lat1: -2 };
  return { x: (lon - grid.lon0) / (grid.lon1 - grid.lon0) * w, y: (grid.lat1 - lat) / (grid.lat1 - grid.lat0) * h };
}
function updateGeographicLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const base = geoToScreen(137.25, -5.65, w, h), goal = geoToScreen(138.05, -4.85, w, h);
  const baseLabel = document.querySelector(".label-base"), sharpLabel = document.querySelector(".label-sharp");
  baseLabel.style.left = `${base.x + 12}px`; baseLabel.style.bottom = "auto"; baseLabel.style.top = `${base.y + 12}px`;
  sharpLabel.style.left = `${goal.x + 12}px`; sharpLabel.style.top = `${goal.y - 20}px`;
}
function drawElevationContours(w, h) {
  const grid = state.molaGrid;
  if (!grid) return;
  const elevations = grid.points.map(p => p.elev).filter(Number.isFinite);
  const min = Math.min(...elevations), max = Math.max(...elevations);
  const levels = [];
  for (let level = Math.ceil(min / 500) * 500; level <= max; level += 500) levels.push(level);
  ctx.lineWidth = 1;
  levels.forEach((level, index) => {
    ctx.beginPath();
    for (let y = 0; y < grid.rows - 1; y++) for (let x = 0; x < grid.cols - 1; x++) {
      const a=grid.points[y*grid.cols+x], b=grid.points[y*grid.cols+x+1], c=grid.points[(y+1)*grid.cols+x], d=grid.points[(y+1)*grid.cols+x+1];
      const edges = [[a,b],[b,d],[d,c],[c,a]].filter(([p,q]) => (p.elev < level) !== (q.elev < level));
      if (edges.length >= 2) {
        const cross = ([p,q]) => { const t=(level-p.elev)/(q.elev-p.elev); return {lon:p.lon+(q.lon-p.lon)*t,lat:p.lat+(q.lat-p.lat)*t}; };
        const p=geoToScreen(cross(edges[0]).lon,cross(edges[0]).lat,w,h), q=geoToScreen(cross(edges[1]).lon,cross(edges[1]).lat,w,h);
        ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y);
      }
    }
    ctx.strokeStyle = index % 5 === 0 ? "rgba(255,190,126,.34)" : "rgba(255,190,126,.16)";
    ctx.stroke();
  });
}
function getRiskWeights() {
  const values = ["terrain", "radiation", "dust", "seismic", "distance"].map(id => Number(document.getElementById(id)?.value || 0));
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return { terrain: values[0] / total, distance: values[4] / total };
}
function buildWeightMatrix(grid) {
  const matrix = new Float32Array(grid.points.length);
  const cellDistanceKm = grid.step * 59.2;
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) {
    const index = y * grid.cols + x, point = grid.points[index];
    const neighbors = [];
    [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
      if (nx >= 0 && ny >= 0 && nx < grid.cols && ny < grid.rows) neighbors.push(grid.points[ny * grid.cols + nx]);
    });
    const maxSlope = neighbors.reduce((max, neighbor) => Math.max(max, Math.abs(neighbor.elev - point.elev) / cellDistanceKm), 0);
    point.slope = maxSlope;
    point.traversalWeight = Math.min(1, maxSlope / 35);
    matrix[index] = point.traversalWeight;
  }
  state.weightMatrix = matrix;
  grid.weightMatrix = matrix;
}
function drawWeightMatrix(w, h) {
  const grid = state.molaGrid;
  if (!grid?.weightMatrix) return;
  const cellW = w / (grid.cols - 1), cellH = h / (grid.rows - 1);
  ctx.save();
  ctx.globalAlpha = .22;
  for (let y = 0; y < grid.rows - 1; y++) for (let x = 0; x < grid.cols - 1; x++) {
    const weight = grid.weightMatrix[y * grid.cols + x];
    if (weight < .08) continue;
    const hue = 24 - weight * 24;
    ctx.fillStyle = `hsla(${hue}, 84%, 58%, ${.25 + weight * .5})`;
    ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
  }
  ctx.restore();
}
function planRoute(grid) {
  const start = { lon: 137.25, lat: -5.65 }, goal = { lon: 138.05, lat: -4.85 };
  const nearest = target => grid.points.reduce((best,p,i) => {
    const score = (p.lon-target.lon)**2 + (p.lat-target.lat)**2;
    return score < best.score ? { index:i, score } : best;
  }, { index:0, score:Infinity }).index;
  const startIndex=nearest(start), goalIndex=nearest(goal), open=[startIndex], came=new Map(), g=new Map([[startIndex,0]]);
  const riskWeights = getRiskWeights();
  const heuristic = i => { const p=grid.points[i], q=grid.points[goalIndex]; return Math.hypot(p.lon-q.lon,p.lat-q.lat) * (1 + riskWeights.distance); };
  const rows=grid.rows, cols=grid.cols;
  while (open.length) {
    open.sort((a,b)=>(g.get(a)+heuristic(a))-(g.get(b)+heuristic(b)));
    const current=open.shift(); if (current===goalIndex) break;
    const x=current%cols,y=Math.floor(current/cols), here=grid.points[current];
    [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].forEach(([nx,ny]) => {
      if(nx<0||ny<0||nx>=cols||ny>=rows)return;
      const ni=ny*cols+nx, next=grid.points[ni], slope=Math.abs(next.elev-here.elev);
      const minLon=Math.min(start.lon,goal.lon)-.35, maxLon=Math.max(start.lon,goal.lon)+.35;
      const minLat=Math.min(start.lat,goal.lat)-.35, maxLat=Math.max(start.lat,goal.lat)+.35;
      if(next.lon<minLon||next.lon>maxLon||next.lat<minLat||next.lat>maxLat)return;
      const corridor = Math.abs((next.lon-start.lon)*(goal.lat-start.lat)-(next.lat-start.lat)*(goal.lon-start.lon));
      const stepKm = Math.hypot(next.lon-here.lon, next.lat-here.lat) * 59.2;
      const slopeWeight = next.traversalWeight ?? Math.min(1, slope / 35);
      const traversalMultiplier = 1 + riskWeights.terrain * slopeWeight * 8 + riskWeights.distance;
      const tentative=(g.get(current)||0)+stepKm * traversalMultiplier + corridor * .35;
      if(tentative < (g.get(ni) ?? Infinity)){came.set(ni,current);g.set(ni,tentative);if(!open.includes(ni))open.push(ni);}
    });
  }
  const path=[]; let current=goalIndex;
  while (current !== undefined) { path.unshift(grid.points[current]); if(current===startIndex) break; current=came.get(current); }
  if (path.length > 1) {
    state.routeCost = g.get(goalIndex) || 0;
    return path;
  }
  const fallback = [grid.points[startIndex]];
  let previous = grid.points[startIndex];
  for (let step = 1; step < 42; step++) {
    const t = step / 42, targetLon = start.lon + (goal.lon - start.lon) * t, targetLat = start.lat + (goal.lat - start.lat) * t;
    const candidates = grid.points.filter(point => Math.hypot(point.lon-targetLon, point.lat-targetLat) < .16);
    candidates.sort((a,b) => {
      const score = point => Math.hypot(point.lon-targetLon, point.lat-targetLat) + Math.abs(point.elev-previous.elev)/18000 + Math.max(0, point.elev)/180000;
      return score(a)-score(b);
    });
    const next = candidates[0] || grid.points[Math.round(startIndex + (goalIndex-startIndex)*t)];
    if (next && next !== previous) { fallback.push(next); previous = next; }
  }
  fallback.push(grid.points[goalIndex]);
  state.routeCost = g.get(goalIndex) || 0;
  return fallback;
}
function updateRouteProfile() {
  if (!state.routeGeo.length) return;
  const elevations = state.routeGeo.map(point => point.elev);
  const min = Math.min(...elevations), max = Math.max(...elevations), span = Math.max(1, max - min);
  const path = state.routeGeo.map((point, index) => {
    const x = index / Math.max(1, state.routeGeo.length - 1) * 360;
    const y = 96 - ((point.elev - min) / span) * 70;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const area = `${path} L360 112 L0 112Z`;
  document.querySelector("#riskChart .line").setAttribute("d", path);
  document.querySelector("#riskChart .area").setAttribute("d", area);
  const ascent = state.routeGeo.reduce((sum, point, index) => index ? sum + Math.max(0, point.elev - state.routeGeo[index - 1].elev) : 0, 0);
  document.getElementById("ascentMetric").innerHTML = `+${Math.round(ascent)} <small>m</small>`;
  document.querySelector(".chart-section .section-title label").textContent = "ELEVATION PROFILE";
  document.querySelector(".chart-legend").innerHTML = '<i class="safe"></i> MOLA ROUTE <i class="threshold"></i> RELIEF';
  const directDistance = Math.hypot(state.routeGeo[0].lon-state.routeGeo.at(-1).lon, state.routeGeo[0].lat-state.routeGeo.at(-1).lat) * 59.2;
  const routeDistance = state.routeGeo.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.lon-state.routeGeo[index].lon, point.lat-state.routeGeo[index].lat) * 59.2, 0);
  const detour = Math.max(0, routeDistance / Math.max(1, directDistance) - 1) * 100;
  document.getElementById("decisionList").innerHTML = [
    ["↗", "Terrain relief", `Weighted grid penalizes cells up to ${Math.round(Math.max(...state.routeGeo.map(point => point.slope || 0)))}% local grade`, "MOLA"],
    ["⌁", "Energy trade-off", `${detour.toFixed(0)}% longer than direct line to reduce slope cost`, `${routeDistance.toFixed(1)} km`],
    ["◌", "Route evidence", "Dashed line is direct; orange line is the computed corridor", "TRACEABLE"]
  ].map(([icon,title,copy,value], index) => `<div class="decision-row"><i class="decision-icon">${icon}</i><div><strong>${title}</strong><span>${copy}</span></div><span class="decision-value">${value}</span><div class="decision-bar"><i style="width:${[82, Math.min(95, 35+detour*2), 100][index]}%"></i></div></div>`).join("");
}
function drawRover(w, h) {
  if (!state.playing) return;
  const points = state.routeGeo.length ? state.routeGeo.map(point => geoToScreen(point.lon, point.lat, w, h)) : [{x:w*.17,y:h*.71},{x:w*.82,y:h*.25}];
  const scaled = state.progress * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const x = points[index].x + (points[index + 1].x - points[index].x) * t;
  const y = points[index].y + (points[index + 1].y - points[index].y) * t;
  ctx.fillStyle = "rgba(255,218,168,.32)"; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff0c9"; ctx.strokeStyle = "#f07e4e"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function updateRoute() {
  const weights = ["terrain","radiation","dust","seismic","distance"].map(k=>+document.getElementById(k).value);
  const total = weights.reduce((a,b)=>a+b,0) || 1;
  document.getElementById("weightTotal").textContent = `${Math.round(total)}%`;
  const score = Math.round(25 + weights[0] * .18 + weights[1] * .14 + weights[2] * .11 + weights[3] * .1);
  document.getElementById("riskScore").textContent = score;
  document.getElementById("distanceMetric").innerHTML = `${(18.6 + (weights[0]-30)*.04).toFixed(1)} <small>km</small>`;
  document.getElementById("timeMetric").innerHTML = `0${7 + Math.floor(score/35)}:${String(42 + score % 18).padStart(2,"0")} <small>h</small>`;
  if (state.molaGrid) {
    state.routeGeo = planRoute(state.molaGrid);
    updateRouteProfile();
  }
  drawMars();
}
function renderWaypoints() {
  document.getElementById("waypointList").innerHTML = waypoints.map(([name, dist, risk, goal]) => `<div class="waypoint"><i class="waypoint-marker ${goal?"goal":""}"></i><div class="waypoint-info"><strong>${name}</strong><span>${dist}</span></div><span class="waypoint-risk" style="color:${risk==="MODERATE"?"var(--orange2)":risk==="TARGET"?"var(--violet)":"var(--green)"}">${risk}</span></div>`).join("");
}
document.querySelectorAll('input[type="range"]').forEach(input => input.addEventListener("input", e => { document.getElementById(`${e.target.id}Value`).textContent = `${e.target.value}%`; updateRoute(); }));
document.querySelectorAll("[data-layer]").forEach(input => input.addEventListener("change", e => { hazards[e.target.dataset.layer] = e.target.checked; drawMars(); }));
document.getElementById("routeButton").addEventListener("click", () => { const button = document.getElementById("routeButton"); button.innerHTML = "<span>✓</span> ROUTE UPDATED <b>⌘ ↵</b>"; updateRoute(); setTimeout(() => button.innerHTML = "<span>✦</span> GENERATE SAFEST ROUTE <b>⌘ ↵</b>", 1800); });
document.getElementById("themeButton").addEventListener("click", () => document.body.classList.toggle("light"));
document.getElementById("zoomIn").addEventListener("click", event => { event.stopPropagation(); state.zoom = Math.min(2.5, state.zoom + .15); drawMars(); drawTerrain(); drawProfile(); });
document.getElementById("zoomOut").addEventListener("click", event => { event.stopPropagation(); state.zoom = Math.max(.65, state.zoom - .15); drawMars(); drawTerrain(); drawProfile(); });
document.getElementById("recenter").addEventListener("click", event => { event.stopPropagation(); state.zoom = 1; state.pitch = 1; state.bearing = 0; state.offsetX = state.offsetY = 0; drawMars(); drawTerrain(); drawProfile(); });
document.querySelectorAll(".map-zoom button, .toolbar-actions button").forEach(button => button.addEventListener("pointerdown", event => event.stopPropagation()));
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-view]").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  state.view = button.dataset.view;
  mapWrap.classList.toggle("side-mode", state.view === "side");
  if (state.view === "slanted") { state.pitch = .72; state.bearing = -.035; } else { state.pitch = 1; state.bearing = 0; }
  drawMars(); drawTerrain(); resizeProfile();
}));
mapWrap.addEventListener("wheel", event => { event.preventDefault(); state.zoom = Math.max(.65, Math.min(2.5, state.zoom + (event.deltaY < 0 ? .1 : -.1))); drawMars(); drawTerrain(); drawProfile(); }, { passive: false });
let drag = null;
mapWrap.addEventListener("pointerdown", event => { drag = { x: event.clientX, y: event.clientY, offsetX: state.offsetX, offsetY: state.offsetY, shift: event.shiftKey }; mapWrap.classList.add("dragging"); mapWrap.setPointerCapture(event.pointerId); });
mapWrap.addEventListener("pointermove", event => {
  if (!drag) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (drag.shift) { state.offsetX = drag.offsetX + dx; state.offsetY = drag.offsetY + dy; }
  else { state.bearing = Math.max(-.35, Math.min(.35, (dx / mapWrap.clientWidth) * .7)); state.pitch = Math.max(.62, Math.min(1.12, 1 - dy / mapWrap.clientHeight * .35)); }
  drawMars(); drawTerrain();
});
mapWrap.addEventListener("pointerup", () => { drag = null; mapWrap.classList.remove("dragging"); });
mapWrap.addEventListener("pointercancel", () => { drag = null; mapWrap.classList.remove("dragging"); });
document.getElementById("playSurface").addEventListener("click", event => {
  state.playing = !state.playing;
  event.currentTarget.innerHTML = state.playing ? "Ⅱ <span>PAUSE</span>" : "▶ <span>TRAVERSE</span>";
  if (state.playing) animateTraverse();
  drawMars(); drawTerrain(); drawProfile();
});
function animateTraverse() {
  if (!state.playing) return;
  state.progress = (state.progress + .0018) % 1;
  drawMars();
  requestAnimationFrame(animateTraverse);
}
document.getElementById("exportButton").addEventListener("click", () => { const content = `AURELIA MISSION BRIEF\nGale Crater Region / MSOL 018\nRisk index: ${document.getElementById("riskScore").textContent}\nTraverse: ${document.getElementById("distanceMetric").textContent.trim()}\nRoute: Aurelia Base -> Mount Sharp Goal`; const blob = new Blob([content], {type:"text/plain"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "aurelia-mission-brief.txt"; a.click(); URL.revokeObjectURL(a.href); });
document.getElementById("objective").addEventListener("change", e => {
  const goals = {
    geology: ["Layered geology transect", "Sample contacts between the Murray and Stimson formations while preserving astronaut energy."],
    biosignature: ["Biosignature search", "Prioritize hydrated-mineral exposures and preserve a safe return corridor for sample caching."],
    water: ["Subsurface ice study", "Use SHARAD-informed target zones to investigate shallow buried ice with minimum radiation exposure."],
    panorama: ["Panoramic imaging", "Reach a high-visibility overlook for a human-scale terrain panorama and navigation landmark."]
  };
  document.getElementById("goalTitle").textContent = goals[e.target.value][0];
  document.getElementById("goalCopy").textContent = goals[e.target.value][1];
});
const drawer = document.getElementById("provenanceDrawer");
document.getElementById("dataButton").addEventListener("click", () => { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); });
document.getElementById("closeData").addEventListener("click", () => { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); });
document.getElementById("marsCanvas").addEventListener("mousemove", e => { const r = canvas.getBoundingClientRect(); document.getElementById("coordinates").textContent = `LAT ${(5.41 - (e.clientY-r.top)/r.height*2.7).toFixed(2)}° S   LON ${(137.39 + (e.clientX-r.left)/r.width*3.1).toFixed(2)}° E`; });
async function loadNASAData() {
  try {
    const [weatherResponse, imageResponse] = await Promise.all([
      fetch("data/mars-weather.json"),
      fetch("data/curiosity-martian-surface.jpg")
    ]);
    if (!weatherResponse.ok || !imageResponse.ok) throw new Error("Local NASA data files could not be loaded");
    state.nasaWeather = await weatherResponse.json();
    const imageBlob = await imageResponse.blob();
    state.nasaImage = new Image();
    state.nasaImage.onload = () => { drawMars(); };
    state.nasaImage.src = URL.createObjectURL(imageBlob);
    const latestSol = state.nasaWeather.soles?.reduce((latest, sol) =>
      !latest || Number(sol.sol) > Number(latest.sol) ? sol : latest, null);
    if (latestSol?.sol) document.querySelector(".map-footer span:nth-child(3) b").textContent = `SOL ${latestSol.sol}`;
    document.querySelector(".map-footer span:first-child").innerHTML = '<i class="live-dot"></i> NASA SURFACE IMAGERY';
    document.querySelector(".source-note span:last-child").textContent = "weather JSON + surface JPEG loaded";
  } catch (error) {
    console.warn("NASA local data unavailable; retaining deterministic simulation.", error);
  }
}
window.addEventListener("resize", resizeCanvas); renderWaypoints(); resizeCanvas(); loadNASAData(); loadMOLA();
