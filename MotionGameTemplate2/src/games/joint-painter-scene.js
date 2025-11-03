// src/scenes/joint-painter-scene.js

import { getPalmCenterFromPose } from '../motion-engine.js';
class PointSmoother { constructor(smoothingFactor = 0.7) { this.smoothingFactor = smoothingFactor; this.smoothedPoint = null; } update(rawPoint) { if (!rawPoint) { this.smoothedPoint = null; return null; } if (!this.smoothedPoint) { this.smoothedPoint = { ...rawPoint }; } else { this.smoothedPoint.x = this.smoothingFactor * this.smoothedPoint.x + (1 - this.smoothingFactor) * rawPoint.x; this.smoothedPoint.y = this.smoothingFactor * this.smoothedPoint.y + (1 - this.smoothingFactor) * rawPoint.y; } return this.smoothedPoint; } reset() { this.smoothedPoint = null; } }

export class JointPainterScene {
    constructor() {
        this.resultsListener = null;
        this.drawingCtx = null; this.skeletonCtx = null;
        
        // === 修改：唔再用 joint index，而係用手嘅標識 ===
        this.brushHand = 'left'; // 'left' or 'right'
        // ============================================

        this.lastBrushPosition = null; this.isDrawing = false;
        this.brushSmoother = new PointSmoother(0.6);
        this.latestPoseLandmarks = null;
    }

    render() {
        return `
            <style>
                .jp-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #1a1d22; }
                .jp-scene #drawing-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .jp-scene #skeleton-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; opacity: 0.5; transform: scaleX(-1); }
                .jp-scene #controls { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 4; background-color: rgba(0,0,0,0.5); padding: 10px; border-radius: 10px; display: flex; flex-wrap: wrap; gap: 10px; pointer-events: auto;}
                .jp-scene .control-btn { padding: 10px 15px; font-size: 1em; background-color: #444; color: white; border: 2px solid transparent; border-radius: 8px; cursor: pointer; }
                .jp-scene .control-btn.active { border-color: #ffd700; background-color: #666; }
                .jp-scene #clear-btn { background-color: #c0392b; }
            </style>
            <div class="jp-scene">
                <a class="back-button" data-scene-changer="launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="drawing-canvas"></canvas>
                <canvas id="skeleton-canvas"></canvas>
                <div id="controls">
                    <!-- === 修改：按鈕文字改為手掌 === -->
                    <button id="brush-left-hand" class="control-btn active" data-motion-activatable>左手</button>
                    <button id="brush-right-hand" class="control-btn" data-motion-activatable>右手</button>
                    <button id="clear-btn" class="control-btn" data-motion-activatable>清除畫布</button>
                </div>
            </div>
        `;
    }

    init() {
        window.motionEngine.setMode('pose');
        window.motionEngine.setPointerHand('left');
        window.motionEngine.outputCanvas.style.display = 'block';

        const drawingCanvas = document.getElementById('drawing-canvas'); const skeletonCanvas = document.getElementById('skeleton-canvas');
        this.drawingCtx = drawingCanvas.getContext('2d'); this.skeletonCtx = skeletonCanvas.getContext('2d');
        drawingCanvas.width = skeletonCanvas.width = window.innerWidth; drawingCanvas.height = skeletonCanvas.height = window.innerHeight;
        this._bindEvents();
    }

    destroy() {
        console.log("Destroying JointPainterScene...");
        window.motionEngine.setPointerHand('right'); window.motionEngine.setMode('hands');
        const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } };
        removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener);
    }

    _bindEvents() {
        document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger));

        const setBrush = (hand, buttonId) => {
            this.brushHand = hand;
            document.querySelectorAll('#controls .control-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(buttonId).classList.add('active');
            this.brushSmoother.reset(); this.isDrawing = false; this.lastBrushPosition = null;
        };

        document.getElementById('brush-left-hand').addEventListener('click', () => setBrush('left', 'brush-left-hand'));
        document.getElementById('brush-right-hand').addEventListener('click', () => setBrush('right', 'brush-right-hand'));
        document.getElementById('clear-btn').addEventListener('click', () => { this.drawingCtx.clearRect(0, 0, this.drawingCtx.canvas.width, this.drawingCtx.canvas.height); });
        
        this.resultsListener = (results) => { this.latestPoseLandmarks = results.poseLandmarks; this.onPoseResults(); };
        window.motionEngine.on('results-updated', this.resultsListener);
    }

    // === 核心修改：用 getPalmCenterFromPose 估算畫筆位置 ===
    onPoseResults() {
        const w = this.skeletonCtx.canvas.width; const h = this.skeletonCtx.canvas.height;
        this.skeletonCtx.clearRect(0, 0, w, h);

        if (this.latestPoseLandmarks) {
            drawConnectors(this.skeletonCtx, this.latestPoseLandmarks, POSE_CONNECTIONS, { color: 'white', lineWidth: 2 });
            
            // 調用公共輔助函數，獲取畫筆手嘅手掌中心
            const rawBrushPoint = getPalmCenterFromPose(this.latestPoseLandmarks, this.brushHand);
            
            if (rawBrushPoint) {
                const smoothedLandmark = this.brushSmoother.update(rawBrushPoint);
                if (smoothedLandmark) {
                    this.skeletonCtx.fillStyle = 'yellow'; this.skeletonCtx.beginPath();
                    this.skeletonCtx.arc(smoothedLandmark.x * w, smoothedLandmark.y * h, 15, 0, 2 * Math.PI);
                    this.skeletonCtx.fill();
                    this.updateDrawing(smoothedLandmark);
                }
            } else {
                this.isDrawing = false;
                this.lastBrushPosition = null;
            }
        }
    }

    updateDrawing(landmark) {
        const w = this.drawingCtx.canvas.width, h = this.drawingCtx.canvas.height;
        const currentPos = { x: (1 - landmark.x) * w, y: landmark.y * h };
        if (!this.isDrawing) {
            this.isDrawing = true;
        } else {
            this.drawingCtx.strokeStyle = 'cyan'; this.drawingCtx.lineWidth = 10;
            this.drawingCtx.lineCap = 'round'; this.drawingCtx.lineJoin = 'round';
            this.drawingCtx.beginPath(); this.drawingCtx.moveTo(this.lastBrushPosition.x, this.lastBrushPosition.y);
            this.drawingCtx.lineTo(currentPos.x, currentPos.y); this.drawingCtx.stroke();
        }
        this.lastBrushPosition = currentPos;
    }
}