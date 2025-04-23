import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 基本設定 & グローバル変数 ---------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 80);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- カメラオフセットとズーム範囲 ---
let cameraOffset = new THREE.Vector3(0, 4, 8); // 初期オフセット (調整可能)
const minZoom = 3;
const maxZoom = 20;

// --- プレイヤーと操作関連の変数 ---
let playerModel = null;
const playerInput = { rotateLeft: false, rotateRight: false }; // 回転用
const rotationSpeed = Math.PI / 100; // 回転速度 (調整可能)
const playerMinY = 0.5; // Y座標範囲 (調整可能)
const playerMaxY = 12.0; // Y座標範囲 (調整可能)
let isDragging = false;
const dragSensitivityX = 0.012; // 水平ドラッグ感度 (調整可能)
const dragSensitivityY = 0.012; // 垂直ドラッグ感度 (調整可能)

// --- 敵関連の変数 ---
const loader = new GLTFLoader(); // GLTFローダー
const enemyModels = []; // 読み込んだ敵モデルデータ
let activeEnemies = []; // アクティブな敵インスタンス
const maxEnemies = 20; // 同時に出現する敵の最大数 (調整可能)
const enemySpawnZ = -80; // 敵が出現するZ座標
const enemyDespawnZ = 15; // 敵が消えるZ座標
let enemySpawnTimer = 0;
let nextSpawnInterval = Math.random() * 1.5 + 0.5; // 次の敵生成までの時間 (調整可能)

// --- ゲーム状態管理 ---
let modelsLoaded = false;
let gameStartTime; // ゲーム開始時間 (宣言)
let animationId = null;
const clock = new THREE.Clock();

// --- モデルファイルのパス (★★★ 必ず書き換えてください！ ★★★) ---
const playerModelPath = 'models/your_player_model_name.glb'; // ← あなたのプレイヤーファイル名に！
const enemyModelPaths = [
    'models/enemy1.glb', // ← あなたの敵1ファイル名に！
    'models/enemy2.glb', // ← あなたの敵2ファイル名に！
    'models/enemy3.glb'  // ← あなたの敵3ファイル名に！
];
// --- (★★★ 必ず書き換えてください！ ★★★) ---

// --- ライトの設定 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

// --- 床の設定 ---
const planeGeometry = new THREE.PlaneGeometry(60, 150);
const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
const context = canvas.getContext('2d'); context.fillStyle = '#aaaaaa'; context.fillRect(0, 0, 64, 64);
context.fillStyle = '#bbbbbb'; context.fillRect(0, 0, 32, 32); context.fillRect(32, 32, 32, 32);
const groundTexture = new THREE.CanvasTexture(canvas);
groundTexture.wrapS = THREE.RepeatWrapping; groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(15, 30);
const planeMaterial = new THREE.MeshStandardMaterial({ map: groundTexture });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2; plane.position.y = 0; plane.receiveShadow = true;
scene.add(plane);
const groundScrollSpeed = 2.5; // 地面スクロール速度 (調整可能)


// --- 非同期モデル読み込み管理 ---
const loadPromises = [];
// プレイヤーモデル読み込み
loadPromises.push(new Promise((resolve, reject) => {
    loader.load(playerModelPath, (gltf) => {
        playerModel = gltf.scene;
        const scale = 4.0; // ★プレイヤーサイズ調整箇所★ (1.0は等倍)
        playerModel.scale.set(scale, scale, scale);
        playerModel.position.set(0, playerMinY, 0);
        playerModel.traverse(node => { if (node.isMesh) node.castShadow = true; });
        scene.add(playerModel);
        resolve();
    }, undefined, reject);
}));
// 敵モデル読み込み
enemyModelPaths.forEach(path => {
    loadPromises.push(new Promise((resolve, reject) => {
        loader.load(path, (gltf) => {
            gltf.scene.traverse(node => { if (node.isMesh) node.castShadow = true; });
            enemyModels.push(gltf.scene); // スケールは spawnEnemy で設定
            resolve();
        }, undefined, reject);
    }));
});
// 全モデル読み込み完了後
Promise.all(loadPromises)
    .then(() => {
        console.log('全てのモデル読み込み完了'); // ★動作確認用ログ
        modelsLoaded = true;
        gameStartTime = performance.now();
        animate(); // アニメーションループを開始
    })
    .catch(error => {
        console.error("モデル読み込み中にエラー発生:", error);
        alert("モデルの読み込みに失敗しました。ファイルパスやファイルを確認してください。");
    });


