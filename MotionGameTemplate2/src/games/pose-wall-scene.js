// src/scenes/pose-wall-scene.js

// --- Helper classes 同數據 (不變) ---
class VectorUtils { static getAngle(p1, p2, p3) { if (!p1 || !p2 || !p3) return 0; const a = Math.hypot(p1.x - p2.x, p1.y - p2.y); const b = Math.hypot(p3.x - p2.x, p3.y - p2.y); const c = Math.hypot(p3.x - p1.x, p3.y - p1.y); if (a === 0 || b === 0) return 0; let angle = Math.acos((a * a + b * b - c * c) / (2 * a * b)); return angle * (180 / Math.PI); } }
const POSE_LIBRARY = { 'T_POSE': { name: 'T-Pose', rules: [ { type: 'angle', points: [11, 13, 15], targetAngle: 180, weight: 2 }, { type: 'angle', points: [12, 14, 16], targetAngle: 180, weight: 2 }, { type: 'y_similarity', points: [13, 14], weight: 1 }, ], }, 'Y_POSE': { name: 'Y-Pose', rules: [ { type: 'angle', points: [23, 11, 13], targetAngle: 135, weight: 2 }, { type: 'angle', points: [24, 12, 14], targetAngle: 135, weight: 2 }, { type: 'angle', points: [11, 13, 15], targetAngle: 180, weight: 1 }, { type: 'angle', points: [12, 14, 16], targetAngle: 180, weight: 1 }, ], } };
class PoseMatcher { constructor(targetPoseName) { this.target = POSE_LIBRARY[targetPoseName]; } calculateSimilarity(landmarks) { if (!landmarks || !this.target) return 0; let totalScore = 0; let totalWeight = 0; for (const rule of this.target.rules) { const allPointsVisible = rule.points.every(idx => landmarks[idx] && (landmarks[idx].visibility === undefined || landmarks[idx].visibility > 0.5)); if (!allPointsVisible) continue; let score = 0; const angleTolerance = 30; const yTolerance = 0.1; if (rule.type === 'angle') { const [p1, p2, p3] = rule.points.map(idx => landmarks[idx]); const currentAngle = VectorUtils.getAngle(p1, p2, p3); const angleDiff = Math.abs(currentAngle - rule.targetAngle); score = Math.max(0, 1 - (angleDiff / angleTolerance)); } else if (rule.type === 'y_similarity') { const [p1, p2] = rule.points.map(idx => landmarks[idx]); const yDiff = Math.abs(p1.y - p2.y); score = Math.max(0, 1 - (yDiff / yTolerance)); } totalScore += score * rule.weight; totalWeight += rule.weight; } return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0; } }
// --- Helper 結束 ---


export class PoseWallScene {
    constructor() {
        this.loopHandle = null; this.resultsListener = null;
        this.canvas = null; this.ctx = null; this.debugInfo = null;
        this.walls = []; this.spawnWallInterval = null;
        this.currentPoseMatcher = null; this.similarityScore = 0;
        this.latestPoseLandmarks = null;
    }

    render() {
        return `
            <style>
                .pw-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #000; }
                .pw-scene #output-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .pw-scene #ui-layer { position: absolute; top: 80px; left: 20px; z-index: 3; color: white; font-family: monospace; font-size: 1.2em; text-shadow: 1px 1px 2px black; pointer-events: none; }
            </style>
            <div class="pw-scene">
                <a class="back-button" data-scene-changer="launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="output-canvas"></canvas>
                <div id="ui-layer"><div id="debug-info"></div></div>
            </div>
        `;
    }

    init() {
        // 為咗同時有姿勢數據同手部指針，我哋強制用 holistic mode
        window.motionEngine.setMode('holistic');
        // 重新顯示黃點指針 UI
        window.motionEngine.outputCanvas.style.display = 'block';

        this.canvas = document.getElementById('output-canvas'); this.ctx = this.canvas.getContext('2d');
        this.debugInfo = document.getElementById('debug-info');
        this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;

        this._bindEvents();
        this.startGame();
    }

