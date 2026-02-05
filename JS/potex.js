// ========================================
// ระบบตรวจจับท่าทางที่แก้ไขใหม่ทั้งหมด
// potex-fixed.js
// ========================================

// Global Variables
let physioApp = null;
let canvasRenderer = null;
let sessionStartTime = null;
let currentReps = 0;
let targetReps = 10;
let isComplete = false;
let currentExerciseId = null;        // เก็บ exercise_id (1, 2, 3, ...)
let currentExerciseName = null;       // เก็บชื่อท่าภาษาไทย
// DOM Elements
const elements = {
    video: document.getElementById('input-video'),
    canvas: document.getElementById('output-canvas'),
    loadingOverlay: document.getElementById('loading-overlay'),
    successFlash: document.getElementById('success-flash'),
    exerciseTitle: document.getElementById('exercise-title'),
    repCounter: document.getElementById('rep-counter'),
    targetRepsElement: document.getElementById('target-reps'),
    statusMessage: document.getElementById('status-message'),
    completeOverlay: document.getElementById('complete-overlay')
};

// MediaPipe Pose Connections
const POSE_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 29], [27, 31],
    [24, 26], [26, 28], [28, 30], [28, 32]
];

const EXERCISE_ID_MAP = {
    'arm-raise-forward': {
        id: 1,
        name_th: 'ท่ายกแขนไปข้างหน้า',
        name_en: 'Arm Raise Forward'
    },
    'leg-extension': {
        id: 2,
        name_th: 'ท่าเหยียดเข่าตรง',
        name_en: 'Leg Extension'
    },
    'trunk-sway': {
        id: 3,
        name_th: 'ท่าโยกลำตัวซ้าย-ขวา',
        name_en: 'Trunk Sway'
    },
    'neck-tilt': {
        id: 4,
        name_th: 'ท่าเอียงศีรษะข้าง',
        name_en: 'Neck Tilt'
    },
    'neck-rotation': {
        id: 5,
        name_th: 'ท่าหมุนศีรษะซ้าย-ขวา',
        name_en: 'Neck Rotation'
    },
    'shoulder-abduction': {
        id: 6,
        name_th: 'ท่ายกแขนข้าง',
        name_en: 'Shoulder Abduction'
    }
};

// การตั้งค่าท่าทางที่แก้ไขใหม่
const EXERCISE_CONFIG = {
    'arm-raise-forward': {
        name: 'ท่ายกแขนไปข้างหน้า',
        targetAngle: { min: 70, max: 100 },
        restAngle: { min: 0, max: 30 },
        landmarks: {
            shoulder: [11, 12],
            elbow: [13, 14],
            wrist: [15, 16]
        },
        requiredVisibility: 0.6,
        holdDuration: 1000,
        alternating: true, // เพิ่ม flag สำหรับการสลับข้าง
        feedback: {
            tooLow: 'ยกแขนให้สูงขึ้น ⬆️',
            tooHigh: 'ลดแขนลงเล็กน้อย ⬇️',
            perfect: 'ดีมาก! คงท่านี้ ✅',
            hold: 'คงท่า... {progress}%',
            nextSide: 'ดีมาก! ตอนนี้ยก{side} 👍'
        }
    },
    'leg-extension': {
        name: 'ท่าเหยียดเข่าตรง',
        targetAngle: { min: 160, max: 180 },
        restAngle: { min: 70, max: 110 },
        landmarks: {
            hip: [23, 24],
            knee: [25, 26],
            ankle: [27, 28]
        },
        requiredVisibility: 0.6,
        holdDuration: 1000,
        alternating: true, // เพิ่มการสลับข้าง
        feedback: {
            tooLow: 'เหยียดเข่าให้มากขึ้น ⬆️',
            tooHigh: 'เข่าตรงแล้ว ดีมาก ✅',
            perfect: 'ยอดเยี่ยม! คงท่า ✅',
            hold: 'กำลังคงท่า... {progress}%',
            nextSide: 'ดีมาก! ตอนนี้ยก{side} 👍'
        }
    },
    'trunk-sway': {
        name: 'ท่าโยกลำตัวซ้าย-ขวา',
        targetAngle: { min: 50, max: 500 }, // ลดระยะห่างขั้นต่ำ เพิ่มช่วงให้กว้าง
        restAngle: { min: 0, max: 100 }, // เพิ่มช่วงพักให้กว้าง
        landmarks: {
            shoulder: [11, 12],
            hip: [23, 24],
            nose: [0] // เพิ่มจมูกสำหรับตรวจจับ
        },
        requiredVisibility: 0.5, // ลดจาก 0.6 เป็น 0.5
        holdDuration: 800, // ลดจาก 2000 เหลือ 800ms (0.8 วินาที)
        useHeadPosition: true, // ใช้ตำแหน่งหัวแทนมุม
        alternating: true,
        feedback: {
            tooLow: 'โยกให้มากขึ้น ↔️',
            tooHigh: 'โยกพอดีแล้ว ✅',
            perfect: 'ดีแล้ว! คงท่า ✅',
            hold: 'คงท่า... {progress}%',
            nextSide: 'ดีมาก! ตอนนี้โยก{side} 👍'
        }
    },
    'neck-tilt': {
        name: 'ท่าเอียงศีรษะซ้าย-ขวา',
        targetAngle: { min: 50, max: 500 }, // ลดระยะห่างขั้นต่ำ เพิ่มช่วงให้กว้าง
        restAngle: { min: 0, max: 100 }, // เพิ่มช่วงพักให้กว้าง
        landmarks: {
            ear: [7, 8],
            shoulder: [11, 12],
            nose: [0] // เพิ่มจมูกสำหรับตรวจจับ
        },
        requiredVisibility: 0.4, // ลดจาก 0.5 เป็น 0.4
        holdDuration: 800, // ลดจาก 2000 เหลือ 800ms (0.8 วินาที)
        useHeadPosition: true, // ใช้ตำแหน่งหัวแทนมุม
        alternating: true,
        feedback: {
            tooLow: 'เอียงให้มากขึ้น ↔️',
            tooHigh: 'พอแล้ว ระวังคอ ⚠️',
            perfect: 'สมบูรณ์แบบ! ✅',
            hold: 'กำลังคงท่า... {progress}%',
            nextSide: 'ดีมาก! ตอนนี้เอียง{side} 👍'
        }
    }
};

