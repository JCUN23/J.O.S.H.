import { useEffect, useRef } from 'react';

// Ambient batcave behind the idle clock: a procedural two-layer cave, bats crossing in
// small flocks, the odd water drip, and floor mist. Built for an always-on AMOLED panel:
// mostly true black, nothing bright holds still, ~30fps, capped resolution, paused
// while hidden, a single still frame with prefers-reduced-motion.

const FPS = 30;
const MAX_DPR = 1.5;
const OVERSCAN = 16;   // rock layers are drawn this much past every edge, so drift never shows a seam

// Deterministic randomness so the cave looks the same every time it's drawn at a size.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// One cave layer: ceiling with stalactites, floor with stalagmites, jagged side walls.
// Each shape is { pts, edge }: pts is the closed fill outline, edge is only the rock face
// (never the screen border), which is what gets the rim light. Returns drip sources too.
function caveLayer(w, h, rand, { depth }) {
    const tips = [];
    const jag = (amp) => (rand() - 0.5) * amp;

    // Ceiling, left to right: rough rock with tapered stalactites hanging from it
    const ceil = [];
    for (let x = 0; x <= w;) {
        const base = h * (0.025 + rand() * 0.045) * depth;
        if (rand() < 0.5) {
            const width = (14 + rand() * 46) * (0.6 + depth * 0.5);
            const len = h * (0.05 + rand() * rand() * 0.3) * depth;
            ceil.push([x, base + jag(4)], [x + width * 0.3, base + len * 0.45 + jag(4)],
                [x + width * 0.46, base + len * 0.85], [x + width * 0.5, base + len],
                [x + width * 0.56, base + len * 0.8], [x + width * 0.72, base + len * 0.35 + jag(4)]);
            if (len > h * 0.07) tips.push([x + width * 0.5, base + len]);
            x += width;
        } else {
            const step = 10 + rand() * 30;
            ceil.push([x, base + jag(8)]);
            x += step;
        }
    }

    // Floor, right to left: stalagmites are stubbier
    const floor = [];
    for (let x = w; x >= 0;) {
        const base = h - h * (0.035 + rand() * 0.04) * depth;
        if (rand() < 0.4) {
            const width = (30 + rand() * 70) * (0.6 + depth * 0.5);
            const len = h * (0.03 + rand() * rand() * 0.14) * depth;
            floor.push([x, base + jag(4)], [x - width * 0.3, base - len * 0.5 + jag(4)],
                [x - width * 0.47, base - len], [x - width * 0.55, base - len * 0.85], [x - width * 0.75, base - len * 0.3]);
            x -= width;
        } else {
            floor.push([x, base + jag(6)]);
            x -= 12 + rand() * 34;
        }
    }

    // Side walls, top to bottom, with the odd ledge
    const wall = (side) => {
        const edge = side < 0 ? 0 : w;
        const pts = [];
        let inset = w * (0.03 + rand() * 0.03) * depth;
        for (let y = 0; y <= h; y += 8 + rand() * 26) {
            inset = Math.max(w * 0.008, Math.min(w * 0.11 * depth, inset + jag(w * 0.018)));
            if (rand() < 0.06) inset += w * 0.02 * depth;          // ledge
            pts.push([edge - side * inset, y]);
        }
        return pts;
    };

    const shapes = [
        { pts: [[0, 0], ...ceil, [w, 0]], edge: ceil },
        { pts: [[w, h], ...floor, [0, h]], edge: floor },
    ];
    for (const side of [-1, 1]) {
        const edgePts = wall(side);
        const x0 = side < 0 ? 0 : w;
        shapes.push({ pts: [[x0, 0], ...edgePts, [x0, h]], edge: edgePts });
    }
    return { shapes, tips };
}

function pathFrom(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
}

