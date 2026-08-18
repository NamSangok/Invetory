// ==============================================================================
// 🔥 Firebase 클라우드 연동 설정 (Firebase Cloud Config)
// ==============================================================================
// Firebase 프로젝트: inventory-fa6a7
// ==============================================================================

const firebaseConfig = {
    apiKey: "AIzaSyAtkcINkt_VVdLc03mnMEKwd3oy99BE-0E",
    authDomain: "inventory-fa6a7.firebaseapp.com",
    projectId: "inventory-fa6a7",
    storageBucket: "inventory-fa6a7.firebasestorage.app",
    messagingSenderId: "1029222926666",
    appId: "1:1029222926666:web:d05a943a4d9af3fe6619b3",
    measurementId: "G-RWSEKGK09G"
};

// Firebase 설정 유효성 검사
const isFirebaseConfigured = true;

let cloudDb = null;
let cloudAuth = null;

if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        cloudDb = firebase.firestore();
        cloudAuth = firebase.auth();
        console.log("🔥 Firebase Cloud Firestore가 활성화되었습니다. (Project: inventory-fa6a7)");
    } catch (e) {
        console.error("Firebase 초기화 오류:", e);
    }
}
