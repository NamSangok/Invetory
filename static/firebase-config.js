// ==============================================================================
// 🔥 Firebase 클라우드 연동 설정 (Firebase Cloud Config)
// ==============================================================================
// Firebase 콘솔 (https://console.firebase.google.com)에서 프로젝트 생성 후
// 웹 앱(</>) 추가 시 발급되는 설정을 아래에 입력하거나, 대시보드 화면의 [Firebase 설정] 모달에 입력하세요.
// ==============================================================================

let firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

// 로컬 스토리지에 저장된 사용자 Firebase 설정이 있다면 우선 적용
try {
    const savedConfig = localStorage.getItem('custom_firebase_config');
    if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.apiKey && parsed.projectId) {
            firebaseConfig = parsed;
        }
    }
} catch (e) {
    console.warn("로컬 Firebase 설정 로드 실패:", e);
}

// Firebase 설정 유효성 검사
const isFirebaseConfigured = Boolean(
    firebaseConfig.apiKey && 
    firebaseConfig.apiKey.length > 5 && 
    firebaseConfig.projectId && 
    firebaseConfig.projectId.length > 2
);

let cloudDb = null;
let cloudAuth = null;

if (isFirebaseConfigured && typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        cloudDb = firebase.firestore();
        cloudAuth = firebase.auth();
        console.log("🔥 Firebase Cloud Firestore가 정상 초기화되었습니다. (Project: " + firebaseConfig.projectId + ")");
    } catch (e) {
        console.error("Firebase 초기화 오류:", e);
    }
}