// Pre-render background glow + both cave layers once per size.
function buildScene(w, h, hud) {
    const rand = rng(w * 7 + h * 13);
    const make = (cw = w, ch = h) => {
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        return c;
    };
    const W = w + OVERSCAN * 2;
    const H = h + OVERSCAN * 2;

    const bg = make();
    let g = bg.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.55);
    glow.addColorStop(0, `rgba(${hud}, 0.13)`);
    glow.addColorStop(0.45, `rgba(${hud}, 0.04)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);

    const far = make(W, H);
    const farCave = caveLayer(W, H, rand, { depth: 0.75 });
    g = far.getContext('2d');
    for (const s of farCave.shapes) {
        pathFrom(g, s.pts, true);
        g.fillStyle = 'rgb(9, 13, 18)';
        g.fill();
        pathFrom(g, s.edge, false);
        g.strokeStyle = `rgba(${hud}, 0.09)`;
        g.lineWidth = 1;
        g.stroke();
    }

    const near = make(W, H);
    const nearCave = caveLayer(W, H, rand, { depth: 1 });
    g = near.getContext('2d');
    for (const s of nearCave.shapes) {
        pathFrom(g, s.pts, true);
        g.fillStyle = 'rgb(1, 2, 3)';
        g.fill();
        pathFrom(g, s.edge, false);
        g.strokeStyle = `rgba(${hud}, 0.18)`;
        g.lineWidth = 1.5;
        g.lineJoin = 'round';
        g.stroke();
    }
    return { bg, far, near, tips: nearCave.tips.map(([x, y]) => [x - OVERSCAN, y - OVERSCAN]), floorY: h * 0.9 };
}

// Bat silhouette in "bat units" (body ~1 wide). flap in [-1, 1] lifts the wing tips.
function drawBat(ctx, x, y, size, flap, facing, rim) {
    const half = [
        [0.2, -1.1], [0.42, -1.55], [0.5, -0.85],                  // ear
        [1.6, -0.9 - flap * 1.1], [3.0, -1.0 - flap * 2.0], [4.4, -0.5 - flap * 2.6], // leading edge to tip
        [3.6, -0.15 - flap * 1.7], [3.1, 0.35 - flap * 1.1],       // scallops
        [2.4, 0.05 - flap * 0.9], [1.9, 0.55 - flap * 0.6],
        [1.2, 0.25 - flap * 0.3], [0.55, 0.85], [0, 1.35],         // trailing edge to tail
    ];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size * facing, size);
    ctx.beginPath();
    ctx.moveTo(0, -1.0);
    for (const [px, py] of half) ctx.lineTo(px, py);
    for (let i = half.length - 2; i >= 0; i--) ctx.lineTo(-half[i][0], half[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgb(1, 1, 2)';
    ctx.fill();
    ctx.lineWidth = 0.24;
    ctx.strokeStyle = rim;
    ctx.stroke();
    ctx.restore();
}

function spawnFlock(w, h, rand) {
    const dir = rand() < 0.5 ? 1 : -1;
    const count = rand() < 0.25 ? 1 : 3 + Math.floor(rand() * 7);
    const depth = 0.25 + rand() * 0.75;                       // whole flock at roughly one depth
    const y0 = h * (0.15 + rand() * 0.45);
    return Array.from({ length: count }, (_, i) => {
        const d = Math.min(1, Math.max(0.2, depth + (rand() - 0.5) * 0.25));
        return {
            x: dir > 0 ? -40 - i * (18 + rand() * 40) : w + 40 + i * (18 + rand() * 40),
            baseY: y0 + (rand() - 0.5) * h * 0.12,
            vx: dir * (45 + d * 110) * (0.85 + rand() * 0.3),
            amp: 6 + rand() * 18, wobble: 0.6 + rand() * 1.2, phase: rand() * 6.28,
            flapRate: 12 + rand() * 7, size: 1.8 + d * 4.6, depth: d, facing: dir,
        };
    });
}

const IdleCave = ({ className = '' }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext?.('2d');
        if (!ctx) return undefined;                           // no canvas (tests, ancient browsers)
        const hud = (getComputedStyle(canvas).getPropertyValue('--hud') || '34 189 238').trim().split(/\s+/).join(', ');
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const rand = rng(Date.now());

        let w = 0; let h = 0; let scene = null;
        let bats = [];
        let drips = [];
        let mist = [];
        let nextFlock = 1 + rand() * 2;
        let nextDrip = 3 + rand() * 5;
        let raf = 0; let last = 0; let t = 0;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            w = Math.round(canvas.clientWidth * dpr);
            h = Math.round(canvas.clientHeight * dpr);
            canvas.width = w; canvas.height = h;
            scene = buildScene(w, h, hud);
            bats = []; drips = [];
            mist = Array.from({ length: 6 }, () => ({ x: rand() * w, y: h * (0.84 + rand() * 0.1),
                r: w * (0.18 + rand() * 0.2), speed: (rand() < 0.5 ? -1 : 1) * (4 + rand() * 10), a: 0.025 + rand() * 0.035 }));
        };

        const frame = (dt) => {
            t += dt;
            // Parallax drift: a few pixels over minutes, keeps the rock edges from burning in
            const ox = Math.sin(t / 47) * 8; const oy = Math.cos(t / 61) * 5;
            ctx.drawImage(scene.bg, 0, 0);
            ctx.drawImage(scene.far, ox * 0.35 - OVERSCAN, oy * 0.35 - OVERSCAN);

            if ((nextFlock -= dt) <= 0) { bats.push(...spawnFlock(w, h, rand)); nextFlock = 5 + rand() * 9; }
            const drawBats = (near) => {
                for (const b of bats) {
                    if ((b.depth > 0.6) !== near) continue;
                    const flap = Math.sin(t * b.flapRate + b.phase);
                    const y = b.baseY + Math.sin(t * b.wobble + b.phase) * b.amp - flap * b.size * 0.6;
                    drawBat(ctx, b.x, y, b.size, flap, b.facing, `rgba(${hud}, ${0.22 + b.depth * 0.45})`);
                }
            };
            for (const b of bats) b.x += b.vx * dt;
            bats = bats.filter((b) => b.x > -120 && b.x < w + 120);

            drawBats(false);                                  // far bats behind the near rock
            ctx.drawImage(scene.near, ox - OVERSCAN, oy - OVERSCAN);
            drawBats(true);

            // Water drips from stalactite tips, with a ripple where they land
            if ((nextDrip -= dt) <= 0 && scene.tips.length) {
                const [x, y] = scene.tips[Math.floor(rand() * scene.tips.length)];
                drips.push({ x: x + ox, y: y + oy, vy: 0, landed: 0 });
                nextDrip = 4 + rand() * 7;
            }
            for (const d of drips) {
                if (!d.landed) {
                    d.vy += 900 * dt; d.y += d.vy * dt;
                    if (d.y >= scene.floorY) { d.y = scene.floorY; d.landed = 0.001; }
                    ctx.fillStyle = `rgba(${hud}, 0.55)`;
                    ctx.fillRect(d.x - 1, d.y - 4, 2, 5);
                } else {
                    d.landed += dt;
                    const r = d.landed * 40;
                    ctx.strokeStyle = `rgba(${hud}, ${Math.max(0, 0.35 - d.landed * 0.35)})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.ellipse(d.x, d.y, r, r * 0.25, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            drips = drips.filter((d) => !d.landed || d.landed < 1);

            // Floor mist: soft radial puffs drifting along the floor (wrap around)
            for (const m of mist) {
                const x = (((m.x + t * m.speed) % (w + m.r * 2)) + (w + m.r * 2)) % (w + m.r * 2) - m.r;
                ctx.save();
                ctx.translate(x, m.y);
                ctx.scale(1, 0.22);
                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, m.r);
                grad.addColorStop(0, `rgba(${hud}, ${m.a})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(-m.r, -m.r, m.r * 2, m.r * 2);
                ctx.restore();
            }
        };

        const loop = (now) => {
            raf = requestAnimationFrame(loop);
            if (document.hidden) { last = now; return; }
            const dt = (now - last) / 1000;
            if (dt < 1 / FPS) return;
            last = now;
            frame(Math.min(dt, 0.1));                          // a long pause shouldn't teleport bats
        };

        resize();
        if (reduced) frame(0);
        else { last = performance.now(); raf = requestAnimationFrame(loop); }
        const onResize = () => { resize(); if (reduced) frame(0); };
        window.addEventListener('resize', onResize);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 w-full h-full ${className}`} />;
};

export default IdleCave;
