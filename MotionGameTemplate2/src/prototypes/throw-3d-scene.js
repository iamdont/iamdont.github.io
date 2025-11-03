// src/prototypes/throw-3d-scene.js

class PointSmoother { constructor(smoothingFactor = 0.8) { this.smoothingFactor = smoothingFactor; this.smoothedData = null; } update(rawData) { if (rawData && rawData.landmarks) { if (!this.smoothedData) { this.smoothedData = { landmarks: rawData.landmarks.map(p => p.clone()) }; } else { for (let i = 0; i < rawData.landmarks.length; i++) { if (this.smoothedData.landmarks[i] && rawData.landmarks[i]) { this.smoothedData.landmarks[i].lerp(rawData.landmarks[i], 1 - this.smoothingFactor); } } } return this.smoothedData; } else { this.smoothedData = null; return null; } } reset() { this.smoothedData = null; } }

export class Throw3DScene {
    constructor() {
        this.renderer = null; this.scene = null; this.camera = null; this.container = null;
        this.hands = {
            left: { skeleton: null, state: { x:0, y:0, z:0, isPinching: false, isVisible: false, history: [] }, smoother: new PointSmoother(0.7) },
            right: { skeleton: null, state: { x:0, y:0, z:0, isPinching: false, isVisible: false, history: [] }, smoother: new PointSmoother(0.7) }
        };
        this.physicsWorld = null;
        this.gameobjects = []; this.ball = null;
        this.ballState = 'idle'; this.grabbingHand = null; 
        this.ballMaterial = null; this.wallMaterial = null;
        this.calibration = { scale: 2.5, xOffset: 0.0, yOffset: 0.9, zOffset: -1.0, };
        this.resultsListener = null; this.animationFrameId = null; this.lastTime = 0;
        
        this.ATTRACT_SPEED = 5;
        this.GRAB_DISTANCE = 0.4;
        this.THROW_MULTIPLIER = 50;
    }

