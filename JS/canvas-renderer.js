// ========================================
// CanvasRenderer - Minimal (Senior Friendly)
// รองรับ: arm-raise-forward, leg-extension, trunk-sway
// เป้าหมาย: เส้นน้อย / หนา / ชัด / ไม่รก
// เพิ่ม: "หลอด" แสดงว่าต้องทำถึงไหน + แถบ hold
// ========================================

class CanvasRenderer {
  constructor(canvasElement, videoElement) {
    this.canvas = canvasElement;
    this.video = videoElement;
    this.ctx = canvasElement.getContext("2d");
    this.isInitialized = false;

    // UI สำหรับผู้สูงอายุ: ตัวใหญ่ เส้นหนา สีสื่อความหมาย
    this.UI = {
      // เส้นส่วนร่างกาย
      lineWidth: 7,
      lineColor: "rgba(0, 229, 255, 0.95)",

      // จุด focus (จุดที่ต้องดู)
      focusRadius: 11,
      focusColor: "rgba(0, 255, 106, 0.98)",

      // จุดทั่วไป (ถ้าต้องการให้เห็นนิดหน่อย)
      jointRadius: 7,
      jointColor: "rgba(255,255,255,0.92)",

      // หลอดความคืบหน้า
      tubeW: 22,
      tubeH: 240,
      tubeTop: 120,
      tubePad: 14,
      tubeRight: 26,
      tubeBg: "rgba(0,0,0,0.45)",
      tubeBorder: "rgba(255,255,255,0.9)",
      tubeWarn: "rgba(255, 214, 0, 0.95)", // เหลือง
      tubeOk: "rgba(0, 255, 106, 0.98)",   // เขียว

      // HUD กล่องข้อความ
      hudW: 360,
      hudH: 96,
      hudX: 16,
      hudY: 16,
      hudBg: "rgba(0,0,0,0.45)",
      font: "bold 22px Kanit, Arial, sans-serif",
      textFill: "rgba(255,255,255,0.96)",
      textStroke: "rgba(0,0,0,0.86)",
      textStrokeW: 6,

      // trunk-sway: โซนซ้าย/ขวา (ดูง่าย)
      swayZoneW: 90,
      swayZoneH: 240,
      swayZoneTopOffset: 40,
      swayZoneGap: 18,
      swayZoneBorder: "rgba(255,255,255,0.85)",
      swayZoneFill: "rgba(255,255,255,0.10)",
    };

    this.setupCanvas();
  }

  setupCanvas() {
    if (!this.canvas || !this.video) return;

    const updateCanvasSize = () => {
      if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.isInitialized = true;
      } else {
        setTimeout(updateCanvasSize, 100);
      }
    };