    destroy() {
        console.log("Destroying PoseWallScene...");
        if (this.loopHandle) { cancelAnimationFrame(this.loopHandle); }
        if (this.spawnWallInterval) { clearInterval(this.spawnWallInterval); }
        
        // 離開場景時，將 engine 切換返去默認嘅 hands 模式
        window.motionEngine.setMode('hands');

        const removeListener = (listeners, handler) => {
            if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); }
        };
        removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener);
    }

    _bindEvents() {
        document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => {
            window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger);
        });

        // 監聽 Motion Engine 嘅數據更新
        this.resultsListener = (results) => {
            // Holistic model 會提供我哋需要嘅所有嘢
            this.latestPoseLandmarks = results.poseLandmarks;
        };
        window.motionEngine.on('results-updated', this.resultsListener);
    }

    startGame() {
        this.walls = [];
        this.spawnWall();
        this.spawnWallInterval = setInterval(() => this.spawnWall(), 5000);
        
        if (!this.loopHandle) {
            this.gameLoop();
        }
    }

    spawnWall() {
        const poseNames = Object.keys(POSE_LIBRARY);
        const randomPoseName = poseNames[Math.floor(Math.random() * poseNames.length)];
        this.currentPoseMatcher = new PoseMatcher(randomPoseName);
        this.walls.push({ z: 100, speed: 0.3, poseName: randomPoseName, passed: false, state: 'approaching' });
    }

    update() {
        for (let i = this.walls.length - 1; i >= 0; i--) {
            const wall = this.walls[i];
            wall.z -= wall.speed;
            if (wall.z < 10 && wall.z > 5 && wall.state === 'approaching') {
                 this.similarityScore = this.currentPoseMatcher.calculateSimilarity(this.latestPoseLandmarks);
                 if(this.similarityScore > 75) wall.passed = true;
                 wall.state = 'passed-check';
            }
            if (wall.z < -10) {
                this.walls.splice(i, 1);
            }
        }
        if (this.currentPoseMatcher) {
            this.debugInfo.innerHTML = `Target Pose: ${this.currentPoseMatcher.target.name}<br>Match Score: ${this.similarityScore.toFixed(1)}%`;
        }
    }

    // === 徹底重寫 DRAW 方法 ===
    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, w, h);

        // 繪製骨架 (如果存在)
        if (this.latestPoseLandmarks) {
            this.ctx.save();
            this.ctx.translate(w, 0); this.ctx.scale(-1, 1); // 鏡像反轉
            // 用 drawConnectors 畫全身骨架
            drawConnectors(this.ctx, this.latestPoseLandmarks, POSE_CONNECTIONS, { color: 'rgba(0, 255, 0, 0.7)', lineWidth: 3 });
            this.ctx.restore();
        }
        
        // 繪製牆壁
        this.walls.sort((a, b) => b.z - a.z); // 由遠到近畫
        for (const wall of this.walls) {
            const scale = Math.max(0, (100 - wall.z) / 100);
            
            // 牆洞嘅大小，由 0 放大到幾乎佔滿屏幕
            const holeWidth = w * scale;
            const holeHeight = h * scale;
            const holeX = (w - holeWidth) / 2;
            const holeY = (h - holeHeight) / 2;

            this.ctx.save();
            this.ctx.globalAlpha = Math.min(1, scale * 2);

            let wallColor;
            if(wall.state === 'approaching') wallColor = '#ff00ff';
            else wallColor = wall.passed ? '#00ffff' : '#ff4444';

            // --- 新嘅、更簡單嘅繪圖方法 ---
            this.ctx.strokeStyle = wallColor;
            this.ctx.lineWidth = Math.max(2, 25 * scale); // 邊框闊度隨距離變化
            this.ctx.strokeRect(holeX, holeY, holeWidth, holeHeight);
            // --- 結束 ---

            // 畫出牆壁中間嘅文字
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `bold ${Math.max(12, 100 * scale)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.globalAlpha = 1;
            this.ctx.fillText(POSE_LIBRARY[wall.poseName].name, w / 2, h / 2);
            
            this.ctx.restore();
        }
    }
    
    gameLoop() {
        this.update();
        this.draw();
        this.loopHandle = requestAnimationFrame(() => this.gameLoop());
    }
}