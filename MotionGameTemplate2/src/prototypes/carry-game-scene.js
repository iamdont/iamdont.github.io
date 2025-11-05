// src/prototypes/carry-game-scene.js
import { BaseScene } from '../core/base-scene.js';

const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
});

export class CarryGameScene extends BaseScene {
    constructor() {
        super();
        this.matterEngine = null;
        this.matterRunner = null;
        this.matterRenderer = null;
        this.skeletonCanvas = null;
        this.skeletonCtx = null;

        this.boxes = [];
        this.carryingBox = null;
        this.hands = {
            left: { x: 0, y: 0, isPinching: false },
            right: { x: 0, y: 0, isPinching: false }
        };
    }

    renderHTML() {
        return `
            <style>
                .cg-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: linear-gradient(#34495e, #2c3e50); cursor: none; }
                .cg-scene #skeleton-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.4; pointer-events: none; transform: scaleX(-1); }
                .cg-scene #game-canvas-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .cg-scene #info-panel { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; text-align: center; }
            </style>
            <div class="cg-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="skeleton-canvas"></canvas>
                <div id="game-canvas-container"></div>
                <div id="info-panel">
                    <p>用雙手同時「捏」實任何一個箱嚟搬運</p>
                    <p>嘗試將佢哋疊高！</p>
                </div>
            </div>
        `;
    }

    async onInit() {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js");
        
        this.motionEngine.setMode('holistic');
        this.motionEngine.outputCanvas.style.display = 'block';

        this.gameCanvasContainer = document.getElementById('game-canvas-container');
        this.skeletonCanvas = document.getElementById('skeleton-canvas');
        this.skeletonCtx = this.skeletonCanvas.getContext('2d');
        this.skeletonCanvas.width = window.innerWidth;
        this.skeletonCanvas.height = window.innerHeight;

        this._setupPhysics();
        this.listenToMotionResults();
        this.resetBoxes();
    }

    onDestroy() {
        if (this.matterRunner) Matter.Runner.stop(this.matterRunner);
        if (this.matterRenderer) {
            Matter.Render.stop(this.matterRenderer);
            if (this.matterRenderer.canvas) this.matterRenderer.canvas.remove();
        }
        if (this.matterEngine) {
            Matter.World.clear(this.matterEngine.world);
            Matter.Engine.clear(this.matterEngine);
        }

        this.matterEngine = this.matterRunner = this.matterRenderer = null;
        this.boxes = [];
        this.carryingBox = null;
        this.skeletonCanvas = this.skeletonCtx = null;

        console.log("[CarryGameScene] Matter.js resources completely destroyed.");
    }
    
    _setupPhysics() {
        const { Engine, Render, Runner, World, Bodies } = Matter;
        this.matterEngine = Engine.create({ enableSleeping: true });
        this.matterRunner = Runner.create();
        this.matterRenderer = Render.create({
            element: this.gameCanvasContainer,
            engine: this.matterEngine,
            options: { width: window.innerWidth, height: window.innerHeight, wireframes: false, background: 'transparent' }
        });
        this.matterEngine.world.gravity.y = 2;

        const w = window.innerWidth, h = window.innerHeight;
        const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, render: { fillStyle: '#95a5a6' } });
        World.add(this.matterEngine.world, ground);

        Render.run(this.matterRenderer);
        Runner.run(this.matterRunner, this.matterEngine);
    }
    
    resetBoxes() {
        if (!this.matterEngine) return;
        this.boxes.forEach(box => Matter.Composite.remove(this.matterEngine.world, box));
        this.boxes = [];
        this.carryingBox = null;

        const boxSize = 120, colors = ['#c0392b', '#16a085', '#2980b9'];
        const startY = window.innerHeight - 100 - boxSize / 2;
        const startX = window.innerWidth / 2 - 200;

        for (let i = 0; i < 3; i++) {
            const box = Matter.Bodies.rectangle(startX + i * (boxSize + 50), startY, boxSize, boxSize, {
                id: i, density: 0.01, friction: 0.8, restitution: 0.1, render: { fillStyle: colors[i] }
            });
            this.boxes.push(box);
            Matter.World.add(this.matterEngine.world, box);
        }
    }

    updateHandsState() {
        if (!this.latestResults) return;
        
        const pointers = this.motionEngine.pointers;
        ['left', 'right'].forEach(hand => {
            const state = this.hands[hand];
            const pointer = pointers.find(p => p.hand === hand);
            
            if (pointer && pointer.isVisible) {
                state.x = (1 - pointer.x) * window.innerWidth;
                state.y = pointer.y * window.innerHeight;
            }

            const landmarks = hand === 'left' ? this.latestResults.leftHandLandmarks : this.latestResults.rightHandLandmarks;
            state.isPinching = window.isPinching(landmarks);
        });
    }

    onUpdate() {
        this.updateHandsState();
        const { left: leftHand, right: rightHand } = this.hands;

        if (this.carryingBox) {
            // 如果正在搬運，但鬆手了
            if (!leftHand.isPinching || !rightHand.isPinching) {
                const boxToRelease = this.carryingBox;
                Matter.Body.setStatic(boxToRelease, false); // 解除靜態狀態
                Matter.Sleeping.set(boxToRelease, false);   // 喚醒物體
                boxToRelease.render.fillStyle = boxToRelease.originalColor;
                this.carryingBox = null;
                
                // 輕微延遲後喚醒所有物體，確保物理引擎穩定
                setTimeout(() => {
                    if (this.matterEngine) { // 檢查引擎是否存在
                        const allBodies = Matter.Composite.allBodies(this.matterEngine.world);
                        for (const body of allBodies) {
                            if (!body.isStatic) Matter.Sleeping.set(body, false);
                        }
                    }
                }, 50);

                return;
            }
            // 持續搬運
            Matter.Body.setPosition(this.carryingBox, {
                x: (leftHand.x + rightHand.x) / 2,
                y: (leftHand.y + rightHand.y) / 2
            });
            Matter.Body.setVelocity(this.carryingBox, { x: 0, y: 0 });

        } else {
            // 如果未搬運，檢查是否開始搬運
            if (leftHand.isPinching && rightHand.isPinching) {
                const leftTouched = Matter.Query.point(this.boxes, { x: leftHand.x, y: leftHand.y });
                const rightTouched = Matter.Query.point(this.boxes, { x: rightHand.x, y: rightHand.y });
                
                // 確保雙手捏的是同一個箱子
                if (leftTouched.length > 0 && rightTouched.length > 0 && rightTouched[0].id === leftTouched[0].id) {
                    this.carryingBox = leftTouched[0];
                    this.carryingBox.originalColor = this.carryingBox.render.fillStyle;
                    this.carryingBox.render.fillStyle = '#2ecc71'; // 變綠表示被抓住
                    Matter.Body.setStatic(this.carryingBox, true); // 設為靜態，脫離物理控制
                }
            }
        }
    }

    onDraw() {
        if (!this.skeletonCtx || !this.latestResults) return;
        const w = this.skeletonCanvas.width, h = this.skeletonCanvas.height;
        this.skeletonCtx.clearRect(0, 0, w, h);
        
        if (this.latestResults.image) this.skeletonCtx.drawImage(this.latestResults.image, 0, 0, w, h);
        
        const drawHand = (landmarks, color) => {
            if (landmarks) {
                drawConnectors(this.skeletonCtx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 });
                drawLandmarks(this.skeletonCtx, landmarks, { color, radius: 4 });
            }
        };
        drawHand(this.latestResults.leftHandLandmarks, '#00FFFF');
        drawHand(this.latestResults.rightHandLandmarks, '#FFD700');
    }
}