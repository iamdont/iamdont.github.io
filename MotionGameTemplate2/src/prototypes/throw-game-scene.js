// src/scenes/throw-game-scene.js

const loadScript = (src) => { /* ... 不變 ... */ return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const script = document.createElement('script'); script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error(`Failed to load script: ${src}`)); document.head.appendChild(script); }); };

export class ThrowGameScene {
    constructor() {
        this.loopHandle = null; this.resultsListener = null;
        this.matterEngine = null; this.matterRunner = null;
        this.latestResults = null;
        
        this.ball = null;
        this.ballState = 'idle'; // idle, grabbing, thrown
        this.grabbingHand = null; // 'left' or 'right'

        this.handStates = {
            left: { x: 0, y: 0, history: [], isPinching: false },
            right: { x: 0, y: 0, history: [], isPinching: false }
        };
        this.HISTORY_LENGTH = 5;
    }

    render() {
        return `
            <style>
                .tg-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #334; cursor: none; }
                .tg-scene #skeleton-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.3; pointer-events: none; transform: scaleX(-1); }
                .tg-scene #game-canvas-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .tg-scene #info-panel { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; text-align: center; }
            </style>
            <div class="tg-scene">
                <a class="back-button" data-scene-changer="launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="skeleton-canvas"></canvas>
                <div id="game-canvas-container"></div>
                <div id="info-panel"">
                    <p>將手靠近個波，然後用拇指同食指「捏」實佢</p>
                    <p>揮動並鬆開手指嚟掟個波</p>
                </div>
            </div>
        `;
    }

    async init() {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js");
        // 呢個遊戲需要精細手勢，用 Holistic 效果最好
        window.motionEngine.setMode('holistic'); 
        window.motionEngine.outputCanvas.style.display = 'block';
        this.gameCanvasContainer = document.getElementById('game-canvas-container');
        this.skeletonCanvas = document.getElementById('skeleton-canvas'); this.skeletonCtx = this.skeletonCanvas.getContext('2d');
        this._setupPhysics(); this._bindEvents(); this.resetBall(); this.gameLoop();
    }

