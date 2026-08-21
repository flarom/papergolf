const ROWS = 26;
const COLS = 16;
const TOP_ROWS = 7;
const BOTTOM_ROWS = 7;
const PAR = 6;
const HOLES_PER_COURSE = 6;
const MULLIGANS_PER_COURSE = 6;

const ROUGH = 'rough';
const FAIRWAY = 'fairway';
const SLOPE = 'slope';
const SAND = 'sand';
const WATER = 'water';
const TREE = 'tree';
const BALL_START = 'ball-start';
const HOLE = 'hole';

const DIRECTIONS = {
    N: { dr: -1, dc:  0 },
    S: { dr:  1, dc:  0 },
    W: { dr:  0, dc: -1 },
    E: { dr:  0, dc:  1 },
};
const DIRECTION_KEYS = Object.keys(DIRECTIONS);

const MOVES = {
    N:  { dr: -1, dc:  0 },
    S:  { dr:  1, dc:  0 },
    E:  { dr:  0, dc:  1 },
    W:  { dr:  0, dc: -1 },
    NE: { dr: -1, dc:  1 },
    NW: { dr: -1, dc: -1 },
    SE: { dr:  1, dc:  1 },
    SW: { dr:  1, dc: -1 },
};

let grid = [];
let slopeDir = [];
let treeType = [];
let protectedCells = new Set();
let keepClear = new Set();

let tileEls = [];
let ballPos = null;
let holePos = null;
let pathPositions = [];
let shots = 0;
let over = false;
let animating = false;
let ballMarker = null;
let diceToken = 0;

let course = null;
let mulligans = 0;
let totalShots = 0;
let holeIndex = 0;
let holeHistory = [];
let holeDone = false;
let lastCourseCanvas = null;
let lastCourseName = '';
let ambianceLoopId = null;
let ambianceFile = null;

let seedOverride = getUrlSeed();

let rng = () => Math.random();

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function setSeed(seed) {
    rng = mulberry32(seed);
}

// we are cheating randomness here
// i had a lot of times where i got the exact same number when rolling a d6
// so we are avoiding the same number twice in a row, which is not a big deal for this game
let lastNum = null;
function randomInt(min, max) {
    if (min === max) return min;
    let newNum;
    do {
        newNum = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (newNum === lastNum);
    
    lastNum = newNum;
    return newNum;
}

function randomOf(arr) {
    return arr[Math.floor(rng() * arr.length)];
}

function seededRandomInt(min, max) {
    if (min === max) return min;
    return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function getUrlSeed() {
    try {
        if (typeof URLSearchParams === 'undefined' || typeof location === 'undefined') return null;
        const s = new URLSearchParams(location.search).get('seed');
        if (s === null || s === '') return null;
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? null : n >>> 0;
    } catch (e) {
        return null;
    }
}

function updateSeedUrl(seed) {
    try {
        if (typeof history === 'undefined' || !history.replaceState || typeof location === 'undefined') return;
        const params = new URLSearchParams(location.search);
        params.set('seed', String(seed));
        history.replaceState(null, '', '?' + params.toString());
    } catch (e) { /* ignore */ }
}

function dailySeed(date) {
    date = date || new Date();
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

const raf = typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb) => cb();

function outOfBounds(r, c) {
    return r < 0 || r >= ROWS || c < 0 || c >= COLS;
}

function key(r, c) {
    return r + ',' + c;
}

function isProtected(r, c) {
    return protectedCells.has(key(r, c));
}

function rebuildProtectedCells() {
    protectedCells = new Set();
    const addNear = (rr, cc) => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = rr + dr, c = cc + dc;
                if (outOfBounds(r, c) || grid[r][c] !== FAIRWAY) continue;
                if (protectedCells.has(key(r, c))) continue;
                const stack = [[r, c]];
                protectedCells.add(key(r, c));
                while (stack.length) {
                    const [cr, cc2] = stack.pop();
                    for (const d of DIRECTION_KEYS) {
                        const ar = cr + DIRECTIONS[d].dr;
                        const ac = cc2 + DIRECTIONS[d].dc;
                        if (outOfBounds(ar, ac) || grid[ar][ac] !== FAIRWAY) continue;
                        if (protectedCells.has(key(ar, ac))) continue;
                        protectedCells.add(key(ar, ac));
                        stack.push([ar, ac]);
                    }
                }
            }
        }
    };
    addNear(holePos.r, holePos.c);
    addNear(ballPos.r, ballPos.c);
}

function adjacent(a, b) {
    return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) <= 1;
}

function randomCellIn(startRow, endRow) {
    return { r: seededRandomInt(startRow, endRow - 1), c: seededRandomInt(0, COLS - 1) };
}

function diamondCells(r0, c0, n, s, e, w) {
    const cells = [];
    n = Math.max(1, n);
    s = Math.max(1, s);
    for (let dy = -n; dy <= s; dy++) {
        const r = r0 + dy;
        if (r < 0 || r >= ROWS) continue;
        const lo = Math.max((w / s) * dy - w, -(w / n) * dy - w);
        const hi = Math.min((e / n) * dy + e, e - (e / s) * dy);
        for (let dx = Math.ceil(lo); dx <= Math.floor(hi); dx++) {
            const c = c0 + dx;
            if (c >= 0 && c < COLS) cells.push([r, c]);
        }
    }
    return cells;
}

function diamondSplotch(r0, c0, minArm, maxArm, minSize, maxSize) {
    const target = seededRandomInt(minSize, maxSize);
    const n = seededRandomInt(minArm, maxArm);
    const s = seededRandomInt(minArm, maxArm);
    const e = seededRandomInt(minArm, maxArm);
    const w = seededRandomInt(minArm, maxArm);
    const cells = diamondCells(r0, c0, n, s, e, w);
    cells.sort((a, b) =>
        (Math.abs(a[0] - r0) + Math.abs(a[1] - c0)) -
        (Math.abs(b[0] - r0) + Math.abs(b[1] - c0))
    );
    return cells.slice(0, target);
}

function randomBlob(r0, c0, target) {
    const blob = new Set([key(r0, c0)]);
    const cells = [[r0, c0]];
    const frontier = [];
    const push = (r, c) => {
        if (outOfBounds(r, c)) return;
        const k = key(r, c);
        if (blob.has(k)) return;
        blob.add(k);
        frontier.push([r, c]);
    };
    push(r0 - 1, c0); push(r0 + 1, c0); push(r0, c0 - 1); push(r0, c0 + 1);
    while (cells.length < target && frontier.length) {
        const window = Math.min(frontier.length, seededRandomInt(4, 10));
        const i = seededRandomInt(0, window - 1);
        const [r, c] = frontier[i];
        frontier.splice(i, 1);
        cells.push([r, c]);
        push(r - 1, c); push(r + 1, c); push(r, c - 1); push(r, c + 1);
    }
    fillBlobHoles(cells);
    return cells;
}

