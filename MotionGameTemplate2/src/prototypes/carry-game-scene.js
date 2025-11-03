// src/scenes/carry-game-scene.js

const loadScript = (src) => { /* ... 不變 ... */ return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const script = document.createElement('script'); script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error(`Failed to load script: ${src}`)); document.head.appendChild(script); }); };

export class CarryGameScene {
    constructor() {
        this.loopHandle = null; this.resultsListener = null;
        this.matterEngine = null; this.matterRunner = null;
        this.latestResults = null;
        this.skeletonCanvas = null; this.skeletonCtx = null;
        
        // === 核心修改 1：由單一 box 變為 boxes 數組 ===
        this.boxes = [];
        this.carryingBox = null; // 記錄當前正在搬運嘅箱
        // ============================================
        
        this.hands = {
            left: { x: 0, y: 0, isPinching: false, isTouchingBox: false },
            right: { x: 0, y: 0, isPinching: false, isTouchingBox: false }
        };
    }

    render() { /* ... 不變 ... */ return ` <style> .cg-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: linear-gradient(#34495e, #2c3e50); cursor: none; } .cg-scene #skeleton-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.4; pointer-events: none; transform: scaleX(-1); } .cg-scene #game-canvas-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; } .cg-scene #info-panel { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; text-align: center; } </style> <div class="cg-scene"> <a class="back-button" data-scene-changer="launcher" data-motion-activatable> <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg> </a> <canvas id="skeleton-canvas"></canvas> <div id="game-canvas-container"></div> <div id="info-panel""> <p>用雙手同時「捏」實任何一個箱嚟搬運</p> <p>嘗試將佢哋疊高！</p> </div> </div> `; }

    async init() {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js");
        window.motionEngine.setMode('holistic'); window.motionEngine.outputCanvas.style.display = 'block';
        this.gameCanvasContainer = document.getElementById('game-canvas-container');
        this.skeletonCanvas = document.getElementById('skeleton-canvas'); this.skeletonCtx = this.skeletonCanvas.getContext('2d');
        this.skeletonCanvas.width = window.innerWidth; this.skeletonCanvas.height = window.innerHeight;
        this._setupPhysics(); this._bindEvents();
        // === 核心修改 2：調用新嘅 resetBoxes 方法 ===
        this.resetBoxes();
        // ===========================================
        this.gameLoop();
    }

