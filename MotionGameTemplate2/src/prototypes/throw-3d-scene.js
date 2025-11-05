// src/prototypes/throw-3d-scene.js
import { BaseScene } from '../core/base-scene.js';

// **【核心】Three.js 資源徹底銷毀輔助函數**
function disposeThreeJsObject(obj, THREE) {
    if (!obj) return;
    
    if (obj.children && obj.children.length > 0) {
        for (let i = obj.children.length - 1; i >= 0; i--) {
            disposeThreeJsObject(obj.children[i], THREE);
        }
    }
    
    if (obj.geometry) {
        obj.geometry.dispose();
    }
    
    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(material => {
                if (material.map) material.map.dispose();
                material.dispose();
            });
        } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
        }
    }
    
    if (obj.parent) {
        obj.parent.remove(obj);
    }
}

export class Throw3DScene extends BaseScene {
    constructor() {
        super();
        this.THREE = null;
        this.CANNON = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.physicsWorld = null;
        
        this.hands = {
            left: { skeleton: null, state: { x: 0, y: 0, z: 0, isPinching: false, isVisible: false, history: [] }, smoother: null },
            right: { skeleton: null, state: { x: 0, y: 0, z: 0, isPinching: false, isVisible: false, history: [] }, smoother: null }
        };
        this.gameobjects = [];
        this.ball = null;
        this.ballMaterial = null;
        this.wallMaterial = null;
        this.ballState = 'idle';
        this.grabbingHand = null;

        this.calibration = { scale: 2.5, xOffset: 0.0, yOffset: 0.9, zOffset: -1.0 };
        this.lastTime = 0;
        this.ATTRACT_SPEED = 5;
        this.GRAB_DISTANCE = 0.4;
        this.THROW_MULTIPLIER = 50;

        this._onWindowResize = this._onWindowResize.bind(this);
    }
    
    renderHTML() {
        return `
            <style>
                .throw3d-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
                #canvas-container { width: 100%; height: 100%; z-index: 1; }
                #info-panel { position: absolute; top: 20px; left: 20px; z-index: 3; color: white; font-family: monospace; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; max-width: 300px; }
                #reset-button { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 4; padding: 10px 20px; font-size: 1em; background-color: #ffd700; color: #1a1a1a; border: none; border-radius: 8px; cursor: none; pointer-events: auto; }
            </style>
            <div class="throw3d-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <div id="canvas-container"></div>
                <div id="info-panel">
                    <h3>3D 投擲</h3>
                    <p>用任何一隻手捏合，即可吸附個波</p>
                    <p id="ball-status">Ball State: idle</p>
                </div>
                <button id="reset-button" data-motion-activatable>Reset Ball</button>
            </div>
        `;
    }
    
    createSmoother(THREE) {
        return class PointSmoother3D {
            constructor(smoothingFactor) {
                this.smoothingFactor = smoothingFactor;
                this.smoothedData = null;
            }
            update(rawData) {
                if (rawData && rawData.landmarks) {
                    if (!this.smoothedData) {
                        this.smoothedData = { landmarks: rawData.landmarks.map(p => p.clone()) };
                    } else {
                        for (let i = 0; i < rawData.landmarks.length; i++) {
                            if (this.smoothedData.landmarks[i] && rawData.landmarks[i]) {
                                this.smoothedData.landmarks[i].lerp(rawData.landmarks[i], 1 - this.smoothingFactor);
                            }
                        }
                    }
                    return this.smoothedData;
                }
                this.smoothedData = null;
                return null;
            }
        }
    }
    
    async onInit() {
        const [THREE, CANNON] = await window.load3DLibs();
        this.THREE = THREE;
        this.CANNON = CANNON;
        
        const PointSmoother3D = this.createSmoother(THREE);
        this.hands.left.smoother = new PointSmoother3D(0.7);
        this.hands.right.smoother = new PointSmoother3D(0.7);
        
        this.container = document.getElementById('canvas-container');
        this.ui = {
            ballStatus: document.getElementById('ball-status'),
            resetButton: document.getElementById('reset-button')
        };
        
        this.motionEngine.setMode('holistic');
        this.motionEngine.outputCanvas.style.display = 'block';
        
        this._setup3DScene();
        this._setupPhysics();
        this._addObjects();
        this._bindEvents();
        
        this.lastTime = performance.now();
    }

    onDestroy() {
        console.log("[Throw3DScene] Starting destruction of Three.js & Cannon.js resources...");
        
        if (this.physicsWorld) {
            while (this.physicsWorld.bodies.length > 0) {
                this.physicsWorld.removeBody(this.physicsWorld.bodies[0]);
            }
            this.physicsWorld = null;
        }

        if (this.scene) {
            disposeThreeJsObject(this.scene, this.THREE);
            this.scene = null;
        }

        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentElement) {
                this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }
        