function fillBlobHoles(cells) {
    if (cells.length < 9) return;
    const blob = new Set(cells.map(([r, c]) => key(r, c)));
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const [r, c] of cells) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
    const open = new Set();
    const stack = [];
    const pushOpen = (r, c) => {
        if (r < minR || r > maxR || c < minC || c > maxC) return;
        const k = key(r, c);
        if (blob.has(k) || open.has(k)) return;
        open.add(k);
        stack.push([r, c]);
    };
    for (let c = minC; c <= maxC; c++) { pushOpen(minR, c); pushOpen(maxR, c); }
    for (let r = minR; r <= maxR; r++) { pushOpen(r, minC); pushOpen(r, maxC); }
    while (stack.length) {
        const [r, c] = stack.pop();
        for (const d of DIRECTION_KEYS) {
            pushOpen(r + DIRECTIONS[d].dr, c + DIRECTIONS[d].dc);
        }
    }
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            const k = key(r, c);
            if (!blob.has(k) && !open.has(k)) cells.push([r, c]);
        }
    }
}

function randomRect(r0, c0, target) {
    const w = seededRandomInt(3, 6);
    const h = Math.max(2, Math.round(target / (4 * w)));
    const a = randomOf([0, 0.2, 0.35, -0.2, -0.35]);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const extR = Math.ceil(h * Math.abs(cos) + w * Math.abs(sin)) + 1;
    const extC = Math.ceil(w * Math.abs(cos) + h * Math.abs(sin)) + 1;
    const cells = [];
    for (let dr = -extR; dr <= extR; dr++) {
        for (let dc = -extC; dc <= extC; dc++) {
            const u = dc * cos + dr * sin;
            const v = -dc * sin + dr * cos;
            if (Math.abs(u) <= w && Math.abs(v) <= h) {
                const r = r0 + dr;
                const c = c0 + dc;
                if (!outOfBounds(r, c)) cells.push([r, c]);
            }
        }
    }
    return cells;
}

function shapeFor(type) {
    if (type === WATER) return randomOf(['blob', 'rect']);
    if (type === FAIRWAY) return randomOf(['diamond', 'blob', 'rect']);
    if (type === SAND) return randomOf(['blob', 'rect']);
    return 'blob';
}

const TERRAIN = {
    [FAIRWAY]: { count: [2, 4], size: [12, 28] },
    [SAND]:    { count: [0, 5], size: [8, 16] },
    [WATER]:   { count: [0, 1], size: [30, 50] },
    [TREE]:    { count: [1, 4], size: [5, 50] },
    [SLOPE]:   { count: [0, 10], size: [6, 10] },
};

const MIN_BLOB_SIZE = 2;

function placeSplotch(type, r, c, minSize, maxSize, minArm, maxArm, force) {
    if (type === SLOPE) return placeSlopeSplotch(minSize, maxSize);

    let cells;
    const shape = shapeFor(type);
    if (shape === 'rect') cells = randomRect(r, c, seededRandomInt(minSize, maxSize));
    else if (shape === 'diamond') cells = diamondSplotch(r, c, minArm, maxArm, minSize, maxSize);
    else cells = randomBlob(r, c, seededRandomInt(minSize, maxSize));

    const tree = type === TREE ? randomOf(['oak', 'pine']) : null;
    const painted = [];
    for (const [rr, cc] of cells) {
        if (grid[rr][cc] === HOLE) continue;
        if ((type === WATER || type === TREE) && keepClear.has(key(rr, cc))) continue;
        if (!force && isProtected(rr, cc)) continue;
        if (grid[rr][cc] === FAIRWAY && type !== FAIRWAY) continue;
        grid[rr][cc] = type;
        treeType[rr][cc] = tree;
        painted.push([rr, cc]);
    }
    return painted;
}

function protectCells(cells) {
    for (const [r, c] of cells) protectedCells.add(key(r, c));
}

function placeSlopeSplotch(minSize, maxSize) {
    const candidates = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] !== FAIRWAY) continue;
            if (isProtected(r, c)) continue;
            candidates.push([r, c]);
        }
    }
    shuffle(candidates);
    const target = Math.min(seededRandomInt(minSize, maxSize), candidates.length);
    let placed = 0;
    for (let i = 0; i < candidates.length && placed < target; i++) {
        const [rr, cc] = candidates[i];
        let tooClose = false;
        for (let dr = -1; dr <= 1 && !tooClose; dr++) {
            for (let dc = -1; dc <= 1 && !tooClose; dc++) {
                if (dr === 0 && dc === 0) continue;
                const ar = rr + dr;
                const ac = cc + dc;
                if (!outOfBounds(ar, ac) && grid[ar][ac] === SLOPE) tooClose = true;
            }
        }
        if (tooClose) continue;
        grid[rr][cc] = SLOPE;
        slopeDir[rr][cc] = randomOf(DIRECTION_KEYS);
        treeType[rr][cc] = null;
        placed++;
    }
}

function fixSlopesPointingAtTrees() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] !== SLOPE) continue;
            const d = DIRECTIONS[slopeDir[r][c]];
            const nr = r + d.dr;
            const nc = c + d.dc;
            if (outOfBounds(nr, nc) || grid[nr][nc] !== TREE) continue;
            const safe = DIRECTION_KEYS.filter((k) => {
                const rr = r + DIRECTIONS[k].dr;
                const cc = c + DIRECTIONS[k].dc;
                return outOfBounds(rr, cc) || grid[rr][cc] !== TREE;
            });
            if (safe.length) {
                slopeDir[r][c] = randomOf(safe);
            } else {
                grid[r][c] = FAIRWAY;
                slopeDir[r][c] = null;
            }
        }
    }
}

function isAligned(a, b) {
    return a.r === b.r || a.c === b.c;
}