    destroy() { /* ... 不變 ... */ if (this.loopHandle) cancelAnimationFrame(this.loopHandle); if (this.matterRunner) Matter.Runner.stop(this.matterRunner); if (this.matterEngine) Matter.Engine.clear(this.matterEngine); window.motionEngine.setMode('hands'); const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } }; removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener); }
    _setupPhysics() { /* ... 不變 ... */ const { Engine, Render, Runner, World, Bodies } = Matter; this.matterEngine = Engine.create(); this.matterRunner = Runner.create(); const renderer = Render.create({ element: this.gameCanvasContainer, engine: this.matterEngine, options: { width: window.innerWidth, height: window.innerHeight, wireframes: false, background: 'transparent' } }); this.matterEngine.world.gravity.y = 1; const w = window.innerWidth, h = window.innerHeight; const wallOptions = { isStatic: true, render: { fillStyle: 'transparent' } }; World.add(this.matterEngine.world, [ Bodies.rectangle(w / 2, h + 30, w, 60, wallOptions), Bodies.rectangle(-30, h / 2, 60, h, wallOptions), Bodies.rectangle(w + 30, h / 2, 60, h, wallOptions), Bodies.rectangle(w / 2, -30, w, 60, wallOptions) ]); Render.run(renderer); Runner.run(this.matterRunner, this.matterEngine); }
    _bindEvents() { /* ... 不變 ... */ document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger)); this.resultsListener = (results) => { this.latestResults = results; }; window.motionEngine.on('results-updated', this.resultsListener); }
    resetBall() { /* ... 不變 ... */ if (this.ball) Matter.Composite.remove(this.matterEngine.world, this.ball); this.ball = Matter.Bodies.circle(window.innerWidth / 2, window.innerHeight / 2, 30, { restitution: 0.7, render: { fillStyle: '#e74c3c' } }); Matter.World.add(this.matterEngine.world, this.ball); this.ballState = 'idle'; this.grabbingHand = null; }

    updateHandsState() {
        if (!this.latestResults) return;
        
        const handData = {
            left: this.latestResults.leftHandLandmarks,
            right: this.latestResults.rightHandLandmarks
        };

        ['left', 'right'].forEach(hand => {
            const state = this.handStates[hand];
            const landmarks = handData[hand];
            const pointer = window.motionEngine.pointers.find(p => p.hand === hand);
            
            // 更新捏合狀態
            state.isPinching = window.isPinching ? window.isPinching(landmarks) : false;

            if (pointer && pointer.isVisible) {
                state.x = (1 - pointer.x) * window.innerWidth;
                state.y = pointer.y * window.innerHeight;
                state.history.push({ x: state.x, y: state.y, time: performance.now() });
                if (state.history.length > this.HISTORY_LENGTH) state.history.shift();
            }
        });
    }
    
    // === 核心修改：全新嘅遊戲 update 邏輯 ===
    update() {
        this.updateHandsState();

        // 狀態 1：抓取中 (Grabbing)
        if (this.ballState === 'grabbing') {
            const state = this.handStates[this.grabbingHand];
            
            // 如果手仲喺度，而且保持捏合，就將波鎖定到手上
            if (state && state.isPinching) {
                Matter.Body.setPosition(this.ball, { x: state.x, y: state.y });
                Matter.Body.setVelocity(this.ball, { x: 0, y: 0 });
            } 
            // 如果放開手指，就掟出去
            else {
                this.ballState = 'thrown';
                this.ball.render.fillStyle = '#e74c3c';

                if (state && state.history.length === this.HISTORY_LENGTH) {
                    const oldest = state.history[0];
                    const newest = state.history[state.history.length - 1];
                    // 計算速度向量
                    const velocityX = (newest.x - oldest.x) / (newest.time - oldest.time) * 30;
                    const velocityY = (newest.y - oldest.y) / (newest.time - oldest.time) * 30;
                    Matter.Body.setVelocity(this.ball, { x: velocityX, y: velocityY });
                }
                this.grabbingHand = null;
            }
        }
        
        // 狀態 2：閒置或已掟出
        else {
            // 檢查有冇手想抓取
            for (const hand of ['left', 'right']) {
                const state = this.handStates[hand];
                if (state.isPinching) {
                    const distance = Math.hypot(state.x - this.ball.position.x, state.y - this.ball.position.y);
                    // 如果手捏合緊，而且夠近，就抓取
                    if (distance < this.ball.circleRadius * 1.5) {
                        this.ballState = 'grabbing';
                        this.grabbingHand = hand;
                        this.ball.render.fillStyle = hand === 'left' ? '#00FFFF' : '#FFD700';
                        break; // 只俾一隻手抓
                    }
                }
            }

            // 如果波已經掟咗出去，檢查係咪要重置
            if (this.ballState === 'thrown' && Matter.Vector.magnitude(this.ball.velocity) < 0.5 && this.ball.position.y > window.innerHeight - 100) {
                this.resetBall();
            }
        }
    }
    
    drawSkeleton() {
        const w = this.skeletonCanvas.width = window.innerWidth;
        const h = this.skeletonCanvas.height = window.innerHeight;
        this.skeletonCtx.clearRect(0, 0, w, h);
        if (!this.latestResults) return;
        if (this.latestResults.image) this.skeletonCtx.drawImage(this.latestResults.image, 0, 0, w, h);
        const drawHand = (landmarks, color) => { if (landmarks) { drawConnectors(this.skeletonCtx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 }); } };
        drawHand(this.latestResults.leftHandLandmarks, '#00FFFF');
        drawHand(this.latestResults.rightHandLandmarks, '#FFD700');
    }

    gameLoop() {
        this.update();
        this.drawSkeleton();
        this.loopHandle = requestAnimationFrame(() => this.gameLoop());
    }
}