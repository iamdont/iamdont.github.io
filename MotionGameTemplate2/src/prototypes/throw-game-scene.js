// src/prototypes/throw-game-scene.js
import { BaseScene } from '../core/base-scene.js';

const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
});

export class ThrowGameScene extends BaseScene {
    constructor() {
        super();
        this.matterEngine = null;
        this.matterRunner = null;
        this.matterRenderer = null;
        
        this.skeletonCanvas = null;
        this.skeletonCtx = null;
        
        this.ball = null;
        this.ballState = 'idle'; // idle, grabbing, thrown
        this.grabbingHand = null;
        
        this.handStates = {
            left: { x: 0, y: 0, history: [], isPinching: false },
            right: { x: 0, y: 0, history: [], isPinching: false }
        };
        this.HISTORY_LENGTH = 5;
    }

    renderHTML() {
        return `
            <style>
                .tg-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #334; cursor: none; }
                .tg-scene #skeleton-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.3; pointer-events: none; transform: scaleX(-1); }
                .tg-scene #game-canvas-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
                .tg-scene #info-panel { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 3; color: white; font-family: monospace; font-size: 1.2em; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; text-align: center; }
            </style>
            <div class="tg-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="skeleton-canvas"></canvas>
                <div id="game-canvas-container"></div>
                <div id="info-panel">
                    <p>將手靠近個波，然後用拇指同食指「捏」實佢</p>
                    <p>揮動並鬆開手指嚟掟個波</p>
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
        
        this._setupPhysics();
        this.listenToMotionResults();
        this.resetBall();
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
        this.ball = null;
        this.skeletonCanvas = this.skeletonCtx = null;

        console.log("[ThrowGameScene] Matter.js resources completely destroyed.");
    }

    _setupPhysics() {
        const { Engine, Render, Runner, World, Bodies } = Matter;
        this.matterEngine = Engine.create({ enableSleeping: true });
        this.matterRunner = Runner.create();
        this.matterRenderer = Render.create({
            element: this.gameCanvasContainer,
            engine: this.matterEngine,
            options: {
                width: window.innerWidth,
                height: window.innerHeight,
                wireframes: false,
                background: 'transparent'
            }
        });
        
        this.matterEngine.world.gravity.y = 1;
        
        const w = window.innerWidth, h = window.innerHeight;
        const wallOptions = { isStatic: true, render: { fillStyle: 'transparent' } };
        World.add(this.matterEngine.world, [
            Bodies.rectangle(w / 2, h + 30, w, 60, wallOptions), // floor
            Bodies.rectangle(-30, h / 2, 60, h, wallOptions),    // left
            Bodies.rectangle(w + 30, h / 2, 60, h, wallOptions),  // right
            Bodies.rectangle(w / 2, -30, w, 60, wallOptions)   // top
        ]);
        
        Render.run(this.matterRenderer);
        Runner.run(this.matterRunner, this.matterEngine);
    }
    
    resetBall() {
        if (!this.matterEngine) return;
        if (this.ball) Matter.Composite.remove(this.matterEngine.world, this.ball);
        
        this.ball = Matter.Bodies.circle(window.innerWidth / 2, window.innerHeight / 2, 30, {
            restitution: 0.7,
            render: { fillStyle: '#e74c3c' }
        });
        Matter.World.add(this.matterEngine.world, this.ball);
        
        this.ballState = 'idle';
        this.grabbingHand = null;
    }

    updateHandsState() {
        if (!this.latestResults) return;
        
        const landmarksData = {
            left: this.latestResults.leftHandLandmarks,
            right: this.latestResults.rightHandLandmarks
        };

        ['left', 'right'].forEach(hand => {
            const state = this.handStates[hand];
            const landmarks = landmarksData[hand];
            const pointer = this.motionEngine.pointers.find(p => p.hand === hand);

            state.isPinching = window.isPinching(landmarks);

            if (pointer && pointer.isVisible) {
                state.x = (1 - pointer.x) * window.innerWidth;
                state.y = pointer.y * window.innerHeight;
                state.history.push({ x: state.x, y: state.y, time: performance.now() });
                if (state.history.length > this.HISTORY_LENGTH) {
                    state.history.shift();
                }
            }
        });
    }
    
    onUpdate() {
        this.updateHandsState();
        if (!this.ball) return;

        if (this.ballState === 'grabbing') {
            const state = this.handStates[this.grabbingHand];
            if (state && state.isPinching) {
                Matter.Body.setPosition(this.ball, { x: state.x, y: state.y });
                Matter.Body.setVelocity(this.ball, { x: 0, y: 0 });
            } else {
                // 鬆手，掟個波出去
                this.ballState = 'thrown';
                this.ball.render.fillStyle = '#e74c3c'; // 還原顏色
                if (state && state.history.length === this.HISTORY_LENGTH) {
                    const oldest = state.history[0];
                    const newest = state.history[state.history.length - 1];
                    const timeDiff = (newest.time - oldest.time) / 1000;
                    if (timeDiff > 0) {
                        const vx = (newest.x - oldest.x) / timeDiff * 0.05; // 調整力度
                        const vy = (newest.y - oldest.y) / timeDiff * 0.05;
                        Matter.Body.setVelocity(this.ball, { x: vx, y: vy });
                    }
                }
                this.grabbingHand = null;
            }
        } else {
            // 檢查係咪抓取
            for (const hand of ['left', 'right']) {
                const state = this.handStates[hand];
                if (state.isPinching && Math.hypot(state.x - this.ball.position.x, state.y - this.ball.position.y) < this.ball.circleRadius * 1.5) {
                    this.ballState = 'grabbing';
                    this.grabbingHand = hand;
                    this.ball.render.fillStyle = hand === 'left' ? '#0FF' : '#FFD700'; // 根據手改變顏色
                    Matter.Sleeping.set(this.ball, false); // 喚醒個波
                    break;
                }
            }
            // 如果掟出後個波瞓著咗，就重置
            if (this.ballState === 'thrown' && this.ball.isSleeping) {
                this.resetBall();
            }
        }
    }
    
    onDraw() {
        if (!this.skeletonCtx || !this.latestResults) return;
        const w = this.skeletonCanvas.width = window.innerWidth;
        const h = this.skeletonCanvas.height = window.innerHeight;
        this.skeletonCtx.clearRect(0, 0, w, h);
        
        if (this.latestResults.image) {
            this.skeletonCtx.drawImage(this.latestResults.image, 0, 0, w, h);
        }

        const drawHand = (landmarks, color) => {
            if (landmarks) {
                drawConnectors(this.skeletonCtx, landmarks, HAND_CONNECTIONS, { color, lineWidth: 2 });
            }
        };
        drawHand(this.latestResults.leftHandLandmarks, '#0FF');
        drawHand(this.latestResults.rightHandLandmarks, '#FFD700');
    }
}