function generateCourse() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(ROUGH));
    slopeDir = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    treeType = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    protectedCells = new Set();

    const hole = randomCellIn(0, TOP_ROWS);
    grid[hole.r][hole.c] = HOLE;
    protectedCells.add(key(hole.r, hole.c));

    let start;
    do {
        start = randomCellIn(ROWS - BOTTOM_ROWS, ROWS);
    } while (adjacent(start, hole) || isAligned(start, hole) || Math.abs(start.c - hole.c) < 5);
    protectedCells.add(key(start.r, start.c));

    keepClear = new Set();
    for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
            if (dr === 0 && dc === 0) continue;
            const rr = hole.r + dr;
            const cc = hole.c + dc;
            if (outOfBounds(rr, cc)) continue;
            keepClear.add(key(rr, cc));
        }
    }

    for (const type of [SAND, TREE, FAIRWAY, WATER]) {
        const cfg = TERRAIN[type];
        if (!cfg) continue;
        for (let i = 0; i < seededRandomInt(cfg.count[0], cfg.count[1]); i++) {
            const r0 = type === FAIRWAY ? seededRandomInt(TOP_ROWS + 4, ROWS - BOTTOM_ROWS - 4) : seededRandomInt(0, ROWS - 1);
            placeSplotch(type, r0, seededRandomInt(0, COLS - 1), cfg.size[0], cfg.size[1], 2, 4, false);
        }
    }

    const holeGreen = placeSplotch(FAIRWAY, hole.r, hole.c, 10, 18, 2, 3, true);
    protectCells(holeGreen);
    protectCells(placeSplotch(FAIRWAY, start.r, start.c, 12, 20, 2, 3, true));

    const slopeCfg = TERRAIN[SLOPE];
    if (slopeCfg) {
        for (let i = 0; i < seededRandomInt(slopeCfg.count[0], slopeCfg.count[1]); i++) {
            placeSlopeSplotch(slopeCfg.size[0], slopeCfg.size[1]);
        }
    }

    fixSlopesPointingAtTrees();

    return { hole, start };
}

function storeGet(key, fallback) {
    try {
        const s = typeof localStorage !== 'undefined' ? localStorage : null;
        if (!s) return fallback;
        const v = s.getItem(key);
        return v === null ? fallback : JSON.parse(v);
    } catch (e) {
        return fallback;
    }
}

function storeSet(key, value) {
    try {
        const s = typeof localStorage !== 'undefined' ? localStorage : null;
        if (!s) return;
        s.setItem(key, JSON.stringify(value));
    } catch (e) { /* ignore */ }
}

function storeClear() {
    try {
        const s = typeof localStorage !== 'undefined' ? localStorage : null;
        if (!s) return;
        s.clear();
    } catch (e) { /* ignore */ }
}

const TILE_CHAR = {
    [ROUGH]: 'r',
    [FAIRWAY]: 'f',
    [SLOPE]: 's',
    [SAND]: 'a',
    [WATER]: 'w',
    [TREE]: 't',
    [HOLE]: 'h',
};
const CHAR_TILE = {};
for (const k of Object.keys(TILE_CHAR)) CHAR_TILE[TILE_CHAR[k]] = k;

const COURSE_ADJECTIVES = [
  'ancient'   , 'misty'    , 'crimson'  , 'golden'   , 'silent'  , 'rusty'    , 'winding'   , 'hidden'    ,
  'forgotten' , 'lonely'   , 'starlit'  , 'emerald'  , 'velvet'  , 'distant'  , 'broken'    , 'thundering',
  'whispering', 'amber'    , 'sapphire' , 'weathered', 'sleepy'  , 'windswept', 'shadowy'   , 'tranquil'  ,
  'copper'    , 'frosted'  , 'wandering', 'sunlit'   , 'rolling' , 'twilight' , 'moonlit'   , 'timeworn'  ,
  'scarlet'   , 'enchanted', 'faded'    , 'secluded' , 'majestic', 'ivory'    , 'slumbering', 'gilded'    ,
  'autumn'    , 'blooming' , 'blue'     , 'bramble'  , 'breezy'  , 'clouded'  , 'crystal'   , 'dusty'     ,
  'eastern'   , 'endless'  , 'foggy'    , 'gentle'   , 'green'   , 'hazy'     , 'lush'      , 'northern'  ,
  'overgrown' , 'peaceful' , 'rainy'    , 'remote'   , 'rocky'   , 'rustic'   , 'secret'    , 'serene'    ,
  'silver'    , 'southern' , 'sunny'    , 'verdant'  , 'wild'    , 'wooden'   , 'lavender'  , 'lost'      ,
  'iron'      , ''
];

const COURSE_NOUNS = [
  'pines'   , 'valley'   , 'meadow'  , 'harbor' , 'summit'  , 'willows', 'bluff'    , 'marsh'  ,
  'ridge'   , 'cove'     , 'oaks'    , 'glen'   , 'heights' , 'falls'  , 'bend'     , 'hollow' ,
  'creek'   , 'highlands', 'orchard' , 'point'  , 'crossing', 'terrace', 'springs'  , 'grove'  ,
  'moor'    , 'vale'     , 'pass'    , 'woods'  , 'shores'  , 'downs'  , 'basin'    , 'timbers',
  'estates' , 'fields'   , 'crest'   , 'landing', 'reach'   , 'knoll'  , 'brook'    , 'chase'  ,
  'birch'   , 'cedars'   , 'cliffs'  , 'dunes'  , 'heath'   , 'isle'   , 'lake'     , 'lakes'  ,
  'lanterns', 'manor'    , 'orchards', 'peaks'  , 'pond'    , 'quarry' , 'ravine'   , 'river'  ,
  'rock'    , 'stone'    , 'thicket' , 'trail'  , 'village' , 'water'  , 'wetlands' , 'winds'  ,
  'yew'     , 'willow'   , 'canyon'  , 'coast'  , 'garden'  , 'island' , 'riverbank', 'shore'  ,
  'station' , 'chapel'   , 'castle'  , 'farm'   , 'ranch'   , 'reserve', ''
];

const COURSE_SUFFIXES = [

  'links'     , 'golf club', 'country club', 'club'   , 'golf course', 'golf resort', 'golf & country club', 'fairways',
  'golf links', 'clubhouse', 'greens'      , 'fairway', 'grounds'    , 'park'       , 'course'             , 'country' ,
  'resort'    , 'range'    , 'lodge'       , 'retreat', 'gardens'    , 'estate'     , 'manor'              , ''
];

function generateCourseName() {
    return (randomOf(COURSE_ADJECTIVES) + ' ' + randomOf(COURSE_NOUNS) + ' ' + randomOf(COURSE_SUFFIXES)).trim().replace(/\s+/g, " "); ;
}

