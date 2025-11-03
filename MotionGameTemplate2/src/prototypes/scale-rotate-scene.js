// src/prototypes/scale-rotate-scene.js

class PointSmoother { constructor(smoothingFactor = 0.8) { this.smoothingFactor = smoothingFactor; this.smoothedData = null; } update(rawData) { if (rawData && rawData.landmarks) { if (!this.smoothedData) { this.smoothedData = { landmarks: rawData.landmarks.map(p => p.clone()) }; } else { for (let i = 0; i < rawData.landmarks.length; i++) { if (this.smoothedData.landmarks[i] && rawData.landmarks[i]) { this.smoothedData.landmarks[i].lerp(rawData.landmarks[i], 1 - this.smoothingFactor); } } } return this.smoothedData; } else { this.smoothedData = null; return null; } } reset() { this.smoothedData = null; } }

export class ScaleRotateScene {
    constructor() {
        this.renderer = null; this.scene = null; this.camera = null; this.targetObject = null;
        this.animationFrameId = null; this.resultsListener = null;
        this.hands = {
            left: { isPinching: false, pos: null, skeleton: null, smoother: new PointSmoother(0.7) },
            right: { isPinching: false, pos: null, skeleton: null, smoother: new PointSmoother(0.7) }
        };
        this.interactionState = {
            isInteracting: false,
            lastCenter: null,
            lastDistance: 0,
            lastVector: null
        };
        this.grabLine = null;
        this.calibration = { scale: 2.5, xOffset: 0.0, yOffset: 0.9, zOffset: -1.0, };
    }

