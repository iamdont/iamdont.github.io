// src/utils.js

// ✨ 核心修改 1：將 PointSmoother 移到此處，並徹底修正
window.PointSmoother = class {
    constructor(smoothingFactor = 0.8) {
        this.smoothingFactor = smoothingFactor;
        this.smoothedData = null;
    }

    update(rawData) {
        if (rawData && rawData.landmarks) {
            // 如果冇舊數據，就做一次深度複製，建立初始狀態
            if (!this.smoothedData) {
                this.smoothedData = {
                    landmarks: rawData.landmarks.map(p => p.clone())
                };
            } else {
                // 遍歷所有關節點，逐個進行平滑
                for (let i = 0; i < rawData.landmarks.length; i++) {
                    if (this.smoothedData.landmarks[i] && rawData.landmarks[i]) {
                        // 正確嘅 lerp 寫法，直接對 Vector3 物件操作
                        this.smoothedData.landmarks[i].lerp(rawData.landmarks[i], 1 - this.smoothingFactor);
                    }
                }
            }
            return this.smoothedData;
        } else {
            // 如果冇新數據，就清除舊數據
            this.smoothedData = null;
            return null;
        }
    }

    reset() {
        this.smoothedData = null;
    }
}


window.getPalmCenterFromPose = function(landmarks, hand = 'right') {
    if (!landmarks) return null;
    const isLeft = hand === 'left';
    const wristIdx = isLeft ? 15 : 16;
    const pinkyIdx = isLeft ? 17 : 18;
    const indexIdx = isLeft ? 19 : 20;
    const wrist = landmarks[wristIdx], pinky = landmarks[pinkyIdx], index = landmarks[indexIdx];
    if (wrist && pinky && index && wrist.visibility > 0.3 && pinky.visibility > 0.3 && index.visibility > 0.3) {
        return { x: (wrist.x + pinky.x + index.x) / 3, y: (wrist.y + pinky.y + index.y) / 3 };
    }
    return null;
}

window.isPinching = function(handLandmarks, threshold = 0.04) {
    if (!handLandmarks || handLandmarks.length < 9) {
        return false;
    }
    const thumbTip = handLandmarks[4];
    const indexTip = handLandmarks[8];
    const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    return distance < threshold;
}

window.load3DLibs = async function() {
    if (window.THREE && window.CANNON) {
        return [window.THREE, window.CANNON];
    }
    const threePromise = import('https://cdn.jsdelivr.net/npm/three@0.138.3/build/three.module.js');
    const cannonPromise = import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/+esm');
    const [threeModule, cannonModule] = await Promise.all([threePromise, cannonPromise]);
    window.THREE = threeModule;
    window.CANNON = cannonModule;
    return [window.THREE, window.CANNON];
}