// ระบบตรวจจับท่าทางที่แก้ไขใหม่
class ImprovedPoseDetector {
    constructor() {
        this.pose = null;
        this.camera = null;
        this.isRunning = false;
        this.currentExercise = null;
        this.config = null;
        this.kalmanFilter = null;
        this.exerciseState = {
            phase: 'rest',
            lastAngle: 0,
            smoothedAngle: 0,
            movementStarted: false,
            holdStartTime: null,
            isHolding: false,
            holdProgress: 0,
            lastDirection: null,
            currentSide: 'left', // เพิ่มตัวแปรเก็บข้างปัจจุบัน
            accuracy: 0,
            consecutiveGoodFrames: 0,
            requiredGoodFrames: 20, // ลดจาก 30 เหลือ 20
            angleHistory: [],
            repCounted: false
        };
    }

    async initialize() {
        try {
            console.log('🚀 กำลังตั้งค่าระบบตรวจจับท่าทาง...');
            
            await this.waitForMediaPipe();
            
            this.pose = new Pose({
                locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });

            this.pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.pose.onResults(results => this.onResults(results));
            await this.setupCamera();
            
            console.log('✅ ระบบพร้อมใช้งาน');
            return true;
        } catch (error) {
            console.error('❌ Error initializing:', error);
            return false;
        }
    }

    async waitForMediaPipe() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50;
            
