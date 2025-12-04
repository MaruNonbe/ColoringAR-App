// main.js
// WebXR + Three.js を使って、塗り絵画像を「空中」に表示する

const canvas = document.getElementById('xr-canvas');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('preview');
const arButton = document.getElementById('ar-start');
const body = document.body;

// Three.js 基本セットアップ
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

// 少し環境光
const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(light);

// ==== 塗り絵テクスチャ関連 ====
let imageLoaded = false;
let imageAspect = 1.0;          // 高さ / 幅
let coloringTexture = null;
let coloringPlane = null;

// 画像選択時の処理
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);

  // プレビュー表示
  preview.src = objectUrl;

  // Three.js用テクスチャ
  const img = new Image();
  img.onload = () => {
    imageAspect = img.height / img.width || 1.0;

    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;

    coloringTexture = tex;
    imageLoaded = true;

    // AR開始ボタンを有効化
    arButton.disabled = false;

    // 一時URLを解放してもOK（テクスチャには読み込まれている）
    URL.revokeObjectURL(objectUrl);
  };
  img.src = objectUrl;
});

// ==== WebXR セッション管理 ====
let xrSession = null;
let xrRefSpace = null;

// AR開始ボタン
arButton.addEventListener('click', async () => {
  if (!navigator.xr) {
    alert('この端末/ブラウザは WebXR に対応していません。');
    return;
  }

  if (!imageLoaded || !coloringTexture) {
    alert('先に塗り絵の写真を選択してください。');
    return;
  }

  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],  // hit-test は使わないので省略
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });

    // Three.js の XR セッションに紐づけ
    renderer.xr.setSession(xrSession);

    // 参照空間（座標系）
    xrRefSpace = await xrSession.requestReferenceSpace('local-floor');

    // AR中のスタイル変更
    body.classList.add('ar-running');

    // アニメーションループ開始
    renderer.setAnimationLoop(onXRFrame);
  } catch (e) {
    console.error(e);
    alert('ARセッションの開始に失敗しました。: ' + e.message);
  }
});

// ==== ウィンドウリサイズ対応 ====
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

// ==== 塗り絵の板を作成 ====
function ensureColoringPlane() {
  if (coloringPlane || !coloringTexture) return;

  // 幅1.2mくらいにして、縦は画像比率に合わせる
  const width = 1.2;
  const height = width * imageAspect;

  const geom = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: coloringTexture,
    side: THREE.DoubleSide,
    transparent: true
  });

  coloringPlane = new THREE.Mesh(geom, mat);
  scene.add(coloringPlane);
}

// ==== 毎フレーム呼ばれるXR描画ループ ====
function onXRFrame(time, frame) {
  const session = frame.session;

  // XRカメラ
  const xrCamera = renderer.xr.getCamera(camera);

  // 塗り絵の板を用意
  ensureColoringPlane();

  if (coloringPlane) {
    // 「空中に浮かせる」ロジック
    //
    // カメラ座標系で (前に5m, 上に2m) の位置を求める。
    // z = -5（前方）、y = +2（上）
    const offset = new THREE.Vector3(0, 2.0, -5.0);
    xrCamera.localToWorld(offset);     // カメラ基準 → ワールド座標へ

    coloringPlane.position.copy(offset);
    coloringPlane.lookAt(xrCamera.position);
  }

  // Three.js で描画
  renderer.render(scene, xrCamera);
}
