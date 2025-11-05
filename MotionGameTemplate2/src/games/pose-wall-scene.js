// src/games/pose-wall-scene.js (更新後)
// [FIX #1, #4, #7] 顯示指針並修復文字反轉問題

import { BaseScene } from '../core/base-scene.js';

class VectorUtils {
    static getAngle(p1, p2, p3) {
        if (!p1 || !p2 || !p3) return 0;
        const a = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const b = Math.hypot(p3.x - p2.x, p3.y - p2.y);
        const c = Math.hypot(p3.x - p1.x, p3.y - p1.y);
        if (a === 0 || b === 0) return 0;
        return Math.acos((a * a + b * b - c * c) / (2 * a * b)) * (180 / Math.PI);
    }
}

const POSE_LIBRARY = {
    'T_POSE': {
        name: 'T-Pose',
        rules: [
            { type: 'angle', points: [11, 13, 15], targetAngle: 180, weight: 2 },
            { type: 'angle', points: [12, 14, 16], targetAngle: 180, weight: 2 },
            { type: 'y_similarity', points: [13, 14], weight: 1 },
        ]
    },
    'Y_POSE': {
        name: 'Y-Pose',
        rules: [
            { type: 'angle', points: [23, 11, 13], targetAngle: 135, weight: 2 },
            { type: 'angle', points: [24, 12, 14], targetAngle: 135, weight: 2 },
            { type: 'angle', points: [11, 13, 15], targetAngle: 180, weight: 1 },
            { type: 'angle', points: [12, 14, 16], targetAngle: 180, weight: 1 },
        ]
    }
};

class PoseMatcher {
    constructor(poseName) {
        this.targetPose = POSE_LIBRARY[poseName];
    }
    calculateSimilarity(landmarks) {
        if (!landmarks || !this.targetPose) return 0;
        let totalScore = 0;
        let totalWeight = 0;

        for (const rule of this.targetPose.rules) {
            const pointsAreVisible = rule.points.every(i => landmarks[i] && (landmarks[i].visibility === undefined || landmarks[i].visibility > 0.5));
            if (!pointsAreVisible) continue;

            let similarity = 0;
            const angleTolerance = 30;
            const ySimilarityTolerance = 0.1;

            if (rule.type === 'angle') {
                const [p1, p2, p3] = rule.points.map(i => landmarks[i]);
                const currentAngle = VectorUtils.getAngle(p1, p2, p3);
                similarity = Math.max(0, 1 - Math.abs(currentAngle - rule.targetAngle) / angleTolerance);
            } else if (rule.type === 'y_similarity') {
                const [p1, p2] = rule.points.map(i => landmarks[i]);
                similarity = Math.max(0, 1 - Math.abs(p1.y - p2.y) / ySimilarityTolerance);
            }
            
            totalScore += similarity * rule.weight;
            totalWeight += rule.weight;
        }

        return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    }
}

export class PoseWallScene extends BaseScene {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.debugInfo = null;

        this.walls = [];
        this.spawnWallInterval = null;
        this.currentPoseMatcher = null;
        this.similarityScore = 0;
    }

    renderHTML() {
        return `
            <style>
                .pw-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #000; }
                .pw-scene #output-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; transform: scaleX(-1); }
                .pw-scene #ui-layer { position: absolute; top: 80px; left: 20px; z-index: 3; color: white; font-family: monospace; font-size: 1.2em; text-shadow: 1px 1px 2px black; pointer-events: none; }
            </style>
            <div class="pw-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="output-canvas"></canvas>
                <div id="ui-layer"><div id="debug-info"></div></div>
            </div>
        `;
    }

    onInit() {
        this.motionEngine.setMode('holistic'); // Holistic 包含 pose
        // [FIX #1, #4] 顯示指針畫布，確保返回按鈕可以被觸發
        this.motionEngine.showPointer(true);

        this.canvas = document.getElementById('output-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.debugInfo = document.getElementById('debug-info');
        
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.listenToMotionResults();
        this.startGame();
    }

    onDestroy() {
        if (this.spawnWallInterval) clearInterval(this.spawnWallInterval);
        this.spawnWallInterval = null;
        this.walls = [];
        this.canvas = null;
        this.ctx = null;
        console.log("[PoseWallScene] Timer and walls cleared.");
    }

    startGame() {
        this.walls = [];
        this.spawnWall();
        if (this.spawnWallInterval) clearInterval(this.spawnWallInterval);
        this.spawnWallInterval = setInterval(() => this.spawnWall(), 5000);
    }

    spawnWall() {
        const poseNames = Object.keys(POSE_LIBRARY);
        const randomPoseName = poseNames[Math.floor(Math.random() * poseNames.length)];
        this.currentPoseMatcher = new PoseMatcher(randomPoseName);
        this.walls.push({
            z: 100,
            speed: 0.3,
            poseName: randomPoseName,
            passed: false,
            state: 'approaching'
        });
    }

    onUpdate() {
        if (!this.currentPoseMatcher) return;

        for (let i = this.walls.length - 1; i >= 0; i--) {
            const wall = this.walls[i];
            wall.z -= wall.speed;

            if (wall.z < 10 && wall.z > 5 && wall.state === 'approaching') {
                this.similarityScore = this.currentPoseMatcher.calculateSimilarity(this.latestResults?.poseLandmarks);
                if (this.similarityScore > 75) {
                    wall.passed = true;
                }
                wall.state = 'passed-check';
            }

            if (wall.z < -10) {
                this.walls.splice(i, 1);
            }
        }
        
        this.debugInfo.innerHTML = `Target Pose: ${this.currentPoseMatcher.targetPose.name}<br>Match Score: ${this.similarityScore.toFixed(1)}%`;
    }

    onDraw() {
        if (!this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, w, h);

        if (this.latestResults && this.latestResults.poseLandmarks) {
            drawConnectors(this.ctx, this.latestResults.poseLandmarks, POSE_CONNECTIONS, { color: 'rgba(0, 255, 0, .7)', lineWidth: 3 });
        }

        this.walls.sort((a, b) => b.z - a.z);
        for (const wall of this.walls) {
            const scale = Math.max(0, (100 - wall.z) / 100);
            const holeWidth = w * scale;
            const holeHeight = h * scale;
            const holeX = (w - holeWidth) / 2;
            const holeY = (h - holeHeight) / 2;

            this.ctx.save();
            this.ctx.globalAlpha = Math.min(1, scale * 2);
            
            let wallColor;
            if (wall.state === 'approaching') {
                wallColor = '#f0f';
            } else {
                wallColor = wall.passed ? '#0ff' : '#f44';
            }

            this.ctx.strokeStyle = wallColor;
            this.ctx.lineWidth = Math.max(2, 25 * scale);
            this.ctx.strokeRect(holeX, holeY, holeWidth, holeHeight);
            
            // [FIX #7] 修正文字反轉問題
            // 繪製文字前，臨時將坐標系反轉返嚟
            this.ctx.save();
            this.ctx.scale(-1, 1); // 反轉 X 軸
            this.ctx.translate(-w, 0); // 將原點移回左上角
            
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `bold ${Math.max(12, 100 * scale)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.globalAlpha = 1;
            this.ctx.fillText(POSE_LIBRARY[wall.poseName].name, w / 2, h / 2);
            
            this.ctx.restore(); // 還原坐標系，只影響文字繪製

            this.ctx.restore(); // 還原 globalAlpha
        }
    }
}