function serializeHole(rec) {
    const g = [];
    const s = [];
    const t = [];
    for (let r = 0; r < ROWS; r++) {
        let gr = '';
        let sr = '';
        let tr = '';
        for (let c = 0; c < COLS; c++) {
            gr += TILE_CHAR[grid[r][c]] || 'r';
            sr += slopeDir[r][c] || '0';
            tr += treeType[r][c] === 'pine' ? 'p' : treeType[r][c] ? 'o' : '0';
        }
        g.push(gr);
        s.push(sr);
        t.push(tr);
    }
    return { g, s, t, hole: [rec.hole.r, rec.hole.c], start: [rec.start.r, rec.start.c] };
}

function unserializeHole(data) {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(ROUGH));
    slopeDir = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    treeType = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            grid[r][c] = CHAR_TILE[data.g[r][c]] || ROUGH;
            slopeDir[r][c] = data.s[r][c] === '0' ? null : data.s[r][c];
            treeType[r][c] = data.t[r][c] === 'p' ? 'pine' : data.t[r][c] === 'o' ? 'oak' : null;
        }
    }
}

function renderHoleInto(container, data) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    const g = data.g.map((row) => row.split('').map((ch) => CHAR_TILE[ch] || ROUGH));
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = g[r][c];
            const tile = document.createElement('div');
            const corners = cornerClasses(type, r, c, g);
            tile.className = 'tile ' + type + (corners.length ? ' ' + corners.join(' ') : '');
            if (type === SLOPE) tile.setAttribute('direction', data.s[r][c]);
            if (type === TREE) tile.setAttribute('type', data.t[r][c] === 'p' ? 'pine' : 'oak');
            if (data.hole && r === data.hole[0] && c === data.hole[1]) tile.setAttribute('hole', '1');
            if (data.start && r === data.start[0] && c === data.start[1]) tile.setAttribute('ball-start', '1');
            container.appendChild(tile);
        }
    }
}

function nextCourseNumber() {
    return (storeGet('mg.courseNumber', 0) || 0) + 1;
}

function completeCourseNumber() {
    const n = (storeGet('mg.courseNumber', 0) || 0) + 1;
    storeSet('mg.courseNumber', n);
    return n;
}

/* ---- COURSE IMAGE (canvas PNG) ---- */

function makeCanvas(w, h) {
    try {
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext && cv.getContext('2d');
        return ctx ? cv : null;
    } catch (e) {
        return null;
    }
}

function tileShapePath(ctx, x, y, size, corners, radius) {
    const set = new Set(corners);
    const tl = set.has('corner-tl');
    const tr = set.has('corner-tr');
    const bl = set.has('corner-bl');
    const br = set.has('corner-br');
    const r = corners && corners.length ? Math.min(radius, size * 0.3) : 0;
    ctx.beginPath();
    ctx.moveTo(x + (tl ? r : 0), y);
    if (tl) ctx.arcTo(x, y, x, y + r, r);
    ctx.lineTo(x, y + (bl ? size - r : size));
    if (bl) ctx.arcTo(x, y + size, x + r, y + size, r);
    ctx.lineTo(x + (br ? size - r : size), y + size);
    if (br) ctx.arcTo(x + size, y + size, x + size, y + size - r, r);
    ctx.lineTo(x + size, y + (tr ? r : 0));
    if (tr) ctx.arcTo(x + size, y, x + size - r, y, r);
    ctx.lineTo(x + (tl ? r : 0), y);
    ctx.closePath();
}

function fillTileBg(ctx, x, y, size, corners, color) {
    ctx.fillStyle = color;
    if (corners && corners.length) {
        tileShapePath(ctx, x, y, size, corners, size * 0.3);
        ctx.fill();
    } else {
        ctx.fillRect(x, y, size, size);
    }
}

function drawDot(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
}

function drawArrow(ctx, x, y, size, dir) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size * 0.4;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    if (dir === 'N') { ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r * 0.75, cy + r * 0.75); ctx.lineTo(cx + r * 0.75, cy + r * 0.75); }
    else if (dir === 'S') { ctx.moveTo(cx, cy + r); ctx.lineTo(cx - r * 0.75, cy - r * 0.75); ctx.lineTo(cx + r * 0.75, cy - r * 0.75); }
    else if (dir === 'W') { ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r * 0.75, cy - r * 0.75); ctx.lineTo(cx + r * 0.75, cy + r * 0.75); }
    else { ctx.moveTo(cx + r, cy); ctx.lineTo(cx - r * 0.75, cy - r * 0.75); ctx.lineTo(cx - r * 0.75, cy + r * 0.75); }
    ctx.closePath();
    ctx.fill();
}

function drawSand(ctx, x, y, size, corners) {
    ctx.save();
    tileShapePath(ctx, x, y, size, corners, size * 0.3);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = Math.max(1, size * 0.05);
    for (let off = -size; off <= size * 2; off += size / 4) {
        ctx.beginPath();
        ctx.moveTo(x + off, y);
        ctx.lineTo(x + off + size, y + size);
        ctx.stroke();
    }
    ctx.restore();
}

function drawOak(ctx, x, y, size) {
    ctx.fillStyle = '#222';
    ctx.fillRect(x + size * 0.44, y + size * 0.6, size * 0.12, size * 0.22);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x + size * 0.225, y + size * 0.15, size * 0.55, size * 0.45, size * 0.2);
    } else {
        ctx.rect(x + size * 0.225, y + size * 0.15, size * 0.55, size * 0.45);
    }
    ctx.closePath();
    ctx.fill();
}

function drawPine(ctx, x, y, size) {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.moveTo(x + size * 0.5, y + size * 0.06);
    ctx.lineTo(x + size * 0.12, y + size * 0.92);
    ctx.lineTo(x + size * 0.88, y + size * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.5, y);
    ctx.lineTo(x + size * 0.18, y + size * 0.6);
    ctx.lineTo(x + size * 0.82, y + size * 0.6);
    ctx.closePath();
    ctx.fill();
}