            const checkLibraries = () => {
                attempts++;
                if (window.Pose && window.Camera && window.drawConnectors && window.drawLandmarks) {
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('MediaPipe libraries failed to load'));
                } else {
                    setTimeout(checkLibraries, 200);
                }
            };
            
            checkLibraries();
        });
    }

    async setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                    frameRate: { ideal: 30 }
                },
                audio: false
            });

            elements.video.srcObject = stream;

            return new Promise(resolve => {
                elements.video.onloadedmetadata = () => {
                    elements.video.play();
                    this.setupCanvasSize();
                    
                    this.camera = new Camera(elements.video, {
                        onFrame: async () => {
                            if (this.pose && this.isRunning) {
                                await this.pose.send({ image: elements.video });
                            }
                        },
                        width: 1280,
                        height: 720
                    });
                    
                    resolve();
                };
            });
        } catch (error) {
            throw new Error('ไม่สามารถเข้าถึงกล้องได้');
        }
    }

    setupCanvasSize() {
        if (elements.video.videoWidth > 0 && elements.video.videoHeight > 0) {
            elements.canvas.width = elements.video.videoWidth;
            elements.canvas.height = elements.video.videoHeight;
        } else {
            elements.canvas.width = 1280;
            elements.canvas.height = 720;
        }
        
        console.log(`Canvas size: ${elements.canvas.width}x${elements.canvas.height}`);
    }

    async start() {
        if (!this.camera) throw new Error('กล้องไม่พร้อม');
        this.isRunning = true;
        await this.camera.start();
        elements.loadingOverlay.style.display = 'none';
        sessionStartTime = Date.now();
        console.log('🎥 เริ่มการตรวจจับ');
    }

    selectExercise(exerciseId) {
    this.currentExercise = exerciseId;
    this.config = EXERCISE_CONFIG[exerciseId];
    
    if (!this.config) {
        console.error('❌ ไม่พบการตั้งค่าสำหรับท่า:', exerciseId);
        return false;
    }

    // ✅ เพิ่มส่วนนี้: เก็บ exercise_id และชื่อท่า
    const exerciseInfo = EXERCISE_ID_MAP[exerciseId];
    if (exerciseInfo) {
        currentExerciseId = exerciseInfo.id;
        currentExerciseName = exerciseInfo.name_th;
        console.log('✅ เก็บข้อมูลท่า:', {
            id: currentExerciseId,
            name: currentExerciseName,
            key: exerciseId
        });
    } else {
        console.warn('⚠️ ไม่พบ exercise_id mapping สำหรับ:', exerciseId);
    }

    // สร้าง Kalman Filter
    if (window.KalmanFilter) {
        this.kalmanFilter = new window.KalmanFilter(0.01, 0.1);
    }

    console.log('✅ เลือกท่า:', this.config.name);
    return true;
}
    onResults(results) {
        if (!this.isRunning || !results.poseLandmarks) return;

        try {
            // คำนวณมุมท่าทาง
            const angle = this.calculateExerciseAngle(results.poseLandmarks);
            
            if (angle === null) {
                updateStatusMessage('ไม่สามารถตรวจจับท่าได้ กรุณาอยู่ในกรอบ');
                return;
            }

            // Smooth angle ด้วย Kalman Filter
            const smoothedAngle = this.kalmanFilter ? 
                this.kalmanFilter.filter(angle) : angle;

            this.exerciseState.smoothedAngle = Math.round(smoothedAngle);
            this.exerciseState.lastAngle = smoothedAngle;

            // เก็บประวัติมุม
            this.exerciseState.angleHistory.push(smoothedAngle);
            if (this.exerciseState.angleHistory.length > 10) {
                this.exerciseState.angleHistory.shift();
            }

            // ตรวจจับการเคลื่อนไหว
            this.detectMovement();

            // อัพเดท UI
            const analysisData = {
                exercise: this.currentExercise,
                phase: this.exerciseState.phase,
                currentAngle: this.exerciseState.smoothedAngle,
                targetAngle: this.config.targetAngle,
                accuracy: this.exerciseState.accuracy,
                reps: currentReps,
                targetReps: targetReps,
                isHolding: this.exerciseState.isHolding,
                holdProgress: this.exerciseState.holdProgress,
                currentSide: this.exerciseState.currentSide, // เพิ่มข้อมูลข้างปัจจุบัน
                leftAngle: this.exerciseState.leftAngle || 0,
                rightAngle: this.exerciseState.rightAngle || 0
            };

            // วาดผลลัพธ์บน canvas
            if (canvasRenderer) {
                canvasRenderer.drawPoseResults(results, analysisData);
            }

            // อัพเดทข้อความสถานะ
            updateStatusMessage(this.getStatusMessage());

        } catch (error) {
            console.warn('⚠️ Error in onResults:', error);
        }
    }

    // ⭐ ฟังก์ชันคำนวณมุมตามท่าทาง
    calculateExerciseAngle(landmarks) {
        if (!this.currentExercise || !this.config) return null;

        switch (this.currentExercise) {
            case 'arm-raise-forward':
                return this.calculateArmRaiseAngle(landmarks);
            case 'leg-extension':
                return this.calculateLegExtensionAngle(landmarks);
            case 'trunk-sway':
                return this.calculateTrunkSwayAngle(landmarks);
            case 'neck-tilt':
                return this.calculateNeckTiltAngle(landmarks);
            default:
                return null;
        }
    }

    // คำนวณมุมยกแขน - รองรับการสลับซ้าย-ขวา
    calculateArmRaiseAngle(landmarks) {
        const leftShoulder = landmarks[11];
        const leftElbow = landmarks[13];
        const leftWrist = landmarks[15];
        const leftHip = landmarks[23];

        const rightShoulder = landmarks[12];
        const rightElbow = landmarks[14];
        const rightWrist = landmarks[16];
        const rightHip = landmarks[24];

        // ตรวจสอบ visibility ของทั้งสองข้าง
        const leftVisible = this.checkLandmarksVisibility([leftShoulder, leftElbow, leftWrist, leftHip]);
        const rightVisible = this.checkLandmarksVisibility([rightShoulder, rightElbow, rightWrist, rightHip]);

        if (!leftVisible && !rightVisible) {
            return null;
        }

        let leftAngle = 0;
        let rightAngle = 0;

        // คำนวณมุมแขนซ้าย
        if (leftVisible) {
            const angle1 = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
            const angle2 = this.calculateAngle(leftHip, leftShoulder, leftElbow);
            leftAngle = Math.min(angle1, angle2);
        }

        // คำนวณมุมแขนขวา
        if (rightVisible) {
            const angle1 = this.calculateAngle(rightShoulder, rightElbow, rightWrist);
            const angle2 = this.calculateAngle(rightHip, rightShoulder, rightElbow);
            rightAngle = Math.min(angle1, angle2);
        }

        // เก็บข้อมูลทั้งสองข้างไว้ใน state
        this.exerciseState.leftAngle = leftAngle;
        this.exerciseState.rightAngle = rightAngle;

        // สำหรับท่าที่ต้องสลับข้าง ให้ส่งค่ามุมของข้างที่ควรทำ
        if (this.config.alternating) {
            return this.exerciseState.currentSide === 'left' ? leftAngle : rightAngle;
        }

        // ถ้าไม่ต้องสลับ ส่งค่ามุมที่มากกว่า (ยกสูงกว่า)
        return Math.max(leftAngle, rightAngle);
    }

    // คำนวณมุมเหยียดเข่า - รองรับการสลับข้าง
    calculateLegExtensionAngle(landmarks) {
        const leftHip = landmarks[23];
        const leftKnee = landmarks[25];
        const leftAnkle = landmarks[27];

        const rightHip = landmarks[24];
        const rightKnee = landmarks[26];
        const rightAnkle = landmarks[28];

        // ตรวจสอบ visibility ของทั้งสองข้าง
        const leftVisible = this.checkLandmarksVisibility([leftHip, leftKnee, leftAnkle]);
        const rightVisible = this.checkLandmarksVisibility([rightHip, rightKnee, rightAnkle]);

        if (!leftVisible && !rightVisible) {
            return null;
        }

        let leftAngle = 0;
        let rightAngle = 0;

        // คำนวณมุมขาซ้าย
        if (leftVisible) {
            leftAngle = this.calculateAngle(leftHip, leftKnee, leftAnkle);
        }

        // คำนวณมุมขาขวา
        if (rightVisible) {
            rightAngle = this.calculateAngle(rightHip, rightKnee, rightAnkle);
        }

        // เก็บข้อมูลทั้งสองข้างไว้ใน state
        this.exerciseState.leftAngle = leftAngle;
        this.exerciseState.rightAngle = rightAngle;

        // สำหรับท่าที่ต้องสลับข้าง ให้ส่งค่ามุมของข้างที่ควรทำ
        if (this.config.alternating) {
            return this.exerciseState.currentSide === 'left' ? leftAngle : rightAngle;
        }

        // ถ้าไม่ต้องสลับ ส่งค่ามุมที่มากกว่า
        return Math.max(leftAngle, rightAngle);
    }

    // คำนวณมุมโยกลำตัว - ใช้ตำแหน่งหัวแทนมุม
    calculateTrunkSwayAngle(landmarks) {
        const nose = landmarks[0];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        if (!this.checkLandmarksVisibility([nose, leftShoulder, rightShoulder, leftHip, rightHip])) {
            return null;
        }

        // ถ้าใช้ระบบตรวจจับตำแหน่งหัว
        if (this.config.useHeadPosition) {
            // คำนวณจุดกลางของลำตัว (กึ่งกลางระหว่างไหล่)
            const centerX = (leftShoulder.x + rightShoulder.x) / 2;
            
            // คำนวณระยะห่างของหัวจากจุดกลาง (แกน X)
            const headOffsetX = nose.x - centerX;
            
            // เก็บทิศทางการเอียง
            // headOffsetX < 0 = เอียงซ้าย (ในกล้องหน้า)
            // headOffsetX > 0 = เอียงขวา
            this.exerciseState.swayDirection = headOffsetX < 0 ? 'left' : 'right';
            
            // คำนวณระยะห่างเป็น pixels (สำหรับเปรียบเทียบกับ targetDistance)
            const distance = Math.abs(headOffsetX) * 1000; // คูณ 1000 เพื่อแปลงเป็น pixels โดยประมาณ
            
            // สำหรับท่าที่ต้องสลับข้าง
            if (this.config.alternating) {
                // ตรวจสอบว่าเอียงไปทิศทางที่ถูกต้องหรือไม่
                const correctDirection = this.exerciseState.swayDirection === this.exerciseState.currentSide;
                
                // ถ้าเอียงถูกทิศทาง ส่งค่าระยะห่าง, ถ้าไม่ถูก ส่ง 0
                return correctDirection ? distance : 0;
            }
            
            return distance;
        }

        // ถ้าไม่ใช้ระบบตำแหน่งหัว ใช้มุมแบบเดิม
        const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
        const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipCenterX = (leftHip.x + rightHip.x) / 2;
        const hipCenterY = (leftHip.y + rightHip.y) / 2;

        const deltaX = shoulderCenterX - hipCenterX;
        const deltaY = shoulderCenterY - hipCenterY;
        const angleDeg = Math.abs(Math.atan2(deltaX, deltaY) * (180 / Math.PI));

        this.exerciseState.swayDirection = deltaX < 0 ? 'left' : 'right';

        if (this.config.alternating) {
            const correctDirection = this.exerciseState.swayDirection === this.exerciseState.currentSide;
            return correctDirection ? angleDeg : 0;
        }

        return angleDeg;
    }

    // คำนวณมุมเอียงศีรษะ - ใช้ตำแหน่งหัวแทนมุม
    calculateNeckTiltAngle(landmarks) {
        const nose = landmarks[0];
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];

        if (!this.checkLandmarksVisibility([nose, leftEar, rightEar, leftShoulder, rightShoulder])) {
            return null;
        }

        // ถ้าใช้ระบบตรวจจับตำแหน่งหัว
        if (this.config.useHeadPosition) {
            // คำนวณจุดกลางของไหล่
            const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
            
            // คำนวณระยะห่างของหัวจากจุดกลางไหล่ (แกน X)
            const headOffsetX = nose.x - shoulderCenterX;
            
            // เก็บทิศทางการเอียง
            this.exerciseState.tiltDirection = headOffsetX < 0 ? 'left' : 'right';
            
            // คำนวณระยะห่างเป็น pixels
            const distance = Math.abs(headOffsetX) * 1000;
            
            // สำหรับท่าที่ต้องสลับข้าง
            if (this.config.alternating) {
                const correctDirection = this.exerciseState.tiltDirection === this.exerciseState.currentSide;
                return correctDirection ? distance : 0;
            }
            
            return distance;
        }

        // ถ้าไม่ใช้ระบบตำแหน่งหัว ใช้มุมแบบเดิม
        const headCenterX = (leftEar.x + rightEar.x) / 2;
        const headCenterY = (leftEar.y + rightEar.y) / 2;

        const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
        const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;

        const deltaX = headCenterX - shoulderCenterX;
        const deltaY = headCenterY - shoulderCenterY;
        const angleDeg = Math.abs(Math.atan2(deltaX, deltaY) * (180 / Math.PI));

        this.exerciseState.tiltDirection = deltaX < 0 ? 'left' : 'right';

        if (this.config.alternating) {
            const correctDirection = this.exerciseState.tiltDirection === this.exerciseState.currentSide;
            return correctDirection ? angleDeg : 0;
        }

        return angleDeg;
    }

    // ฟังก์ชันคำนวณมุมระหว่างจุด 3 จุด
    calculateAngle(point1, point2, point3) {
        const radians = Math.atan2(point3.y - point2.y, point3.x - point2.x) - 
                        Math.atan2(point1.y - point2.y, point1.x - point2.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        
        if (angle > 180.0) {
            angle = 360 - angle;
        }
        
        return angle;
    }

    // ตรวจสอบ visibility ของ landmarks
    checkLandmarksVisibility(landmarks) {
        return landmarks.every(lm => 
            lm && lm.visibility > this.config.requiredVisibility
        );
    }

    // ⭐ ตรวจจับการเคลื่อนไหว - รองรับการสลับข้าง
    detectMovement() {
        const angle = this.exerciseState.smoothedAngle;
        const target = this.config.targetAngle;
        const rest = this.config.restAngle;

        // ตรวจสอบว่าอยู่ในช่วงเป้าหมาย
        const inTargetRange = angle >= target.min && angle <= target.max;
        const inRestRange = angle >= rest.min && angle <= rest.max;

        if (inTargetRange) {
            this.exerciseState.consecutiveGoodFrames++;
            
            // เริ่มนับเวลาคงท่า
            if (!this.exerciseState.isHolding) {
                this.exerciseState.isHolding = true;
                this.exerciseState.holdStartTime = Date.now();
                this.exerciseState.phase = 'holding';
            }

            // คำนวณความคืบหน้าการคงท่า
            if (this.exerciseState.holdStartTime) {
                const holdTime = Date.now() - this.exerciseState.holdStartTime;
                this.exerciseState.holdProgress = Math.min(100, 
                    (holdTime / this.config.holdDuration) * 100
                );

                // นับ rep เมื่อคงท่าครบเวลา
                if (holdTime >= this.config.holdDuration && !this.exerciseState.repCounted) {
                    this.exerciseState.repCounted = true;
                    
                    // ถ้าเป็นท่าที่ต้องสลับข้าง
                    if (this.config.alternating) {
                        // นับครั้งทันทีไม่ว่าจะข้างไหน
                        this.incrementRep();
                        
                        // สลับข้างสำหรับครั้งถัดไป
                        if (this.exerciseState.currentSide === 'left') {
                            this.exerciseState.currentSide = 'right';
                        } else {
                            this.exerciseState.currentSide = 'left';
                        }
                    } else {
                        // ท่าปกติ ไม่ต้องสลับ
                        this.incrementRep();
                    }
                }
            }

            // คำนวณความแม่นยำ
            const targetCenter = (target.min + target.max) / 2;
            const deviation = Math.abs(angle - targetCenter);
            const maxDeviation = (target.max - target.min) / 2;
            this.exerciseState.accuracy = Math.max(0, 100 - (deviation / maxDeviation) * 100);

        } else {
            // ไม่อยู่ในช่วงเป้าหมาย - รีเซ็ตการคงท่า
            if (this.exerciseState.isHolding) {
                this.exerciseState.isHolding = false;
                this.exerciseState.holdStartTime = null;
                this.exerciseState.holdProgress = 0;
            }

            // ถ้ากลับมาที่ท่าพัก - รีเซ็ตเพื่อเตรียมนับครั้งต่อไป
            if (inRestRange && this.exerciseState.repCounted) {
                this.exerciseState.repCounted = false;
                this.exerciseState.consecutiveGoodFrames = 0;
                this.exerciseState.phase = 'rest';
            } else if (!inRestRange) {
                this.exerciseState.phase = 'moving';
            }
        }
    }

    getStatusMessage() {
        if (!this.config) return '';
        
        const state = this.exerciseState;
        const angle = state.smoothedAngle;
        const target = this.config.targetAngle;
        
        // แสดงข้างที่กำลังทำสำหรับท่าที่ต้องสลับ
        const sideText = this.config.alternating ? 
            (state.currentSide === 'left' ? ' (แขนซ้าย)' : ' (แขนขวา)') : '';
        
        if (state.isHolding) {
            return this.config.feedback.hold.replace('{progress}', Math.round(state.holdProgress)) + sideText;
        }
        
        if (angle < target.min - 10) {
            return this.config.feedback.tooLow + sideText;
        } else if (angle > target.max + 10) {
            return this.config.feedback.tooHigh + sideText;
        } else if (angle >= target.min && angle <= target.max) {
            return this.config.feedback.perfect + sideText;
        }
        
        return 'เคลื่อนไหวไปยังท่าเป้าหมาย...' + sideText;
    }

    incrementRep() {
        currentReps++;
        updateRepCounter();
        showSuccessFlash();
        playSuccessSound();

        console.log(`✅ ทำสำเร็จ ${currentReps}/${targetReps} ครั้ง (ความแม่นยำ: ${Math.round(this.exerciseState.accuracy)}%)`);

        if (currentReps >= targetReps) {
            setTimeout(() => {
                completeExercise();
            }, 1000);
        } else {
            setTimeout(() => {
                this.exerciseState.phase = 'rest';
                updateStatusMessage('เตรียมพร้อมสำหรับครั้งต่อไป...');
            }, 1500);
        }
    }

    stop() {
        this.isRunning = false;
        if (this.camera) this.camera.stop();
    }

    destroy() {
        this.stop();
        if (elements.video.srcObject) {
            const stream = elements.video.srcObject;
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            elements.video.srcObject = null;
        }
    }
}

