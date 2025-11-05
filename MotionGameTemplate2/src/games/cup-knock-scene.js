// src/games/cup-knock-scene.js (更新後)
// [FIX #1, #8] 啟用指針，並確保 Game Over 後仍可交互

import { BaseScene } from '../core/base-scene.js';

const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
});

export class CupKnockScene extends BaseScene {
    constructor() {
        super();
        this.matterEngine = null;
        this.matterRunner = null;
        this.matterRenderer = null;
        this.platform = null;
        this.skeletonCanvas = null;
        this.skeletonCtx = null;
        this.ui = {};
        this.score = 0;
        this.isGameOver = false;
    }

    renderHTML() {
        return `
            <style>
                .ck-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; cursor: none; }
                .ck-scene #skeleton-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.25; pointer-events: none; transform: scaleX(-1); }
                .ck-scene #game-canvas-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; background: transparent; }
                .ck-scene #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.7); pointer-events: none; }
                .ck-scene #score, .ck-scene #message { position: absolute; left: 50%; transform: translateX(-50%); font-size: 3em; font-weight: bold; }
                .ck-scene #score { top: 20px; }
                .ck-scene #message { top: 50%; transform: translate(-50%, -50%); font-size: 4em; display: none; }
                .ck-scene #reset-button { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); padding: 15px 30px; font-size: 1.2em; background-color: #ffd700; color: #1a1a1a; border: none; border-radius: 10px; z-index: 4; pointer-events: auto; }
            </style>
            <div class="ck-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <canvas id="skeleton-canvas"></canvas>
                <div id="game-canvas-container"></div>
                <div id="ui-layer">
                    <div id="score">Score: 0</div>
                    <div id="message"></div>
                </div>
                <button id="reset-button" data-motion-activatable>Reset Game</button>
            </div>
        `;
    }

    async onInit() {
        try {
            await loadScript("https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js");
            
            this.motionEngine.setMode('hands');
            // [FIX #1, #8] 顯示指針，確保返回/重置按鈕可以被觸發
            this.motionEngine.showPointer(true);

            this.skeletonCanvas = document.getElementById('skeleton-canvas');
            this.skeletonCtx = this.skeletonCanvas.getContext('2d');
            this.ui.gameCanvasContainer = document.getElementById('game-canvas-container');
            this.ui.scoreElement = document.getElementById('score');
            this.ui.messageElement = document.getElementById('message');
            this.ui.resetButton = document.getElementById('reset-button');
            
            this.skeletonCanvas.width = window.innerWidth;
            this.skeletonCanvas.height = window.innerHeight;

            this._setupPhysics();
            
            this.addManagedEventListener(this.ui.resetButton, 'click', () => this.resetGame());
            this.listenToMotionResults();

            this.resetGame();

        } catch (error) {
            console.error("Failed to initialize CupKnockScene:", error);
            this.container.innerHTML = `<div style="color:red;">Error: ${error.message}</div>`;
        }
    }
    
    onDestroy() {
        if (this.matterRunner) {
            Matter.Runner.stop(this.matterRunner);
            this.matterRunner = null;
        }
        if (this.matterRenderer) {
            Matter.Render.stop(this.matterRenderer);
            if (this.matterRenderer.canvas) {
                this.matterRenderer.canvas.remove();
            }
            this.matterRenderer = null;
        }
        if (this.matterEngine) {
            Matter.World.clear(this.matterEngine.world);
            Matter.Engine.clear(this.matterEngine);
            this.matterEngine = null;
        }

        this.platform = null;
        this.ui = {};
        console.log("[CupKnockScene] Matter.js resources completely destroyed.");
    }

    onUpdate() {
        // [FIX #8] 即使遊戲結束，仍然檢查手部碰撞，以便顯示手部指針
        this.checkCollisions();
        
        if (this.isGameOver) return; // 遊戲邏輯停止
        
        this.checkWinCondition();
    }
    
    onDraw() {
        this.drawSkeleton();
    }
    
    onResults(results) {
        this.latestResults = results;
    }

    _setupPhysics() {
        const { Engine, Render, Runner, World, Bodies } = Matter;
        this.matterEngine = Engine.create({ enableSleeping: true });
        this.matterRunner = Runner.create();
        this.matterRenderer = Render.create({
            element: this.ui.gameCanvasContainer,
            engine: this.matterEngine,
            options: {
                width: window.innerWidth,
                height: window.innerHeight,
                wireframes: false,
                background: 'transparent'
            }
        });

        const w = window.innerWidth, h = window.innerHeight;
        const wallOptions = { isStatic: true, render: { visible: false } };
        World.add(this.matterEngine.world, [
            Bodies.rectangle(w / 2, h + 30, w, 60, wallOptions),
            Bodies.rectangle(-30, h / 2, 60, h, wallOptions),
            Bodies.rectangle(w + 30, h / 2, 60, h, wallOptions)
        ]);

        this.platform = Bodies.rectangle(w / 2, h - 250, 400, 20, {
            isStatic: true,
            render: { fillStyle: '#e0e0e0' },
            label: 'platform'
        });
        World.add(this.matterEngine.world, this.platform);

        Render.run(this.matterRenderer);
        Runner.run(this.matterRunner, this.matterEngine);
    }
    