function renderHoleCanvas(data, tileSize) {
    const size = tileSize || 36;
    const g = data.g.map((row) => row.split('').map((ch) => CHAR_TILE[ch] || ROUGH));
    const cv = makeCanvas(COLS * size, ROWS * size);
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = g[r][c];
            const x = c * size;
            const y = r * size;
            const corners = cornerClasses(type, r, c, g);
            switch (type) {
                case ROUGH:
                    drawDot(ctx, x, y, size, '#ccc');
                    break;
                case FAIRWAY:
                    fillTileBg(ctx, x, y, size, corners, '#ccc');
                    drawDot(ctx, x, y, size, '#222');
                    break;
                case SLOPE:
                    fillTileBg(ctx, x, y, size, corners, '#ccc');
                    drawArrow(ctx, x, y, size, data.s[r][c]);
                    break;
                case SAND:
                    drawSand(ctx, x, y, size, corners);
                    break;
                case WATER:
                    fillTileBg(ctx, x, y, size, corners, '#222');
                    drawDot(ctx, x, y, size, '#fff');
                    break;
                case TREE:
                    if (data.t[r][c] === 'p') drawPine(ctx, x, y, size);
                    else drawOak(ctx, x, y, size);
                    break;
                case HOLE:
                    ctx.fillStyle = '#222';
                    ctx.beginPath();
                    ctx.arc(x + size / 2, y + size / 2, size * 0.38, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                default:
                    break;
            }
        }
    }
    if (data.path && data.path.length) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        for (const p of data.path) {
            ctx.fillRect(p[1] * size, p[0] * size, size, size);
        }
        if (data.path.length >= 2) {
            ctx.save();
            ctx.strokeStyle = '#222';
            ctx.lineWidth = Math.max(2, size * 0.07);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let i = 0; i < data.path.length; i++) {
                const cx = (data.path[i][1] + 0.5) * size;
                const cy = (data.path[i][0] + 0.5) * size;
                if (i === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = '#222';
        for (let i = 0; i < data.path.length - 1; i++) {
            ctx.beginPath();
            ctx.arc((data.path[i][1] + 0.5) * size, (data.path[i][0] + 0.5) * size, size * 0.14, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (data.start) {
        const x = data.start[1] * size;
        const y = data.start[0] * size;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, size * 0.05);
        ctx.strokeStyle = '#222';
        ctx.stroke();
    }
    return cv;
}

function courseCanvas(course, opts) {
    opts = opts || {};
    const tileSize = opts.tileSize || 36;
    const gap = opts.gap || 16;
    const withHeader = opts.header !== false;
    const header = withHeader ? (opts.header || 64) : 0;
    const holes = course.holes.length;
    const cols = 3;
    const rows = Math.ceil(holes / cols);
    const width = cols * COLS * tileSize + (cols - 1) * gap;
    const height = header + rows * ROWS * tileSize + (rows - 1) * gap;
    const cv = makeCanvas(width, height);
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    if (withHeader) {
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(header * 0.38) + 'px system-ui, sans-serif';
        ctx.fillText(course.name, width / 2, header * 0.4);
        ctx.font = Math.round(header * 0.22) + 'px system-ui, sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('course ' + (course.number || '') + ' \u00b7 ' + holes + ' holes', width / 2, header * 0.76);
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, header);
        ctx.lineTo(width, header);
        ctx.stroke();
    }
    for (let i = 0; i < holes; i++) {
        const holeCv = renderHoleCanvas(course.holes[i], tileSize);
        if (!holeCv) continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (COLS * tileSize + gap);
        const y = header + row * (ROWS * tileSize + gap);
        ctx.drawImage(holeCv, x, y);
    }
    return cv;
}

function toast(text) {
    try {
        let t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = text;
        raf(() => t.classList.add('visible'));
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('visible'), 2200);
    } catch (e) { /* ignore */ }
}

function copyCanvas(canvas, filename) {
    if (!canvas) return;
    const fallback = () => {
        downloadCanvas(canvas, filename);
        toast('clipboard unavailable \u2014 downloaded the image instead');
    };
    const write = () => {
        canvas.toBlob((blob) => {
            if (!blob) {
                fallback();
                return;
            }
            try {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    .then(() => toast('image copied to clipboard!'))
                    .catch(fallback);
            } catch (e) {
                fallback();
            }
        }, 'image/png');
    };
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        write();
    } else {
        fallback();
    }
}

function startCourse() {
    let seed = seedOverride;
    seedOverride = null;
    if (seed === null) seed = randomInt(1, 2147483646);
    setSeed(seed);
    updateSeedUrl(seed);
    const holes = [];
    for (let i = 0; i < HOLES_PER_COURSE; i++) {
        const rec = generateCourse();
        holes.push(serializeHole(rec));
    }
    course = {
        name: generateCourseName(),
        number: nextCourseNumber(),
        holes,
        seed,
    };
    mulligans = MULLIGANS_PER_COURSE;
    totalShots = 0;
    holeIndex = 0;
    holeHistory = [];
    showIntro();
    document.title = 'papergolf - ' + course.name;
}

function hideOverlays() {
    for (const id of ['intro', 'hole-end', 'failure', 'course-end']) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    }
}

function showIntro() {
    const number = document.getElementById('intro-number');
    if (number) number.textContent = 'course ' + course.number;
    const name = document.getElementById('intro-name');
    if (name) name.textContent = course.name;
    const facts = document.getElementById('intro-facts');
    if (facts) facts.textContent = HOLES_PER_COURSE + ' holes \u00b7 ' + MULLIGANS_PER_COURSE + ' mulligans';
    introStart.focus();
    hideOverlays();
    const intro = document.getElementById('intro');
    if (intro) intro.hidden = false;
}

function updateAmbiance() {
    let trees = 0, water = 0;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === TREE) trees++;
            if (grid[r][c] === WATER) water++;
        }

    let file = 'media/audio/ambiance.mp3';
    if (trees > 10) file = 'media/audio/ambianceForest.mp3';
    if (water > 10) file = 'media/audio/ambianceLake.mp3';

    if (file === ambianceFile) return;

    if (ambianceLoopId) audio.stopLoop(ambianceLoopId, { fadeOut: 2 });
    ambianceLoopId = file ? audio.playLoop(file, { volume: 25, fadeIn: 2 }) : null;
    ambianceFile = file;
}

function startHole(i) {
    holeIndex = i;
    const data = course.holes[i];
    unserializeHole(data);
    holePos = { r: data.hole[0], c: data.hole[1] };
    ballPos = { r: data.start[0], c: data.start[1] };
    rebuildProtectedCells();
    pathPositions = [{ r: ballPos.r, c: ballPos.c }];
    shots = 0;
    over = false;
    holeDone = false;
    holeHistory = [];
    animating = false;

    hideOverlays();

    render(ballPos, holePos);
    showMessage('');
    updateStatusBar();
    updateAmbiance();
    beginTurn();
}

