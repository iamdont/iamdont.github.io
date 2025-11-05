// src/scenes/test-scene.js
import { BaseScene } from '../core/base-scene.js';

export class TestScene extends BaseScene {
    constructor() {
        super();
        this.ui = {};
        this.currentMode = 'hands';
        this.fps = 0;
        this.lastFrameTime = 0;
    }

    renderHTML() {
        return `
            <style>
                .test-scene { display: grid; grid-template-columns: 1fr 380px; gap: 16px; padding: 16px; padding-top: 80px; height: 100vh; width: 100vw; box-sizing: border-box; background: #1a1a1a; color: white; }
                .test-scene .main-view { background: #2b2b2b; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; }
                .test-scene .video-container { position: relative; width: 100%; flex-grow: 1; background: #000; border-radius: 8px; overflow: hidden; }
                .test-scene #overlay-canvas { position: absolute; width: 100%; height: 100%; object-fit: contain; transform: scaleX(-1); }
                .test-scene .control-panel { background: #2b2b2b; border-radius: 12px; padding: 16px; overflow-y: auto; }
                .test-scene .panel-section { margin-bottom: 20px; padding: 16px; background: #3c3c3c; border-radius: 8px; }
                .test-scene .panel-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #ffd700; }
                .test-scene .mode-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .test-scene .mode-btn { padding: 10px; background: #555; border: 1px solid #666; border-radius: 6px; color: white; cursor: pointer; transition: all 0.2s; font-size: 14px; pointer-events: auto; }
                .test-scene .mode-btn:hover, .test-scene .mode-btn.motion-hover { background: #666; border-color: #ffd700; }
                .test-scene .mode-btn.active { background: #ffd700; color: #1a1a1a; border-color: #ffd700; font-weight: bold; }
                .test-scene .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                .test-scene .stat-item { padding: 8px; background: #444; border-radius: 6px; }
                .test-scene .stat-label { font-size: 12px; color: #aaa; margin-bottom: 4px; }
                .test-scene .stat-value { font-size: 18px; font-weight: bold; color: #4CAF50; }
            </style>
            <div class="test-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                     <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <div class="main-view">
                    <div class="video-container">
                        <canvas id="overlay-canvas"></canvas>
                    </div>
                </div>
                <div class="control-panel">
                    <div class="panel-section">
                        <div class="panel-title">🎯 Detection Mode</div>
                        <div class="mode-buttons">
                            <button class="mode-btn active" data-mode="hands" data-motion-activatable>✋ Hands</button>
                            <button class="mode-btn" data-mode="pose" data-motion-activatable>🚶 Pose</button>
                            <button class="mode-btn" data-mode="holistic" data-motion-activatable>🧍 Holistic</button>
                        </div>
                    </div>
                    <div class="panel-section">
                        <div class="panel-title">📊 Performance Stats</div>
                        <div class="stats">
                            <div class="stat-item">
                                <div class="stat-label">FPS</div>
                                <div class="stat-value" id="fps">0</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onInit() {
        this.ui.canvas = document.getElementById('overlay-canvas');
        this.ui.ctx = this.ui.canvas.getContext('2d');
        this.ui.fps = document.getElementById('fps');
        
        this.motionEngine.setPointerHand('left');
        this.motionEngine.outputCanvas.style.display = 'block';
        
        this._bindEvents();
        this.switchMode(this.currentMode);
        
        this.lastFrameTime = performance.now();
    }

    onDestroy() {
        this.ui = {};
        console.log("[TestScene] Destroyed.");
    }
    
    _bindEvents() {
        const modeButtons = this.container.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            this.addManagedEventListener(btn, 'click', (e) => this.switchMode(e.target.dataset.mode));
        });
        
        this.listenToMotionResults();
    }

    onUpdate(timestamp) {
        const delta = timestamp - this.lastFrameTime;
        if (delta > 0 && this.ui.fps) {
            this.fps = 1000 / delta;
            this.ui.fps.textContent = Math.round(this.fps);
        }
        this.lastFrameTime = timestamp;
    }

    onDraw() {
        this.drawOverlays();
    }

    onResults(results) {
        this.latestResults = results;
    }

    switchMode(mode) {
        if (!mode) return;
        this.currentMode = mode;
        this.motionEngine.setMode(mode);
        
        const modeButtons = this.container.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }

    drawOverlays() {
        if (!this.ui.ctx || !this.latestResults) return;

        const w = this.ui.canvas.width = this.ui.canvas.clientWidth;
        const h = this.ui.canvas.height = this.ui.canvas.clientHeight;
        const ctx = this.ui.ctx;
        
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        
        if (this.latestResults.image) {
            ctx.drawImage(this.latestResults.image, 0, 0, w, h);
        }
        
        const drawConfig = { color: '#00FF00', lineWidth: 4 };
        const landmarkConfig = { color: '#FF0000', radius: 5 };

        switch (this.currentMode) {
            case 'hands':
                if (this.latestResults.multiHandLandmarks) {
                    for (const landmarks of this.latestResults.multiHandLandmarks) {
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, drawConfig);
                        drawLandmarks(ctx, landmarks, landmarkConfig);
                    }
                }
                break;
            case 'pose':
                if (this.latestResults.poseLandmarks) {
                    drawConnectors(ctx, this.latestResults.poseLandmarks, POSE_CONNECTIONS, drawConfig);
                    drawLandmarks(ctx, this.latestResults.poseLandmarks, landmarkConfig);
                }
                break;
            case 'holistic':
                if (this.latestResults.poseLandmarks) drawConnectors(ctx, this.latestResults.poseLandmarks, POSE_CONNECTIONS, drawConfig);
                if (this.latestResults.leftHandLandmarks) drawConnectors(ctx, this.latestResults.leftHandLandmarks, HAND_CONNECTIONS, { ...drawConfig, color: '#CC0000' });
                if (this.latestResults.rightHandLandmarks) drawConnectors(ctx, this.latestResults.rightHandLandmarks, HAND_CONNECTIONS, { ...drawConfig, color: '#0000CC' });
                break;
        }
        ctx.restore();
    }
}