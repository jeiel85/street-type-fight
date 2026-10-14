// 쿼터뷰 카메라·조명·렌더러. 카메라 방향(요)은 고정해 종이인형 캐릭터가 항상 정면을 보이게 한다.

import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight, PCFShadowMap, PerspectiveCamera,
  Scene, Vector3, WebGLRenderer,
} from 'three';

const CAM_OFFSET = new Vector3(0, 15.5, 14);
const LOOK_HEIGHT = 0.6;
const SKY = 0xbfe2ee;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** 카메라가 내려다보는 각도. 종이인형을 이만큼 뒤로 눕혀 카메라와 마주 보게 한다. */
  readonly tilt = Math.atan2(CAM_OFFSET.y - LOOK_HEIGHT, CAM_OFFSET.z);
  private readonly sun: DirectionalLight;
  private readonly focus = new Vector3();
  private shakeAmp = 0;
  private shakeT = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(34, 1, 0.5, 200);
    this.scene.background = new Color(SKY);
    this.scene.fog = new Fog(SKY, 34, 70);

    this.scene.add(new HemisphereLight(0xe8f4ff, 0x6f8f4e, 1.6));
    this.sun = new DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // 세로로 좁은 화면에서도 주변이 보이도록 화각을 넓힌다.
    this.camera.fov = w / h < 1.2 ? 48 : 34;
    this.camera.updateProjectionMatrix();
  }

  /** 대상을 부드럽게 따라간다. snap이면 즉시 이동. */
  follow(x: number, z: number, dt: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-6 * dt);
    this.focus.x += (x - this.focus.x) * k;
    this.focus.z += (z - this.focus.z) * k;
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-9 * dt);
    const sx = Math.sin(this.shakeT * 61) * this.shakeAmp;
    const sy = Math.cos(this.shakeT * 53) * this.shakeAmp;
    this.camera.position.set(this.focus.x + CAM_OFFSET.x + sx, CAM_OFFSET.y + sy, this.focus.z + CAM_OFFSET.z);
    this.camera.lookAt(this.focus.x + sx * 0.5, LOOK_HEIGHT, this.focus.z);
    this.sun.position.set(this.focus.x - 14, 24, this.focus.z + 10);
    this.sun.target.position.set(this.focus.x, 0, this.focus.z);
  }

  shake(amount: number): void {
    this.shakeAmp = Math.min(0.6, Math.max(this.shakeAmp, amount));
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