// --- キーボードイベントリスナー (回転用) ---
document.addEventListener('keydown', (event) => { // ★ event 引数を確認 ★
    // console.log('keydown event fired:', event.key); // ← デバッグ用ログ (正しい位置に修正)
    switch(event.key.toLowerCase()) {
        case 'a': case 'arrowleft': playerInput.rotateLeft = true; break;
        case 'd': case 'arrowright': playerInput.rotateRight = true; break;
    }
});
document.addEventListener('keyup', (event) => { // ★ event 引数を確認 ★
    switch(event.key.toLowerCase()) {
        case 'a': case 'arrowleft': playerInput.rotateLeft = false; break;
        case 'd': case 'arrowright': playerInput.rotateRight = false; break;
    }
});

// --- マウスイベントリスナー (ドラッグ XY 移動) ---
renderer.domElement.addEventListener('pointerdown', (event) => { // ★ event 引数を確認 ★
    isDragging = true;
});
renderer.domElement.addEventListener('pointermove', (event) => { // ★ event 引数を確認 ★
    if (isDragging && playerModel) {
        const deltaX = event.movementX || 0;
        const deltaY = event.movementY || 0;
        playerModel.position.x += deltaX * dragSensitivityX;
        playerModel.position.y -= deltaY * dragSensitivityY; // Yは上下反転
        // Y座標の範囲制限
        playerModel.position.y = Math.max(playerMinY, Math.min(playerMaxY, playerModel.position.y));
    }
});
renderer.domElement.addEventListener('pointerup', (event) => { // ★ event 引数を確認 ★ (今回は使わないが念のため)
    isDragging = false;
});
renderer.domElement.addEventListener('pointerleave', (event) => { // ★ event 引数を確認 ★ (今回は使わないが念のため)
    isDragging = false;
});

// --- マウスホイールイベントリスナー (ズーム) ---
renderer.domElement.addEventListener('wheel', (event) => { // ★ event 引数を確認 ★
    const zoomAmount = event.deltaY * 0.01;
    let currentZoom = cameraOffset.length();
    currentZoom += zoomAmount;
    currentZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom));
    cameraOffset.normalize().multiplyScalar(currentZoom);
});


// --- 敵を生成する関数 ---
function spawnEnemy() {
    if (enemyModels.length === 0) return;
    const modelIndex = Math.floor(Math.random() * enemyModels.length);
    const originalEnemyModel = enemyModels[modelIndex];
    const enemy = originalEnemyModel.clone();

    const enemyScale = Math.random() * 0.8 + 3.0; // ★敵の大きさ調整箇所★ (0.8〜1.2倍)
    enemy.scale.set(enemyScale, enemyScale, enemyScale);

    const spawnX = (Math.random() - 0.5) * 40; // X座標出現範囲 (調整可能)
    const spawnY = Math.random() * (playerMaxY - playerMinY) + playerMinY; // Y座標出現範囲
    enemy.position.set(spawnX, spawnY, enemySpawnZ);

    const speed = Math.random() * 3 + 7; // ★敵の移動速度調整箇所★ (2〜5)
    enemy.userData = { speed: speed, type: modelIndex };

    scene.add(enemy);
    activeEnemies.push(enemy);
}

// --- アニメーションループ ---
function animate() {
    // console.log('animate loop running'); // ★デバッグ用ログ (動作確認できたら削除OK)
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (!modelsLoaded) return; // モデル読み込み完了まで待機

    // 地面スクロール
    if (groundTexture) groundTexture.offset.y += groundScrollSpeed * delta;

    // 敵生成
    enemySpawnTimer += delta;
    if (activeEnemies.length < maxEnemies && enemySpawnTimer > nextSpawnInterval) {
        spawnEnemy();
        enemySpawnTimer = 0;
        nextSpawnInterval = Math.random() * 1.5 + 0.5; // ★敵の出現間隔調整箇所★
    }

    // 敵の移動と消滅
    const enemiesToRemove = [];
    activeEnemies.forEach(enemy => {
        enemy.position.z += enemy.userData.speed * delta;
        if (enemy.position.z > enemyDespawnZ) enemiesToRemove.push(enemy);
    });
    enemiesToRemove.forEach(enemy => {
        scene.remove(enemy);
        activeEnemies = activeEnemies.filter(e => e !== enemy);
    });

    // プレイヤー処理
    if (playerModel) {
        // console.log('playerModel exists'); // ★デバッグ用ログ (動作確認できたら削除OK)
        // 回転
        if (playerInput.rotateLeft) playerModel.rotation.y += rotationSpeed;
        if (playerInput.rotateRight) playerModel.rotation.y -= rotationSpeed;
        // カメラ追従
        const rotatedOffset = cameraOffset.clone().applyQuaternion(playerModel.quaternion);
        const targetCameraPosition = playerModel.position.clone().add(rotatedOffset);
        camera.position.copy(targetCameraPosition);
        const lookAtPosition = playerModel.position.clone().add(new THREE.Vector3(0, 1, 0));
        camera.lookAt(lookAtPosition);
    }

    renderer.render(scene, camera);
}

// --- ウィンドウリサイズ対応 ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// アニメーション開始は Promise.all().then() 内で行う