    destroy() { /* ... 不變 ... */ if (this.loopHandle) cancelAnimationFrame(this.loopHandle); if (this.matterRunner) Matter.Runner.stop(this.matterRunner); if (this.matterEngine) Matter.Engine.clear(this.matterEngine); window.motionEngine.setMode('hands'); const removeListener = (listeners, handler) => { if (listeners && handler) { const index = listeners.indexOf(handler); if (index > -1) listeners.splice(index, 1); } }; removeListener(window.motionEngine.eventListeners.get('results-updated'), this.resultsListener); }
    _setupPhysics() { /* ... 不變 ... */ const { Engine, Render, Runner, World, Bodies } = Matter; this.matterEngine = Engine.create(); this.matterRunner = Runner.create(); const renderer = Render.create({ element: this.gameCanvasContainer, engine: this.matterEngine, options: { width: window.innerWidth, height: window.innerHeight, wireframes: false, background: 'transparent' } }); this.matterEngine.world.gravity.y = 2; const w = window.innerWidth, h = window.innerHeight; const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, render: { fillStyle: '#95a5a6' } }); World.add(this.matterEngine.world, ground); Render.run(renderer); Runner.run(this.matterRunner, this.matterEngine); }
    _bindEvents() { /* ... 不變 ... */ document.querySelector('.back-button[data-scene-changer]').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger)); this.resultsListener = (results) => { this.latestResults = results; }; window.motionEngine.on('results-updated', this.resultsListener); }

    // === 核心修改 3：創建多個箱子 ===
    resetBoxes() {
        // 清理舊箱子
        this.boxes.forEach(box => Matter.Composite.remove(this.matterEngine.world, box));
        this.boxes = [];
        this.carryingBox = null;
        
        const boxSize = 120; // 縮小啲，易啲疊
        const colors = ['#c0392b', '#16a085', '#2980b9']; // 紅、綠、藍
        const startY = window.innerHeight - 100 - boxSize / 2;
        const startX = window.innerWidth / 2 - 200;

        for (let i = 0; i < 3; i++) {
            const box = Matter.Bodies.rectangle(
                startX + i * (boxSize + 50), 
                startY, 
                boxSize, boxSize, 
                {
                    density: 0.01,
                    friction: 0.7, // 增加摩擦力，令堆疊更穩定
                    restitution: 0.1, // 減少彈性
                    render: { fillStyle: colors[i] }
                }
            );
            this.boxes.push(box);
            Matter.World.add(this.matterEngine.world, box);
        }
    }

    updateHandsState() {
        if (!this.latestResults) return;
        const pointers = window.motionEngine.pointers;
        ['left', 'right'].forEach(hand => {
            const state = this.hands[hand];
            const pointer = pointers.find(p => p.hand === hand);
            
            state.isTouchingBox = false; // 每幀重置
            if (pointer && pointer.isVisible) {
                state.x = (1 - pointer.x) * window.innerWidth;
                state.y = pointer.y * window.innerHeight;
                // 檢查手係咪掂到任何一個箱
                if (Matter.Query.point(this.boxes, {x: state.x, y: state.y}).length > 0) {
                    state.isTouchingBox = true;
                }
            }
            
            const landmarks = hand === 'left' ? this.latestResults.leftHandLandmarks : this.latestResults.rightHandLandmarks;
            state.isPinching = window.isPinching ? window.isPinching(landmarks) : false;
        });
    }

    // === 核心修改 4：重構 update 邏輯以處理多個目標 ===
    update() {
        this.updateHandsState();
        
        const leftHand = this.hands.left;
        const rightHand = this.hands.right;

        // 如果正在搬運
        if (this.carryingBox) {
            if (!leftHand.isPinching || !rightHand.isPinching) {
                // 放手
                this.carryingBox.render.fillStyle = this.carryingBox.originalColor;
                Matter.Body.setStatic(this.carryingBox, false);
                this.carryingBox = null;
                return;
            }
            const centerX = (leftHand.x + rightHand.x) / 2;
            const centerY = (leftHand.y + rightHand.y) / 2;
            Matter.Body.setPosition(this.carryingBox, { x: centerX, y: centerY });
            
        } 
        // 如果冇嘢搬緊，就檢查係咪可以抓取
        else {
            // 必須要兩隻手都捏合緊
            if (leftHand.isPinching && rightHand.isPinching) {
                // 搵出兩隻手同時掂到嘅箱
                const leftTouchedBoxes = Matter.Query.point(this.boxes, {x: leftHand.x, y: leftHand.y});
                const rightTouchedBoxes = Matter.Query.point(this.boxes, {x: rightHand.x, y: rightHand.y});

                if (leftTouchedBoxes.length > 0 && rightTouchedBoxes.length > 0) {
                    // 確保兩隻手掂到嘅係同一個箱
                    const targetBox = leftTouchedBoxes.find(box => box === rightTouchedBoxes[0]);

                    if (targetBox) {
                        this.carryingBox = targetBox;
                        this.carryingBox.originalColor = this.carryingBox.render.fillStyle; // 記住原來顏色
                        this.carryingBox.render.fillStyle = '#2ecc71'; // 變綠色
                        Matter.Body.setStatic(this.carryingBox, true);
                    }
                }
            }
        }
    }

    draw() { /* ... 不變 ... */ const w = this.skeletonCanvas.width; const h = this.skeletonCanvas.height; this.skeletonCtx.clearRect(0, 0, w, h); if (!this.latestResults) return; if (this.latestResults.image) { this.skeletonCtx.drawImage(this.latestResults.image, 0, 0, w, h); } const drawHand = (landmarks, color) => { if (landmarks) { drawConnectors(this.skeletonCtx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 }); drawLandmarks(this.skeletonCtx, landmarks, { color, radius: 4 }); } }; drawHand(this.latestResults.leftHandLandmarks, '#00FFFF'); drawHand(this.latestResults.rightHandLandmarks, '#FFD700'); }
    gameLoop() { /* ... 不變 ... */ this.update(); this.draw(); this.loopHandle = requestAnimationFrame(() => this.gameLoop()); }
}