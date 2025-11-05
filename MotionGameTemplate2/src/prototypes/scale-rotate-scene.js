// src/prototypes/scale-rotate-scene.js (更新後)
// [FIX #2] 調整校準參數，確保骨架唔會輕易移出畫面

import { BaseScene } from '../core/base-scene.js';

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

export class ScaleRotateScene extends BaseScene {
    constructor() {
        super();
        this.THREE = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.targetObject = null;
        
        this.hands = {
            left: { isPinching: false, pos: null, skeleton: null, smoother: null },
            right: { isPinching: false, pos: null, skeleton: null, smoother: null }
        };
        this.interactionState = { isInteracting: false, lastCenter: null, lastDistance: 0, lastVector: null };
        this.grabLine = null;
        
        // [FIX #2] 調整校準參數：
        // 1. scale 減細，令手部移動範圍喺 3D 空間中嘅映射範圍縮細。
        // 2. zOffset 減細 (更負)，將整個交互空間向後推，遠離鏡頭。
        this.calibration = { scale: 2.0, xOffset: 0, yOffset: 1.2, zOffset: -2.0 };
        
        this._onWindowResize = this._onWindowResize.bind(this);
    }

    createSmoother(THREE) {
        return class PointSmoother3D {
            constructor(smoothingFactor = 0.8) {
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

    renderHTML() {
        return `
            <style>
                .sr-scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
                #canvas-container { width: 100%; height: 100%; }
                #info-panel { position: absolute; top: 80px; left: 20px; color: white; font-family: monospace; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; }
            </style>
            <div class="sr-scene">
                <a class="back-button" data-scene-changer="scenes/launcher" data-motion-activatable>
                    <svg viewBox="0 0 24 24"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
                </a>
                <div id="canvas-container"></div>
                <div id="info-panel">
                    <h3>原型 F: 雙手縮放與旋轉</h3>
                    <p>請同時用雙手做出捏合手勢</p>
                    <p id="left-hand-status">左手: 未檢測到</p>
                    <p id="right-hand-status">右手: 未檢測到</p>
                </div>
            </div>
        `;
    }

    async onInit() {
        const [THREE] = await window.load3DLibs();
        this.THREE = THREE;
        
        const PointSmoother3D = this.createSmoother(THREE);
        this.hands.left.smoother = new PointSmoother3D(0.7);
        this.hands.right.smoother = new PointSmoother3D(0.7);
        this.hands.left.pos = new THREE.Vector3();
        this.hands.right.pos = new THREE.Vector3();
        
        this.container = document.getElementById('canvas-container');
        this.ui = {
            leftStatus: document.getElementById('left-hand-status'),
            rightStatus: document.getElementById('right-hand-status'),
        };

        this.motionEngine.setMode('holistic');
        // [FIX #1] 顯示指針，確保返回按鈕可以被觸發
        this.motionEngine.showPointer(true);
        
        this._setup3DScene();
        this._addObjects();
        this._bindEvents();
    }

    onDestroy() {
        console.log("[ScaleRotateScene] Starting destruction of Three.js resources...");
        
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
        this.targetObject = null;
        this.hands = null;
        this.THREE = null;
        
        console.log("[ScaleRotateScene] Three.js resources completely destroyed.");
    }
    
    _bindEvents() {
        this.addManagedEventListener(window, 'resize', this._onWindowResize);
        this.listenToMotionResults();
    }

    _setup3DScene() {
        const T = this.THREE;
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        this.scene = new T.Scene();
        this.scene.background = new T.Color(0x1d2d3d);
        
        this.camera = new T.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.5, 4);
        
        this.scene.add(new T.AmbientLight(0xffffff, 0.7));
        const dirLight = new T.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);
    }

    _addObjects() {
        const T = this.THREE;
        const geometry = new T.BoxGeometry(1, 1, 1);
        const material = new T.MeshStandardMaterial({ color: 0x0099ff, roughness: 0.3, metalness: 0.2 });
        this.targetObject = new T.Mesh(geometry, material);
        this.targetObject.position.y = 1.5;
        this.scene.add(this.targetObject);

        this.scene.add(new T.GridHelper(10, 10));

        this.hands.left.skeleton = this._createHandSkeleton(0xff00ff);
        this.hands.right.skeleton = this._createHandSkeleton(0x00ffff);
        this.scene.add(this.hands.left.skeleton, this.hands.right.skeleton);

        const lineMaterial = new T.LineBasicMaterial({ color: 0xffd700 });
        const lineGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
        this.grabLine = new T.Line(lineGeometry, lineMaterial);
        this.grabLine.visible = false;
        this.scene.add(this.grabLine);
    }

    _createHandSkeleton(color) {
        const T = this.THREE;
        const skeletonGroup = new T.Group();
        skeletonGroup.visible = false;
        
        const jointMaterial = new T.MeshBasicMaterial({ color: color });
        const jointGeometry = new T.SphereGeometry(0.02, 8, 8);
        for (let i = 0; i < 21; i++) {
            skeletonGroup.add(new T.Mesh(jointGeometry, jointMaterial));
        }

        const boneMaterial = new T.LineBasicMaterial({ color: color });
        for (const connection of window.HAND_CONNECTIONS) {
            const points = [new T.Vector3(), new T.Vector3()];
            const geometry = new T.BufferGeometry().setFromPoints(points);
            skeletonGroup.add(new T.Line(geometry, boneMaterial));
        }
        return skeletonGroup;
    }

    onUpdate() {
        this._updateHandsState();
        if (!this.interactionState.isInteracting && this.targetObject) {
            this.targetObject.rotation.y += 0.005;
        }
    }
    
    onDraw() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    _updateHandsState() {
        if (!this.latestResults) return;
        
        const landmarksData = {
            left: this.latestResults.leftHandLandmarks,
            right: this.latestResults.rightHandLandmarks
        };

        for (const hand of ['left', 'right']) {
            const handState = this.hands[hand];
            const smoothedData = handState.smoother.update(this._landmarksToWorld(landmarksData[hand]));
            
            if (smoothedData) {
                handState.skeleton.visible = true;
                this._updateSkeleton(handState.skeleton, smoothedData.landmarks);
                
                const indexMCP = smoothedData.landmarks[5];
                const middleMCP = smoothedData.landmarks[9];
                if (indexMCP && middleMCP) {
                    handState.pos.set((indexMCP.x + middleMCP.x) / 2, (indexMCP.y + middleMCP.y) / 2, (indexMCP.z + middleMCP.z) / 2);
                }
                handState.isPinching = window.isPinching(landmarksData[hand]);
                this.ui[`${hand}Status`].textContent = `${hand}: ${handState.isPinching ? '捏合' : '張開'}`;
            } else {
                handState.skeleton.visible = false;
                handState.isPinching = false;
                this.ui[`${hand}Status`].textContent = `${hand}: 未檢測到`;
            }
        }
        this._handleTwoHandInteraction();
    }

    _landmarksToWorld(landmarks) {
        if (!landmarks || landmarks.length === 0) return null;
        
        const aspect = window.innerWidth / window.innerHeight; // 使用當前窗口 aspect ratio
        const landmarks3D = [];
        for (const lm of landmarks) {
            // 將 0-1 坐標轉換為 NDC (-1 to 1)
            let ndcX = -(lm.x * 2 - 1);
            let ndcY = -(lm.y * 2 - 1);
            
            // 根據 aspect ratio 調整，防止變形
            if (aspect > 1) ndcX *= aspect;
            else ndcY /= aspect;
            
            landmarks3D.push(new this.THREE.Vector3(
                (ndcX * this.calibration.scale) + this.calibration.xOffset,
                (ndcY * this.calibration.scale) + this.calibration.yOffset,
                this.calibration.zOffset + (lm.z * 2)
            ));
        }
        return { landmarks: landmarks3D };
    }

    _updateSkeleton(skeleton, landmarks3D) {
        for (let i = 0; i < landmarks3D.length; i++) {
            if (skeleton.children[i]) skeleton.children[i].position.copy(landmarks3D[i]);
        }
        
        let lineIndex = 21;
        for (const connection of window.HAND_CONNECTIONS) {
            const startPoint = landmarks3D[connection[0]];
            const endPoint = landmarks3D[connection[1]];
            const line = skeleton.children[lineIndex];
            
            if (line && startPoint && endPoint) {
                const positions = line.geometry.attributes.position.array;
                positions.set([...startPoint.toArray(), ...endPoint.toArray()]);
                line.geometry.attributes.position.needsUpdate = true;
            }
            lineIndex++;
        }
    }

    _handleTwoHandInteraction() {
        const { left: leftHand, right: rightHand } = this.hands;
        const isInteractingNow = leftHand.isPinching && rightHand.isPinching;
        
        this.grabLine.visible = isInteractingNow;
        if (isInteractingNow) {
            const linePositions = this.grabLine.geometry.attributes.position.array;
            linePositions.set([...leftHand.pos.toArray(), ...rightHand.pos.toArray()]);
            this.grabLine.geometry.attributes.position.needsUpdate = true;
            
            const currentCenter = new this.THREE.Vector3().addVectors(leftHand.pos, rightHand.pos).multiplyScalar(0.5);
            const currentDistance = leftHand.pos.distanceTo(rightHand.pos);
            const currentVector = new this.THREE.Vector3().subVectors(rightHand.pos, leftHand.pos);
            
            if (!this.interactionState.isInteracting) {
                this.interactionState.lastCenter = currentCenter.clone();
                this.interactionState.lastDistance = currentDistance;
                this.interactionState.lastVector = currentVector.clone();
            } else {
                const deltaCenter = new this.THREE.Vector3().subVectors(currentCenter, this.interactionState.lastCenter);
                this.targetObject.position.add(deltaCenter);
                
                if (this.interactionState.lastDistance > 0.01) {
                    this.targetObject.scale.multiplyScalar(currentDistance / this.interactionState.lastDistance);
                }
                
                if (this.interactionState.lastVector.lengthSq() > 0.0001 && currentVector.lengthSq() > 0.0001) {
                    const quaternion = new this.THREE.Quaternion().setFromUnitVectors(
                        this.interactionState.lastVector.clone().normalize(),
                        currentVector.clone().normalize()
                    );
                    this.targetObject.quaternion.premultiply(quaternion);
                }

                this.interactionState.lastCenter.copy(currentCenter);
                this.interactionState.lastDistance = currentDistance;
                this.interactionState.lastVector.copy(currentVector);
            }
        }
        this.interactionState.isInteracting = isInteractingNow;
    }
    
    _onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}