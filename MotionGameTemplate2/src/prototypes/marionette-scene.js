// src/prototypes/marionette-scene.js

export class MarionetteScene {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.animationFrameId = null;
        this.resultsListener = null;
        this.latestResults = null;
        this.character = null; 
        this.targets = { leftHand: null, rightHand: null, leftFoot: null, rightFoot: null, };
        this.smoothers = {
            leftHand: new (this.createSmoother())(0.6),
            rightHand: new (this.createSmoother())(0.6),
            leftFoot: new (this.createSmoother())(0.6),
            rightFoot: new (this.createSmoother())(0.6),
        };
    }
    
    createSmoother() {
        return class PointSmoother {
            constructor(factor) { this.factor = factor; this.point = null; }
            update(newPoint) {
                if (newPoint) {
                    if (this.point) {
                        this.point.lerp(newPoint, 1 - this.factor);
                    } else {
                        // ✨ 修正：確保 clone 存在
                        if (typeof newPoint.clone === 'function') {
                            this.point = newPoint.clone();
                        } else {
                            this.point = { ...newPoint };
                        }
                    }
                    return this.point;
                }
                return null;
            }
        }
    }

    render() { return ` <style> .marionette-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; background-color: #1a1a1a; } #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; } </style> <div class="marionette-scene"> <a class="back-button" data-scene-changer="launcher" data-motion-activatable> <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg> </a> <canvas id="game-canvas"></canvas> </div> `; }

    async init() {
        const [THREE] = await window.load3DLibs(); 
        this.THREE = THREE;
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        window.motionEngine.setMode('pose'); 
        window.motionEngine.outputCanvas.style.display = 'none';
        this._bindEvents();
        this._createCharacter();
        this._animate();
    }

    destroy() { if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); window.removeEventListener('resize', this._onWindowResize); if (this.resultsListener) { const listeners = window.motionEngine.eventListeners.get('results-updated'); if (listeners) { const index = listeners.indexOf(this.resultsListener); if (index > -1) listeners.splice(index, 1); } } }
    _bindEvents() { document.querySelector('.back-button').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger)); this.resultsListener = (results) => { this.latestResults = results; if(results.poseLandmarks) { this._updateTargets(results.poseLandmarks); } }; window.motionEngine.on('results-updated', this.resultsListener); this._onWindowResize = () => { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; this._createCharacter(); }; window.addEventListener('resize', this._onWindowResize); }
    
    _createCharacter() {
        const w = this.canvas.width; const h = this.canvas.height;
        const torsoHeight = h * 0.22; const headRadius = h * 0.04;
        const shoulderWidth = w * 0.1; const armLength = h * 0.25;
        const legLength = h * 0.3;
        const centerX = w / 2; const neckY = h * 0.3; const hipY = neckY + torsoHeight;

        this.character = {
            head: { x: centerX, y: neckY - headRadius },
            neck: { x: centerX, y: neckY },
            hip: { x: centerX, y: hipY },
            leftArm:  { chain: [ {x:centerX - shoulderWidth/2, y:neckY}, {x:centerX - shoulderWidth/2, y:neckY + armLength/2}, {x:centerX - shoulderWidth/2, y:neckY + armLength} ], lengths: [armLength/2, armLength/2] },
            rightArm: { chain: [ {x:centerX + shoulderWidth/2, y:neckY}, {x:centerX + shoulderWidth/2, y:neckY + armLength/2}, {x:centerX + shoulderWidth/2, y:neckY + armLength} ], lengths: [armLength/2, armLength/2] },
            leftLeg:  { chain: [ {x:centerX - shoulderWidth/4, y:hipY}, {x:centerX - shoulderWidth/4, y:hipY + legLength/2}, {x:centerX - shoulderWidth/4, y:hipY + legLength} ], lengths: [legLength/2, legLength/2] },
            // ✨ 核心修正：將 rightLeg 嘅定義由 [] 改為 {}
            rightLeg: { chain: [ {x:centerX + shoulderWidth/4, y:hipY}, {x:centerX + shoulderWidth/4, y:hipY + legLength/2}, {x:centerX + shoulderWidth/4, y:hipY + legLength} ], lengths: [legLength/2, legLength/2] },
        };
    }

    _updateTargets(landmarks) {
        const w = this.canvas.width; const h = this.canvas.height;
        const get2DPos = (index) => {
            if (!landmarks[index] || landmarks[index].visibility < 0.3) return null;
            return new this.THREE.Vector2( (1 - landmarks[index].x) * w, landmarks[index].y * h);
        };
        const targetPositions = {
            leftHand: get2DPos(15), rightHand: get2DPos(16),
            leftFoot: get2DPos(27), rightFoot: get2DPos(28),
        };
        for(const key in this.targets) { this.targets[key] = this.smoothers[key].update(targetPositions[key]); }
    }
    
    _update() {
        if (!this.character) return;
        this.solveIK(this.character.leftArm, this.targets.leftHand);
        this.solveIK(this.character.rightArm, this.targets.rightHand);
        this.solveIK(this.character.leftLeg, this.targets.leftFoot);
        this.solveIK(this.character.rightLeg, this.targets.rightFoot);
    }
    
    solveIK(limb, target) {
        if (!limb || !target) return;
        const chain = limb.chain; const lengths = limb.lengths;
        const numJoints = chain.length; const root = { x: chain[0].x, y: chain[0].y };
        for(let iter = 0; iter < 5; iter++) {
            chain[numJoints - 1] = { x: target.x, y: target.y };
            for (let i = numJoints - 2; i >= 0; i--) {
                const direction = { x: chain[i+1].x - chain[i].x, y: chain[i+1].y - chain[i].y };
                const dist = Math.sqrt(direction.x**2 + direction.y**2) || 1;
                const ratio = lengths[i] / dist;
                chain[i] = { x: chain[i+1].x - direction.x * ratio, y: chain[i+1].y - direction.y * ratio, };
            }
            chain[0] = { x: root.x, y: root.y };
            for (let i = 0; i < numJoints - 1; i++) {
                if (i === 0 && chain.length > 2) { 
                    const elbow = chain[1]; const shoulder = chain[0];
                    if (elbow.y < shoulder.y) { elbow.y = shoulder.y + 1; }
                }
                const direction = { x: chain[i+1].x - chain[i].x, y: chain[i+1].y - chain[i].y };
                const dist = Math.sqrt(direction.x**2 + direction.y**2) || 1;
                const ratio = lengths[i] / dist;
                chain[i+1] = { x: chain[i].x + direction.x * ratio, y: chain[i].y + direction.y * ratio, };
            }
        }
    }
    
    _draw() {
        const w = this.canvas.width; const h = this.canvas.height;
        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        if (this.latestResults && this.latestResults.image) {
            this.ctx.globalAlpha = 0.4;
            this.ctx.translate(w, 0); this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.latestResults.image, 0, 0, w, h);
            this.ctx.restore(); this.ctx.save();
        }
        if (this.latestResults && this.latestResults.poseLandmarks) {
            this.ctx.globalAlpha = 0.6;
            this.ctx.translate(w, 0); this.ctx.scale(-1, 1);
            drawConnectors(this.ctx, this.latestResults.poseLandmarks, POSE_CONNECTIONS, {color: 'rgba(255, 255, 255, 0.5)', lineWidth: 2});
            this.ctx.restore();
        }
        this.ctx.globalAlpha = 1.0;
        this.ctx.strokeStyle = '#00FF00'; this.ctx.lineWidth = 12;
        this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
        if (!this.character) { this.ctx.restore(); return; }
        const { head, neck, hip, leftArm, rightArm, leftLeg, rightLeg } = this.character;
        this.ctx.beginPath(); this.ctx.moveTo(neck.x, neck.y); this.ctx.lineTo(hip.x, hip.y); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.arc(head.x, head.y, 30, 0, Math.PI * 2); this.ctx.stroke();
        const drawLimb = (limb) => {
            if (!limb || !limb.chain) return;
            const chain = limb.chain; this.ctx.beginPath();
            this.ctx.moveTo(chain[0].x, chain[0].y);
            for (let i = 1; i < chain.length; i++) { this.ctx.lineTo(chain[i].x, chain[i].y); }
            this.ctx.stroke();
        };
        drawLimb(leftArm); drawLimb(rightArm); drawLimb(leftLeg); drawLimb(rightLeg);
    }

    _animate() {
        this.animationFrameId = requestAnimationFrame(() => this._animate());
        this._update();
        this._draw();
    }
}