function mulliganDots(remaining) {
    const used = MULLIGANS_PER_COURSE - remaining;
    let html = '';
    for (let i = 0; i < MULLIGANS_PER_COURSE; i++) {
        html += '<span class="mulligan-dot' + (i < used ? ' used' : '') + '"></span>';
    }
    return html;
}

function updateStatusBar() {
    const name = document.getElementById('course-name');
    if (name && course) name.textContent = course.name;
    const holeEl = document.getElementById('hole-indicator');
    if (holeEl) holeEl.textContent = 'hole ' + (holeIndex + 1);
    const strokesEl = document.getElementById('strokes');
    if (strokesEl) strokesEl.textContent = 'strokes ' + shots + '/' + PAR;
    const totalEl = document.getElementById('total');
    if (totalEl) totalEl.textContent = 'total: ' + (totalShots + (holeDone ? 0 : shots));
    const mul = document.getElementById('mulligans');
    if (mul) mul.innerHTML = mulliganDots(mulligans);
    const undoBtn = document.getElementById('undo');
    if (undoBtn) undoBtn.disabled = holeDone || over || mulligans <= 0 || holeHistory.length === 0;
    const rerollBtn = document.getElementById('reroll');
    if (rerollBtn) rerollBtn.disabled = holeDone || over || mulligans <= 0 || animating;
}

function undoLastMove() {
    if (holeDone || mulligans <= 0 || animating) return;
    if (!holeHistory.length) return;
    const snap = holeHistory.pop();
    mulligans--;
    ballPos = { r: snap.r, c: snap.c };
    shots = snap.shots;
    const snapIdx = pathPositions.findIndex((p) => p.shotEndIndex === snap.shots + 1);
    pathPositions = pathPositions.slice(0, snapIdx);
    over = false;
    clearActionButtons();
    for (const el of tileEls) el.classList.remove('visited');
    for (const p of pathPositions) tileEls[p.r * COLS + p.c].classList.add('visited');
    positionMarker(ballPos);
    tracePath();
    const failure = document.getElementById('failure');
    if (failure) failure.hidden = true;
    showMessage('');
    updateStatusBar();
    beginTurn();
}

function rerollDice() {
    if (holeDone || over || mulligans <= 0 || animating) return;
    mulligans--;
    clearActionButtons();
    updateStatusBar();
    beginTurn();
}

function showFailure(message) {
    over = true;
    const msg = document.getElementById('failure-message');
    if (msg) msg.textContent = message;
    const undoBtn = document.getElementById('failure-undo');
    if (undoBtn) undoBtn.hidden = mulligans <= 0;
    const ov = document.getElementById('failure');
    if (ov) ov.hidden = false;
    updateStatusBar();
}

function parName(score, par) {
    par = par || PAR;
    const diff = score - par;
    if (diff <= -4) return 'condor';
    if (diff === -3) return 'albatroz';
    if (diff === -2) return 'eagle';
    if (diff === -1) return 'birdie';
    if (diff === 0) return 'par';
    if (diff === 1) return 'bogey';
    if (diff === 2) return 'double bogey';
    return 'triple bogey';
}

function showHoleEnd() {
    const parEl = document.getElementById('hole-end-par');
    if (parEl) parEl.textContent = parName(shots);
    const msg = document.getElementById('hole-end-message');
    if (msg) msg.textContent = 'hole ' + (holeIndex + 1) + ' complete in ' + shots + '/' + PAR + ' shot' + (shots === 1 ? '' : 's');
    const ov = document.getElementById('hole-end');
    if (ov) ov.hidden = false;
}

function completeCourse() {
    const rec = {
        name: course.name,
        number: course.number,
        mulligansLeft: mulligans,
        date: new Date().toISOString(),
        holes: course.holes,
        seed: course.seed,
    };
    completeCourseNumber();
    const gallery = storeGet('mg.gallery', []);
    gallery.unshift(rec);
    storeSet('mg.gallery', gallery.slice(0, 20));

    const name = document.getElementById('course-end-name');
    if (name) name.textContent = rec.name;
    const mul = document.getElementById('course-end-mulligans');
    if (mul) mul.innerHTML = mulliganDots(rec.mulligansLeft);
    const total = document.getElementById('course-end-total');
    if (total) total.textContent = 'total: ' + totalShots;
    const imgHolder = document.getElementById('course-end-image');
    if (imgHolder) {
        imgHolder.innerHTML = '';
        lastCourseCanvas = courseCanvas(rec);
        lastCourseName = rec.name;
        if (lastCourseCanvas) {
            const img = document.createElement('img');
            img.className = 'course-img';
            img.alt = rec.name;
            img.src = lastCourseCanvas.toDataURL('image/png');
            imgHolder.appendChild(img);
        }
    }
    const ov = document.getElementById('course-end');
    if (ov) ov.hidden = false;
    updateStatusBar();
}

function renderPaperField(container) {
    const { hole, start } = generateCourse();
    container.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tile = document.createElement('div');
            const corners = cornerClasses(grid[r][c], r, c);
            tile.className = 'tile ' + grid[r][c] + (corners.length ? ' ' + corners.join(' ') : '');
            if (grid[r][c] === SLOPE) tile.setAttribute('direction', slopeDir[r][c]);
            if (grid[r][c] === TREE) tile.setAttribute('type', treeType[r][c]);
            if (r === start.r && c === start.c) tile.setAttribute('ball-start', '1');
            if (r === hole.r && c === hole.c) tile.setAttribute('hole', '1');
            container.appendChild(tile);
        }
    }
}

function inSamePatch(a, b) {
    if (a === HOLE) a = FAIRWAY;
    if (b === HOLE) b = FAIRWAY;
    if (a === FAIRWAY || a === SLOPE) return b === FAIRWAY || b === SLOPE;
    return a === b;
}

function cornerClasses(type, r, c, source) {
    const g = source || grid;
    const same = (rr, cc) => !outOfBounds(rr, cc) && inSamePatch(type, g[rr][cc]);
    const corners = [];
    if (!same(r - 1, c) && !same(r, c - 1)) corners.push('corner-tl');
    if (!same(r - 1, c) && !same(r, c + 1)) corners.push('corner-tr');
    if (!same(r + 1, c) && !same(r, c - 1)) corners.push('corner-bl');
    if (!same(r + 1, c) && !same(r, c + 1)) corners.push('corner-br');
    return corners;
}

