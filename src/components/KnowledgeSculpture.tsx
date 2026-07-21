'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './KnowledgeSculpture.module.css';

type TextureTone = 'paper' | 'sage' | 'dark';

type CardSpec = {
  step: string;
  meta: string;
  title: string;
  body: string;
  footer: string;
  tone: TextureTone;
};

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(' ');
  let line = '';
  let lineIndex = 0;

  words.forEach((word, index) => {
    if (lineIndex >= maxLines) return;
    const testLine = line ? `${line} ${word}` : word;
    const isLastWord = index === words.length - 1;

    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex += 1;
    } else {
      line = testLine;
    }

    if (isLastWord && lineIndex < maxLines) {
      context.fillText(line, x, y + lineIndex * lineHeight);
    }
  });
}

function createCardTexture(spec: CardSpec, anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 1200;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable');

  const palette = {
    paper: {
      background: '#f4f3eb',
      ink: '#101711',
      muted: '#667069',
      line: '#d8dbd2',
      accent: '#158052',
      field: '#e3eadf',
    },
    sage: {
      background: '#dce7d8',
      ink: '#102116',
      muted: '#59695d',
      line: '#bdcbbb',
      accent: '#147348',
      field: '#cbdac8',
    },
    dark: {
      background: '#101a13',
      ink: '#f5f5ed',
      muted: '#9ba79d',
      line: '#334138',
      accent: '#caff46',
      field: '#18271d',
    },
  }[spec.tone];

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = palette.background;
  drawRoundedRect(context, 8, 8, 944, 1184, 34);
  context.fill();

  context.strokeStyle = palette.line;
  context.lineWidth = 2;
  drawRoundedRect(context, 8, 8, 944, 1184, 34);
  context.stroke();

  context.fillStyle = palette.accent;
  context.font = '700 28px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText(spec.step.toUpperCase(), 72, 88);

  context.fillStyle = palette.muted;
  context.font = '600 24px Arial, sans-serif';
  context.textAlign = 'right';
  context.fillText(spec.meta.toUpperCase(), 888, 88);
  context.textAlign = 'left';

  context.strokeStyle = palette.line;
  context.beginPath();
  context.moveTo(72, 128);
  context.lineTo(888, 128);
  context.stroke();

  context.fillStyle = palette.ink;
  context.font = '600 68px Georgia, serif';
  wrapText(context, spec.title, 72, 242, 780, 76, 4);

  context.fillStyle = palette.muted;
  context.font = '400 31px Arial, sans-serif';
  wrapText(context, spec.body, 72, 560, 770, 49, 5);

  context.fillStyle = palette.field;
  drawRoundedRect(context, 72, 850, 816, 178, 22);
  context.fill();

  if (spec.tone === 'dark') {
    context.strokeStyle = palette.line;
    context.lineWidth = 2;
    drawRoundedRect(context, 72, 850, 816, 178, 22);
    context.stroke();
  }

  context.fillStyle = palette.muted;
  context.font = '500 27px Arial, sans-serif';
  context.fillText(spec.footer, 108, 924);

  context.fillStyle = palette.accent;
  context.beginPath();
  context.arc(824, 940, 28, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = spec.tone === 'dark' ? '#101a13' : '#f4f3eb';
  context.font = '700 28px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('↗', 824, 950);
  context.textAlign = 'left';

  context.fillStyle = palette.muted;
  context.font = '600 22px Arial, sans-serif';
  context.letterSpacing = '2px';
  context.fillText('LEARNMAX', 72, 1126);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createStudyCard(
  spec: CardSpec,
  anisotropy: number,
  width = 3.05,
  height = 3.82
) {
  const texture = createCardTexture(spec, anisotropy);
  const card = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.1, 1, 1, 1),
    new THREE.MeshStandardMaterial({
      color:
        spec.tone === 'dark'
          ? 0x111b14
          : spec.tone === 'sage'
            ? 0xd3dfd0
            : 0xebeae2,
      roughness: 0.66,
      metalness: 0.03,
    })
  );
  card.add(base);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.025, height - 0.025),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  face.position.z = 0.056;
  card.add(face);

  return { card, texture };
}

