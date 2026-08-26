/**
 * Quantum Neural Network — Interactive 3D Architecture Visualization
 *
 * Pipeline (left → right):
 *   ChEMBL Dataset → Classical Pre-processing Model → Internet (WiFi)
 *   → IBM Quantum Computer (qubits + superposition + entanglement)
 *
 * Interactions mirror cardiovascular.js:
 *   - Continuous 360° auto-rotate when not in drag mode
 *   - Drag mode toggle → fullscreen + OrbitControls
 *   - Focal-point zoom (scroll / pinch)
 *   - Hover info panels on components
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  var dragMode = false;
  var transitioning = false;
  var autoRotateAngle = 0;
  var clickStart = { x: 0, y: 0 };
  var zoomTarget = null;

  // ─── Three.js essentials ───────────────────────────────────────────────────
  var scene, camera, renderer, controls, raycaster, mouse;
  var DURATION = 1400;
  var cameraBase = { pos: [0, 8, 22], look: [0, 0, 0] };

  // ─── Colours ───────────────────────────────────────────────────────────────
  var C = {
    blue:       0x1d8cf8,
    brightBlue: 0x3ea6ff,
    cyan:       0x00F0FF,
    purple:     0x8A2BE2,
    brightPurple: 0xB388FF,
    red:        0xEF4444,
    green:      0x22C55E,
    darkGrid:   0x0a1628,
    gridLine:   0x142840,
  };

  // ─── Materials ─────────────────────────────────────────────────────────────
  var M = {
    blueWire:     new THREE.LineBasicMaterial({ color: C.blue,       transparent: true, opacity: 0.95 }),
    brightWire:   new THREE.LineBasicMaterial({ color: C.brightBlue, transparent: true, opacity: 0.85 }),
    cyanWire:     new THREE.LineBasicMaterial({ color: C.cyan,       transparent: true, opacity: 0.75 }),
    purpleWire:   new THREE.LineBasicMaterial({ color: C.purple,     transparent: true, opacity: 0.9 }),
    brightPurple: new THREE.LineBasicMaterial({ color: C.brightPurple, transparent: true, opacity: 0.95 }),
    greenWire:    new THREE.LineBasicMaterial({ color: C.green,      transparent: true, opacity: 0.95 }),
    redWire:      new THREE.LineBasicMaterial({ color: C.red,        transparent: true, opacity: 0.85 }),
    hit:          new THREE.MeshBasicMaterial({ visible: false }),
    blueFill:     new THREE.MeshBasicMaterial({ color: C.blue,   transparent: true, opacity: 0.12 }),
    purpleFill:   new THREE.MeshBasicMaterial({ color: C.purple, transparent: true, opacity: 0.10 }),
    cyanFill:     new THREE.MeshBasicMaterial({ color: C.cyan,   transparent: true, opacity: 0.08 }),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  GEOMETRY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function labelSprite(text, color, fontSize) {
    fontSize = fontSize || 38;
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    var scale = 2;
    var w = 640, h = 160;
    c.width = w * scale; c.height = h * scale;
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(5,8,16,0.92)';
    ctx.strokeStyle = color || '#EF4444';
    ctx.lineWidth = 3;
    roundRect(ctx, 6, 6, w - 12, h - 12, 12);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color || '#EF4444';
    ctx.font = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
    var sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })
    );
    sp.scale.set(3.2, 0.8, 1);
    sp.renderOrder = 999;
    return sp;
  }

  function labelSpriteSmall(text, color, fontSize) {
    fontSize = fontSize || 28;
    var sp = labelSprite(text, color, fontSize);
    sp.scale.set(3, 0.8, 1);
    return sp;
  }

  function wireBox(w, h, d, mat) {
    var g = new THREE.Group();
    var b = new THREE.BoxGeometry(w, h, d);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(b), mat || M.blueWire));
    var m = new THREE.Mesh(b, M.hit); g.add(m); return g;
  }

  function wireCyl(rt, rb, ht, seg, mat) {
    var g = new THREE.Group();
    var c = new THREE.CylinderGeometry(rt, rb, ht, seg);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(c), mat || M.blueWire));
    var m = new THREE.Mesh(c, M.hit); g.add(m); return g;
  }

  function arrow(len, mat, headSize) {
    headSize = headSize || 0.18;
    var g = new THREE.Group();
    var shaft = new THREE.CylinderGeometry(0.03, 0.03, len, 6);
    shaft.rotateZ(Math.PI / 2);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(shaft), mat || M.greenWire));
    var head = new THREE.ConeGeometry(headSize, headSize * 2.0, 8);
    head.rotateZ(-Math.PI / 2);
    var m = new THREE.Mesh(head, M.hit);
    m.position.x = len / 2 + headSize;
    g.add(m);
    var e = new THREE.LineSegments(new THREE.EdgesGeometry(head), mat || M.greenWire);
    e.position.copy(m.position);
    g.add(e);
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GRID FLOOR
  // ═══════════════════════════════════════════════════════════════════════════

  function gridFloor(y) {
    var g = new THREE.Group();
    var grid = new THREE.GridHelper(50, 50, C.gridLine, C.darkGrid);
    grid.position.y = y || -3;
    g.add(grid);
    var plane = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.03, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y || -3;
    g.add(plane);
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WIFI SIGNAL
  // ═══════════════════════════════════════════════════════════════════════════

  function createWiFiGroup(name) {
    var wifiGroup = new THREE.Group();
    wifiGroup.name = name || 'wifi';

    var arc1 = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.55, 0.025, 4, 16, Math.PI * 1.1)),
      M.cyanWire
    );
    arc1.userData.pulse = true; arc1.userData.idx = 0;
    wifiGroup.add(arc1);
    var arc2 = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.38, 0.025, 4, 16, Math.PI * 1.1)),
      M.cyanWire
    );
    arc2.userData.pulse = true; arc2.userData.idx = 1;
    wifiGroup.add(arc2);
    wifiGroup.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.SphereGeometry(0.08, 6, 4)),
      M.cyanWire
    ));
    var wfHit = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), M.hit);
    wfHit.name = name || 'wifi';
    wifiGroup.add(wfHit);

    return wifiGroup;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  function buildScene() {
    var sc = new THREE.Group();
    sc.name = 'qnn';

    sc.add(gridFloor(-3));

    // ── 1. ChEMBL Dataset (far left) ────────────────────────────────────────
    var db = new THREE.Group();
    db.name = 'chembl';
    db.position.set(-15, 0.5, 0);
    var dbBody = wireCyl(1.0, 1.0, 2.2, 16, M.brightWire);
    db.add(dbBody);
    for (var di = 0; di < 3; di++) {
      var ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.TorusGeometry(1.0, 0.02, 4, 20)),
        M.cyanWire
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.65 + di * 0.65;
      db.add(ring);
    }
    // floating molecule dots around the dataset
    for (var mi = 0; mi < 6; mi++) {
      var ang = (mi / 6) * Math.PI * 2;
      var mol = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.SphereGeometry(0.1, 6, 4)),
        M.brightWire
      );
      mol.position.set(Math.cos(ang) * 1.8, Math.sin(ang * 1.5) * 1.2, Math.sin(ang) * 1.2);
      mol.userData.orbitMol = true;
      mol.userData.molIdx = mi;
      db.add(mol);
    }
    sc.add(db);
    sc.add(labelSpriteSmall('ChEMBL DATASET', '#EF4444', 60).translateX(-15).translateY(2.6));

    // ── 2. Classical Pre-processing Model ───────────────────────────────────
    var cm = new THREE.Group();
    cm.name = 'classical';
    cm.position.set(-8, 0, 0);
    var cmBody = wireBox(3.2, 2.6, 1.6, M.brightWire);
    cm.add(cmBody);
    // internal neural-net layers (3 columns of nodes)
    for (var li = 0; li < 3; li++) {
      var nodes = 3 + li;
      for (var ni = 0; ni < nodes; ni++) {
        var node = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.SphereGeometry(0.12, 6, 4)),
          M.cyanWire
        );
        node.position.set(-1.0 + li * 1.0, -0.8 + ni * (1.6 / (nodes - 1)), 0.85);
        cm.add(node);
      }
    }
    sc.add(cm);
    sc.add(labelSpriteSmall('CLASSICAL MODEL', '#EF4444', 60).translateX(-8).translateY(2.2));
    sc.add(labelSpriteSmall('PRE-PROCESSING', '#3ea6ff', 45).translateX(-8).translateY(-2.0));

    // arrow dataset → classical model
    var a1 = arrow(2.6, M.greenWire, 0.22);
    a1.position.set(-12.4, 0.5, 0);
    sc.add(a1);

    // ── 3. Internet / WiFi (center) ─────────────────────────────────────────
    var wifi = createWiFiGroup('wifi');
    wifi.position.set(-2.5, 0.5, 0);
    sc.add(wifi);
    sc.add(labelSpriteSmall('INTERNET', '#22C55E', 55).translateX(-2.5).translateY(2.2));

    // arrow classical → wifi
    var a2 = arrow(2.6, M.greenWire, 0.22);
    a2.position.set(-5.9, 0.3, 0);
    sc.add(a2);

    // ── 4. IBM Quantum Computer (right) ─────────────────────────────────────
    var qc = new THREE.Group();
    qc.name = 'quantum';
    qc.position.set(8, 0, 0);

    // chip base platform
    var base = wireBox(7.0, 0.4, 5.0, M.blueWire);
    base.position.y = -1.6;
    qc.add(base);

    // chip board (raised)
    var chip = wireBox(5.6, 0.3, 4.0, M.brightWire);
    chip.position.y = -1.2;
    qc.add(chip);

    // qubits arranged in a circle on the chip
    var qubitCount = 8;
    var qRadius = 1.9;
    var qubits = [];
    for (var qi = 0; qi < qubitCount; qi++) {
      var qa = (qi / qubitCount) * Math.PI * 2;
      var qx = Math.cos(qa) * qRadius;
      var qz = Math.sin(qa) * qRadius;

      var qGrp = new THREE.Group();
      qGrp.name = 'qubit';
      qGrp.position.set(qx, -0.4, qz);

      // qubit core
      var core = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.SphereGeometry(0.18, 8, 6)),
        M.brightPurple
      );
      qGrp.add(core);

      // superposition cloud (pulsing translucent sphere)
      var cloud = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 10),
        M.purpleFill
      );
      cloud.userData.cloudPulse = true;
      cloud.userData.cloudIdx = qi;
      qGrp.add(cloud);

      // |0⟩ and |1⟩ state markers (tiny spheres above/below)
      var s0 = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.SphereGeometry(0.07, 6, 4)),
        M.cyanWire
      );
      s0.position.y = 0.85;
      qGrp.add(s0);
      var s1 = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.SphereGeometry(0.07, 6, 4)),
        M.purpleWire
      );
      s1.position.y = -0.85;
      qGrp.add(s1);

      qc.add(qGrp);
      qubits.push({ x: qx, z: qz, group: qGrp });
    }

    // entanglement lines between qubits (connect ring + a few cross links)
    var entangleMat = new THREE.LineBasicMaterial({ color: C.brightPurple, transparent: true, opacity: 0.55 });
    for (var ei = 0; ei < qubitCount; ei++) {
      var a = qubits[ei];
      var b = qubits[(ei + 1) % qubitCount];
      var geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, -0.4, a.z),
        new THREE.Vector3(b.x, -0.4, b.z),
      ]);
      var line = new THREE.Line(geo, entangleMat);
      line.userData.entangle = true;
      qc.add(line);
    }
    // cross entanglement (opposite pairs)
    for (var ci = 0; ci < qubitCount / 2; ci++) {
      var pa = qubits[ci];
      var pb = qubits[ci + qubitCount / 2];
      var cgeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pa.x, -0.4, pa.z),
        new THREE.Vector3(pb.x, -0.4, pb.z),
      ]);
      var cline = new THREE.Line(cgeo, entangleMat);
      cline.userData.entangle = true;
      qc.add(cline);
    }

    sc.add(qc);
    sc.add(labelSpriteSmall('IBM QUANTUM COMPUTER', '#EF4444', 55).translateX(8).translateY(3.2));

    // quantum labels
    sc.add(labelSpriteSmall('SUPERPOSITION', '#B388FF', 70).translateX(5.2).translateY(1.4));
    sc.add(labelSpriteSmall('~30 QUBITS', '#B388FF', 70).translateX(10.8).translateY(1.4));
    sc.add(labelSpriteSmall('ENTANGLEMENT', '#B388FF', 70).translateX(8).translateY(-2.6));

    // arrow wifi → quantum computer
    var a3 = arrow(3.2, M.greenWire, 0.24);
    a3.position.set(0.5, 0.3, 0);
    sc.add(a3);
    sc.add(labelSpriteSmall('ENCODED DATA', '#22C55E', 40).translateX(0.6).translateY(-1.0).scale.set(2.0, 0.5, 1));

    return sc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    var canvas = document.getElementById('qviz-canvas');
    if (!canvas) return;

    var container = document.getElementById('qviz-container');
    var w = container.clientWidth;
    var h = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.set(0, 8, 22);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.82;
    controls.minPolarAngle = Math.PI * 0.1;
    controls.autoRotate = false;
    controls.zoomSpeed = 0;
    controls.enabled = false;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    scene.add(buildScene());

    // Events
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('resize', onResize, { passive: true });

    var dragBtn = document.getElementById('qviz-drag-btn');
    if (dragBtn) dragBtn.addEventListener('click', toggleDragMode);

    var fsBtn = document.getElementById('qviz-fullscreen-btn');
    if (fsBtn) fsBtn.addEventListener('click', exitDragMode);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dragMode) exitDragMode();
    });

    animate();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) return;

    var t = performance.now() * 0.001;

    // Continuous 360° auto-rotate when not in drag mode
    if (!dragMode && !transitioning) {
      autoRotateAngle += 0.004;
      var dist = 22;
      var camY = 8;
      camera.position.set(
        Math.sin(autoRotateAngle) * dist,
        camY,
        Math.cos(autoRotateAngle) * dist
      );
      camera.lookAt(0, 0, 0);
    }

    // Smooth zoom interpolation
    if (zoomTarget) {
      camera.position.lerp(zoomTarget, 0.12);
      if (camera.position.distanceTo(zoomTarget) < 0.05) {
        zoomTarget = null;
      }
    }

    // Molecule dots orbiting the ChEMBL dataset
    scene.traverse(function (o) {
      if (o.userData && o.userData.orbitMol) {
        var mi = o.userData.molIdx;
        var ma = t * 0.8 + (mi / 6) * Math.PI * 2;
        o.position.set(Math.cos(ma) * 1.8, Math.sin(ma * 1.5) * 1.2, Math.sin(ma) * 1.2);
      }
      // superposition cloud pulse
      if (o.userData && o.userData.cloudPulse) {
        var s = 0.85 + Math.sin(t * 2.5 + o.userData.cloudIdx * 0.8) * 0.2;
        o.scale.set(s, s, s);
      }
      // entanglement line shimmer
      if (o.userData && o.userData.entangle) {
        o.material.opacity = 0.35 + Math.sin(t * 3 + o.position.x) * 0.25;
      }
    });

    // Pulsing WiFi arcs
    scene.traverse(function (o) {
      if (o.userData && o.userData.pulse) {
        var s = 0.85 + Math.sin(t * 3.5 + o.userData.idx * 1.2) * 0.18;
        o.scale.set(s, s, s);
      }
    });

    if (controls.enabled) controls.update();
    renderer.render(scene, camera);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DRAG MODE TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════

  function toggleDragMode() {
    if (dragMode) exitDragMode();
    else enterDragMode();
  }

  function enterDragMode() {
    dragMode = true;
    var container = document.getElementById('qviz-container');
    var dragBtn = document.getElementById('qviz-drag-btn');
    var fsBtn = document.getElementById('qviz-fullscreen-btn');

    if (container) container.classList.add('cviz-fullscreen');
    if (dragBtn) { dragBtn.classList.add('active'); dragBtn.style.display = 'none'; }
    if (fsBtn) fsBtn.classList.add('visible');

    controls.target.set(0, 0, 0);
    controls.enabled = true;
    onResize();
  }

  function exitDragMode() {
    dragMode = false;
    var container = document.getElementById('qviz-container');
    var dragBtn = document.getElementById('qviz-drag-btn');
    var fsBtn = document.getElementById('qviz-fullscreen-btn');

    if (container) container.classList.remove('cviz-fullscreen');
    if (dragBtn) { dragBtn.classList.remove('active'); dragBtn.style.display = ''; }
    if (fsBtn) fsBtn.classList.remove('visible');

    controls.enabled = false;
    autoRotateAngle = Math.atan2(camera.position.x, camera.position.z);
    zoomTarget = null;
    onResize();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FOCAL-POINT ZOOM
  // ═══════════════════════════════════════════════════════════════════════════

  function onWheel(e) {
    if (!dragMode) return;
    e.preventDefault();
    e.stopPropagation();

    var canvas = renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
    var hits = raycaster.intersectObjects(scene.children, true);
    var focal = hits.length > 0 ? hits[0].point.clone() : new THREE.Vector3(0, 0, 0);

    var zoomFactor = e.deltaY > 0 ? 1.06 : 1 / 1.06;
    var curDist = camera.position.distanceTo(focal);
    var newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, curDist * zoomFactor));

    var dir = new THREE.Vector3().subVectors(camera.position, focal).normalize();
    zoomTarget = focal.clone().add(dir.multiplyScalar(newDist));
  }

  var pinchStartDist = 0;

  function onTouchStart(e) {
    if (!dragMode) return;
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    if (!dragMode) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchStartDist > 0) {
        var scaleFactor = pinchStartDist / dist;
        var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        var canvas = renderer.domElement;
        var rect = canvas.getBoundingClientRect();
        var tm = new THREE.Vector2(
          ((midX - rect.left) / rect.width) * 2 - 1,
          -((midY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(tm, camera);
        var hits = raycaster.intersectObjects(scene.children, true);
        var focal = hits.length > 0 ? hits[0].point.clone() : new THREE.Vector3(0, 0, 0);

        var curDist = camera.position.distanceTo(focal);
        var newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, curDist * scaleFactor));
        var dir = new THREE.Vector3().subVectors(camera.position, focal).normalize();
        zoomTarget = focal.clone().add(dir.multiplyScalar(newDist));
        pinchStartDist = dist;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  POINTER / HOVER / INFO
  // ═══════════════════════════════════════════════════════════════════════════

  var infoData = {
    chembl:    { title: 'ChEMBL Dataset',          desc: 'A curated database of bioactive molecules with drug-like properties, used as the raw training data for drug discovery.' },
    classical: { title: 'Classical Pre-processing', desc: 'A classical ML model filters, classifies and compresses the molecular data into a minimal representation, so the quantum layer processes far less.' },
    wifi:      { title: 'Internet Transmission',    desc: 'The pre-processed molecular data is encoded and sent securely over the internet to the IBM Quantum computer.' },
    quantum:   { title: 'IBM Quantum Computer',     desc: 'Superposition lets ~30 qubits represent an enormous molecular search space simultaneously, while entanglement captures the dependency between bonded atoms.' },
  };

  function onPointerDown(e) {
    clickStart.x = e.clientX;
    clickStart.y = e.clientY;
  }

  function onPointerUp(e) {
    var dx = e.clientX - clickStart.x;
    var dy = e.clientY - clickStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) return;

    var canvas = renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(scene.children, true);

    for (var i = 0; i < hits.length; i++) {
      var n = hits[i].object.name || hits[i].object.parent && hits[i].object.parent.name;
      if (n === 'chembl')  { showInfo(infoData.chembl); return; }
      if (n === 'classical') { showInfo(infoData.classical); return; }
      if (n === 'wifi')    { showInfo(infoData.wifi); return; }
      if (n === 'quantum') { showInfo(infoData.quantum); return; }
    }
    hideInfo();
  }

  function onPointerMove(e) {
    var canvas = renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(scene.children, true);

    var hovering = false;
    for (var i = 0; i < hits.length; i++) {
      var n = hits[i].object.name || (hits[i].object.parent && hits[i].object.parent.name);
      if (n === 'chembl' || n === 'classical' || n === 'wifi' || n === 'quantum') {
        hovering = true; break;
      }
    }
    canvas.style.cursor = hovering ? 'pointer' : (dragMode ? 'grab' : 'default');
  }

  function showInfo(d) {
    var panel = document.getElementById('qviz-info');
    if (!panel) return;
    panel.querySelector('h4').textContent = d.title;
    panel.querySelector('p').textContent  = d.desc;
    panel.classList.add('visible');
  }

  function hideInfo() {
    var panel = document.getElementById('qviz-info');
    if (panel) panel.classList.remove('visible');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function onResize() {
    var c = document.getElementById('qviz-container');
    if (!c) return;
    var w = c.clientWidth, h = c.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BOOT
  // ═══════════════════════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
