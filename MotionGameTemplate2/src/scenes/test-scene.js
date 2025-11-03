// src/scenes/test-scene.js

export class TestScene {
    constructor() {
        this.ui = {};
        this.currentMode = 'hands';
        this.fps = 0;
        this.loopHandle = null;
        this.resultsListener = null;
        this.lastFrameTime = performance.now();
    }

    render() {
        return `
            <style>
                .test-scene { display: grid; grid-template-columns: 1fr 380px; gap: 16px; padding: 16px; padding-top: 80px; /* 為返回按鈕留位 */ height: 100vh; width: 100vw; box-sizing: border-box; background: #1a1a1a; color: white; }
                .test-scene .main-view { background: #2b2b2b; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; }
                .test-scene .video-container { position: relative; width: 100%; flex-grow: 1; background: #000; border-radius: 8px; overflow: hidden; }
                .test-scene #output-canvas { position: absolute; width: 100%; height: 100%; object-fit: contain; transform: scaleX(-1); }
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
                <a class="back-button" data-scene-changer="launcher" data-motion-activatable>
                     <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <div class="main-view">
                    <div class="video-container"><canvas id="output-canvas"></canvas></div>
                </div>
                <div class="control-panel">
                    <div class="panel-section"><div class="panel-title">🎯 Detection Mode</div>
                        <div class="mode-buttons">
                            <button class="mode-btn active" data-mode="hands" data-motion-activatable>✋ Hands</button>
                            <button class="mode-btn" data-mode="pose" data-motion-activatable>🚶 Pose</button>
                            <button class="mode-btn" data-mode="holistic" data-motion-activatable>🧍 Holistic</button>
                        </div>
                    </div>
                    <div class="panel-section"><div class="panel-title">📊 Performance Stats</div>
                        <div class="stats"><div class="stat-item"><div class="stat-label">FPS</div><div class="stat-value" id="fps">0</div></div></div>
                    </div>
                </div>
            </div>
        `;
    }

    init() {
        this.ui.canvas = document.getElementById('output-canvas');
        this.ui.ctx = this.ui.canvas.getContext('2d');
        this.ui.fps = document.getElementById('fps');
        
        // === 核心修改：統一設置 ===
        // 無論係咩 mode，都用左手做指針
        window.motionEngine.setPointerHand('left');
        // 無論係咩 mode，都顯示黃點指針
        window.motionEngine.outputCanvas.style.display = 'block';
        // ==========================

        this.switchMode(this.currentMode);
        this._bindEvents();
        this.gameLoop();
    }

    destroy() {
        if (this.loopHandle) cancelAnimationFrame(this.loopHandle);
        const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } };
        removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener);
        
        // 離開時恢復默認設置
        window.motionEngine.setPointerHand('right');
        window.motionEngine.setMode('hands');
    }

    _bindEvents() {
        document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger));
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchMode(e.target.dataset.mode));
        });
        this.resultsListener = (results) => this.onResults(results);
        window.motionEngine.on('results-updated', this.resultsListener);
    }

    // === 核心修改：移除不必要嘅 display 切換 ===
    switchMode(mode) {
        this.currentMode = mode;
        window.motionEngine.setMode(mode);
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        // 唔再需要喺度控制黃點嘅顯示，init 已經統一處理咗
    }

    onResults(results) {
        const w = this.ui.canvas.width = window.innerWidth * 0.7;
        const h = this.ui.canvas.height = window.innerHeight * 0.8;
        const ctx = this.ui.ctx;
        ctx.save();
        ctx.clearRect(0, 0, w, h);
        
        if (results.image) {
            ctx.drawImage(results.image, 0, 0, w, h);
        }
        
        const drawConfig = { color: '#00FF00', lineWidth: 4 }, landmarkConfig = { color: '#FF0000', radius: 5 };
        // 繪圖邏輯保持不變，因為 motionEngine 已經為我哋提供咗正確嘅 results
        switch(this.currentMode) {
            case 'hands': if (results.multiHandLandmarks) for (const l of results.multiHandLandmarks) { drawConnectors(ctx, l, HAND_CONNECTIONS, drawConfig); drawLandmarks(ctx, l, landmarkConfig); } break;
            case 'pose': if (results.poseLandmarks) { drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, drawConfig); drawLandmarks(ctx, results.poseLandmarks, landmarkConfig); } break;
            case 'holistic':
                if (results.poseLandmarks) drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, drawConfig);
                if (results.leftHandLandmarks) drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { ...drawConfig, color: '#CC0000' });
                if (results.rightHandLandmarks) drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { ...drawConfig, color: '#0000CC' });
                break;
        }
        ctx.restore();
    }

    gameLoop() {
        const now = performance.now();
        const delta = now - this.lastFrameTime;
        if (delta > 0) { // 避免除以零
            this.fps = 1000 / delta;
            this.ui.fps.textContent = Math.round(this.fps);
        }
        this.lastFrameTime = now;
        this.loopHandle = requestAnimationFrame(() => this.gameLoop());
    }
}