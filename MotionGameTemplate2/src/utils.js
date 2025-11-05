// src/utils.js

// getPalmCenterFromPose 和 isPinching 已經移到 motion-engine.js 成為全局函數

// 異步載入 3D 庫嘅輔助函數
window.load3DLibs = async function() {
    if (window.THREE && window.CANNON) {
        return [window.THREE, window.CANNON];
    }
    const threePromise = import('https://cdn.jsdelivr.net/npm/three@0.138.3/build/three.module.js');
    const cannonPromise = import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/+esm');
    
    // Promise.all 會並行載入，速度更快
    const [threeModule, cannonModule] = await Promise.all([threePromise, cannonPromise]);
    
    // 將佢哋掛載到 window object，方便後續直接調用
    window.THREE = threeModule;
    window.CANNON = cannonModule;
    
    return [window.THREE, window.CANNON];
}