    drawSkeleton() {
        if (!this.skeletonCtx || !this.latestResults) return;
        
        const w = this.skeletonCanvas.width;
        const h = this.skeletonCanvas.height;
        this.skeletonCtx.clearRect(0, 0, w, h);
        
        if (this.latestResults.image) {
            this.skeletonCtx.drawImage(this.latestResults.image, 0, 0, w, h);
        }

        const hands = [];
        if (this.latestResults.multiHandLandmarks) hands.push(...this.latestResults.multiHandLandmarks);
        if (this.latestResults.leftHandLandmarks) hands.push(this.latestResults.leftHandLandmarks);
        if (this.latestResults.rightHandLandmarks) hands.push(this.latestResults.rightHandLandmarks);

        for (const landmarks of hands) {
            if (landmarks) {
                drawConnectors(this.skeletonCtx, landmarks, HAND_CONNECTIONS, { color: '#FFFFFF', lineWidth: 2 });
                drawLandmarks(this.skeletonCtx, landmarks, { color: '#FFD700', radius: 4 });
            }
        }
    }

    resetGame() {
        this.isGameOver = false;
        this.updateScore(0);
        this.ui.messageElement.style.display = 'none';

        if (!this.matterRunner || !this.matterEngine) return;
        
        this.matterRunner.enabled = true;
        
        const allBodies = Matter.Composite.allBodies(this.matterEngine.world);
        allBodies.forEach(body => {
            if (!body.isStatic) {
                Matter.Composite.remove(this.matterEngine.world, body);
            }
        });

        const cupWidth = 50, cupHeight = 70;
        const startY = this.platform.position.y - 10 - (cupHeight / 2);
        const startX = this.platform.position.x - (2 * cupWidth + 2 * 10);
        const cupOptions = {
            density: 0.005,
            friction: 0.8,
            restitution: 0.1,
            label: 'cup',
            sleepThreshold: 60
        };

        for (let i = 0; i < 5; i++) {
            const cup = Matter.Bodies.rectangle(startX + i * (cupWidth + 10), startY, cupWidth, cupHeight, {
                ...cupOptions,
                render: { fillStyle: '#4287f5' }
            });
            cup.isScored = false;
            Matter.World.add(this.matterEngine.world, cup);
        }
    }

    checkCollisions() {
        if (!this.matterEngine) return;
        const cups = Matter.Composite.allBodies(this.matterEngine.world).filter(b => b.label === 'cup');

        for (const pointer of this.motionEngine.pointers) {
            if (!pointer.isVisible) continue;
            
            // [FIX #8] 如果遊戲結束，只更新指針位置，唔再施加力
            if (this.isGameOver) continue;

            const handPos = {
                x: (1 - pointer.x) * window.innerWidth,
                y: pointer.y * window.innerHeight,
                radius: 15
            };

            for (const cup of cups) {
                if (Math.hypot(handPos.x - cup.position.x, handPos.y - cup.position.y) < handPos.radius + (cup.bounds.max.x - cup.bounds.min.x) / 2) {
                    const direction = Matter.Vector.normalise(Matter.Vector.sub(cup.position, handPos));
                    Matter.Body.setVelocity(cup, {
                        x: direction.x * 15,
                        y: (direction.y || -1) * 15
                    });
                    Matter.Sleeping.set(cup, false);
                }
            }
        }
    }

    checkWinCondition() {
        if (this.isGameOver || !this.matterEngine) return;

        let currentScore = 0;
        const platformTop = this.platform.position.y - 10;
        const cups = Matter.Composite.allBodies(this.matterEngine.world).filter(b => b.label === 'cup');

        cups.forEach(cup => {
            if (!cup.isScored && (Math.abs(cup.angle) > Math.PI / 3 || cup.position.y > platformTop + 50)) {
                cup.isScored = true;
                cup.render.fillStyle = '#888888';
            }
            if (cup.isScored) {
                currentScore += 100;
            }
        });

        this.updateScore(currentScore);

        if (currentScore >= 500) { // 檢查 currentScore 而唔係 this.score
            this.isGameOver = true;
            this.ui.messageElement.textContent = "You Win!";
            this.ui.messageElement.style.display = 'block';
            this.matterRunner.enabled = false;
        }
    }

    updateScore(newScore) {
        if (this.score !== newScore) {
            this.score = newScore;
            this.ui.scoreElement.textContent = `Score: ${this.score}`;
        }
    }
}