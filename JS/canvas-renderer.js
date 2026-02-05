// ========================================
// ระบบแสดงผล Canvas พร้อมเส้นไกด์วงกลม
// canvas-renderer-fixed.js
// ========================================

class CanvasRenderer {
    constructor(canvasElement, videoElement) {
        this.canvas = canvasElement;
        this.video = videoElement;
        this.ctx = canvasElement.getContext('2d');
        this.isInitialized = false;
        
        this.setupCanvas();
    }

    setupCanvas() {
        if (!this.canvas || !this.video) {
            console.error('❌ ไม่พบ canvas หรือ video element');
            return;
        }

        const updateCanvasSize = () => {
            if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.isInitialized = true;
                console.log(`✅ Canvas ขนาด: ${this.canvas.width}x${this.canvas.height}`);
            } else {
                setTimeout(updateCanvasSize, 100);
            }
        };
        
        updateCanvasSize();
    }

    // วาดผลการตรวจจับท่าทาง
    drawPoseResults(poseResults, exerciseAnalysis = null) {
        if (!this.isInitialized || !this.ctx || !poseResults) return;
        
        try {
            // เคลียร์ canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // วาดภาพจากวิดีโอ
            if (this.video && this.video.videoWidth > 0) {
                this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            }
            
            if (poseResults.poseLandmarks) {
                // ⭐ วาดเส้นไกด์วงกลมก่อน (ก่อนวาดโครงกระดูก)
                if (exerciseAnalysis?.exercise) {
                    this.drawTargetGuides(poseResults.poseLandmarks, exerciseAnalysis);
                }

                // วาดเส้นเชื่อมโครงกระดูก
                this.drawPoseConnections(poseResults.poseLandmarks);
                
                // วาดจุด landmarks
                this.drawLandmarks(poseResults.poseLandmarks);
                
                // ไฮไลท์จุดสำคัญ
                if (exerciseAnalysis?.exercise) {
                    this.highlightExercisePoints(poseResults.poseLandmarks, exerciseAnalysis.exercise);
                }
                
                // วาดข้อมูลการออกกำลังกาย
                if (exerciseAnalysis) {
                    this.drawExerciseInfo(exerciseAnalysis);
                }
            }
        } catch (error) {
            console.warn('⚠️ Error in drawPoseResults:', error);
        }
    }

    // ⭐ วาดเส้นไกด์วงกลมเป้าหมาย
    drawTargetGuides(landmarks, analysis) {
        const exercise = analysis.exercise;
        const currentAngle = analysis.currentAngle || 0;
        const targetAngle = analysis.targetAngle;
        const currentSide = analysis.currentSide || 'left'; // รับข้อมูลข้างที่กำลังทำ
        
        if (!targetAngle) return;

        const ctx = this.ctx;
        const inTarget = currentAngle >= targetAngle.min && currentAngle <= targetAngle.max;

        // กำหนดสีตามสถานะ
        const guideColor = inTarget ? 'rgba(0, 255, 0, 0.4)' : 'rgba(255, 255, 0, 0.3)';
        const borderColor = inTarget ? '#00ff00' : '#ffff00';

        switch (exercise) {
            case 'arm-raise-forward':
                this.drawArmRaiseGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle, currentSide);
                break;
            case 'leg-extension':
                this.drawLegExtensionGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle);
                break;
            case 'trunk-sway':
                this.drawTrunkSwayGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle);
                break;
            case 'neck-tilt':
                this.drawNeckTiltGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle);
                break;
        }
    }

    // ⭐ ไกด์สำหรับยกแขน - รองรับทั้งสองแขน
    drawArmRaiseGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle, currentSide = 'left') {
        // ⭐ วาดทั้งแขนซ้ายและแขนขวา
        this.drawSingleArmGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle, 'left', currentSide);
        this.drawSingleArmGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle, 'right', currentSide);
    }

    // ฟังก์ชันช่วยวาดไกด์สำหรับแขนข้างเดียว
    drawSingleArmGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle, side, activeSide) {
        const shoulderIndex = side === 'left' ? 11 : 12;
        const elbowIndex = side === 'left' ? 13 : 14;
        const wristIndex = side === 'left' ? 15 : 16;

        const shoulder = landmarks[shoulderIndex];
        const elbow = landmarks[elbowIndex];
        const wrist = landmarks[wristIndex];

        if (!this.isLandmarkVisible(shoulder) || !this.isLandmarkVisible(elbow)) {
            return;
        }

        const shoulderX = shoulder.x * this.canvas.width;
        const shoulderY = shoulder.y * this.canvas.height;
        const elbowX = elbow.x * this.canvas.width;
        const elbowY = elbow.y * this.canvas.height;

        // คำนวณระยะห่างจากไหล่ไปข้อศอก
        const distance = Math.sqrt(
            Math.pow(elbowX - shoulderX, 2) + 
            Math.pow(elbowY - shoulderY, 2)
        );

        // วาดวงกลมเป้าหมาย (สีเขียว/เหลือง)
        const targetRadius = distance * 1.5; // ขยายออกไปอีก 50%
        
        // วาดส่วนโค้งของเป้าหมาย
        const minAngleRad = (180 - targetAngle.max) * Math.PI / 180;
        const maxAngleRad = (180 - targetAngle.min) * Math.PI / 180;

        // ⭐ ปรับความเข้มของสีตามว่าเป็นแขนที่กำลังทำหรือไม่
        const isActiveSide = side === activeSide;
        const opacity = isActiveSide ? 1.0 : 0.3; // แขนที่ไม่ใช่ active จะจางลง
        
        // ปรับสี
        const adjustedBorderColor = isActiveSide ? borderColor : 'rgba(150, 150, 150, 0.5)';
        const adjustedGuideColor = isActiveSide ? guideColor : 'rgba(200, 200, 200, 0.2)';

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(shoulderX, shoulderY, targetRadius, minAngleRad, maxAngleRad);
        this.ctx.strokeStyle = adjustedBorderColor;
        this.ctx.lineWidth = isActiveSide ? 6 : 3; // แขน active เส้นหนาขึ้น
        this.ctx.stroke();

        // วาดพื้นที่เป้าหมาย
        this.ctx.beginPath();
        this.ctx.moveTo(shoulderX, shoulderY);
        this.ctx.arc(shoulderX, shoulderY, targetRadius, minAngleRad, maxAngleRad);
        this.ctx.closePath();
        this.ctx.fillStyle = adjustedGuideColor;
        this.ctx.fill();

        // วาดข้อความบอกมุม (เฉพาะแขนที่กำลัง active)
        if (isActiveSide) {
            const midAngle = (minAngleRad + maxAngleRad) / 2;
            const textX = shoulderX + Math.cos(midAngle) * (targetRadius + 40);
            const textY = shoulderY + Math.sin(midAngle) * (targetRadius + 40);
            
            const sideLabel = side === 'left' ? 'ซ้าย' : 'ขวา';
            this.drawGuideText(`${sideLabel} ${targetAngle.min}°-${targetAngle.max}°`, textX, textY, borderColor);
        }
        
        this.ctx.restore();
    }

    // ⭐ ไกด์สำหรับเหยียดเข่า
    drawLegExtensionGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle) {
        const leftHip = landmarks[23];
        const leftKnee = landmarks[25];
        const leftAnkle = landmarks[27];

        if (!this.isLandmarkVisible(leftKnee) || !this.isLandmarkVisible(leftAnkle)) {
            return;
        }

        const kneeX = leftKnee.x * this.canvas.width;
        const kneeY = leftKnee.y * this.canvas.height;
        const ankleX = leftAnkle.x * this.canvas.width;
        const ankleY = leftAnkle.y * this.canvas.height;

        // คำนวณระยะห่าง
        const distance = Math.sqrt(
            Math.pow(ankleX - kneeX, 2) + 
            Math.pow(ankleY - kneeY, 2)
        );

        const targetRadius = distance * 1.2;

        // วาดส่วนโค้งเป้าหมาย (160-180 องศา = เกือบตรง)
        const minAngleRad = (180 - targetAngle.max) * Math.PI / 180;
        const maxAngleRad = (180 - targetAngle.min) * Math.PI / 180;

        this.ctx.save();
        
        // วาดเส้นโค้ง
        this.ctx.beginPath();
        this.ctx.arc(kneeX, kneeY, targetRadius, minAngleRad, maxAngleRad);
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 6;
        this.ctx.stroke();

        // วาดพื้นที่
        this.ctx.beginPath();
        this.ctx.moveTo(kneeX, kneeY);
        this.ctx.arc(kneeX, kneeY, targetRadius, minAngleRad, maxAngleRad);
        this.ctx.closePath();
        this.ctx.fillStyle = guideColor;
        this.ctx.fill();

        // ข้อความ
        const midAngle = (minAngleRad + maxAngleRad) / 2;
        const textX = kneeX + Math.cos(midAngle) * (targetRadius + 40);
        const textY = kneeY + Math.sin(midAngle) * (targetRadius + 40);
        
        this.drawGuideText(`เหยียดตรง ${targetAngle.min}°-${targetAngle.max}°`, textX, textY, borderColor);
        
        this.ctx.restore();
    }

    // ⭐ ไกด์สำหรับโยกลำตัว
    drawTrunkSwayGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle) {
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        if (!this.isLandmarkVisible(leftShoulder) || !this.isLandmarkVisible(rightShoulder) ||
            !this.isLandmarkVisible(leftHip) || !this.isLandmarkVisible(rightHip)) {
            return;
        }

        // คำนวณจุดกลางไหล่และสะโพก
        const shoulderCenterX = ((leftShoulder.x + rightShoulder.x) / 2) * this.canvas.width;
        const shoulderCenterY = ((leftShoulder.y + rightShoulder.y) / 2) * this.canvas.height;
        const hipCenterX = ((leftHip.x + rightHip.x) / 2) * this.canvas.width;
        const hipCenterY = ((leftHip.y + rightHip.y) / 2) * this.canvas.height;

        // วาดเส้นตรงกลาง (แนวตั้ง)
        this.ctx.save();
        this.ctx.setLineDash([10, 10]);
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(shoulderCenterX, shoulderCenterY - 100);
        this.ctx.lineTo(shoulderCenterX, hipCenterY + 50);
        this.ctx.stroke();

        // วาดโซนเป้าหมายซ้าย-ขวา
        const zoneWidth = 100;
        const zoneHeight = Math.abs(hipCenterY - shoulderCenterY) + 50;

        // โซนซ้าย
        this.ctx.fillStyle = guideColor;
        this.ctx.fillRect(
            shoulderCenterX - zoneWidth - 50,
            shoulderCenterY - 50,
            zoneWidth,
            zoneHeight
        );
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(
            shoulderCenterX - zoneWidth - 50,
            shoulderCenterY - 50,
            zoneWidth,
            zoneHeight
        );

        // โซนขวา
        this.ctx.fillStyle = guideColor;
        this.ctx.fillRect(
            shoulderCenterX + 50,
            shoulderCenterY - 50,
            zoneWidth,
            zoneHeight
        );
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(
            shoulderCenterX + 50,
            shoulderCenterY - 50,
            zoneWidth,
            zoneHeight
        );

        // ข้อความ
        this.drawGuideText('← โยกซ้าย', shoulderCenterX - zoneWidth - 25, shoulderCenterY - 70, borderColor);
        this.drawGuideText('โยกขวา →', shoulderCenterX + 75, shoulderCenterY - 70, borderColor);

        this.ctx.restore();
    }

    // ⭐ ไกด์สำหรับเอียงศีรษะ
    drawNeckTiltGuide(landmarks, guideColor, borderColor, currentAngle, targetAngle) {
        const nose = landmarks[0];
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];

        if (!this.isLandmarkVisible(nose)) {
            return;
        }

        const noseX = nose.x * this.canvas.width;
        const noseY = nose.y * this.canvas.height;

        // วาดเส้นตรงกลาง
        this.ctx.save();
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(noseX, noseY - 80);
        this.ctx.lineTo(noseX, noseY + 80);
        this.ctx.stroke();

        // วาดส่วนโค้งซ้าย-ขวา
        const arcRadius = 80;
        const leftAngle = (90 + targetAngle.max) * Math.PI / 180;
        const rightAngle = (90 - targetAngle.max) * Math.PI / 180;

        // โค้งซ้าย
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(noseX, noseY, arcRadius, Math.PI / 2, leftAngle);
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 5;
        this.ctx.stroke();

        // โค้งขวา
        this.ctx.beginPath();
        this.ctx.arc(noseX, noseY, arcRadius, rightAngle, Math.PI / 2);
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 5;
        this.ctx.stroke();

        // ข้อความ
        this.drawGuideText(`← เอียง ${targetAngle.min}°-${targetAngle.max}° →`, 
            noseX - 80, noseY - 100, borderColor);

        this.ctx.restore();
    }

    // วาดข้อความสำหรับไกด์
    drawGuideText(text, x, y, color) {
        this.ctx.save();
        this.ctx.font = 'bold 16px Kanit, Arial, sans-serif';
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 4;
        
        // วาดเงา
        this.ctx.strokeText(text, x, y);
        this.ctx.fillText(text, x, y);
        
        this.ctx.restore();
    }

    // วาดเส้นเชื่อมโครงกระดูก
    drawPoseConnections(landmarks) {
        if (!window.drawConnectors || !window.POSE_CONNECTIONS) return;
        
        try {
            const config = StrokeConfig.CONFIG.CANVAS;
            window.drawConnectors(this.ctx, landmarks, window.POSE_CONNECTIONS, {
                color: config.CONNECTION_COLOR,
                lineWidth: config.LINE_WIDTH
            });
        } catch (error) {
            console.warn('⚠️ Error drawing pose connections:', error);
        }
    }

    // วาดจุด landmarks
    drawLandmarks(landmarks) {
        if (!window.drawLandmarks) return;
        
        try {
            const config = StrokeConfig.CONFIG.CANVAS;
            window.drawLandmarks(this.ctx, landmarks, {
                color: config.LANDMARK_COLOR,
                lineWidth: config.LINE_WIDTH,
                radius: config.LANDMARK_RADIUS
            });
        } catch (error) {
            console.warn('⚠️ Error drawing landmarks:', error);
        }
    }

    // ไฮไลท์จุดสำคัญตามท่าออกกำลังกาย
    highlightExercisePoints(landmarks, exerciseId) {
        if (!window.drawLandmarks || !exerciseId) return;

        const exerciseData = StrokeConfig.EXERCISE_DATA[exerciseId];
        if (!exerciseData) return;

        const highlightIndices = exerciseData.landmarks;
        const highlightLandmarks = highlightIndices
            .map(index => landmarks[index])
            .filter(landmark => landmark && landmark.visibility > 0.5);

        if (highlightLandmarks.length > 0) {
            try {
                const config = StrokeConfig.CONFIG.CANVAS;
                window.drawLandmarks(this.ctx, highlightLandmarks, {
                    color: config.HIGHLIGHT_COLOR,
                    lineWidth: config.LINE_WIDTH + 1,
                    radius: config.LANDMARK_RADIUS + 3
                });
            } catch (error) {
                console.warn('⚠️ Error highlighting exercise points:', error);
            }
        }
    }

    // วาดข้อมูลการออกกำลังกาย
    drawExerciseInfo(analysis) {
        if (!analysis) return;

        try {
            this.ctx.font = 'bold 20px Kanit, Arial, sans-serif';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 4;

            let yPosition = 40;
            const lineHeight = 35;

            // แสดงมุมปัจจุบัน (ใหญ่และชัดเจน)
            if (analysis.currentAngle > 0) {
                const targetAngle = analysis.targetAngle;
                const inTarget = targetAngle && 
                    analysis.currentAngle >= targetAngle.min && 
                    analysis.currentAngle <= targetAngle.max;
                
                this.ctx.fillStyle = inTarget ? '#00ff00' : '#ffff00';
                const angleText = `มุม: ${analysis.currentAngle}°`;
                this.drawTextWithOutline(angleText, 20, yPosition);
                yPosition += lineHeight;
            }

            // แสดงสถานะ
            if (analysis.isHolding) {
                this.ctx.fillStyle = '#00ff00';
                const holdText = `⏱ คงท่า ${Math.round(analysis.holdProgress)}%`;
                this.drawTextWithOutline(holdText, 20, yPosition);
                yPosition += lineHeight;
            }

            // แสดงความแม่นยำ
            if (analysis.accuracy !== undefined && analysis.accuracy > 0) {
                this.ctx.fillStyle = this.getAccuracyColor(analysis.accuracy);
                const accuracyText = `✓ ความแม่นยำ: ${Math.round(analysis.accuracy)}%`;
                this.drawTextWithOutline(accuracyText, 20, yPosition);
            }

            // วาดแถบความคืบหน้า
            if (analysis.reps !== undefined && analysis.targetReps) {
                this.drawProgressBar(analysis.reps, analysis.targetReps);
            }

        } catch (error) {
            console.warn('⚠️ Error drawing exercise info:', error);
        }
    }

    // วาดข้อความพร้อมขอบ
    drawTextWithOutline(text, x, y) {
        this.ctx.strokeText(text, x, y);
        this.ctx.fillText(text, x, y);
    }

    // วาดแถบความคืบหน้า
    drawProgressBar(current, total) {
        const barWidth = 250;
        const barHeight = 15;
        const barX = 20;
        const barY = this.canvas.height - 50;

        // วาดพื้นหลังแถบ
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        // คำนวณความคืบหน้า
        const progress = Math.min(1, current / total);
        const progressWidth = barWidth * progress;

        // วาดแถบความคืบหน้า
        this.ctx.fillStyle = this.getProgressColor(progress);
        this.ctx.fillRect(barX, barY, progressWidth, barHeight);

        // วาดขอบ
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);

        // วาดข้อความความคืบหน้า
        this.ctx.font = 'bold 14px Kanit, Arial, sans-serif';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        const progressText = `${current}/${total} ครั้ง`;
        this.drawTextWithOutline(progressText, barX + barWidth + 15, barY + 12);
    }

    // ตรวจสอบว่า landmark มองเห็นได้
    isLandmarkVisible(landmark) {
        return landmark && landmark.visibility > 0.5;
    }

    // ได้สีตามความแม่นยำ
    getAccuracyColor(accuracy) {
        if (accuracy >= 90) return '#4CAF50'; // เขียว
        if (accuracy >= 70) return '#FFC107'; // เหลือง
        if (accuracy >= 50) return '#FF9800'; // ส้ม
        return '#F44336'; // แดง
    }

    // ได้สีแถบความคืบหน้า
    getProgressColor(progress) {
        if (progress >= 1.0) return '#4CAF50'; // เขียว - เสร็จ
        if (progress >= 0.7) return '#2196F3'; // น้ำเงิน - ใกล้เสร็จ
        if (progress >= 0.3) return '#FF9800'; // ส้ม - ครึ่งทาง
        return '#9E9E9E'; // เทา - เริ่มต้น
    }

    // จับภาพหน้าจอ
    captureScreenshot() {
        if (!this.isInitialized) return null;

        try {
            return this.canvas.toDataURL('image/png');
        } catch (error) {
            console.warn('⚠️ Error capturing screenshot:', error);
            return null;
        }
    }

    // รีเซ็ต canvas
    clear() {
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // ปรับขนาด canvas
    resize() {
        this.setupCanvas();
    }

    // ทำลายระบบแสดงผล
    destroy() {
        this.clear();
        this.canvas = null;
        this.video = null;
        this.ctx = null;
        this.isInitialized = false;
    }
}

// ส่งออกคลาส
window.CanvasRenderer = CanvasRenderer;

console.log('✅ canvas-renderer-fixed.js โหลดเสร็จแล้ว');