        this.camera = null;
        this.gameobjects = [];
        this.ball = null;
        this.hands = null;
        this.THREE = null;
        this.CANNON = null;
        
        console.log("[Throw3DScene] All 3D and physics resources completely destroyed.");
    }
    
    _bindEvents() {
        this.addManagedEventListener(this.ui.resetButton, 'click', () => this.resetBall());
        this.addManagedEventListener(window, 'resize', this._onWindowResize);
        this.listenToMotionResults();
    }

    _setup3DScene() {
        const T = this.THREE;
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        this.scene = new T.Scene();
        this.scene.background = new T.Color(0x22223b);
        this.camera = new T.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.5, 3);
        const aL = new T.AmbientLight(0xffffff, 0.6);
        this.scene.add(aL);
        const dL = new T.DirectionalLight(0xffffff, 1.0);
        dL.position.set(5, 10, 7.5);
        dL.castShadow = true;
        this.scene.add(dL);
    }

    _setupPhysics() {
        const C = this.CANNON;
        this.physicsWorld = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
        this.physicsWorld.broadphase = new C.SAPBroadphase(this.physicsWorld);
        this.physicsWorld.allowSleep = true;
        this.wallMaterial = new C.Material('wall');
        this.ballMaterial = new C.Material('ball');
        const contactMaterial = new C.ContactMaterial(this.wallMaterial, this.ballMaterial, { friction: 0.4, restitution: 0.7 });
        this.physicsWorld.addContactMaterial(contactMaterial);
        const groundBody = new C.Body({ mass: 0, shape: new C.Plane(), material: this.wallMaterial });
        groundBody.quaternion.setFromAxisAngle(new C.Vec3(1, 0, 0), -Math.PI / 2);
        this.physicsWorld.addBody(groundBody);
    }
    
    _addObjects() {
        const T = this.THREE;
        const groundGeometry = new T.PlaneGeometry(20, 20);
        const groundMaterial = new T.MeshStandardMaterial({ color: 0x4a4e69 });
        const groundMesh = new T.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);
        
        const grid = new T.GridHelper(20, 20, 0x888888, 0x444444);
        grid.position.y = 0.01;
        this.scene.add(grid);
        
        const ballRadius = 0.2;
        const ballMaterial = new T.MeshStandardMaterial({ color: 0xfca311 });
        const ballGeometry = new T.SphereGeometry(ballRadius, 32, 32);
        const ballMesh = new T.Mesh(ballGeometry, ballMaterial);
        ballMesh.position.set(0, 1, -1);
        ballMesh.castShadow = true;
        this.scene.add(ballMesh);
        
        this.ball = { mesh: ballMesh, body: null };
        this.createBallBody();
        this.gameobjects.push(this.ball);
        
        this.hands.left.skeleton = this._createHandSkeleton(0xff00ff);
        this.hands.right.skeleton = this._createHandSkeleton(0x00ffff);
        this.scene.add(this.hands.left.skeleton);
        this.scene.add(this.hands.right.skeleton);
    }
    
    _createHandSkeleton(color) {
        const T = this.THREE;
        const s = new T.Group();
        s.visible = false;
        const jm = new T.MeshBasicMaterial({ color: color, opacity: 0.8, transparent: true });
        const jg = new T.SphereGeometry(0.02, 8, 8);
        for (let i = 0; i < 21; i++) {
            s.add(new T.Mesh(jg.clone(), jm.clone()));
        }
        const bm = new T.LineBasicMaterial({ color: color, opacity: 0.8, transparent: true });
        for (const con of window.HAND_CONNECTIONS) {
            const p = [new T.Vector3(), new T.Vector3()];
            const g = new T.BufferGeometry().setFromPoints(p);
            s.add(new T.Line(g, bm.clone()));
        }
        return s;
    }
    
    onUpdate(timestamp) {
        if (!this.physicsWorld) return;
        
        const deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        
        this._updateGameLogic();
        
        this.physicsWorld.step(1 / 60, deltaTime, 3);
        
        if (this.ball && this.ball.body && this.ball.body.position.length() > 6) {
            this.ball.body.velocity.negate(this.ball.body.velocity);
        }
        
        for (const obj of this.gameobjects) {
            if (obj.body && obj.mesh) {
                obj.mesh.position.copy(obj.body.position);
                obj.mesh.quaternion.copy(obj.body.quaternion);
            }
        }
    }
    
    onDraw() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    onResults(results) {
        this._updateHandsState(results);
    }
    
    _updateHandsState(results) {
        if (!this.hands) return;
        const d = { left: results.leftHandLandmarks, right: results.rightHandLandmarks };
        for (const h of ['left', 'right']) {
            const o = this.hands[h];
            const s = o.smoother.update(this.landmarksToWorld(d[h]));
            if (s) {
                o.state.isVisible = true;
                o.skeleton.visible = true;
                this.updateSkeleton(o.skeleton, s.landmarks);
                const i = s.landmarks[5], m = s.landmarks[9];
                if (i && m) {
                    o.state.x = (i.x + m.x) / 2;
                    o.state.y = (i.y + m.y) / 2;
                    o.state.z = (i.z + m.z) / 2;
                    o.state.history.push({ pos: new this.CANNON.Vec3(o.state.x, o.state.y, o.state.z), time: performance.now() });
                    if (o.state.history.length > 10) o.state.history.shift();
                }
                o.state.isPinching = window.isPinching(d[h]);
            } else {
                o.state.isVisible = false;
                o.skeleton.visible = false;
                o.state.isPinching = false;
                o.state.history = [];
            }
        }
    }
    
    landmarksToWorld(landmarks) {
        if (!landmarks || landmarks.length === 0) return null;
        const aspect = this.camera.aspect;
        const landmarks3D = [];
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            let ndcX = -(lm.x * 2 - 1);
            let ndcY = -(lm.y * 2 - 1);
            if (aspect > 1) {
                ndcX *= aspect;
            } else {
                ndcY /= aspect;
            }
            const worldPos = new this.THREE.Vector3(
                (ndcX * this.calibration.scale) + this.calibration.xOffset,
                (ndcY * this.calibration.scale) + this.calibration.yOffset,
                this.calibration.zOffset + (lm.z * 2)
            );
            landmarks3D.push(worldPos);
        }
        return { landmarks: landmarks3D };
    }
    
    updateSkeleton(skeleton, landmarks3D) {
        for (let i = 0; i < landmarks3D.length; i++) {
            if (skeleton.children[i]) {
                skeleton.children[i].position.copy(landmarks3D[i]);
            }
        }
        let lineIndex = 21;
        for (const c of window.HAND_CONNECTIONS) {
            const start = landmarks3D[c[0]];
            const end = landmarks3D[c[1]];
            const line = skeleton.children[lineIndex];
            if (line && start && end) {
                const positions = line.geometry.attributes.position.array;
                positions.set([...start.toArray(), ...end.toArray()]);
                line.geometry.attributes.position.needsUpdate = true;
            }
            lineIndex++;
        }
    }

    _updateGameLogic() {
        if (!this.ball || !this.ui.ballStatus || !this.hands) return;
        if (this.ballState === 'grabbing') {
            const handState = this.hands[this.grabbingHand].state;
            const handPos = new this.THREE.Vector3(handState.x, handState.y, handState.z);
            this.ball.mesh.position.lerp(handPos, 0.3);
            if (!handState.isPinching) {
                this.ballState = 'thrown';
                this.createBallBody();
                if (handState.history.length > 2) {
                    const oldest = handState.history[0];
                    const newest = handState.history[handState.history.length - 1];
                    const timeDiff = (newest.time - oldest.time) / 1000;
                    if (timeDiff > 0) {
                        const velocity = newest.pos.vsub(oldest.pos);
                        velocity.scale(1 / timeDiff, velocity);
                        const throwVelocity = velocity.scale(this.THROW_MULTIPLIER);
                        this.ball.body.velocity.copy(throwVelocity);
                    }
                }
                handState.history = [];
                this.grabbingHand = null;
            }
        } else if (this.ballState === 'idle' || this.ballState === 'thrown') {
            let attractingHand = null;
            for (const h of ['left', 'right']) {
                if (this.hands[h].state.isVisible && this.hands[h].state.isPinching) {
                    attractingHand = h;
                    break;
                }
            }
            if (attractingHand && this.ball.body) {
                const handState = this.hands[attractingHand].state;
                const handPos = new this.CANNON.Vec3(handState.x, handState.y, handState.z);
                const distance = handPos.distanceTo(this.ball.body.position);
                const direction = handPos.vsub(this.ball.body.position).unit();
                const attractVelocity = direction.scale(this.ATTRACT_SPEED);
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
    
    resetBall() {
        if (!this.ball || !this.physicsWorld) return;
        this.ballState = 'idle';
        const resetPosition = new this.THREE.Vector3(0, 1, -1);
        this.ball.mesh.position.copy(resetPosition);
        
        if (this.ball.body) {
            this.ball.body.position.copy(resetPosition);
            this.ball.body.velocity.set(0, 0, 0);
            this.ball.body.angularVelocity.set(0, 0, 0);
        } else {
            this.createBallBody();
        }
    }

    createBallBody() {
        if (!this.physicsWorld || !this.ball) return;
        if (this.ball.body) this.physicsWorld.removeBody(this.ball.body);
        
        const C = this.CANNON;
        const shape = new C.Sphere(this.ball.mesh.geometry.parameters.radius);
        const body = new C.Body({ mass: 1, shape, material: this.ballMaterial });
        body.position.copy(this.ball.mesh.position);
        this.physicsWorld.addBody(body);
        this.ball.body = body;
    }

    _onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}