function createMasteryTicket(anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 400;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable');

  context.fillStyle = '#caff46';
  drawRoundedRect(context, 7, 7, 706, 386, 30);
  context.fill();
  context.strokeStyle = 'rgba(8, 18, 10, 0.22)';
  context.lineWidth = 2;
  drawRoundedRect(context, 7, 7, 706, 386, 30);
  context.stroke();

  context.fillStyle = '#102116';
  context.font = '700 24px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText('MASTERY / 04', 48, 62);
  context.font = '600 104px Georgia, serif';
  context.fillText('09/10', 46, 208);
  context.font = '500 28px Arial, sans-serif';
  context.fillText('Specific. Complete. Recalled.', 48, 310);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;

  const ticket = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.17, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xcaff46,
      roughness: 0.5,
      metalness: 0.03,
    })
  );
  ticket.add(base);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.08, 1.15),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  face.position.z = 0.046;
  ticket.add(face);
  return { ticket, texture };
}

export default function KnowledgeSculpture() {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 40);
    camera.position.set(0, 0.05, 9.5);

    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const textureResources: THREE.Texture[] = [];
    const cardData: Array<{
      object: THREE.Group;
      basePosition: THREE.Vector3;
      baseRotation: THREE.Euler;
      phase: number;
    }> = [];
    const recallEngine = new THREE.Group();

    const source = createStudyCard(
      {
        step: 'Source / 01',
        meta: '12 pages',
        title: 'Why spacing strengthens memory',
        body: 'A little forgetting makes retrieval more effortful. That effort strengthens the route back to the idea.',
        footer: 'Your reading, kept in context',
        tone: 'paper',
      },
      anisotropy
    );
    source.card.position.set(-1.22, 0.35, -0.92);
    source.card.rotation.set(-0.06, 0.34, -0.15);
    recallEngine.add(source.card);
    textureResources.push(source.texture);
    cardData.push({
      object: source.card,
      basePosition: source.card.position.clone(),
      baseRotation: source.card.rotation.clone(),
      phase: 0,
    });

    const explanation = createStudyCard(
      {
        step: 'Explain / 02',
        meta: 'Grounded',
        title: 'Make the idea click',
        body: 'Spacing works because successful retrieval after a delay reinforces the pathway needed to find the idea again.',
        footer: 'Connected to the exact section',
        tone: 'sage',
      },
      anisotropy
    );
    explanation.card.position.set(0, 0.05, -0.38);
    explanation.card.rotation.set(0.02, 0.04, 0.055);
    recallEngine.add(explanation.card);
    textureResources.push(explanation.texture);
    cardData.push({
      object: explanation.card,
      basePosition: explanation.card.position.clone(),
      baseRotation: explanation.card.rotation.clone(),
      phase: 1.7,
    });

    const recall = createStudyCard(
      {
        step: 'Recall / 03',
        meta: 'Source hidden',
        title: 'Why is delayed retrieval stronger?',
        body: 'Reconstruct the mechanism in your own words. The explanation stays out of view until you commit.',
        footer: 'Answer from memory',
        tone: 'dark',
      },
      anisotropy
    );
    recall.card.position.set(1.22, -0.22, 0.26);
    recall.card.rotation.set(0.08, -0.26, 0.13);
    recallEngine.add(recall.card);
    textureResources.push(recall.texture);
    cardData.push({
      object: recall.card,
      basePosition: recall.card.position.clone(),
      baseRotation: recall.card.rotation.clone(),
      phase: 3.2,
    });

    const mastery = createMasteryTicket(anisotropy);
    mastery.ticket.position.set(1.68, 1.7, 0.8);
    mastery.ticket.rotation.set(-0.04, -0.18, 0.08);
    recallEngine.add(mastery.ticket);
    textureResources.push(mastery.texture);

    const journeyCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.65, -1.75, -1.05),
      new THREE.Vector3(-2.1, 1.55, -0.88),
      new THREE.Vector3(-0.25, 2.15, -0.35),
      new THREE.Vector3(2.55, 1.15, 0.2),
      new THREE.Vector3(2.7, -1.45, 0.48),
      new THREE.Vector3(1.12, -2.2, 0.4),
    ]);
    const journey = new THREE.Mesh(
      new THREE.TubeGeometry(journeyCurve, 110, 0.018, 6, false),
      new THREE.MeshStandardMaterial({
        color: 0xcaff46,
        emissive: 0x2e5a12,
        emissiveIntensity: 0.45,
        metalness: 0.15,
        roughness: 0.42,
      })
    );
    recallEngine.add(journey);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xedffb5 })
    );
    recallEngine.add(marker);

    [-2.65, 2.7].forEach((x, index) => {
      const node = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        new THREE.MeshStandardMaterial({
          color: index === 0 ? 0xd8ddd4 : 0xcaff46,
          metalness: 0.18,
          roughness: 0.42,
        })
      );
      node.position.copy(journeyCurve.getPoint(index));
      node.rotation.z = Math.PI / 4;
      recallEngine.add(node);
    });

    recallEngine.rotation.x = -0.04;
    recallEngine.rotation.y = -0.05;
    scene.add(recallEngine);

    const ambient = new THREE.HemisphereLight(0xf3f5e9, 0x08120a, 1.7);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-3.5, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcaff46, 1.35);
    rim.position.set(4, -2, 3.5);
    scene.add(rim);

    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    let frameId = 0;
    let lastFrame = 0;
    let visible = true;
    let disposed = false;

    const render = (time = 0) => {
      frameId = 0;
      if (disposed || !visible) return;
      if (!reduceMotion && time - lastFrame < 25) {
        frameId = window.requestAnimationFrame(render);
        return;
      }
      lastFrame = time;

      if (!reduceMotion) {
        pointer.lerp(pointerTarget, 0.055);
        recallEngine.rotation.x = -0.04 + pointer.y * 0.055;
        recallEngine.rotation.y = -0.05 + pointer.x * 0.1;
        recallEngine.position.y = Math.sin(time * 0.00045) * 0.035;

        cardData.forEach(
          ({ object, basePosition, baseRotation, phase }, index) => {
            object.position.y =
              basePosition.y + Math.sin(time * 0.00062 + phase) * 0.04;
            object.rotation.z =
              baseRotation.z + Math.sin(time * 0.00035 + phase) * 0.008;
            object.position.x =
              basePosition.x + pointer.x * (index - 1) * 0.055;
          }
        );
        mastery.ticket.position.y =
          1.7 + Math.sin(time * 0.00072 + 0.8) * 0.055;
        mastery.ticket.rotation.z =
          0.08 + Math.sin(time * 0.0004 + 2.2) * 0.018;
        marker.position.copy(journeyCurve.getPointAt((time * 0.000035) % 1));
      } else {
        marker.position.copy(journeyCurve.getPointAt(0.83));
      }

      renderer.render(scene, camera);
      if (!reduceMotion) frameId = window.requestAnimationFrame(render);
    };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion) return;
      const bounds = frame.getBoundingClientRect();
      pointerTarget.set(
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        -((event.clientY - bounds.top) / bounds.height - 0.5) * 2
      );
    };
    const onPointerLeave = () => pointerTarget.set(0, 0);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(frame);
    frame.addEventListener('pointermove', onPointerMove, { passive: true });
    frame.addEventListener('pointerleave', onPointerLeave);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && !document.hidden;
        if (visible && !reduceMotion && !frameId) {
          frameId = window.requestAnimationFrame(render);
        }
      },
      { threshold: 0.02 }
    );
    visibilityObserver.observe(frame);

    const onVisibilityChange = () => {
      visible = !document.hidden && frame.getBoundingClientRect().bottom > 0;
      if (visible && !reduceMotion && !frameId) {
        frameId = window.requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    resize();
    renderer.render(scene, camera);
    setIsReady(true);
    if (!reduceMotion) frameId = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) {
          return;
        }
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
      textureResources.forEach((texture) => texture.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      role="img"
      aria-label="Source material moving through explain and recall stages into a scored mastery result"
    >
      <div
        className={`${styles.fallback} ${isReady ? styles.fallbackHidden : ''}`}
        aria-hidden="true"
      >
        <span className={styles.fallbackSource}>Source / 01</span>
        <span className={styles.fallbackExplain}>Explain / 02</span>
        <span className={styles.fallbackRecall}>Recall / 03</span>
      </div>

      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${isReady ? styles.canvasReady : ''}`}
        aria-hidden="true"
      />

      <div
        className={`${styles.annotation} ${styles.annotationStart}`}
        aria-hidden="true"
      >
        <span>Material in</span>
        <i />
      </div>
      <div
        className={`${styles.annotation} ${styles.annotationEnd}`}
        aria-hidden="true"
      >
        <i />
        <span>Recall out</span>
      </div>
      <p className={styles.interactionHint} aria-hidden="true">
        Move to inspect
      </p>
    </div>
  );
}