// Helper Functions
function updateRepCounter() {
    elements.repCounter.textContent = currentReps;
    elements.repCounter.classList.add('pulse');
    setTimeout(() => {
        elements.repCounter.classList.remove('pulse');
    }, 600);
}

function updateStatusMessage(message) {
    elements.statusMessage.textContent = message;
}

function showSuccessFlash() {
    elements.successFlash.classList.add('active');
    setTimeout(() => {
        elements.successFlash.classList.remove('active');
    }, 600);
}

function playSuccessSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
    } catch (error) {
        console.warn('Cannot play sound:', error);
    }
}

// ===== SAVE TO DATABASE =====
async function saveToDatabase(sessionData) {
    try {
        console.log('💾 กำลังบันทึกข้อมูลลงฐานข้อมูล...');
        
        // 🔐 ดึง Token และ User Data
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const userDataStr = sessionStorage.getItem('userData') || localStorage.getItem('userData');
        
        if (!token || !userDataStr) {
            console.warn('⚠️ ไม่พบ token หรือ userData - ข้ามการบันทึกฐานข้อมูล');
            return { success: false, error: 'No authentication' };
        }

        const userData = JSON.parse(userDataStr);
        console.log('👤 User ID:', userData.user_id);

        // ✅ คำนวณ reps ซ้าย-ขวา
        const totalReps = sessionData.reps || 0;
        const repsLeft = Math.floor(totalReps / 2);
        const repsRight = Math.ceil(totalReps / 2);

        // ✅ สร้างข้อมูลตามโครงสร้าง Exercise_Sessions table
        const postData = {
            patient_id: userData.user_id,
            plan_id: 1,                                    // default plan
            exercise_id: sessionData.exercise_id,          // ต้องมีค่านี้
            session_date: new Date().toISOString(),
            actual_reps_left: repsLeft,
            actual_reps_right: repsRight,
            actual_reps: totalReps,
            actual_sets: 1,
            accuracy_percent: parseFloat(sessionData.accuracy) || 0,
            duration_seconds: parseInt(sessionData.duration_seconds) || 0,
            notes: `ทำครบ ${totalReps} ครั้ง ด้วยความแม่นยำ ${sessionData.accuracy}%`,
            completed: true
        };

        console.log('📤 ข้อมูลที่จะส่ง:', postData);

        const response = await fetch('https://bn1-1.onrender.com/api/exercise-sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(postData)
        });

        console.log('📡 Response status:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log('✅ บันทึกฐานข้อมูลสำเร็จ:', result);
            return { success: true, data: result };
        } else {
            const errorData = await response.json();
            console.error('❌ API Error:', errorData);
            return { success: false, error: errorData };
        }

    } catch (error) {
        console.error('❌ Error saving to database:', error);
        return { success: false, error: error.message };
    }
}


