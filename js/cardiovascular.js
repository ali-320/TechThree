/**
 * Cardiovascular Monitor — Interactive 3D Architecture Visualization (v4)
 *
 * Fixes from v3:
 * - Continuous 360° auto-rotate (no oscillation)
 * - Arrows track orbiting sensors: head on sensor, tail on body part
 * - Smooth focal-point zoom without lag
 * - Drag mode preserved across WiFi view transitions
 * - WiFi on software side is LEFT of database with arrow pointing right
 * - Green text: "Click on the wifi to view software" / "Click on the wifi to view hardware"
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  var view = 'hardware';
  var dragMode = false;
  var transitioning = false;
  var autoRotateAngle = 0;
  var clickStart = { x: 0, y: 0 };

  // ─── Three.js essentials ───────────────────────────────────────────────────
  var scene, camera, renderer, controls, raycaster, mouse;
  var transition = null;
  var DURATION = 1400;
  var cameraBase = { pos: [0, 6, 18], look: [0, 0, 0] };
  var zoomTarget = null; // target camera position for smooth zoom

  // ─── Colours ───────────────────────────────────────────────────────────────
  var C = {
    blue:       0x1d8cf8,
    brightBlue: 0x3ea6ff,
    cyan:       0x00F0FF,
    red:        0xEF4444,
    green:      0x22C55E,
    white:      0xE5E7EB,
    darkGrid:   0x0a1628,
    gridLine:   0x142840,
  };

  // ─── Materials ─────────────────────────────────────────────────────────────
  var M = {
    blueWire:   new THREE.LineBasicMaterial({ color: C.blue,       transparent: true, opacity: 0.95 }),
    brightWire: new THREE.LineBasicMaterial({ color: C.brightBlue, transparent: true, opacity: 0.85 }),
    cyanWire:   new THREE.LineBasicMaterial({ color: C.cyan,       transparent: true, opacity: 0.75 }),
    greenWire:  new THREE.LineBasicMaterial({ color: C.green,      transparent: true, opacity: 0.95 }),
    redWire:    new THREE.LineBasicMaterial({ color: C.red,        transparent: true, opacity: 0.85 }),
    grayWire:   new THREE.LineBasicMaterial({ color: 0x4B5563,     transparent: true, opacity: 0.3 }),
    hit:        new THREE.MeshBasicMaterial({ visible: false }),
    blueFill:   new THREE.MeshBasicMaterial({ color: C.blue,       transparent: true, opacity: 0.12 }),
    cyanFill:   new THREE.MeshBasicMaterial({ color: C.cyan,       transparent: true, opacity: 0.08 }),
    greenFill:  new THREE.MeshBasicMaterial({ color: C.green,      transparent: true, opacity: 0.10 }),
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

  function arrowVertical(len, mat, headSize) {
    headSize = headSize || 0.18;
    var g = new THREE.Group();
    var shaft = new THREE.CylinderGeometry(0.03, 0.03, len, 6);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(shaft), mat || M.greenWire));
    var head = new THREE.ConeGeometry(headSize, headSize * 2.0, 8);
    head.rotateZ(Math.PI);
    var m = new THREE.Mesh(head, M.hit);
    m.position.y = -len / 2 - headSize;
    g.add(m);
    var e = new THREE.LineSegments(new THREE.EdgesGeometry(head), mat || M.greenWire);
    e.position.copy(m.position);
    g.add(e);
    return g;
  }

  /**
   * Create a green arrow from (x1,y1) to (x2,y2) in 2D (XY plane).
   * Head points toward (x2,y2).
   */
  function makeArrowBetween(x1, y1, x2, y2, mat, headSize) {
    headSize = headSize || 0.16;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return new THREE.Group();
    var angle = Math.atan2(dy, dx);

    var g = new THREE.Group();
    // shaft
    var shaft = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
    var shaftMesh = new THREE.LineSegments(new THREE.EdgesGeometry(shaft), mat || M.greenWire);
    shaftMesh.rotation.z = Math.PI / 2;
    g.add(shaftMesh);
    // head at the end
    var head = new THREE.ConeGeometry(headSize, headSize * 2.0, 8);
    head.rotateZ(-Math.PI / 2);
    var headMesh = new THREE.Mesh(head, M.hit);
    headMesh.position.x = len / 2 + headSize;
    g.add(headMesh);
    var headEdge = new THREE.LineSegments(new THREE.EdgesGeometry(head), mat || M.greenWire);
    headEdge.position.copy(headMesh.position);
    g.add(headEdge);

    g.position.set(x1, y1, 0);
    g.rotation.z = angle;
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STICKMAN FACTORY
  // ═══════════════════════════════════════════════════════════════════════════

  function stickman(headColor, bodyColor) {
    var g = new THREE.Group();
    var hg = new THREE.SphereGeometry(0.38, 10, 8);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(hg), headColor || M.cyanWire).translateY(2.05));
    var tg = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(tg), bodyColor || M.blueWire).translateY(0.9));
    var armG = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
    var armL = new THREE.LineSegments(new THREE.EdgesGeometry(armG), bodyColor || M.blueWire);
    armL.position.set(-0.6, 1.35, 0); armL.rotation.z = Math.PI / 2 + 0.15; g.add(armL);
    var armR = new THREE.LineSegments(new THREE.EdgesGeometry(armG), bodyColor || M.blueWire);
    armR.position.set(0.6, 1.35, 0); armR.rotation.z = -(Math.PI / 2 + 0.15); g.add(armR);
    var legG = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4);
    var legL = new THREE.LineSegments(new THREE.EdgesGeometry(legG), bodyColor || M.blueWire);
    legL.position.set(-0.25, -0.05, 0); legL.rotation.z = 0.18; g.add(legL);
    var legR = new THREE.LineSegments(new THREE.EdgesGeometry(legG), bodyColor || M.blueWire);
    legR.position.set(0.25, -0.05, 0); legR.rotation.z = -0.18; g.add(legR);
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GEOMETRIC GRID FLOOR
  // ═══════════════════════════════════════════════════════════════════════════

  function gridFloor(y) {
    var g = new THREE.Group();
    var grid = new THREE.GridHelper(40, 40, C.gridLine, C.darkGrid);
    grid.position.y = y || -2.5;
    g.add(grid);
    var plane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.03, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y || -2.5;
    g.add(plane);
    return g;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WiFi SIGNAL (reusable)
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
  //  PMS SCREEN WITH ANALYSIS GRAPHS
  // ═══════════════════════════════════════════════════════════════════════════

  function createPMSScreenTexture() {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 640;
    var ctx = c.getContext('2d');

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, 1024, 640);
    ctx.strokeStyle = '#1d8cf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 1004, 620);

    ctx.fillStyle = '#3ea6ff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PATIENT MANAGEMENT SYSTEM', 512, 45);

    // ECG waveform
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = 40; x < 340; x++) {
      var t = (x - 40) / 60;
      var y = 120;
      var phase = t % 1.0;
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

    // SpO2 bar chart
    ctx.fillStyle = '#00F0FF';
    ctx.font = '16px monospace';
    ctx.fillText('SpO\u2082', 400, 90);
    var spo2Vals = [94, 96, 97, 95, 98, 96, 97, 95];
    spo2Vals.forEach(function (v, i) {
      var barH = (v - 90) * 12;
      ctx.fillStyle = v >= 96 ? '#22C55E' : '#EF4444';
      ctx.fillRect(400 + i * 38, 180 - barH, 30, barH);
    });
    ctx.fillStyle = '#3ea6ff';
    ctx.fillText('97%', 400, 200);

    // NIBP line graph
    ctx.strokeStyle = '#8A2BE2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var nibpVals = [120, 122, 118, 125, 121, 119, 123, 120, 124, 122, 118, 121];
    nibpVals.forEach(function (v, i) {
      var px = 660 + i * 28;
      var py = 200 - (v - 110) * 4;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = '#8A2BE2';
    ctx.font = '16px monospace';
    ctx.fillText('NIBP', 660, 90);
    ctx.fillText('122/78 mmHg', 660, 200);

    ctx.fillStyle = '#1d8cf8';
    ctx.font = '14px monospace';
    ctx.fillText('HR: 72 bpm   |   Temp: 36.8\u00B0C   |   Resp: 16 /min', 180, 310);

    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 340, 944, 80);
    ctx.fillStyle = 'rgba(239,68,68,0.1)';
    ctx.fillRect(40, 340, 944, 80);
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('\u26A0  ANOMALY DETECTED \u2014 Awaiting doctor confirmation', 512, 385);

    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.fillText('Patient: Ahmed Khan  |  ID: T3-0041  |  Bed: C-12  |  Monitor: Live', 180, 590);

    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER — HARDWARE
  // ═══════════════════════════════════════════════════════════════════════════

  function buildHardware() {
    var sc = new THREE.Group();
    sc.name = 'hw';

    sc.add(gridFloor(-2.5));

    // ── Patient stickman at CENTER (shifted left for room) ─────────────────
    var patient = stickman(M.cyanWire, M.blueWire);
    patient.name = 'patient';
    patient.position.set(-2, 0, 0);
    sc.add(patient);
    sc.add(labelSpriteSmall('PATIENT', '#22C55E', 70).translateX(-2).translateY(3.2));

    // ── Sensor components (orbit around patient) ────────────────────────────
    var orbitRadius = 4.5;
    var sensorDefs = [
      { name: 'ecg',  label: 'ECG \u00D7 3',     offset: 0             },
      { name: 'spo2', label: 'SpO\u2082 CLIP',   offset: Math.PI * 2/3 },
      { name: 'nibp', label: 'NIBP STRAP',        offset: Math.PI * 4/3 },
    ];

    // 1) ECG Electrodes
    var ecgGroup = new THREE.Group();
    ecgGroup.name = 'ecg';
    ecgGroup.userData = { orbit: true, radius: orbitRadius, speed: 0.25, offset: 0 };
    for (var i = 0; i < 3; i++) {
      var pad = wireCyl(0.22, 0.22, 0.08, 12, M.brightWire);
      pad.position.set((i - 1) * 0.55, 0, 0);
      ecgGroup.add(pad);
      var nub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), M.hit);
      nub.position.set((i - 1) * 0.55, 0.06, 0);
      ecgGroup.add(nub);
      var nubEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.06, 6, 4)), M.cyanWire);
      nubEdge.position.copy(nub.position);
      ecgGroup.add(nubEdge);
    }
    var cableG = new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6);
    var cable = new THREE.LineSegments(new THREE.EdgesGeometry(cableG), M.blueWire);
    cable.rotation.z = Math.PI / 2;
    cable.position.y = -0.7;
    ecgGroup.add(cable);
    sc.add(ecgGroup);

    // 2) SpO2 Clip
    var spo2Group = new THREE.Group();
    spo2Group.name = 'spo2';
    spo2Group.userData = { orbit: true, radius: orbitRadius, speed: 0.25, offset: Math.PI * 2/3 };
    var clipBody = wireBox(1.0, 0.3, 0.5, M.brightWire);
    clipBody.position.y = 0.12;
    spo2Group.add(clipBody);
    var jaw = wireBox(0.9, 0.15, 0.45, M.blueWire);
    jaw.position.y = -0.12;
    spo2Group.add(jaw);
    var hinge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusGeometry(0.12, 0.02, 4, 12)),
      M.cyanWire
    );
    hinge.position.set(-0.35, 0, 0); hinge.rotation.y = Math.PI / 2;
    spo2Group.add(hinge);
    sc.add(spo2Group);

    // 3) NIBP Strap
    var nibpGroup = new THREE.Group();
    nibpGroup.name = 'nibp';
    nibpGroup.userData = { orbit: true, radius: orbitRadius, speed: 0.25, offset: Math.PI * 4/3 };
    var cuffGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.9, 20, 1, true);
    var cuff = new THREE.Mesh(cuffGeo, M.blueFill);
    cuff.rotation.z = Math.PI / 2;
    nibpGroup.add(cuff);
    var cuffEdge = new THREE.LineSegments(new THREE.EdgesGeometry(cuffGeo), M.brightWire);
    cuffEdge.rotation.z = Math.PI / 2;
    nibpGroup.add(cuffEdge);
    var tubeG = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6);
    var tube = new THREE.LineSegments(new THREE.EdgesGeometry(tubeG), M.blueWire);
    tube.position.set(0, -0.9, 0); tube.rotation.z = 0.3;
    nibpGroup.add(tube);
    sc.add(nibpGroup);

    // Labels for sensors
    ecgGroup.add(labelSpriteSmall('ECG \u00D7 3', '#EF4444', 70).translateY(1.1));
    spo2Group.add(labelSpriteSmall('SpO\u2082 CLIP', '#EF4444', 70).translateY(1.0));
    nibpGroup.add(labelSpriteSmall('NIBP STRAP', '#EF4444', 70).translateY(1.4));

    // ── Green arrows: patient center → sensor (dynamic, updated in loop) ───
    var arrowHolder = new THREE.Group();
    arrowHolder.name = 'arrowHolder';
    for (var ai = 0; ai < 3; ai++) {
      var placeholder = new THREE.Group();
      placeholder.userData = { arrowIndex: ai };
      arrowHolder.add(placeholder);
    }
    sc.add(arrowHolder);

    // ── ESP32 (right side) ──────────────────────────────────────────────────
    var esp = new THREE.Group();
    esp.name = 'esp32';
    esp.position.set(7.7, 0, 0);
    var board = wireBox(2.8, 1.4, 0.3, M.brightWire);
    esp.add(board);
    var chip = wireBox(1.0, 1.0, 0.15, M.blueWire);
    chip.position.set(0, 0, 0.15);
    esp.add(chip);
    for (var row = -1; row <= 1; row += 2) {
      for (var pi = 0; pi < 10; pi++) {
        var pin = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(0.06, 0.3, 0.06)),
          M.blueWire
        );
        pin.position.set(-1.1 + pi * 0.25, row * 0.85, 0);
        esp.add(pin);
      }
    }
    var usb = wireBox(0.45, 0.25, 0.2, M.cyanWire);
    usb.position.set(-1.35, 0, 0);
    esp.add(usb);
    sc.add(esp);
    sc.add(labelSpriteSmall('ESP32', '#EF4444', 70).translateX(7.7).translateY(1.8));

    // ── WiFi Signal (right of ESP32) ───────────────────────────────────────
    var wifiGroup = createWiFiGroup('wifi');
    wifiGroup.position.set(12.5, 0, 0);
    sc.add(wifiGroup);

    // Green text to the RIGHT of WiFi
    var wifiLabel = labelSpriteSmall('CLICK ON THE WIFI TO VIEW SOFTWARE', '#22C55E', 33);
    wifiLabel.position.set(13.0, -0.8, 0);
    wifiLabel.scale.set(3.0, 1, 1);
    wifiLabel.userData.isStatic = true;
    sc.add(wifiLabel);

    // green arrow ESP32 → WiFi
    var espToWifi = arrow(1.3, M.greenWire, 0.22);
    espToWifi.position.set(10.1, 0, 0);
    espToWifi.userData.isStatic = true;
    sc.add(espToWifi);

    // ── Big green arrow: sensors → ESP32 ────────────────────────────────────
    var sensorToEsp = arrow(3.0, M.greenWire, 0.28);
    sensorToEsp.position.set(3.5, 0, 0);
    sensorToEsp.userData.isStatic = true;
    sc.add(sensorToEsp);
    sc.add(labelSpriteSmall('VITALS DATA', '#22C55E').translateX(4.0).translateY(-1.2).scale.set(2.0, 0.5, 1));

    return sc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER — SOFTWARE
  // ═══════════════════════════════════════════════════════════════════════════

  function buildSoftware() {
    var sc = new THREE.Group();
    sc.name = 'sw';

    sc.add(gridFloor(-3.5));

    // ── WiFi Signal — LEFT of database ──────────────────────────────────────
    var wifiSw = createWiFiGroup('wifi-sw');
    wifiSw.position.set(-10.5, 0.5, 0);
    sc.add(wifiSw);

    // Green text to the LEFT of WiFi
    var wifiSwLabel = labelSpriteSmall('CLICK ON THE WIFI TO VIEW HARDWARE', '#22C55E', 33);
    wifiSwLabel.position.set(-10.5, -0.5, 0);
    wifiSwLabel.scale.set(3.0, 1, 1);
    wifiSwLabel.userData.isStatic = true;
    sc.add(wifiSwLabel);

    // ── Database (center-left) ──────────────────────────────────────────────
    var dbGrp = new THREE.Group();
    dbGrp.name = 'database';
    dbGrp.position.set(-6, 0.5, 0);
    var dbBody = wireCyl(1.0, 1.0, 2.2, 16, M.brightWire);
    dbGrp.add(dbBody);
    for (var di = 0; di < 3; di++) {
      var ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.TorusGeometry(1.0, 0.02, 4, 20)),
        M.cyanWire
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.65 + di * 0.65;
      dbGrp.add(ring);
    }
    sc.add(dbGrp);
    
    var dlabel = labelSpriteSmall('Database', '#EF4444', 70).translateX(-6).translateY(2.5);
    sc.add(dlabel);

    // green arrow WiFi → Database (pointing right from WiFi to DB)
    var wifiToDb = makeArrowBetween(-8.7, 0.5, -7.0, 0.5, M.greenWire, 0.18);
    wifiToDb.userData.isStatic = true;
    sc.add(wifiToDb);

    // ── PMS Screen (center) ─────────────────────────────────────────────────
    var pmsGrp = new THREE.Group();
    pmsGrp.position.set(0, 1.5, 0);
    var frame = wireBox(5.0, 3.2, 0.2, M.brightWire);
    pmsGrp.add(frame);
    var screenGeo = new THREE.PlaneGeometry(4.7, 2.9);
    var screenMat = new THREE.MeshBasicMaterial({ map: createPMSScreenTexture() });
    var screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = 0.11;
    pmsGrp.add(screen);
    pmsGrp.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.15, 1.0, 0.2)), M.blueWire
    ).translateY(-2.1));
    pmsGrp.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.0, 0.06, 0.3)), M.blueWire
    ).translateY(-2.65));
    sc.add(pmsGrp);
    sc.add(labelSpriteSmall('PMS', '#EF4444', 70).translateX(0).translateY(4.2));


    // green arrow Database → PMS (pointing right from DB to PMS)
    var DBToPMS = makeArrowBetween(-4, 0.5, -2.5, 0.5, M.greenWire, 0.18);
    DBToPMS.userData.isStatic = true;
    sc.add(DBToPMS);


    // ── Doctor stickman (right) ─────────────────────────────────────────────
    var doctor = stickman(M.blueWire, M.blueWire);
    doctor.position.set(6.5, 0.5, 0);
    sc.add(doctor);
    sc.add(labelSpriteSmall('DOCTOR', '#EF4444', 60).translateX(6.5).translateY(3.2));

    // bidirectional arrows doctor ↔ PMS
    var arrowD2P = arrow(2.0, M.greenWire);
    arrowD2P.position.set(4.0, 1.0, 0);
    arrowD2P.userData.isStatic = true;
    sc.add(arrowD2P);
    var arrowP2D = arrow(2.0, M.greenWire);
    arrowP2D.rotation.z = Math.PI;
    arrowP2D.position.set(4.0, 0.2, 0);
    arrowP2D.userData.isStatic = true;
    sc.add(arrowP2D);
    sc.add(labelSpriteSmall('ENTERS READINGS', '#22C55E').translateX(5.25).translateY(-1.0).scale.set(1.8, 0.45, 1));

    // ── ML Models (below PMS) ───────────────────────────────────────────────
    var mlNames = 'ML models';
    var vArrow = arrowVertical(1.7, M.greenWire, 0.14);
    vArrow.position.set(-1.5, -1, 0);
    vArrow.userData.isStatic = true;
    sc.add(vArrow);


    sc.add(labelSpriteSmall(mlNames.toUpperCase(), '#EF4444', 60).translateX(-1.5).translateY(-2.5));

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

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 35;
    controls.maxPolarAngle = Math.PI * 0.82;
    controls.minPolarAngle = Math.PI * 0.1;
    controls.autoRotate = false;
    controls.zoomSpeed = 0; // we handle zoom for focal-point behavior
    controls.enabled = false;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    scene.add(buildHardware());

    // Events
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('resize', onResize, { passive: true });

    var btn = document.getElementById('cviz-back');
    if (btn) btn.addEventListener('click', function () { goTo('hardware'); });

    var dragBtn = document.getElementById('cviz-drag-btn');
    if (dragBtn) dragBtn.addEventListener('click', toggleDragMode);

    var fsBtn = document.getElementById('cviz-fullscreen-btn');
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

    // ── Continuous 360° auto-rotate when not in drag mode ───────────────────
    if (!dragMode && !transitioning) {
      autoRotateAngle += 0.004; // ~0.23° per frame, full rotation in ~26s
      var dist = 18;
      var camY = 6;
      camera.position.set(
        Math.sin(autoRotateAngle) * dist,
        camY,
        Math.cos(autoRotateAngle) * dist
      );
      camera.lookAt(0, 0, 0);
    }

    // ── Smooth zoom interpolation ───────────────────────────────────────────
    if (zoomTarget) {
      camera.position.lerp(zoomTarget, 0.12);
      if (camera.position.distanceTo(zoomTarget) < 0.05) {
        zoomTarget = null;
      }
    }

    // ── Orbiting sensors + arrows + patient rotation in hardware view ───────
    if (view === 'hardware') {
      var sensorPositions = [];

      scene.traverse(function (o) {
        if (o.userData && o.userData.orbit) {
          var sAngle = t * o.userData.speed + o.userData.offset;
          var r = o.userData.radius;
          var h = o.userData.height;
          // Vertical orbit (XY plane) — like a 2D solar system side-view
          o.position.set(
            -2 + Math.cos(sAngle) * r,
            Math.sin(sAngle) * r,
            0
          );
          sensorPositions.push({ pos: o.position.clone(), angle: sAngle });
        }
      });

      // Patient rotates continuously co-centric with component orbit
      var patient = null;
      scene.traverse(function (o) { if (o.name === 'patient') patient = o; });
      if (patient) {
        patient.rotation.y = t * 0.25;
      }

      // Update arrows: patient center → each sensor position (vertical orbit)
      var arrowHolder = null;
      scene.traverse(function (o) { if (o.name === 'arrowHolder') arrowHolder = o; });
      if (arrowHolder) {
        for (var ai = 0; ai < arrowHolder.children.length; ai++) {
          var ph = arrowHolder.children[ai];
          var idx = ph.userData.arrowIndex;
          if (idx < sensorPositions.length) {
            var sPos = sensorPositions[idx].pos;
            while (ph.children.length > 0) ph.remove(ph.children[0]);
            // Arrow: tail starts 1.5 units from patient center toward sensor
            var dx = sPos.x - (-2);
            var dy = sPos.y - 0;
            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
            var sx = -2 + (dx / dist) * 2;
            var sy = 0 + (dy / dist) * 2;
            var newArrow = makeArrowBetween(sx, sy, sPos.x, sPos.y, M.greenWire, 0.16);
            ph.add(newArrow);
          }
        }
      }
    }

    // ── Pulsing WiFi arcs (both views) ──────────────────────────────────────
    scene.traverse(function (o) {
      if (o.userData && o.userData.pulse) {
        var s = 0.85 + Math.sin(t * 3.5 + o.userData.idx * 1.2) * 0.18;
        o.scale.set(s, s, s);
      }
    });

    // ── Camera transition ────────────────────────────────────────────────────
    if (transition) {
      var elapsed = performance.now() - transition.startTime;
      var t01 = Math.min(elapsed / DURATION, 1);
      if (t01 >= 1) {
        camera.position.copy(transition.to.pos);
        camera.lookAt(transition.to.look);
        transitioning = false;
        transition = null;
        if (dragMode) {
          controls.target.set(0, 0, 0);
          controls.update();
          controls.enabled = true;
        }
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
    zoomTarget = null;

    var fromPos = new THREE.Vector3().copy(camera.position);
    var fromLook = new THREE.Vector3(0, 0, 0);

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
  //  DRAG MODE TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════

  function toggleDragMode() {
    if (dragMode) {
      exitDragMode();
    } else {
      enterDragMode();
    }
  }

  function enterDragMode() {
    dragMode = true;
    var container = document.getElementById('cviz-container');
    var dragBtn = document.getElementById('cviz-drag-btn');
    var fsBtn = document.getElementById('cviz-fullscreen-btn');

    if (container) container.classList.add('cviz-fullscreen');
    if (dragBtn) { dragBtn.classList.add('active'); dragBtn.style.display = 'none'; }
    if (fsBtn) fsBtn.classList.add('visible');

    controls.target.set(0, 0, 0);
    controls.enabled = true;
    onResize();
  }

  function exitDragMode() {
    dragMode = false;
    var container = document.getElementById('cviz-container');
    var dragBtn = document.getElementById('cviz-drag-btn');
    var fsBtn = document.getElementById('cviz-fullscreen-btn');

    if (container) container.classList.remove('cviz-fullscreen');
    if (dragBtn) { dragBtn.classList.remove('active'); dragBtn.style.display = ''; }
    if (fsBtn) fsBtn.classList.remove('visible');

    controls.enabled = false;
    autoRotateAngle = Math.atan2(camera.position.x, camera.position.z);
    zoomTarget = null;
    onResize();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FOCAL-POINT ZOOM (scroll wheel)
  // ═══════════════════════════════════════════════════════════════════════════

  function onWheel(e) {
    if (!dragMode || transitioning) return;
    e.preventDefault();
    e.stopPropagation();

    var canvas = renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    var mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast to find focal point
    var focalMouse = new THREE.Vector2(mouseX, mouseY);
    raycaster.setFromCamera(focalMouse, camera);
    var hits = raycaster.intersectObjects(scene.children, true);
    var focalPoint = hits.length > 0 ? hits[0].point.clone() : new THREE.Vector3(0, 0, 0);

    // Zoom factor
    var zoomFactor = e.deltaY > 0 ? 1.06 : 1 / 1.06;
    var currentDist = camera.position.distanceTo(focalPoint);
    var newDist = currentDist * zoomFactor;
    newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));

    // Compute target camera position along the line focalPoint→camera
    var dir = new THREE.Vector3().subVectors(camera.position, focalPoint).normalize();
    var targetPos = focalPoint.clone().add(dir.multiplyScalar(newDist));

    // Set target for smooth interpolation
    zoomTarget = targetPos;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PINCH-TO-ZOOM (mobile)
  // ═══════════════════════════════════════════════════════════════════════════

  var pinchStartDist = 0;

  function onTouchStart(e) {
    if (!dragMode || transitioning) return;
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    if (!dragMode || transitioning) return;
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
        var touchMouse = new THREE.Vector2(
          ((midX - rect.left) / rect.width) * 2 - 1,
          -((midY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(touchMouse, camera);
        var hits = raycaster.intersectObjects(scene.children, true);
        var focalPoint = hits.length > 0 ? hits[0].point.clone() : new THREE.Vector3(0, 0, 0);

        var currentDist = camera.position.distanceTo(focalPoint);
        var newDist = currentDist * scaleFactor;
        newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));

        var dir = new THREE.Vector3().subVectors(camera.position, focalPoint).normalize();
        zoomTarget = focalPoint.clone().add(dir.multiplyScalar(newDist));
        pinchStartDist = dist;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  POINTER / HOVER / CLICK
  // ═══════════════════════════════════════════════════════════════════════════

  var infoData = {
    wifi:      { title: 'WiFi Link',              desc: 'The ESP32 streams captured vital signs over the hospital LAN to the Patient Management System in real time.' },
    'wifi-sw': { title: 'WiFi Link',              desc: 'Receiving vital signs from the ESP32 on the hardware side. Click to return to hardware view.' },
    database:  { title: 'Database',               desc: 'All incoming ECG, SpO\u2082, and NIBP readings are stored for historical analysis and model training.' },
    esp32:     { title: 'ESP32 Microcontroller',  desc: 'The ESP32 captures sensor data, processes it locally, and transmits it over WiFi to the hospital network.' },
  };

  function onPointerDown(e) {
    clickStart.x = e.clientX;
    clickStart.y = e.clientY;
  }

  function onPointerUp(e) {
    if (transitioning) return;
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
      var name = hits[i].object.name;
      // WiFi clicks work in BOTH modes and preserve drag mode
      if (name === 'wifi' && view === 'hardware') {
        goTo('software');
        return;
      }
      if (name === 'wifi-sw' && view === 'software') {
        goTo('hardware');
        return;
      }
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
      var n = hits[i].object.name;
      if (n === 'wifi' || n === 'wifi-sw') { hoveringWifi = true; break; }
    }
    canvas.style.cursor = hoveringWifi ? 'pointer' : (dragMode ? 'grab' : 'default');

    scene.traverse(function (o) {
      if (o.name === 'wifi' || o.name === 'wifi-sw') {
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