    render() { return ` <style> .throw3d-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; } #canvas-container { width: 100%; height: 100%; z-index: 1; } #info-panel { position: absolute; top: 20px; left: 20px; z-index: 3; color: white; font-family: monospace; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; max-width: 300px; } #reset-button { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 4; padding: 10px 20px; font-size: 1em; background-color: #ffd700; color: #1a1a1a; border: none; border-radius: 8px; cursor: none; pointer-events: auto; } </style> <div class="throw3d-scene"> <a class="back-button" data-scene-changer="launcher" data-motion-activatable> <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg> </a> <div id="canvas-container"></div> <div id="info-panel"> <h3>3D 投擲</h3> <p>用任何一隻手捏合，即可吸附個波</p> <p id="ball-status">Ball State: idle</p> </div> <button id="reset-button" data-motion-activatable>Reset Ball</button> </div> `; }
    async init() { const [THREE, CANNON] = await window.load3DLibs(); this.THREE = THREE; this.CANNON = CANNON; this.container = document.getElementById('canvas-container'); this.ui = { ballStatus: document.getElementById('ball-status'), resetButton: document.getElementById('reset-button') }; window.motionEngine.setMode('holistic'); window.motionEngine.outputCanvas.style.display = 'block'; this._setup3DScene(); this._setupPhysics(); this._addObjects(); this._bindEvents(); this.lastTime = performance.now(); this._animate(); }
    destroy() { if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); window.removeEventListener('resize', this._onWindowResize); if (this.resultsListener) { const listeners = window.motionEngine.eventListeners.get('results-updated'); if (listeners) { const index = listeners.indexOf(this.resultsListener); if (index > -1) listeners.splice(index, 1); } } if (this.renderer) this.container.removeChild(this.renderer.domElement); }
    _bindEvents() { document.querySelector('.back-button').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger)); this.ui.resetButton.addEventListener('click', () => this.resetBall()); this.resultsListener = (results) => { this._updateHandsState(results); }; window.motionEngine.on('results-updated', this.resultsListener); this._onWindowResize = () => { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }; window.addEventListener('resize', this._onWindowResize); }
    _setup3DScene() { const THREE = this.THREE; this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.setPixelRatio(window.devicePixelRatio); this.renderer.shadowMap.enabled = true; this.container.appendChild(this.renderer.domElement); this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x22223b); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); this.camera.position.set(0, 1.5, 3); const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); this.scene.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); directionalLight.position.set(5, 10, 7.5); directionalLight.castShadow = true; this.scene.add(directionalLight); }
    
    // ✨ 核心修改 1：實現球形邊界
    _setupPhysics() { 
        const CANNON = this.CANNON; 
        this.physicsWorld = new CANNON.World(); 
        this.physicsWorld.gravity.set(0, -9.82, 0); 
        this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld); 
        this.physicsWorld.allowSleep = true; 
        
        this.wallMaterial = new CANNON.Material('wall'); 
        this.ballMaterial = new CANNON.Material('ball');
        const wallBallContactMaterial = new CANNON.ContactMaterial(this.wallMaterial, this.ballMaterial, { friction: 0.4, restitution: 0.7, });
        this.physicsWorld.addContactMaterial(wallBallContactMaterial);

        // 地板
        const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.wallMaterial });
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.physicsWorld.addBody(groundBody);

        // 球形邊界牆
        const sphereRadius = 6;
        const boundaryShape = new CANNON.Sphere(sphereRadius);
        const boundaryBody = new CANNON.Body({ mass: 0, material: this.wallMaterial });
        // 我哋需要一個「反轉」嘅球體，所以個 shape 係向內嘅。
        // Cannon-es 冇直接反轉 shape 嘅方法，但我哋可以創建一個巨大嘅靜態球體，
        // 波喺入面撞擊時，效果就等於一個空心球殼。
        // 一個更簡單嘅方法係，當波飛得太遠時將佢拉返嚟。
        // 但為咗實現你要求嘅物理邊界，我哋喺 animate loop 做一個手動邊界檢測。
    }

    _addObjects() { const THREE = this.THREE; const groundGeometry = new THREE.PlaneGeometry(20, 20); const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4e69 }); const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial); groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true; this.scene.add(groundMesh); const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0x444444); gridHelper.position.y = 0.01; this.scene.add(gridHelper); const ballRadius = 0.2; const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xfca311, emissive: 0x000000 }); this.ballOriginalColor = ballMaterial.color.clone(); this.ballHighlightColor = new THREE.Color(0x00ff00); const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32); const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial); ballMesh.position.set(0, 1.0, -1); ballMesh.castShadow = true; this.scene.add(ballMesh); this.ball = { mesh: ballMesh, body: null }; this.createBallBody(); this.gameobjects.push(this.ball); this.hands.left.skeleton = this._createHandSkeleton(0xff00ff); this.hands.right.skeleton = this._createHandSkeleton(0x00ffff); this.scene.add(this.hands.left.skeleton); this.scene.add(this.hands.right.skeleton); }
    _createHandSkeleton(color) { const THREE = this.THREE; const skeleton = new THREE.Group(); skeleton.visible = false; const jointMaterial = new THREE.MeshBasicMaterial({ color, opacity: 0.8, transparent: true }); const jointGeometry = new THREE.SphereGeometry(0.02, 8, 8); for (let i = 0; i < 21; i++) { skeleton.add(new THREE.Mesh(jointGeometry, jointMaterial)); } const boneMaterial = new THREE.LineBasicMaterial({ color, opacity: 0.8, transparent: true }); for (const connection of window.HAND_CONNECTIONS) { const points = [new THREE.Vector3(), new THREE.Vector3()]; const geometry = new THREE.BufferGeometry().setFromPoints(points); skeleton.add(new THREE.Line(geometry, boneMaterial)); } return skeleton; }
    createBallBody() { if (this.ball.body) { this.physicsWorld.removeBody(this.ball.body); } const CANNON = this.CANNON; const ballShape = new CANNON.Sphere(this.ball.mesh.geometry.parameters.radius); const ballBody = new CANNON.Body({ mass: 1, shape: ballShape, material: this.ballMaterial }); ballBody.position.copy(this.ball.mesh.position); this.physicsWorld.addBody(ballBody); this.ball.body = ballBody; }
    _updateHandsState(results) { const handData = { left: results.leftHandLandmarks, right: results.rightHandLandmarks }; for (const hand of ['left', 'right']) { const handLandmarks = handData[hand]; const handObj = this.hands[hand]; const rawWorldPos = this.landmarksToWorld(handLandmarks); const smoothedData = handObj.smoother.update(rawWorldPos); if (smoothedData) { handObj.state.isVisible = true; handObj.skeleton.visible = true; this.updateSkeleton(handObj.skeleton, smoothedData.landmarks); const indexMcp = smoothedData.landmarks[5]; const middleMcp = smoothedData.landmarks[9]; if (indexMcp && middleMcp) { handObj.state.x = (indexMcp.x + middleMcp.x) / 2; handObj.state.y = (indexMcp.y + middleMcp.y) / 2; handObj.state.z = (indexMcp.z + middleMcp.z) / 2; handObj.state.history.push({ pos: new this.CANNON.Vec3(handObj.state.x, handObj.state.y, handObj.state.z), time: performance.now() }); if (handObj.state.history.length > 10) { handObj.state.history.shift(); } } handObj.state.isPinching = window.isPinching(handLandmarks); } else { handObj.state.isVisible = false; handObj.skeleton.visible = false; handObj.state.isPinching = false; handObj.state.history = []; } } }
    landmarksToWorld(landmarks) { if (!landmarks || landmarks.length === 0) return null; const aspect = this.camera.aspect; const landmarks3D = []; for (let i = 0; i < landmarks.length; i++) { const lm = landmarks[i]; let ndcX = -((lm.x * 2) - 1); let ndcY = -((lm.y * 2) - 1); if (aspect > 1) { ndcX *= aspect; } else { ndcY /= aspect; } const worldPos = new this.THREE.Vector3( (ndcX * this.calibration.scale) + this.calibration.xOffset, (ndcY * this.calibration.scale) + this.calibration.yOffset, this.calibration.zOffset + (lm.z * 2.0) ); landmarks3D.push(worldPos); } return { landmarks: landmarks3D }; }
    updateSkeleton(skeleton, landmarks3D) { for (let i = 0; i < landmarks3D.length; i++) { if (skeleton.children[i]) { skeleton.children[i].position.copy(landmarks3D[i]); } } let lineIndex = 21; for (const c of window.HAND_CONNECTIONS) { const s = landmarks3D[c[0]]; const e = landmarks3D[c[1]]; const line = skeleton.children[lineIndex]; if(line && s && e) { const p = line.geometry.attributes.position.array; p[0]=s.x; p[1]=s.y; p[2]=s.z; p[3]=e.x; p[4]=e.y; p[5]=e.z; line.geometry.attributes.position.needsUpdate=true; } lineIndex++; } }

    // ✨ 核心修改 2：修正 lerp 用法
    _updateGameLogic() {
        if (!this.ball || !this.ui.ballStatus) return; 

        if (this.ballState === 'grabbing') {
            const handState = this.hands[this.grabbingHand].state;
            const handPos = new this.CANNON.Vec3(handState.x, handState.y, handState.z); 
            this.ball.mesh.position.lerp(handPos, 0.3);
            if (!handState.isPinching) { this.ballState = 'thrown'; this.createBallBody(); if (handState.history.length > 2) { const oldest = handState.history[0]; const newest = handState.history[handState.history.length-1]; const timeDiff = (newest.time - oldest.time) / 1000; if (timeDiff > 0) { const velocity = newest.pos.vsub(oldest.pos); velocity.scale(1 / timeDiff, velocity); const throwVelocity = velocity.scale(this.THROW_MULTIPLIER); this.ball.body.velocity.copy(throwVelocity); } } handState.history = []; this.grabbingHand = null; } 
        } else if (this.ballState === 'idle' || this.ballState === 'thrown') {
            let attractingHand = null;
            let isAnyHandPinching = false;
            
            for (const hand of ['left', 'right']) {
                if (this.hands[hand].state.isVisible && this.hands[hand].state.isPinching) {
                    isAnyHandPinching = true;
                    attractingHand = hand;
                    break;
                }
            }

            if (isAnyHandPinching && this.ball.body) {
                const handState = this.hands[attractingHand].state;
                const handPos = new this.CANNON.Vec3(handState.x, handState.y, handState.z);
                const distance = handPos.distanceTo(this.ball.body.position);
                
                const direction = handPos.vsub(this.ball.body.position).unit();
                const attractVelocity = direction.scale(this.ATTRACT_SPEED);
                
                // 正確嘅 cannon-es lerp 用法
                this.ball.body.velocity.lerp(attractVelocity, 0.2, this.ball.body.velocity);
                
                if (distance < this.GRAB_DISTANCE) {
                    this.ballState = 'grabbing';
                    this.grabbingHand = attractingHand;
                    if (this.ball.body) {
                        this.physicsWorld.removeBody(this.ball.body);
                        this.ball.body = null;
                    }
                }
            }
        } 
        
        this.ui.ballStatus.textContent = `Ball State: ${this.ballState}`; 
    }

    resetBall() { this.ballState = 'idle'; this.ball.mesh.position.set(0, 1.0, -1); this.createBallBody(); }
    
    // ✨ 核心修改 3：喺 Animate loop 加入手動邊界檢測
    _animate() {
        this.animationFrameId = requestAnimationFrame(() => this._animate()); 
        const time = performance.now(); 
        const deltaTime = (time - this.lastTime) / 1000; 
        this.lastTime = time; 

        this._updateGameLogic(); 
        
        if (this.physicsWorld) { this.physicsWorld.step(1 / 60, deltaTime, 3); } 

        // 手動邊界檢測
        const boundaryRadius = 5;
        if (this.ball.body && this.ball.body.position.length() > boundaryRadius) {
            // 如果波飛得太遠，就將佢嘅速度反轉，令佢彈返嚟
            this.ball.body.velocity.negate(this.ball.body.velocity);
        }
        
        for (const obj of this.gameobjects) { if (obj.body) { obj.mesh.position.copy(obj.body.position); obj.mesh.quaternion.copy(obj.body.quaternion); } } 
        if (this.renderer) { this.renderer.render(this.scene, this.camera); } 
    }
}