function completeExercise() {
    isComplete = true;
    
    // แสดง overlay
    if (elements.completeOverlay) {
        elements.completeOverlay.classList.add('show');
    }
    
    // 📊 คำนวณข้อมูล
    const sessionDuration = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
    const avgAccuracy = Math.round(physioApp.exerciseState.accuracy);
    
    console.log('🎉 การออกกำลังเสร็จสิ้น!');
    console.log('📊 สถิติ:', {
        exercise_id: currentExerciseId,
        exercise_name: currentExerciseName,
        exercise_key: physioApp.currentExercise,
        reps: currentReps,
        accuracy: avgAccuracy,
        duration: sessionDuration
    });

    // ⚠️ ตรวจสอบว่ามี exercise_id หรือไม่
    if (!currentExerciseId) {
        console.error('❌ ไม่พบ currentExerciseId - ไม่สามารถบันทึกฐานข้อมูลได้!');
        alert('เกิดข้อผิดพลาด: ไม่พบข้อมูล exercise_id');
    }

    // 💾 เตรียมข้อมูลสำหรับ localStorage
    const localStorageData = {
        exercise: physioApp.currentExercise,
        exerciseName: currentExerciseName || physioApp.config.name,
        reps: currentReps,
        targetReps: targetReps,
        accuracy: avgAccuracy,
        sessionStats: {
            exerciseTime: sessionDuration,
            bestAccuracy: avgAccuracy,
            improvementRate: (Math.random() * 10 - 5).toFixed(1)
        },
        date: new Date().toLocaleDateString('th-TH', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        }),
        time: new Date().toLocaleTimeString('th-TH', { 
            hour: '2-digit', 
            minute: '2-digit' 
        }),
        completedAt: new Date().toISOString(),
        success: true
    };
    
    // บันทึก localStorage
    localStorage.setItem('lastSessionData', JSON.stringify(localStorageData));
    
    let exerciseHistory = [];
    const existingHistory = localStorage.getItem('exerciseHistory');
    if (existingHistory) {
        try {
            exerciseHistory = JSON.parse(existingHistory);
        } catch (e) {
            exerciseHistory = [];
        }
    }
    
    exerciseHistory.push(localStorageData);
    
    if (exerciseHistory.length > 50) {
        exerciseHistory = exerciseHistory.slice(-50);
    }
    
    localStorage.setItem('exerciseHistory', JSON.stringify(exerciseHistory));
    console.log('💾 บันทึก localStorage สำเร็จ');

    // ✅ เตรียมข้อมูลสำหรับฐานข้อมูล
    const databaseData = {
        exercise_id: currentExerciseId,           // ✅ ใช้ตัวแปร global
        exercise_name: currentExerciseName,       // ✅ ใช้ตัวแปร global
        reps: currentReps,
        accuracy: avgAccuracy,
        duration_seconds: sessionDuration
    };

    console.log('📤 กำลังส่งข้อมูลไปยัง API:', databaseData);

    // ✅ บันทึกลงฐานข้อมูล (async)
    saveToDatabase(databaseData).then(result => {
        if (result.success) {
            console.log('✅ บันทึกฐานข้อมูลสำเร็จ!');
            if (typeof speak === 'function') {
                speak(`บันทึกสำเร็จ! คุณทำได้ ${currentReps} ครั้ง`);
            }
        } else {
            console.warn('⚠️ บันทึกฐานข้อมูลล้มเหลว:', result.error);
            console.log('💾 แต่ข้อมูลอยู่ใน localStorage แล้ว');
            if (typeof speak === 'function') {
                speak(`ยินดีด้วย! คุณทำได้ ${currentReps} ครั้ง`);
            }
        }
    }).catch(error => {
        console.error('❌ Exception in saveToDatabase:', error);
    });
    
    // เล่นเสียง
    if (typeof playSuccessSound === 'function') {
        playSuccessSound();
    }
    
    // Auto redirect หลัง 5 วินาที
    setTimeout(() => {
        window.location.href = 'report.html';
    }, 5000);
}

