/**
 * Cardiovascular Monitor — Interactive 3D Architecture Visualization (v2)
 *
 * Hardware view: patient stickman at center, orbiting sensors (ECG, SpO₂, NIBP),
 *   green arrows → sensors → ESP32 → WiFi signal (clickable to software view).
 * Software view: database → PMS screen with live analysis graphs → doctor stickman,
 *   ML models below with labels underneath.
 *
 * Both views: geometric grid floor, full OrbitControls rotation, blueprint-blue wireframes.
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let view = 'hardware';
  let transitioning = false;

  // ─── Three.js essentials ───────────────────────────────────────────────────
  let scene, camera, renderer, controls, raycaster, mouse;
  let clickStart = { x: 0, y: 0 };
  const DURATION = 1400;
  let transition = null;
  const cameraBase = { pos: [0, 6, 18], look: [0, 0, 0] };

  // ─── Colours ───────────────────────────────────────────────────────────────
  const C = {
    blue:     0x1d8cf8,
    brightBlue: 0x3ea6ff,
    cyan:     0x00F0FF,
    red:      0xEF4444,
    green:    0x22C55E,
    white:    0xE5E7EB,
    darkGrid: 0x0a1628,
    gridLine: 0x142840,
  };

  // ─── Materials (shared) ────────────────────────────────────────────────────
  const M = {
    blueWire:   new THREE.LineBasicMaterial({ color: C.blue,   transparent: true, opacity: 0.95 }),
    brightWire: new THREE.LineBasicMaterial({ color: C.brightBlue, transparent: true, opacity: 0.85 }),
    cyanWire:   new THREE.LineBasicMaterial({ color: C.cyan,   transparent: true, opacity: 0.75 }),
    greenWire:  new THREE.LineBasicMaterial({ color: C.green,  transparent: true, opacity: 0.95 }),
    redWire:    new THREE.LineBasicMaterial({ color: C.red,    transparent: true, opacity: 0.85 }),
    grayWire:   new THREE.LineBasicMaterial({ color: 0x4B5563, transparent: true, opacity: 0.3 }),
    hit:        new THREE.MeshBasicMaterial({ visible: false }),
    blueFill:   new THREE.MeshBasicMaterial({ color: C.blue,   transparent: true, opacity: 0.12 }),
    cyanFill:   new THREE.MeshBasicMaterial({ color: C.cyan,   transparent: true, opacity: 0.08 }),
    greenFill:  new THREE.MeshBasicMaterial({ color: C.green,  transparent: true, opacity: 0.10 }),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  GEOMETRY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function arrow(len, mat, headSize) {
    headSize = headSize || 0.18;
    const g = new THREE.Group();
    const shaft = new THREE.CylinderGeometry(0.03, 0.03, len, 6);
    shaft.rotateZ(Math.PI / 2);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(shaft), mat || M.greenWire));
    const head = new THREE.ConeGeometry(headSize, headSize * 2.0, 8);
    head.rotateZ(-Math.PI / 2);
    const m = new THREE.Mesh(head, M.hit);
    m.position.x = len / 2 + headSize;
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(head), mat || M.greenWire);
    e.position.copy(m.position);
    g.add(e);
    return g;
  }

  function arrowVertical(len, mat, headSize) {
    headSize = headSize || 0.18;
    const g = new THREE.Group();
    const shaft = new THREE.CylinderGeometry(0.03, 0.03, len, 6);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(shaft), mat || M.greenWire));
    const head = new THREE.ConeGeometry(headSize, headSize * 2.0, 8);
    head.rotateZ(Math.PI);
    const m = new THREE.Mesh(head, M.hit);
    m.position.y = -len / 2 - headSize;
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(head), mat || M.greenWire);
    e.position.copy(m.position);
    g.add(e);
    return g;
  }

  /**
   * High-res canvas label — much sharper than the original 512×128.
   */
  function labelSprite(text, color, fontSize) {
    fontSize = fontSize || 38;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const scale = 2;                                    // retina crisp
    const w = 640, h = 160;
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
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })
    );
    sp.scale.set(3.2, 0.8, 1);
    sp.renderOrder = 999;
    return sp;
  }

  function labelSpriteSmall(text, color, fontSize) {
    fontSize = fontSize || 28;
    const sp = labelSprite(text, color, fontSize);
    sp.scale.set(2.4, 0.6, 1);
    return sp;
  }

  function wireBox(w, h, d, mat) {
    const g = new THREE.Group();
    const b = new THREE.BoxGeometry(w, h, d);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(b), mat || M.blueWire));
    const m = new THREE.Mesh(b, M.hit); g.add(m); return g;
  }

  function wireCyl(rt, rb, ht, seg, mat) {
    const g = new THREE.Group();
    const c = new THREE.CylinderGeometry(rt, rb, ht, seg);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(c), mat || M.blueWire));
    const m = new THREE.Mesh(c, M.hit); g.add(m); return g;
  }

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  STICKMAN FACTORY
  // ═══════════════════════════════════════════════════════════════════════════

  function stickman(headColor, bodyColor) {
    const g = new THREE.Group();
    // head
    const hg = new THREE.SphereGeometry(0.38, 10, 8);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(hg), headColor || M.cyanWire).translateY(2.05));
    // torso
    const tg = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(tg), bodyColor || M.blueWire).translateY(0.9));
    // arms
    const armG = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
    const armL = new THREE.LineSegments(new THREE.EdgesGeometry(armG), bodyColor || M.blueWire);
    armL.position.set(-0.6, 1.35, 0); armL.rotation.z = Math.PI / 2 + 0.15; g.add(armL);
    const armR = new THREE.LineSegments(new THREE.EdgesGeometry(armG), bodyColor || M.blueWire);
    armR.position.set(0.6, 1.35, 0); armR.rotation.z = -(Math.PI / 2 + 0.15); g.add(armR);
    // legs
    const legG = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4);
    const legL = new THREE.LineSegments(new THREE.EdgesGeometry(legG), bodyColor || M.blueWire);
    legL.position.set(-0.25, -0.05, 0); legL.rotation.z = 0.18; g.add(legL);
    const legR = new THREE.LineSegments(new THREE.EdgesGeometry(legG), bodyColor || M.blueWire);
    legR.position.set(0.25, -0.05, 0); legR.rotation.z = -0.18; g.add(legR);
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GEOMETRIC GRID FLOOR (shared)
  // ═══════════════════════════════════════════════════════════════════════════

  function gridFloor(y) {
    const g = new THREE.Group();
    const grid = new THREE.GridHelper(40, 40, C.gridLine, C.darkGrid);
    grid.position.y = y || -2.5;
    g.add(grid);
    // subtle glow plane
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.03, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y || -2.5;
    g.add(plane);
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER — HARDWARE
  // ═══════════════════════════════════════════════════════════════════════════

  function buildHardware() {
    const sc = new THREE.Group();
    sc.name = 'hw';

    // ── Grid floor ──────────────────────────────────────────────────────────
    sc.add(gridFloor(-2.5));

    // ── Patient stickman at CENTER ──────────────────────────────────────────
    const patient = stickman(M.cyanWire, M.blueWire);
    patient.position.set(0, 0, 0);
    sc.add(patient);
    sc.add(labelSpriteSmall('PATIENT', '#22C55E').translateX(0).translateY(3.2));

    // ── Sensor components (orbit around patient) ────────────────────────────
    // These groups will be animated in the loop to orbit.
    const orbitRadius = 4.5;
    const sensors = [];

    // 1) ECG Electrodes — 3 pads + lead wires
    const ecgGroup = new THREE.Group();
    ecgGroup.name = 'ecg';
    ecgGroup.userData = { orbit: true, radius: orbitRadius, speed: 0.25, offset: 0, height: 1.6 };
    // three electrode pads
    for (let i = 0; i < 3; i++) {
      const pad = wireCyl(0.22, 0.22, 0.08, 12, M.brightWire);
      pad.position.set((i - 1) * 0.55, 0, 0);
      ecgGroup.add(pad);
      // snap connector nub
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), M.hit);
      nub.position.set((i - 1) * 0.55, 0.06, 0);
      ecgGroup.add(nub);
      const nubEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.06, 6, 4)), M.cyanWire);
      nubEdge.position.copy(nub.position);
      ecgGroup.add(nubEdge);
    }
    // lead cable
    const cableG = new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6);
    const cable = new THREE.LineSegments(new THREE.EdgesGeometry(cableG), M.blueWire);
    cable.rotation.z = Math.PI / 2;
    cable.position.y = -0.7;
    ecgGroup.add(cable);
    sensors.push(ecgGroup);
    sc.add(ecgGroup);

    // 2) SpO₂ Clip — clip-shaped box
    const spo2Group = new THREE.Group();
    spo2Group.name = 'spo2';
    spo2Group.userData = { orbit: true, radius: orbitRadius, speed: 0.25, offset: (Math.PI * 2) / 3, height: 1.6 };
    // clip body
    const clipBody = wireBox(1.0, 0.3, 0.5, M.brightWire);
    clipBody.position.y = 0.12;
    spo2Group.add(clipBody);
    // clip jaw
    const jaw = wireBox(0.9, 0.15, 0.45, M.blueWire);
    jaw.position.y = -0.12;
    spo2Group.add(jaw);
    // hinge circle
    const hinge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.12, 0.02, 4, 12)),
      M.cyanWire
    );
    hinge.position.set(-0.35, 0, 0); hinge.rotation.y = Math.PI / 2;
    spo2Group.add(hinge);
    sensors.push(spo2Group);
    sc.add(spo2Group);

    // 3) NIBP Strap — cylindrical cuff
    const nibpGroup = new THREE.Group();
    nibpGroup.name = 'nibp';
    nibpGroup.userData = { orbit: true, radius: orbitRadius, speed: 0.25, offset: (Math.PI * 4) / 3, height: 1.6 };
    // cuff
    const cuffGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.9, 20, 1, true);
    const cuff = new THREE.Mesh(cuffGeo, M.blueFill);
    cuff.rotation.z = Math.PI / 2;
    nibpGroup.add(cuff);
    const cuffEdge = new THREE.LineSegments(new THREE.EdgesGeometry(cuffGeo), M.brightWire);
    cuffEdge.rotation.z = Math.PI / 2;
    nibpGroup.add(cuffEdge);
    // tube
    const tubeG = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6);
    const tube = new THREE.LineSegments(new THREE.EdgesGeometry(tubeG), M.blueWire);
    tube.position.set(0, -0.9, 0); tube.rotation.z = 0.3;
    nibpGroup.add(tube);
    sensors.push(nibpGroup);
    sc.add(nibpGroup);

    // ── Labels for sensors (orbiting with them — placed as children) ────────
    ecgGroup.add(labelSpriteSmall('ECG × 3', '#EF4444').translateY(1.1));
    spo2Group.add(labelSpriteSmall('SpO₂ CLIP', '#EF4444').translateY(1.0));
    nibpGroup.add(labelSpriteSmall('NIBP STRAP', '#EF4444').translateY(1.4));

    // ── Green arrows: patient → each sensor (placed in scene, not in group) ─
    // These will be positioned in the animation loop to point toward each sensor.

    // ── ESP32 (right side) ──────────────────────────────────────────────────
    const esp = new THREE.Group();
    esp.name = 'esp32';
    esp.position.set(9, 0, 0);
    // board body
    const board = wireBox(2.8, 1.4, 0.3, M.brightWire);
    esp.add(board);
    // MCU chip
    const chip = wireBox(1.0, 1.0, 0.15, M.blueWire);
    chip.position.set(0, 0, 0.15);
    esp.add(chip);
    // pins (two rows)
    for (let row = -1; row <= 1; row += 2) {
      for (let i = 0; i < 10; i++) {
        const pin = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(0.06, 0.3, 0.06)),
          M.blueWire
        );
        pin.position.set(-1.1 + i * 0.25, row * 0.85, 0);
        esp.add(pin);
      }
    }
    // USB port
    const usb = wireBox(0.45, 0.25, 0.2, M.cyanWire);
    usb.position.set(-1.35, 0, 0);
    esp.add(usb);
    sc.add(esp);
    sc.add(labelSpriteSmall('ESP32', '#EF4444').translateX(9).translateY(1.8));

    // ── WiFi Signal (clickable → software view) ────────────────────────────
    const wifiGroup = new THREE.Group();
    wifiGroup.name = 'wifi';
    wifiGroup.position.set(12.5, 0, 0);
    wifiGroup.userData = { hover: false };

    // WiFi arcs
    const arc1 = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.55, 0.025, 4, 16, Math.PI * 1.1)),
      M.cyanWire
    );
    arc1.userData.pulse = true; arc1.userData.idx = 0;
    wifiGroup.add(arc1);
    const arc2 = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.38, 0.025, 4, 16, Math.PI * 1.1)),
      M.cyanWire
    );
    arc2.userData.pulse = true; arc2.userData.idx = 1;
    wifiGroup.add(arc2);
    // center dot
    wifiGroup.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.SphereGeometry(0.08, 6, 4)),
      M.cyanWire
    ));
    // clickable hitbox
    const wfHit = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), M.hit);
    wfHit.name = 'wifi';
    wifiGroup.add(wfHit);
    sc.add(wifiGroup);

    // green text below WiFi
    const wifiLabel = labelSpriteSmall('GO TO SOFTWARE →', '#22C55E');
    wifiLabel.position.set(12.5, -2.0, 0);
    wifiLabel.userData.isStatic = true;
    sc.add(wifiLabel);

    // green arrow ESP32 → WiFi
    const espToWifi = arrow(2.5, M.greenWire, 0.22);
    espToWifi.position.set(10.7, 0, 0);
    espToWifi.userData.isStatic = true;
    sc.add(espToWifi);

    // ── Big green arrow: sensors → ESP32 ────────────────────────────────────
    const sensorToEsp = arrow(4.0, M.greenWire, 0.28);
    sensorToEsp.position.set(5.0, 0, 0);
    sensorToEsp.userData.isStatic = true;
    sc.add(sensorToEsp);
    sc.add(labelSpriteSmall('VITALS DATA', '#22C55E').translateX(5.5).translateY(-1.2).scale.set(2.0, 0.5, 1));

    return sc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PMS SCREEN WITH ANALYSIS GRAPHS (canvas texture)
  // ═══════════════════════════════════════════════════════════════════════════

  function createPMSScreenTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 640;
    const ctx = c.getContext('2d');

    // background
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, 1024, 640);

    // border
    ctx.strokeStyle = '#1d8cf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 1004, 620);

    // title
    ctx.fillStyle = '#3ea6ff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PATIENT MANAGEMENT SYSTEM', 512, 45);

    // ECG waveform
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 40; x < 340; x++) {
      const t = (x - 40) / 60;
      let y = 120;
      const phase = t % 1.0;
      if (phase > 0.35 && phase < 0.40) y -= 50;
      else if (phase > 0.40 && phase < 0.45) y += 30;
      else if (phase > 0.45 && phase < 0.50) y -= 15;
      else y += Math.sin(phase * Math.PI * 2) * 2;
      if (x === 40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#22C55E';
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ECG', 40, 90);

    // SpO₂ bar chart
    ctx.fillStyle = '#00F0FF';
    ctx.font = '16px monospace';
    ctx.fillText('SpO₂', 400, 90);
    const spo2Vals = [94, 96, 97, 95, 98, 96, 97, 95];
    spo2Vals.forEach((v, i) => {
      const barH = (v - 90) * 12;
      ctx.fillStyle = v >= 96 ? '#22C55E' : '#EF4444';
      ctx.fillRect(400 + i * 38, 180 - barH, 30, barH);
    });
    ctx.fillStyle = '#3ea6ff';
    ctx.fillText('97%', 400, 200);

    // NIBP line graph
    ctx.strokeStyle = '#8A2BE2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const nibpVals = [120, 122, 118, 125, 121, 119, 123, 120, 124, 122, 118, 121];
    nibpVals.forEach((v, i) => {
      const px = 660 + i * 28;
      const py = 200 - (v - 110) * 4;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = '#8A2BE2';
    ctx.font = '16px monospace';
    ctx.fillText('NIBP', 660, 90);
    ctx.fillText('122/78 mmHg', 660, 200);

    // bottom stats
    ctx.fillStyle = '#1d8cf8';
    ctx.font = '14px monospace';
    ctx.fillText('HR: 72 bpm   |   Temp: 36.8°C   |   Resp: 16 /min', 180, 310);

    // alert box
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 340, 944, 80);
    ctx.fillStyle = 'rgba(239,68,68,0.1)';
    ctx.fillRect(40, 340, 944, 80);
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('⚠  ANOMALY DETECTED — Awaiting doctor confirmation', 512, 385);

    // patient info
    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.fillText('Patient: Ahmed Khan  |  ID: T3-0041  |  Bed: C-12  |  Monitor: Live', 180, 590);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER — SOFTWARE
  // ═══════════════════════════════════════════════════════════════════════════

  function buildSoftware() {
    const sc = new THREE.Group();
    sc.name = 'sw';

    // ── Grid floor ──────────────────────────────────────────────────────────
    sc.add(gridFloor(-2.5));

    // ── Database (left) ─────────────────────────────────────────────────────
    const dbGrp = new THREE.Group();
    dbGrp.position.set(-8, 0, 0);
    const dbBody = wireCyl(1.0, 1.0, 2.2, 16, M.brightWire);
    dbGrp.add(dbBody);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.TorusGeometry(1.0, 0.02, 4, 20)),
        M.cyanWire
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.65 + i * 0.65;
      dbGrp.add(ring);
    }
    sc.add(dbGrp);
    sc.add(labelSpriteSmall('DATABASE', '#EF4444').translateX(-8).translateY(2.5));

    // green arrow DB → PMS
    sc.add(arrow(3.0, M.greenWire, 0.22).translateX(-4.5).translateY(0));

    // ── PMS Screen (center) with analysis graph ─────────────────────────────
    const pmsGrp = new THREE.Group();
    pmsGrp.position.set(0, 1.0, 0);
    // monitor frame
    const frame = wireBox(5.0, 3.2, 0.2, M.brightWire);
    pmsGrp.add(frame);
    // screen with texture
    const screenGeo = new THREE.PlaneGeometry(4.7, 2.9);
    const screenMat = new THREE.MeshBasicMaterial({ map: createPMSScreenTexture() });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = 0.11;
    pmsGrp.add(screen);
    // stand
    pmsGrp.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.15, 1.0, 0.2)), M.blueWire
    ).translateY(-2.1));
    pmsGrp.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.0, 0.06, 0.3)), M.blueWire
    ).translateY(-2.65));
    sc.add(pmsGrp);
    sc.add(labelSpriteSmall('PATIENT MANAGEMENT SYSTEM', '#EF4444').translateX(0).translateY(4.2));

    // ── Doctor stickman (right) ─────────────────────────────────────────────
    const doctor = stickman(M.blueWire, M.blueWire);
    doctor.position.set(6.5, 0, 0);
    sc.add(doctor);
    sc.add(labelSpriteSmall('DOCTOR', '#EF4444').translateX(6.5).translateY(3.2));

    // bidirectional arrows doctor ↔ PMS
    const arrowD2P = arrow(2.0, M.greenWire);
    arrowD2P.position.set(4.0, 0.5, 0);
    arrowD2P.userData.isStatic = true;
    sc.add(arrowD2P);
    const arrowP2D = arrow(2.0, M.greenWire);
    arrowP2D.rotation.z = Math.PI;
    arrowP2D.position.set(4.0, -0.3, 0);
    arrowP2D.userData.isStatic = true;
    sc.add(arrowP2D);
    sc.add(labelSpriteSmall('ENTERS READINGS', '#22C55E').translateX(5.25).translateY(-1.5).scale.set(1.8, 0.45, 1));

    // ── ML Models (below PMS) ───────────────────────────────────────────────
    const mlNames = ['ECG Analysis', 'SpO₂ Analysis', 'NIBP Analysis'];
    const mlX = [-3.0, 0, 3.0];
    for (let i = 0; i < 3; i++) {
      // vertical arrow PMS → ML
      const a = arrowVertical(2.2, M.greenWire, 0.16);
      a.position.set(mlX[i], -1.2, 0);
      a.userData.isStatic = true;
      sc.add(a);

      // model box
      const ml = wireBox(2.0, 1.3, 0.8, M.blueWire);
      ml.position.set(mlX[i], -3.2, 0);
      sc.add(ml);

      // label BELOW the model
      sc.add(labelSpriteSmall(mlNames[i].toUpperCase(), '#3ea6ff').translateX(mlX[i]).translateY(-4.2));
    }
    sc.add(labelSpriteSmall('ML MODELS', '#EF4444').translateX(0).translateY(-1.8));
    sc.add(labelSpriteSmall('LIVE DATA FLOW', '#22C55E').translateX(0).translateY(-5.2).scale.set(2.0, 0.5, 1));

    return sc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    var canvas = document.getElementById('cviz-canvas');
    if (!canvas) return;

    var container = document.getElementById('cviz-container');
    var w = container.clientWidth;
    var h = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.set(0, 6, 18);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 35;
    controls.maxPolarAngle = Math.PI * 0.82;
    controls.minPolarAngle = Math.PI * 0.1;
    controls.autoRotate = false; // we handle rotation ourselves for transitions
    controls.enabled = true;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    scene.add(buildHardware());

    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    var btn = document.getElementById('cviz-back');
    if (btn) btn.addEventListener('click', function () { goTo('hardware'); });

    animate();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) return;

    var t = performance.now() * 0.001;

    // orbiting sensors in hardware view
    if (view === 'hardware') {
      scene.traverse(function (o) {
        if (o.userData && o.userData.orbit) {
          var angle = t * o.userData.speed + o.userData.offset;
          var r = o.userData.radius;
          var h = o.userData.height;
          o.position.set(
            Math.cos(angle) * r,
            h + Math.sin(angle * 0.5) * 0.4,
            Math.sin(angle) * r
          );
        }
      });
    }

    // pulsing WiFi arcs
    scene.traverse(function (o) {
      if (o.userData && o.userData.pulse) {
        var s = 0.85 + Math.sin(t * 3.5 + o.userData.idx * 1.2) * 0.18;
        o.scale.set(s, s, s);
      }
    });

    // camera transition
    if (transition) {
      var elapsed = performance.now() - transition.startTime;
      var t01 = Math.min(elapsed / DURATION, 1);
      if (t01 >= 1) {
        camera.position.copy(transition.to.pos);
        camera.lookAt(transition.to.look);
        transitioning = false;
        transition = null;
        controls.enabled = true;
        var hc = document.getElementById('cviz-container');
        if (hc) hc.style.cursor = 'default';
        hideInfo();
      } else {
        var e = easeInOutCubic(t01);
        camera.position.lerpVectors(transition.from.pos, transition.to.pos, e);
        var lk = new THREE.Vector3().lerpVectors(transition.from.look, transition.to.look, e);
        camera.lookAt(lk);
      }
    }

    if (controls.enabled) controls.update();
    renderer.render(scene, camera);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE TRANSITION
  // ═══════════════════════════════════════════════════════════════════════════

  function goTo(target) {
    if (transitioning || view === target) return;
    transitioning = true;
    controls.enabled = false;

    var fromPos  = new THREE.Vector3().copy(camera.position);
    var fromLook = new THREE.Vector3(0, 0, 0);

    // fade current scene
    var cur = scene.children[0];
    if (cur) { cur.visible = false; scene.remove(cur); }

    scene.add(target === 'software' ? buildSoftware() : buildHardware());
    view = target;

    var btn = document.getElementById('cviz-back');
    if (btn) btn.classList.toggle('visible', view === 'software');

    var hint = document.getElementById('cviz-hint');
    if (hint) hint.style.display = view === 'hardware' ? '' : 'none';

    var hc = document.getElementById('cviz-container');
    if (hc) hc.style.cursor = 'wait';

    transition = {
      from: { pos: fromPos, look: fromLook },
      to:   { pos: new THREE.Vector3().fromArray(cameraBase.pos), look: new THREE.Vector3().fromArray(cameraBase.look) },
      startTime: performance.now()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  POINTER / HOVER / CLICK
  // ═══════════════════════════════════════════════════════════════════════════

  var infoData = {
    wifi:     { title: 'WiFi Link',              desc: 'The ESP32 streams captured vital signs over the hospital LAN to the Patient Management System in real time.' },
    database: { title: 'Database',               desc: 'All incoming ECG, SpO₂, and NIBP readings are stored for historical analysis and model training.' },
    esp32:    { title: 'ESP32 Microcontroller',  desc: 'The ESP32 captures sensor data, processes it locally, and transmits it over WiFi to the hospital network.' },
  };

  function onPointerDown(e) {
    clickStart.x = e.clientX;
    clickStart.y = e.clientY;
  }

  function onPointerUp(e) {
    if (transitioning) return;
    var dx = e.clientX - clickStart.x;
    var dy = e.clientY - clickStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) return; // was a drag/rotate

    var canvas = renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(scene.children, true);

    for (var i = 0; i < hits.length; i++) {
      var name = hits[i].object.name;
      if (name === 'wifi' && view === 'hardware') { goTo('software'); return; }
      if (name === 'esp32' && view === 'hardware') { showInfo(infoData.esp32); return; }
      if (name === 'database' && view === 'software') { showInfo(infoData.database); return; }
    }
    hideInfo();
  }

  function onPointerMove(e) {
    if (transitioning) return;
    var canvas = renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(scene.children, true);

    var hoveringWifi = false;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].object.name === 'wifi') { hoveringWifi = true; break; }
    }
    canvas.style.cursor = hoveringWifi ? 'pointer' : 'grab';

    // hover zoom on WiFi
    scene.traverse(function (o) {
      if (o.name === 'wifi') {
        var targetScale = hoveringWifi ? 1.25 : 1.0;
        var s = o.scale.x + (targetScale - o.scale.x) * 0.1;
        o.scale.set(s, s, s);
      }
    });
  }

  function showInfo(d) {
    var panel = document.getElementById('cviz-info');
    if (!panel) return;
    panel.querySelector('h4').textContent = d.title;
    panel.querySelector('p').textContent  = d.desc;
    panel.classList.add('visible');
  }

  function hideInfo() {
    var panel = document.getElementById('cviz-info');
    if (panel) panel.classList.remove('visible');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function onResize() {
    var c = document.getElementById('cviz-container');
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
