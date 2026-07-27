/**
 * TechThree — Products Page 3D Background
 * Subtle floating geometric shapes representing the three product areas.
 */

(function () {
  const canvas = document.getElementById('products-canvas');
  if (!canvas) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.background = 'radial-gradient(circle at 30% 50%, rgba(0,240,255,0.05), transparent 60%)';
    return;
  }

  let scene, camera, renderer;
  let shapes = [];
  let animationId;

  init();

  function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      2000
    );
    camera.position.z = 600;

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Heart-like shape (Product 1) — using a sphere as abstraction
    const heartGeometry = new THREE.IcosahedronGeometry(30, 0);
    const heartMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const heart = new THREE.Mesh(heartGeometry, heartMaterial);
    heart.position.set(-250, 100, -200);
    scene.add(heart);
    shapes.push({ mesh: heart, rotSpeed: { x: 0.003, y: 0.005 } });

    // Molecular shape (Product 2) — torus knot
    const moleculeGeometry = new THREE.TorusKnotGeometry(25, 8, 64, 16);
    const moleculeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8a2be2,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const molecule = new THREE.Mesh(moleculeGeometry, moleculeMaterial);
    molecule.position.set(0, -80, -300);
    scene.add(molecule);
    shapes.push({ mesh: molecule, rotSpeed: { x: 0.002, y: 0.006 } });

    // Hologram cube (Product 3)
    const cubeGeometry = new THREE.BoxGeometry(45, 45, 45);
    const cubeMaterial = new THREE.MeshBasicMaterial({
      color: 0x14b8a6,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(250, 80, -150);
    scene.add(cube);
    shapes.push({ mesh: cube, rotSpeed: { x: 0.004, y: 0.004 } });

    window.addEventListener('resize', onWindowResize, { passive: true });

    animate();
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (document.hidden) return;

    const time = performance.now() * 0.001;

    shapes.forEach((shape, index) => {
      shape.mesh.rotation.x += shape.rotSpeed.x;
      shape.mesh.rotation.y += shape.rotSpeed.y;
      shape.mesh.position.y += Math.sin(time + index * 2) * 0.3;
    });

    renderer.render(scene, camera);
  }
})();