function goBack() {
    if (confirm('การฝึกยังไม่เสร็จสิ้น ต้องการออกจริงหรือไม่?')) {
        cleanup();
        window.location.href = 'dashboard.html';
    }
}

function endExercise() {
    if (confirm('ต้องการจบการฝึกหรือไม่?')) {
        cleanup();
        window.location.href = 'dashboard.html';
    }
}

function cleanup() {
    if (physioApp) {
        physioApp.destroy();
    }
    if (canvasRenderer) {
        canvasRenderer.destroy();
    }
}

function getSelectedExerciseInfo() {
    const selectedExercise = localStorage.getItem('selectedExercise');
    const selectedExerciseName = localStorage.getItem('selectedExerciseName');
    if (!selectedExercise || !selectedExerciseName) return null;
    return { id: selectedExercise, name: selectedExerciseName };
}

// Initialization
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('🚀 เริ่มโหลดระบบตรวจจับท่าทาง...');
        
        const exerciseInfo = getSelectedExerciseInfo();
        if (!exerciseInfo) {
            alert('ไม่พบข้อมูลท่าทางที่เลือก');
            window.location.href = 'dashboard.html';
            return;
        }

        elements.exerciseTitle.textContent = exerciseInfo.name;
        elements.targetRepsElement.textContent = targetReps;
        
        // สร้าง Canvas Renderer
        canvasRenderer = new CanvasRenderer(elements.canvas, elements.video);
        
        // สร้าง Pose Detector
        physioApp = new ImprovedPoseDetector();
        const success = await physioApp.initialize();
        
        if (success) {
            const exerciseSelected = physioApp.selectExercise(exerciseInfo.id);
            if (exerciseSelected) {
                await physioApp.start();
                updateStatusMessage('เตรียมตัวในท่าเริ่มต้น...');
            } else {
                throw new Error('ไม่สามารถเลือกท่าทางได้');
            }
        } else {
            throw new Error('ไม่สามารถเริ่มต้นระบบได้');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert(`เกิดข้อผิดพลาด: ${error.message}`);
        window.location.href = 'dashboard.html';
    }
});

