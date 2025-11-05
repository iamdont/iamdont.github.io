// src/games/joint-painter-scene.js (更新後)
// [FIX #1, #3] 顯示指針並設置獨立平滑度

import { BaseScene } from '../core/base-scene.js';

class PointSmoother {
    constructor(smoothingFactor = 0.7) {
        this.smoothingFactor = smoothingFactor;
        this.point = null;
    }
    update(rawPoint) {
        if (!rawPoint) {
            this.point = null;
            return null;
        }
        if (!this.point) {
            this.point = { ...rawPoint };
        } else {
            this.point.x = this.smoothingFactor * this.point.x + (1 - this.smoothingFactor) * rawPoint.x;
            this.point.y = this.smoothingFactor * this.point.y + (1 - this.smoothingFactor) * rawPoint.y;
        }
        return this.point;
    }
    reset() {
        this.point = null;
    }
}

export class JointPainterScene extends BaseScene {
    constructor() {
        super();
        this.drawingCtx = null;
        this.skeletonCtx = null;
        this.brushHand = 'left';
        this.lastBrushPosition = null;
        this.isDrawing = false;
        this.brushSmoother = new PointSmoother(0.6);
    }

    renderHTML() {
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
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="drawing-canvas"></canvas>
                <canvas id="skeleton-canvas"></canvas>
                <div id="controls">
                    <button id="brush-left-hand" class="control-btn active" data-motion-activatable>左手</button>
                    <button id="brush-right-hand" class="control-btn" data-motion-activatable>右手</button>
                    <button id="clear-btn" class="control-btn" data-motion-activatable>清除畫布</button>
                </div>
            </div>
        `;
    }

    onInit() {
        this.motionEngine.setMode('pose');
        this.motionEngine.setPointerHand('left');
        
        // [FIX #1] 顯示指針畫布，以便用戶可以操作頂部按鈕
        this.motionEngine.showPointer(true);
        
        // [FIX #3] 設置一個較低嘅平滑度，令指針反應更靈敏，方便點擊按鈕
        this.motionEngine.setSmoothing(0.5);

        const drawingCanvas = document.getElementById('drawing-canvas');
        const skeletonCanvas = document.getElementById('skeleton-canvas');
        
        this.drawingCtx = drawingCanvas.getContext('2d');
        this.skeletonCtx = skeletonCanvas.getContext('2d');

        drawingCanvas.width = skeletonCanvas.width = window.innerWidth;
        drawingCanvas.height = skeletonCanvas.height = window.innerHeight;

        this._bindEvents();
        this.listenToMotionResults();
    }
    
    onDestroy() {
        this.drawingCtx = null;
        this.skeletonCtx = null;
        this.lastBrushPosition = null;
        console.log("[JointPainterScene] Canvases and state cleared.");
    }
    
    onUpdate() {
        this.updateDrawingState();
    }
    
    onDraw() {
        this.drawSkeletonAndBrush();
    }

    _bindEvents() {
        const setBrush = (hand, buttonId) => {
            this.brushHand = hand;
            this.container.querySelectorAll('#controls .control-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(buttonId).classList.add('active');
            this.brushSmoother.reset();
            this.isDrawing = false;
            this.lastBrushPosition = null;
        };

        this.addManagedEventListener(document.getElementById('brush-left-hand'), 'click', () => setBrush('left', 'brush-left-hand'));
        this.addManagedEventListener(document.getElementById('brush-right-hand'), 'click', () => setBrush('right', 'brush-right-hand'));
        this.addManagedEventListener(document.getElementById('clear-btn'), 'click', () => {
            if (this.drawingCtx) {
                this.drawingCtx.clearRect(0, 0, this.drawingCtx.canvas.width, this.drawingCtx.canvas.height);
            }
        });
    }

    updateDrawingState() {
        if (!this.latestResults || !this.latestResults.poseLandmarks) {
            this.isDrawing = false;
            this.lastBrushPosition = null;
            return;
        }

        const rawBrushPoint = window.getPalmCenterFromPose(this.latestResults.poseLandmarks, this.brushHand);
        // 注意：呢度繪畫用嘅 smoother 同 motion engine 嘅 smoother 係獨立嘅，以達到唔同嘅手感
        const smoothedPoint = this.brushSmoother.update(rawBrushPoint);

        if (smoothedPoint) {
            const w = this.drawingCtx.canvas.width;
            const h = this.drawingCtx.canvas.height;
            const currentPos = {
                x: (1 - smoothedPoint.x) * w,
                y: smoothedPoint.y * h
            };

            if (!this.isDrawing) {
                this.isDrawing = true;
            } else {
                this.drawingCtx.strokeStyle = 'cyan';
                this.drawingCtx.lineWidth = 10;
                this.drawingCtx.lineCap = 'round';
                this.drawingCtx.lineJoin = 'round';
                this.drawingCtx.beginPath();
                this.drawingCtx.moveTo(this.lastBrushPosition.x, this.lastBrushPosition.y);
                this.drawingCtx.lineTo(currentPos.x, currentPos.y);
                this.drawingCtx.stroke();
            }
            this.lastBrushPosition = currentPos;
        } else {
            this.isDrawing = false;
            this.lastBrushPosition = null;
        }
    }

    drawSkeletonAndBrush() {
        if (!this.skeletonCtx) return;

        const w = this.skeletonCtx.canvas.width;
        const h = this.skeletonCtx.canvas.height;
        this.skeletonCtx.clearRect(0, 0, w, h);

        if (this.latestResults && this.latestResults.poseLandmarks) {
            drawConnectors(this.skeletonCtx, this.latestResults.poseLandmarks, POSE_CONNECTIONS, { color: 'white', lineWidth: 2 });
            
            const rawBrushPoint = window.getPalmCenterFromPose(this.latestResults.poseLandmarks, this.brushHand);
            if (rawBrushPoint) {
                const smoothedPoint = this.brushSmoother.update(rawBrushPoint);
                if (smoothedPoint) {
                    this.skeletonCtx.fillStyle = 'yellow';
                    this.skeletonCtx.beginPath();
                    this.skeletonCtx.arc(smoothedPoint.x * w, smoothedPoint.y * h, 15, 0, 2 * Math.PI);
                    this.skeletonCtx.fill();
                }
            }
        }
    }
}