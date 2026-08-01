/**
 * TechThree — Hero 3D Background
 * A performant Three.js particle field with mouse interaction.
 */

(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.background = 'radial-gradient(circle at center, rgba(0,240,255,0.08), transparent 70%)';
    return;
  }

  let scene, camera, renderer;
  let particles, linesMesh;
  let mouse = new THREE.Vector2(-9999, -9999);
  let targetMouse = new THREE.Vector2(-9999, -9999);
  let animationId;

  const particleCount = window.matchMedia('(pointer: coarse)').matches ? 60 : 100;
  const connectionDistance = 120;
  const maxConnections = 4;

  init();

  function init() {
    scene = new THREE.Scene();
    // scene.fog = new THREE.FogExp2(0x0B0E14, 0.0015);

    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      2000
    );
    camera.position.z = 400;

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resizeRenderer();

    createParticles();
    createLines();

    window.addEventListener('resize', onWindowResize, { passive: true });
    document.addEventListener('mousemove', onMouseMove, { passive: true });

    animate();
  }

  function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const colorCyan = new THREE.Color(0x00f0ff);
    const colorPurple = new THREE.Color(0x8a2be2);
    const colorTeal = new THREE.Color(0x14b8a6);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 1000;
      positions[i3 + 1] = (Math.random() - 0.5) * 1000;
      positions[i3 + 2] = (Math.random() - 0.5) * 1000;

      const colorChoice = Math.random();
      let chosenColor;
      if (colorChoice < 0.33) chosenColor = colorCyan;
      else if (colorChoice < 0.66) chosenColor = colorPurple;
      else chosenColor = colorTeal;

      colors[i3] = chosenColor.r;
      colors[i3 + 1] = chosenColor.g;
      colors[i3 + 2] = chosenColor.b;

      sizes[i] = Math.random() * 3 + 1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
  }

  function createLines() {
    const material = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
    });

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * particleCount * 6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    linesMesh = new THREE.LineSegments(geometry, material);
    scene.add(linesMesh);
  }

  function resizeRenderer() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function onWindowResize() {
    resizeRenderer();
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    targetMouse.x = event.clientX - rect.left;
    targetMouse.y = event.clientY - rect.top;
  }

  function updateMouse() {
    const rect = canvas.getBoundingClientRect();
    const x = targetMouse.x;
    const y = targetMouse.y;

    if (x === undefined || y === undefined) return;

    mouse.x = (x / rect.width) * 2 - 1;
    mouse.y = -(y / rect.height) * 2 + 1;
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (document.hidden) return;

    updateMouse();

    const positions = particles.geometry.attributes.position.array;
    const time = performance.now() * 0.0003;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Gentle floating motion
      positions[i3] += Math.sin(time + i * 0.5) * 0.3;
      positions[i3 + 1] += Math.cos(time + i * 0.7) * 0.3;

      // Mouse repulsion
      if (mouse.x !== -9999) {
        const particleX = positions[i3];
        const particleY = positions[i3 + 1];
        const screenX = (particleX / camera.position.z + 1) * (canvas.clientWidth || window.innerWidth) / 2;
        const screenY = (-particleY / camera.position.z + 1) * (canvas.clientHeight || window.innerHeight) / 2;

        const dx = screenX - targetMouse.x;
        const dy = screenY - targetMouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200) {
          const force = (200 - dist) / 200 * 2;
          positions[i3] += (dx / dist) * force;
          positions[i3 + 1] -= (dy / dist) * force;
        }
      }
    }

    particles.geometry.attributes.position.needsUpdate = true;

    // Rotate the entire particle system slowly
    particles.rotation.y = time * 0.05;

    updateLines();

    renderer.render(scene, camera);
  }

  function updateLines() {
    if (!linesMesh) return;

    const positions = particles.geometry.attributes.position.array;
    const linePositions = linesMesh.geometry.attributes.position.array;
    let lineIndex = 0;

    for (let i = 0; i < particleCount; i++) {
      let connections = 0;

      for (let j = i + 1; j < particleCount; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < connectionDistance && connections < maxConnections) {
          linePositions[lineIndex++] = positions[i * 3];
          linePositions[lineIndex++] = positions[i * 3 + 1];
          linePositions[lineIndex++] = positions[i * 3 + 2];
          linePositions[lineIndex++] = positions[j * 3];
          linePositions[lineIndex++] = positions[j * 3 + 1];
          linePositions[lineIndex++] = positions[j * 3 + 2];
          connections++;
        }
      }
    }

    linesMesh.geometry.setDrawRange(0, lineIndex / 3);
    linesMesh.geometry.attributes.position.needsUpdate = true;
  }
})();