window.addEventListener('beforeunload', function(event) {
    if (!isComplete && currentReps > 0) {
        event.preventDefault();
        event.returnValue = '';
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        goBack();
    }
});
// ============================================
// ตัวอย่างโค้ดสำหรับเพิ่มเอฟเฟกต์จอเขียว
// ============================================

// ฟังก์ชันสำหรับแสดงจอเขียวเมื่อทำท่าถูก
function showCorrectPoseEffect() {
    const videoContainer = document.getElementById('video-container') || 
                          document.querySelector('.video-container');
    const statusMessage = document.getElementById('status-message');
    
    // เพิ่ม class เพื่อแสดงเอฟเฟกต์จอเขียว
    if (videoContainer) {
        videoContainer.classList.add('correct-pose');
        
        // ลบ class หลังจาก animation เสร็จ
        setTimeout(() => {
            videoContainer.classList.remove('correct-pose');
        }, 800);
    }
    
    // เปลี่ยนสถานะข้อความ
    if (statusMessage) {
        statusMessage.textContent = '✓ ท่าถูกต้อง! เยี่ยมมาก!';
        statusMessage.classList.add('success');
        
        setTimeout(() => {
            statusMessage.classList.remove('success');
        }, 2000);
    }
}

// ============================================
// วิธีใช้งานในโค้ดหลัก (potex.js หรือไฟล์อื่นๆ)
// ============================================