function render(ballStart, hole) {
    const container = document.getElementById('course');
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

    tileEls = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tile = document.createElement('div');
            const corners = cornerClasses(grid[r][c], r, c);
            tile.className = 'tile ' + grid[r][c] + (corners.length ? ' ' + corners.join(' ') : '');
            if (grid[r][c] === SLOPE) tile.setAttribute('direction', slopeDir[r][c]);
            if (grid[r][c] === TREE) tile.setAttribute('type', treeType[r][c]);
            if (r === ballStart.r && c === ballStart.c) {
                tile.setAttribute('ball-start', '1');
                tile.classList.add('visited');
            }
            if (r === hole.r && c === hole.c) tile.setAttribute('hole', '1');
            container.appendChild(tile);
            tileEls.push(tile);
        }
    }

    const marker = document.createElement('div');
    marker.id = 'ball-marker';
    container.appendChild(marker);
    ballMarker = marker;
    positionMarker(ballStart);
}

/* ---- GAMEPLAY ---- */

function diceModifier(r, c) {
    if (chebToHole(r, c) <= 1) return 0;
    switch (grid[r][c]) {
        case SAND: return -1;
        case FAIRWAY:
        case SLOPE: return 1;
        default: return 0;
    }
}

function chebToHole(r, c) {
    return Math.max(Math.abs(r - holePos.r), Math.abs(c - holePos.c));
}

function shotPath(dir, r, c, steps, blockTrees, exactHole) {
    const path = [{ r, c }];
    const d = MOVES[dir];
    const canCrossTrees = !blockTrees && (grid[r][c] === FAIRWAY || grid[r][c] === SLOPE);
    let guard = 0;
    for (let i = 0; i < steps; i++) {
        if (guard++ > ROWS * COLS) break;
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (outOfBounds(nr, nc)) break;
        if (grid[nr][nc] === TREE && !canCrossTrees) break;
        r = nr;
        c = nc;
        path.push({ r, c });
        if (r === holePos.r && c === holePos.c) {
            if (exactHole === false || i === steps - 1) break;
            continue;
        }
    }
    const visited = new Set([key(r, c)]);
    while (grid[r][c] === SLOPE) {
        if (guard++ > ROWS * COLS) break;
        const sd = DIRECTIONS[slopeDir[r][c]];
        const nr = r + sd.dr;
        const nc = c + sd.dc;
        if (outOfBounds(nr, nc)) break;
        if (grid[nr][nc] === TREE) break;
        r = nr;
        c = nc;
        const k = key(r, c);
        if (visited.has(k)) break;
        visited.add(k);
        path.push({ r, c });
        if (r === holePos.r && c === holePos.c) break;
    }
    return path;
}

function playSound(name, ...args) {
    if (typeof window !== 'undefined' && window.sounds && window.sounds[name]) {
        try { window.sounds[name](...args); } catch (e) { /* ignore */ }
    }
}

function positionMarker(pos) {
    if (!ballMarker) return;
    const container = document.getElementById('course');
    if (!container || !container.getBoundingClientRect) return;
    const size = container.getBoundingClientRect().width / COLS;
    const d = size * 0.55;
    ballMarker.style.left = (pos.c + 0.5) * size - d / 2 + 'px';
    ballMarker.style.top = (pos.r + 0.5) * size - d / 2 + 'px';
    ballMarker.style.width = d + 'px';
    ballMarker.style.height = d + 'px';
}

function moveBallTo(r, c, shotEndIndex) {
    ballPos = { r, c };
    pathPositions.push({ r, c, shotEndIndex });
    tileEls[r * COLS + c].classList.add('visited');
    positionMarker({ r, c });
}

function finishShot(path) {
    const last = path[path.length - 1];
    holeHistory.push({ r: ballPos.r, c: ballPos.c, shots });
    shots++;
    for (let i = 1; i < path.length; i++) {
        const isEnd = i === path.length - 1;
        moveBallTo(path[i].r, path[i].c, isEnd ? shots : null);
    }
    tracePath();
    animating = false;
    if (grid[last.r][last.c] === WATER) {
        audio.playAudio('media/audio/collapseWater.mp3', { volume: 80 });
        showFailure('The ball fell in the water.');
        return;
    }
    if (grid[last.r][last.c] === TREE) {
        audio.playAudio('media/audio/collapseTrees.mp3', { volume: 80 });
        showFailure('The ball got lost in the trees.');
        return;
    }
    if (last.r === holePos.r && last.c === holePos.c) {
        audio.playAudio('media/audio/cup.mp3', { volume: 80 })
        winHole();
    }
    updateStatusBar();
    if (!over) beginTurn();
}

function puttSteps(r, c) {
    return (grid[r][c] === FAIRWAY || grid[r][c] === SLOPE) ? 2 : 1;
}

function positionOverTile(el, r, c, scale, vy) {
    const container = document.getElementById('course');
    const size = container.getBoundingClientRect().width / COLS;
    const d = size * scale;
    const yCenter = (r + (vy == null ? 0.5 : vy)) * size;
    el.style.left = (c + 0.5) * size - d / 2 + 'px';
    el.style.top = yCenter - d / 2 + 'px';
    el.style.width = d + 'px';
    el.style.height = d + 'px';
    el.style.fontSize = Math.round(size * scale * 0.7) + 'px';
}

function rollDice(done) {
    const container = document.getElementById('course');
    const size = container.getBoundingClientRect().width / COLS;
    const token = ++diceToken;
    const dice = document.createElement('div');
    dice.id = 'dice';
    const value = document.createElement('span');
    value.className = 'dice-value';
    dice.appendChild(value);
    const mod = document.createElement('div');
    mod.id = 'dice-mod';
    mod.hidden = true;
    mod.style.fontSize = Math.round(size * 0.50) + 'px';
    dice.appendChild(mod);
    positionOverTile(dice, ballPos.r, ballPos.c, 0.72, -0.5);
    container.appendChild(dice);

    const finalRoll = randomInt(1, 6);
    const modifier = diceModifier(ballPos.r, ballPos.c);
    let ticks = 0;
    const totalTicks = 7;
    const tick = () => {
        if (token !== diceToken) return;
        if (ticks < totalTicks) {
            value.textContent = String(randomInt(1, 6));
            playSound('strengthTick');
            ticks++;
            setTimeout(tick, 90);
        } else {
            value.textContent = String(finalRoll);
            dice.classList.add('settled');
            playSound('strengthTick');
            if (modifier !== 0) {
                mod.textContent = modifier > 0 ? '+' + modifier : String(modifier);
                mod.hidden = false;
                playSound('dirChange');
            }
            setTimeout(() => {
                if (token !== diceToken) return;
                dice.remove();
                done(finalRoll, modifier);
            }, 380);
        }
    };
    setTimeout(tick, 250);
}