    render() { return ` <style> .sr-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; } #canvas-container { width: 100%; height: 100%; } #info-panel { position: absolute; top: 80px; left: 20px; color: white; font-family: monospace; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; } </style> <div class="sr-scene"> <a class="back-button" data-scene-changer="launcher" data-motion-activatable> <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg> </a> <div id="canvas-container"></div> <div id="info-panel"> <h3>原型 F: 雙手縮放與旋轉</h3> <p>請同時用雙手做出捏合手勢</p> <p id="left-hand-status">左手: 未檢測到</p> <p id="right-hand-status">右手: 未檢測到</p> </div> </div> `; }
    async init() { const [THREE] = await window.load3DLibs(); this.THREE = THREE; this.hands.left.pos = new THREE.Vector3(); this.hands.right.pos = new THREE.Vector3(); this.container = document.getElementById('canvas-container'); this.ui = { leftStatus: document.getElementById('left-hand-status'), rightStatus: document.getElementById('right-hand-status'), }; window.motionEngine.setMode('holistic'); window.motionEngine.outputCanvas.style.display = 'none'; this._setup3DScene(); this._addObjects(); this._bindEvents(); this._animate(); }
    destroy() { if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); window.removeEventListener('resize', this._onWindowResize); if (this.resultsListener) { const listeners = window.motionEngine.eventListeners.get('results-updated'); if (listeners) { const index = listeners.indexOf(this.resultsListener); if (index > -1) listeners.splice(index, 1); } } if (this.renderer) this.container.removeChild(this.renderer.domElement); }
    _bindEvents() { document.querySelector('.back-button').addEventListener('click', (e) => window.sceneManager.loadScene(e.currentTarget.dataset.sceneChanger)); this.resultsListener = (results) => { this._updateHandsState(results); }; window.motionEngine.on('results-updated', this.resultsListener); this._onWindowResize = () => { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }; window.addEventListener('resize', this._onWindowResize); }
    _setup3DScene() { const THREE = this.THREE; this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); this.renderer.setSize(window.innerWidth, window.innerHeight); this.renderer.setPixelRatio(window.devicePixelRatio); this.container.appendChild(this.renderer.domElement); this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x1d2d3d); this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); this.camera.position.set(0, 1, 4); this.scene.add(new THREE.AmbientLight(0xffffff, 0.7)); const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); dirLight.position.set(5, 5, 5); this.scene.add(dirLight); }
    _addObjects() { const THREE = this.THREE; const geometry = new THREE.BoxGeometry(1, 1, 1); const material = new THREE.MeshStandardMaterial({ color: 0x0099ff, roughness: 0.3, metalness: 0.2 }); this.targetObject = new THREE.Mesh(geometry, material); this.targetObject.position.y = 1.5; this.scene.add(this.targetObject); const gridHelper = new THREE.GridHelper(10, 10); this.scene.add(gridHelper); this.hands.left.skeleton = this._createHandSkeleton(0xff00ff); this.hands.right.skeleton = this._createHandSkeleton(0x00ffff); this.scene.add(this.hands.left.skeleton); this.scene.add(this.hands.right.skeleton); const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffd700 }); const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); this.grabLine = new THREE.Line(lineGeometry, lineMaterial); this.grabLine.visible = false; this.scene.add(this.grabLine); }
    _createHandSkeleton(color) { const THREE = this.THREE; const skeleton = new THREE.Group(); skeleton.visible = false; const jointMaterial = new THREE.MeshBasicMaterial({ color }); const jointGeometry = new THREE.SphereGeometry(0.02, 8, 8); for (let i = 0; i < 21; i++) { skeleton.add(new THREE.Mesh(jointGeometry, jointMaterial)); } const boneMaterial = new THREE.LineBasicMaterial({ color }); for (const connection of window.HAND_CONNECTIONS) { const points = [new THREE.Vector3(), new THREE.Vector3()]; const geometry = new THREE.BufferGeometry().setFromPoints(points); skeleton.add(new THREE.Line(geometry, boneMaterial)); } return skeleton; }
    _updateHandsState(results) { const handData = { left: results.leftHandLandmarks, right: results.rightHandLandmarks }; for (const hand of ['left', 'right']) { const handLandmarks = handData[hand]; const handObj = this.hands[hand]; const rawWorldPos = this._landmarksToWorld(handLandmarks); const smoothedData = handObj.smoother.update(rawWorldPos); if (smoothedData) { handObj.skeleton.visible = true; this._updateSkeleton(handObj.skeleton, smoothedData.landmarks); const indexMcp = smoothedData.landmarks[5]; const middleMcp = smoothedData.landmarks[9]; if (indexMcp && middleMcp) { handObj.pos.set( (indexMcp.x + middleMcp.x) / 2, (indexMcp.y + middleMcp.y) / 2, (indexMcp.z + middleMcp.z) / 2 ); } handObj.isPinching = window.isPinching(handLandmarks); this.ui[`${hand}Status`].textContent = `${hand}: ${handObj.isPinching ? '捏合' : '張開'}`; } else { handObj.skeleton.visible = false; handObj.isPinching = false; this.ui[`${hand}Status`].textContent = `${hand}: 未檢測到`; } } this._handleTwoHandInteraction(); }
    _landmarksToWorld(landmarks) { if (!landmarks || landmarks.length === 0) return null; const aspect = this.camera.aspect; const landmarks3D = []; for (let i = 0; i < landmarks.length; i++) { const lm = landmarks[i]; let ndcX = -((lm.x * 2) - 1); let ndcY = -((lm.y * 2) - 1); if (aspect > 1) { ndcX *= aspect; } else { ndcY /= aspect; } const worldPos = new this.THREE.Vector3( (ndcX * this.calibration.scale) + this.calibration.xOffset, (ndcY * this.calibration.scale) + this.calibration.yOffset, this.calibration.zOffset + (lm.z * 2.0) ); landmarks3D.push(worldPos); } return { landmarks: landmarks3D }; }
    _updateSkeleton(skeleton, landmarks3D) { for (let i = 0; i < landmarks3D.length; i++) { if (skeleton.children[i]) { skeleton.children[i].position.copy(landmarks3D[i]); } } let lineIndex = 21; for (const c of window.HAND_CONNECTIONS) { const s = landmarks3D[c[0]]; const e = landmarks3D[c[1]]; const line = skeleton.children[lineIndex]; if(line && s && e) { const p = line.geometry.attributes.position.array; p[0]=s.x; p[1]=s.y; p[2]=s.z; p[3]=e.x; p[4]=e.y; p[5]=e.z; line.geometry.attributes.position.needsUpdate=true; } lineIndex++; } }

    // ✨ 核心修正：還原到穩定嘅 6DoF 旋轉邏輯
    _handleTwoHandInteraction() {
        const leftHand = this.hands.left;
        const rightHand = this.hands.right;
        const isInteractingNow = leftHand.isPinching && rightHand.isPinching;

        this.grabLine.visible = isInteractingNow;
        if (isInteractingNow) {
            const positions = this.grabLine.geometry.attributes.position.array;
            positions[0] = leftHand.pos.x; positions[1] = leftHand.pos.y; positions[2] = leftHand.pos.z;
            positions[3] = rightHand.pos.x; positions[4] = rightHand.pos.y; positions[5] = rightHand.pos.z;
            this.grabLine.geometry.attributes.position.needsUpdate = true;
        }

        if (isInteractingNow) {
            const currentCenter = new this.THREE.Vector3().addVectors(leftHand.pos, rightHand.pos).multiplyScalar(0.5);
            const currentDistance = leftHand.pos.distanceTo(rightHand.pos);
            const currentVector = new this.THREE.Vector3().subVectors(rightHand.pos, leftHand.pos);

            if (!this.interactionState.isInteracting) {
                this.interactionState.lastCenter = currentCenter;
                this.interactionState.lastDistance = currentDistance;
                this.interactionState.lastVector = currentVector;
            } else {
                const deltaCenter = new this.THREE.Vector3().subVectors(currentCenter, this.interactionState.lastCenter);
                this.targetObject.position.add(deltaCenter);

                if (this.interactionState.lastDistance > 0.01) {
                    const scaleFactor = currentDistance / this.interactionState.lastDistance;
                    this.targetObject.scale.multiplyScalar(scaleFactor);
                }

                if (this.interactionState.lastVector.length() > 0.01 && currentVector.length() > 0.01) {
                    const quaternion = new this.THREE.Quaternion().setFromUnitVectors(
                        this.interactionState.lastVector.clone().normalize(),
                        currentVector.clone().normalize()
                    );
                    this.targetObject.quaternion.premultiply(quaternion);
                }
                
                this.interactionState.lastCenter = currentCenter;
                this.interactionState.lastDistance = currentDistance;
                this.interactionState.lastVector = currentVector;
            }
        }
        this.interactionState.isInteracting = isInteractingNow;
    }

    _animate() {
        this.animationFrameId = requestAnimationFrame(() => this._animate());
        if (!this.interactionState.isInteracting) {
            this.targetObject.rotation.y += 0.005;
        }
        this.renderer.render(this.scene, this.camera);
    }
}