    updateCanvasSize();
  }

  // ---------- Main draw ----------
  drawPoseResults(poseResults, analysis = null) {
    if (!this.isInitialized || !poseResults) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // วาดวิดีโอพื้นหลัง
    ctx.clearRect(0, 0, w, h);
    if (this.video && this.video.videoWidth > 0) {
      ctx.drawImage(this.video, 0, 0, w, h);
    }

    const lm = poseResults.poseLandmarks;
    if (!lm || lm.length === 0) return;

    const exercise = analysis?.exercise || null;
    const side = analysis?.currentSide || "left";

    // 1) วาดโซน trunk-sway (ถ้าเป็นท่าโยกตัว) ก่อน เพื่อเป็นฉากหลังนำทาง
    if (exercise === "trunk-sway") {
      this.drawTrunkSwayZones(lm, analysis);
    }

    // 2) วาดเส้น “เฉพาะส่วนที่เกี่ยวข้อง” (ลดความรก)
    this.drawMinimalLines(lm, exercise, side);

    // 3) วาดจุด focus (ใหญ่/เขียว) + จุดจำเป็น (ขาว)
    const focus = this.getFocusIndices(exercise, side);
    this.drawFocusJoints(lm, focus);

    // 4) วาดหลอดความคืบหน้า (Angle/Distance Tube)
    if (analysis?.targetAngle) {
      this.drawProgressTube(
        analysis.currentAngle || 0,
        analysis.targetAngle,
        !!analysis.isHolding,
        analysis.holdProgress || 0
      );
    }

    // 5) HUD ข้อความสั้น/ใหญ่
    this.drawHUD(analysis);
  }

  // ---------- Utilities ----------
  isVisible(p) {
    return !!p && (p.visibility ?? 1) > 0.5;
  }
  px(p) {
    return { x: p.x * this.canvas.width, y: p.y * this.canvas.height };
  }
  outlineText(text, x, y) {
    const ctx = this.ctx;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  // ---------- Focus indices per exercise ----------
  getFocusIndices(exercise, side = "left") {
    // MediaPipe Pose indices
    const L = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, nose: 0 };
    const R = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, nose: 0 };

    if (exercise === "arm-raise-forward") {
      return side === "right"
        ? [R.shoulder, R.elbow, R.wrist]
        : [L.shoulder, L.elbow, L.wrist];
    }

    if (exercise === "leg-extension") {
      return side === "right"
        ? [R.hip, R.knee, R.ankle]
        : [L.hip, L.knee, L.ankle];
    }

    if (exercise === "trunk-sway") {
      // ใช้ “จมูก + ไหล่สองข้าง” เพื่อให้เห็นการเอียงง่าย
      return [0, 11, 12];
    }

    // fallback
    return [11, 13, 15];
  }

  // ---------- Minimal lines ----------
  drawMinimalLines(lm, exercise, side = "left") {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.UI.lineColor;
    ctx.lineWidth = this.UI.lineWidth;

    const L = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 };
    const R = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };

    let lines = [];

    if (exercise === "arm-raise-forward") {
      lines = side === "right"
        ? [[R.shoulder, R.elbow], [R.elbow, R.wrist]]
        : [[L.shoulder, L.elbow], [L.elbow, L.wrist]];
    } else if (exercise === "leg-extension") {
      lines = side === "right"
        ? [[R.hip, R.knee], [R.knee, R.ankle]]
        : [[L.hip, L.knee], [L.knee, L.ankle]];
    } else if (exercise === "trunk-sway") {
      // ให้เห็น “แกนลำตัว” แบบง่าย: เส้นไหล่ + เส้นลงสะโพก
      lines = [
        [11, 12],
        [11, 23],
        [12, 24],
        [23, 24],
      ];
    } else {
      lines = [[11, 13], [13, 15]];
    }

    for (const [a, b] of lines) {
      const pa = lm[a], pb = lm[b];
      if (!this.isVisible(pa) || !this.isVisible(pb)) continue;
      const A = this.px(pa), B = this.px(pb);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------- Joints ----------
  drawFocusJoints(lm, focusIndices) {
    const ctx = this.ctx;

    // จุด focus (เขียว ใหญ่)
    ctx.save();
    for (const idx of focusIndices) {
      const p = lm[idx];
      if (!this.isVisible(p)) continue;
      const { x, y } = this.px(p);
      ctx.beginPath();
      ctx.fillStyle = this.UI.focusColor;
      ctx.arc(x, y, this.UI.focusRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // จุดจำเป็น (ขาว) — เพื่อให้ผู้สูงอายุมองตามได้ แต่ไม่รก
    // ถ้าอยาก “โล่งสุด” ให้ลบ/คอมเมนต์บล็อกนี้ได้
    ctx.save();
    for (const idx of focusIndices) {
      const p = lm[idx];
      if (!this.isVisible(p)) continue;
      const { x, y } = this.px(p);
      ctx.beginPath();
      ctx.fillStyle = this.UI.jointColor;
      ctx.arc(x, y, this.UI.jointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Progress Tube (Angle/Distance) ----------
  drawProgressTube(currentValue, targetAngle, isHolding, holdProgress) {
    const ctx = this.ctx;
    const w = this.canvas.width;

    const x = w - this.UI.tubeRight - this.UI.tubeW;
    const y = this.UI.tubeTop;
    const H = this.UI.tubeH;
    const W = this.UI.tubeW;

    const min = targetAngle.min ?? 0;
    const max = targetAngle.max ?? (min + 1);
    const denom = Math.max(1, max - min);

    // ค่าคืบหน้า: จาก min -> max
    let p = (currentValue - min) / denom;
    p = Math.max(0, Math.min(1, p));

    const inTarget = currentValue >= min && currentValue <= max;
    const fillColor = inTarget ? this.UI.tubeOk : this.UI.tubeWarn;

    ctx.save();

    // กล่องพื้นหลังหลอด (ช่วยให้เห็นชัดในวิดีโอ)
    ctx.fillStyle = this.UI.tubeBg;
    ctx.fillRect(x - this.UI.tubePad, y - this.UI.tubePad, W + this.UI.tubePad * 2, H + this.UI.tubePad * 2);

    // พื้นหลอด
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x, y, W, H);

    // เติมหลอด
    const fillH = H * p;
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y + (H - fillH), W, fillH);

    // ขอบหลอด
    ctx.strokeStyle = this.UI.tubeBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, W, H);

    // แถบ hold ด้านข้าง (ไม่ต้องโชว์เปอร์เซ็นต์เยอะ)
    if (isHolding) {
      const hp = Math.max(0, Math.min(1, holdProgress / 100));
      const hh = H * hp;
      ctx.fillStyle = this.UI.tubeOk;
      ctx.fillRect(x + W + 8, y + (H - hh), 6, hh);
      ctx.strokeStyle = this.UI.tubeBorder;
      ctx.strokeRect(x + W + 8, y, 6, H);
    }

    ctx.restore();
  }

  // ---------- trunk-sway zones (simple left/right boxes) ----------
  drawTrunkSwayZones(lm, analysis) {
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];

    if (!this.isVisible(leftShoulder) || !this.isVisible(rightShoulder)) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const centerX = ((leftShoulder.x + rightShoulder.x) / 2) * w;
    const topY = ((leftShoulder.y + rightShoulder.y) / 2) * h - this.UI.swayZoneTopOffset;

    const zoneW = this.UI.swayZoneW;
    const zoneH = this.UI.swayZoneH;
    const gap = this.UI.swayZoneGap;

    const leftX = centerX - gap - zoneW;
    const rightX = centerX + gap;

    ctx.save();

    // เติมพื้นจาง ๆ
    ctx.fillStyle = this.UI.swayZoneFill;
    ctx.fillRect(leftX, topY, zoneW, zoneH);
    ctx.fillRect(rightX, topY, zoneW, zoneH);

    // ขอบ
    ctx.strokeStyle = this.UI.swayZoneBorder;
    ctx.lineWidth = 3;
    ctx.strokeRect(leftX, topY, zoneW, zoneH);
    ctx.strokeRect(rightX, topY, zoneW, zoneH);

    // ไฮไลต์โซนที่ควรไป (ตาม currentSide ใน analysis)
    const side = analysis?.currentSide || "left";
    ctx.fillStyle = "rgba(255, 214, 0, 0.14)";
    if (side === "left") ctx.fillRect(leftX, topY, zoneW, zoneH);
    else ctx.fillRect(rightX, topY, zoneW, zoneH);

    ctx.restore();
  }

  // ---------- HUD ----------
  drawHUD(analysis) {
    if (!analysis) return;

    const ctx = this.ctx;
    const ex = analysis.exercise;
    const side = analysis.currentSide || "left";
    const target = analysis.targetAngle;
    const val = Math.round(analysis.currentAngle || 0);

    // ข้อความสั้น ๆ สำหรับผู้สูงอายุ
    let msg = "ทำตามกรอบ";
    if (ex === "arm-raise-forward") msg = side === "left" ? "ยกแขนซ้ายไปข้างหน้า" : "ยกแขนขวาไปข้างหน้า";
    if (ex === "leg-extension") msg = side === "left" ? "ยก/เหยียดขาซ้ายไปข้างหน้า" : "ยก/เหยียดขาขวาไปข้างหน้า";
    if (ex === "trunk-sway") msg = side === "left" ? "เอียงตัวไปทางซ้าย" : "เอียงตัวไปทางขวา";

    // สถานะสี: ในเป้า = เขียว / ยังไม่ถึง = เหลือง
    let inTarget = false;
    if (target) {
      inTarget = val >= (target.min ?? -999) && val <= (target.max ?? 999);
    }

    const status = analysis.isHolding ? "✅ คงท่าไว้" : (inTarget ? "✅ ถูกต้อง" : "⬆️ ไปให้ถึงเส้น");

    ctx.save();
    ctx.font = this.UI.font;

    // กล่องพื้น
    ctx.fillStyle = this.UI.hudBg;
    ctx.fillRect(this.UI.hudX, this.UI.hudY, this.UI.hudW, this.UI.hudH);

    // ข้อความ
    ctx.fillStyle = this.UI.textFill;
    ctx.strokeStyle = this.UI.textStroke;
    ctx.lineWidth = this.UI.textStrokeW;

    this.outlineText(msg, this.UI.hudX + 12, this.UI.hudY + 36);

    // บรรทัดสอง: สถานะ + ค่า/เป้า (ยังคงอ่านง่าย)
    const range = target ? `${target.min ?? 0}-${target.max ?? 0}` : "-";
    const line2 = `${status}  |  ค่าปัจจุบัน: ${val}  (เป้า ${range})`;
    this.outlineText(line2, this.UI.hudX + 12, this.UI.hudY + 76);

    ctx.restore();
  }

  // ---------- other ----------
  captureScreenshot() {
    if (!this.isInitialized) return null;
    try {
      return this.canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  clear() {
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resize() {
    this.setupCanvas();
  }

  destroy() {
    this.clear();
    this.canvas = null;
    this.video = null;
    this.ctx = null;
    this.isInitialized = false;
  }
}

window.CanvasRenderer = CanvasRenderer;
console.log("✅ CanvasRenderer Minimal (Senior Friendly) loaded");