function addActionButton(r, c, distance, kind, index, onClick) {
    const container = document.getElementById('course');
    const btn = document.createElement('div');
    btn.className = 'action-btn ' + kind;
    btn.textContent = String(distance);
    btn.style.animationDelay = (index * 0.045) + 's';
    positionOverTile(btn, r, c, 0.65);
    playSound('buttonPop', index * 0.045);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    container.appendChild(btn);
}

function clearActionButtons() {
    const container = document.getElementById('course');
    const old = container.querySelectorAll('.action-btn');
    for (const el of old) el.remove();
    const dice = document.getElementById('dice');
    if (dice) dice.remove();
}

function showActionButtons(roll, modifier, strength) {
    clearActionButtons();
    const puttDist = puttSteps(ballPos.r, ballPos.c);
    let index = 0;
    for (const dir of Object.keys(MOVES)) {
        const puttPath = shotPath(dir, ballPos.r, ballPos.c, puttDist, true, false);
        const puttLand = puttPath[puttPath.length - 1];
        const puttMoves = puttLand.r !== ballPos.r || puttLand.c !== ballPos.c;

        const shotP = shotPath(dir, ballPos.r, ballPos.c, strength);
        const shotLand = shotP[shotP.length - 1];
        const shotMoves = shotLand.r !== ballPos.r || shotLand.c !== ballPos.c;

        const sameLand = puttMoves && shotMoves && puttLand.r === shotLand.r && puttLand.c === shotLand.c;

        if (puttMoves && !sameLand) {
            addActionButton(puttLand.r, puttLand.c, puttDist, 'putt', index++, () => {
                commitShot(dir, puttDist, true, false, 'smallHit');
            });
        }
        if (shotMoves) {
            addActionButton(shotLand.r, shotLand.c, strength, 'shot', index++, () => {
                commitShot(dir, strength, false, true, 'hit');
            });
        }
    }
}

function beginTurn() {
    if (over) return;
    animating = true;
    rollDice((roll, modifier) => {
        const strength = Math.max(0, roll + modifier);
        showActionButtons(roll, modifier, strength);
        animating = false;
    });
}

function commitShot(dir, distance, blockTrees, exactHole, sound) {
    if (over || animating) return;
    clearActionButtons();
    animating = true;
    playSound(sound);
    const path = shotPath(dir, ballPos.r, ballPos.c, distance, blockTrees, exactHole);
    animatePath(path, () => {
        finishShot(path);
    });
}

function animatePath(path, done) {
    const container = document.getElementById('course');
    const size = container.getBoundingClientRect().width / COLS;
    let i = 1;
    const step = () => {
        if (i >= path.length) {
            done();
            return;
        }
        const a = path[i - 1];
        const b = path[i];
        const ax = (a.c + 0.5) * size;
        const ay = (a.r + 0.5) * size;
        const bx = (b.c + 0.5) * size;
        const by = (b.r + 0.5) * size;
        positionMarker(b);
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len >= 1) {
            const line = document.createElement('div');
            line.className = 'path-line';
            line.style.left = ax + 'px';
            line.style.top = ay + 'px';
            line.style.width = '0px';
            line.style.transform = 'rotate(' + Math.atan2(dy, dx) * 180 / Math.PI + 'deg)';
            container.appendChild(line);
            raf(() => {
                raf(() => {
                    line.style.width = len + 'px';
                });
            });
        }
        i++;
        setTimeout(step, 100);
    };
    step();
}

function winHole() {
    over = true;
    holeDone = true;
    totalShots += shots;
    if (course && course.holes[holeIndex]) {
        course.holes[holeIndex].path = pathPositions.map((p) => [p.r, p.c]);
        course.holes[holeIndex].shots = shots;
    }
    showHoleEnd();
    updateStatusBar();
}

function showMessage(text) {
    const el = document.getElementById('message');
    if (!el) return;
    el.textContent = text;
    el.hidden = text === '';
}

function tracePath() {
    const container = document.getElementById('course');
    const oldLines = container.querySelectorAll('.path-line');
    for (const el of oldLines) el.remove();
    if (pathPositions.length < 2) return;

    const size = container.getBoundingClientRect().width / COLS;
    for (let i = 1; i < pathPositions.length; i++) {
        const a = pathPositions[i - 1];
        const b = pathPositions[i];
        const ax = (a.c + 0.5) * size;
        const ay = (a.r + 0.5) * size;
        const bx = (b.c + 0.5) * size;
        const by = (b.r + 0.5) * size;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        const line = document.createElement('div');
        line.className = 'path-line';
        line.style.left = ax + 'px';
        line.style.top = ay + 'px';
        line.style.width = len + 'px';
        line.style.transform = 'rotate(' + Math.atan2(dy, dx) * 180 / Math.PI + 'deg)';
        container.appendChild(line);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('course')) startCourse();
});

const introStart = document.getElementById('intro-start');
if (introStart) {
    introStart.addEventListener('click', () => startHole(0));
}

const holeEndNext = document.getElementById('hole-end-next');
if (holeEndNext) {
    holeEndNext.addEventListener('click', () => {
        if (holeIndex + 1 >= HOLES_PER_COURSE) {
            completeCourse();
        } else {
            startHole(holeIndex + 1);
        }
    });
}

const failureUndo = document.getElementById('failure-undo');
if (failureUndo) {
    failureUndo.addEventListener('click', undoLastMove);
}

const failureQuit = document.getElementById('failure-quit');
if (failureQuit) {
    failureQuit.addEventListener('click', startCourse);
}

const courseEndAgain = document.getElementById('course-end-again');
if (courseEndAgain) {
    courseEndAgain.addEventListener('click', startCourse);
}

const courseEndCopy = document.getElementById('course-end-copy');
if (courseEndCopy) {
    courseEndCopy.addEventListener('click', () => copyCanvas(lastCourseCanvas, lastCourseName + '.png'));
}

const undoButton = document.getElementById('undo');
if (undoButton) {
    undoButton.addEventListener('click', undoLastMove);
}

const rerollButton = document.getElementById('reroll');
if (rerollButton) {
    rerollButton.addEventListener('click', rerollDice);
}