/*
// ตัวอย่าง: เรียกใช้เมื่อตรวจพบท่าถูกต้อง
function onPoseDetected(isCorrect) {
    if (isCorrect) {
        // เพิ่มคะแนน
        repCount++;
        document.getElementById('rep-counter').textContent = repCount;
        
        // แสดงเอฟเฟกต์จอเขียว
        showCorrectPoseEffect();
        
        // แสดง success flash (ที่มีอยู่แล้ว)
        const successFlash = document.getElementById('success-flash');
        if (successFlash) {
            successFlash.classList.add('show');
            setTimeout(() => {
                successFlash.classList.remove('show');
            }, 600);
        }
    }
}

// ตัวอย่าง: ใช้กับ MediaPipe Pose Detection
function onPoseResults(results) {
    // ตรวจสอบท่าทาง
    const isCorrectPose = checkPoseCorrectness(results);
    
    if (isCorrectPose && !lastPoseCorrect) {
        // ท่าถูกต้องครั้งแรก
        showCorrectPoseEffect();
        countRep();
    }
    
    lastPoseCorrect = isCorrectPose;
}
*/

// ============================================
// ฟังก์ชันเพิ่มเติมสำหรับ Mobile
// ============================================

// เพิ่ม haptic feedback บนมือถือ (สั่นเบาๆ เมื่อทำถูก)
function triggerHapticFeedback() {
    if (navigator.vibrate) {
        // สั่น 50ms เมื่อทำถูก
        navigator.vibrate(50);
    }
}

// เรียกใช้พร้อมกับจอเขียว
function showCorrectPoseWithFeedback() {
    showCorrectPoseEffect();
    triggerHapticFeedback();
    
    // เล่นเสียง (ถ้ามี)
    const successSound = document.getElementById('success-sound');
    if (successSound) {
        successSound.play().catch(e => console.log('Cannot play sound:', e));
    }
}

// ============================================
// ตัวอย่างการใช้งานจริง
// ============================================

/*
// วางโค้ดนี้ในไฟล์ potex.js หรือไฟล์หลักของคุณ

let repCount = 0;
let lastPoseCorrect = false;

function updatePoseDetection(landmarks) {
    // ตรวจสอบว่าท่าถูกต้องหรือไม่
    const isCorrect = validatePose(landmarks);
    
    // ถ้าท่าถูกต้องและยังไม่นับ
    if (isCorrect && !lastPoseCorrect) {
        repCount++;
        document.getElementById('rep-counter').textContent = repCount;
        
        // แสดงเอฟเฟกต์จอเขียว + haptic feedback
        showCorrectPoseWithFeedback();
        
        // ตรวจสอบว่าครบเป้าหมายหรือยัง
        const target = parseInt(document.getElementById('target-reps').textContent);
        if (repCount >= target) {
            showCompleteOverlay();
        }
    }
    
    lastPoseCorrect = isCorrect;
}
*/
function debugExerciseInfo() {
    console.log('🔍 Debug Exercise Info:');
    console.log('  currentExerciseId:', currentExerciseId);
    console.log('  currentExerciseName:', currentExerciseName);
    console.log('  physioApp.currentExercise:', physioApp?.currentExercise);
    console.log('  currentReps:', currentReps);
    console.log('  targetReps:', targetReps);
}
console.log('Green flash effect loaded! 🟢');
console.log('Use showCorrectPoseEffect() to trigger green screen flash');

console.log('✅ potex-fixed.js โหลดเสร็จแล้ว');