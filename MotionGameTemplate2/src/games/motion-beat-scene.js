// src/scenes/motion-beat-scene.js

class PointSmoother { /* ... 不變 ... */ constructor(smoothingFactor = 0.8) { this.smoothingFactor = smoothingFactor; this.smoothedPoint = null; } update(rawPoint) { if (!rawPoint) return this.smoothedPoint; if (!this.smoothedPoint) { this.smoothedPoint = { ...rawPoint }; } else { this.smoothedPoint.x = this.smoothingFactor * this.smoothedPoint.x + (1 - this.smoothingFactor) * rawPoint.x; this.smoothedPoint.y = this.smoothingFactor * this.smoothedPoint.y + (1 - this.smoothingFactor) * rawPoint.y; } return this.smoothedPoint; } reset() { this.smoothedPoint = null; } }

export class MotionBeatScene {
    constructor() { /* ... 不變 ... */ this.loopHandle = null; this.resultsListener = null; this.canvas = null; this.ctx = null; this.ui = {}; this.limbs = { LEFT_HAND:  { name: '左手', poseIndex: [15, 17, 19], x: 0.25, y: 0.4, color: '#3498db', radius: 50 }, RIGHT_HAND: { name: '右手', poseIndex: [16, 18, 20], x: 0.75, y: 0.4, color: '#e74c3c', radius: 50 }, LEFT_FOOT:  { name: '左腳', poseIndex: [27, 29], x: 0.35, y: 0.8, color: '#f1c40f', radius: 60 }, RIGHT_FOOT: { name: '右腳', poseIndex: [28, 30], x: 0.65, y: 0.8, color: '#2ecc71', radius: 60 } }; this.limbPositions = {}; this.notes = []; this.particles = []; this.score = 0; this.combo = 0; this.spawnInterval = null; this.latestPoseLandmarks = null; this.limbSmoothers = { LEFT_HAND: new PointSmoother(0.6), RIGHT_HAND: new PointSmoother(0.6), LEFT_FOOT: new PointSmoother(0.6), RIGHT_FOOT: new PointSmoother(0.6), }; }
    render() { /* ... 不變 ... */ return ` <style> .mb-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #0c0c1e; } .mb-scene #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; } .mb-scene #ui-layer { position: absolute; top: 20px; right: 20px; z-index: 3; color: white; text-shadow: 2px 2px 4px black; text-align: right; pointer-events: none; } .mb-scene #score { font-size: 3em; font-weight: bold; } .mb-scene #combo { font-size: 1.5em; color: #ffd700; height: 1.5em; } </style> <div class="mb-scene"> <a class="back-button" data-scene-changer="launcher" data-motion-activatable> <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg> </a> <canvas id="game-canvas"></canvas> <div id="ui-layer"> <div id="score">0</div> <div id="combo"></div> </div> </div> `; }
    init() { /* ... 不變 ... */ window.motionEngine.setMode('pose'); window.motionEngine.setPointerHand('left'); window.motionEngine.outputCanvas.style.display = 'block'; this.canvas = document.getElementById('game-canvas'); this.ctx = this.canvas.getContext('2d'); this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; this.ui.scoreEl = document.getElementById('score'); this.ui.comboEl = document.getElementById('combo'); for (const key in this.limbs) { const limb = this.limbs[key]; limb.screenX = limb.x * this.canvas.width; limb.screenY = limb.y * this.canvas.height; this.limbPositions[key] = { x: -1000, y: -1000 }; } this._bindEvents(); this.startGame(); }
    destroy() { /* ... 不變 ... */ console.log("Destroying MotionBeatScene..."); if (this.loopHandle) cancelAnimationFrame(this.loopHandle); if (this.spawnInterval) clearInterval(this.spawnInterval); window.motionEngine.setPointerHand('right'); window.motionEngine.setMode('hands'); const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } }; removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener); }
    _bindEvents() { /* ... 不變 ... */ document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => { window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger); }); this.resultsListener = (results) => { this.latestPoseLandmarks = results.poseLandmarks; }; window.motionEngine.on('results-updated', this.resultsListener); }
    startGame() { /* ... 不變 ... */ this.score = 0; this.combo = 0; this.notes = []; this.particles = []; this.updateUI(); if (this.spawnInterval) clearInterval(this.spawnInterval); this.spawnInterval = setInterval(() => this.spawnNote(), 1000); Object.values(this.limbSmoothers).forEach(s => s.reset()); if (!this.loopHandle) this.gameLoop(); }

    // === 核心修改：修正坐標轉換 ===
    updateLimbPositions() {
        if (!this.latestPoseLandmarks) return;
        
        const w = this.canvas.width, h = this.canvas.height;
        const landmarks = this.latestPoseLandmarks;

        for (const key in this.limbs) {
            const limbConfig = this.limbs[key];
            let rawPoint = null; // 0-1 坐標

            if (key.includes('HAND')) {
                const [wrist, pinky, index] = limbConfig.poseIndex.map(i => landmarks[i]);
                if (wrist && pinky && index && wrist.visibility > 0.5) {
                    rawPoint = { 
                        x: (wrist.x + pinky.x + index.x) / 3,
                        y: (wrist.y + pinky.y + index.y) / 3
                    };
                }
            } else { // 腳
                const [ankle, heel] = limbConfig.poseIndex.map(i => landmarks[i]);
                if (ankle && heel && ankle.visibility > 0.5) {
                    const vecX = ankle.x - heel.x;
                    const vecY = ankle.y - heel.y;
                    rawPoint = { 
                        x: ankle.x + vecX * 0.8,
                        y: ankle.y + vecY * 0.8
                    };
                }
            }
            
            const smoothedPoint = this.limbSmoothers[key].update(rawPoint);

            if (smoothedPoint) {
                // 喺呢度先做屏幕坐標轉換
                this.limbPositions[key].x = (1 - smoothedPoint.x) * w;
                this.limbPositions[key].y = smoothedPoint.y * h;
            } else {
                this.limbPositions[key].x = -1000;
            }
        }
    }
    // ======================================
    
    spawnNote() { /* ... 不變 ... */ const limbKeys = Object.keys(this.limbs); const randomLimbKey = limbKeys[Math.floor(Math.random() * limbKeys.length)]; this.notes.push({ target: randomLimbKey, z: 100, speed: 1.2, hit: false, missed: false }); }
    update() { /* ... 不變 ... */ this.updateLimbPositions(); for (let i = this.notes.length - 1; i >= 0; i--) { const note = this.notes[i]; note.z -= note.speed; if (note.z < 15 && note.z > -15 && !note.hit && !note.missed) { const targetLimb = this.limbs[note.target]; const limbPos = this.limbPositions[note.target]; const distance = Math.hypot(limbPos.x - targetLimb.screenX, limbPos.y - targetLimb.screenY); if (distance < targetLimb.radius) { note.hit = true; this.score += 10 + this.combo * 5; this.combo++; this.createExplosion(targetLimb.screenX, targetLimb.screenY, targetLimb.color); this.updateUI(); } } if (note.z < -20) { if (!note.hit) { this.combo = 0; note.missed = true; this.updateUI(); } this.notes.splice(i, 1); } } this.particles.forEach(p => { p.life--; p.radius *= 0.95; p.x += p.vx; p.y += p.vy; }); this.particles = this.particles.filter(p => p.life > 0); }

    // === 核心修改：加入骨架繪製 ===
    draw() {
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        // 繪製骨架 (用於調試)
        if (this.latestPoseLandmarks) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3; // 令骨架半透明
            this.ctx.translate(w, 0); this.ctx.scale(-1, 1); // 鏡像
            drawConnectors(this.ctx, this.latestPoseLandmarks, POSE_CONNECTIONS, { color: 'white', lineWidth: 2 });
            this.ctx.restore();
        }
        
        // 畫四肢嘅目標圈 ... (後面不變)
        for (const key in this.limbs) { const limb = this.limbs[key]; this.ctx.strokeStyle = limb.color; this.ctx.lineWidth = 4; this.ctx.globalAlpha = 0.5; this.ctx.beginPath(); this.ctx.arc(limb.screenX, limb.screenY, limb.radius, 0, 2 * Math.PI); this.ctx.stroke(); this.ctx.globalAlpha = 1; }
        for (const key in this.limbPositions) { const limb = this.limbs[key]; const pos = this.limbPositions[key]; this.ctx.fillStyle = limb.color; this.ctx.beginPath(); this.ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI); this.ctx.fill(); }
        this.notes.sort((a,b) => b.z - a.z); for (const note of this.notes) { if (note.hit) continue; const target = this.limbs[note.target]; const scale = Math.max(0, (100 - note.z) / 100); const size = target.radius * 1.5 * scale; this.ctx.save(); this.ctx.translate(target.screenX, target.screenY); this.ctx.rotate(scale * Math.PI); this.ctx.fillStyle = target.color; this.ctx.globalAlpha = scale * 1.5; this.ctx.fillRect(-size / 2, -size / 2, size, size); this.ctx.restore(); }
        this.particles.forEach(p => { this.ctx.fillStyle = p.color; this.ctx.globalAlpha = p.life / 40; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI); this.ctx.fill(); }); this.ctx.globalAlpha = 1;
    }
    // ======================================

    createExplosion(x, y, color) { /* ... 不變 ... */ for (let i = 0; i < 20; i++) { const angle = Math.random() * Math.PI * 2; const speed = 2 + Math.random() * 5; this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 2 + Math.random() * 3, life: 40, color }); } }
    updateUI() { /* ... 不變 ... */ this.ui.scoreEl.textContent = this.score; this.ui.comboEl.textContent = this.combo > 1 ? `x${this.combo} Combo!` : ''; }
    gameLoop() { /* ... 不變 ... */ this.update(); this.draw(); this.loopHandle = requestAnimationFrame(() => this.gameLoop()); }
}