// ==============================================================================
// 스마트 생산·재고 관리 시스템 (Frontend Engine with Firebase Cloud Sync)
// ==============================================================================

let cachedItems = [];
let cachedTransactions = [];
let currentActiveTab = 'dashboard';
let currentItemTypeFilter = '';
let currentLowStockOnly = false;
let selectedBOMProductId = null;
let currentBOMData = [];
let html5QrScanner = null;

// Charts references
let trendChart = null;
let distributionChart = null;

// Unsubscribe hooks for Firestore real-time listeners
let unsubscribeItems = null;
let unsubscribeTransactions = null;
let unsubscribeNotices = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    updateCloudStatusUI();
    initDataEngine();
    switchTab('dashboard');
});

// Real-time Clock
function initClock() {
    const updateTime = () => {
        const now = new Date();
        const clockEl = document.getElementById('server-clock');
        if (clockEl) {
            clockEl.innerText = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Data Engine (Dual-mode: Local API vs Firebase Firestore)
function initDataEngine() {
    if (isFirebaseConfigured && cloudDb) {
        console.log("🚀 Firestore Realtime 모드로 시작합니다.");
        // Listen to items real-time
        unsubscribeItems = cloudDb.collection('items').onSnapshot(snapshot => {
            const items = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                items.push({ ...data, id: data.id || doc.id });
            });
            cachedItems = items;
            preloadItemOptions();
            if (currentActiveTab === 'items') renderItemsTable(items);
            if (currentActiveTab === 'dashboard') calculateAndRenderDashboardFromCache();
            if (currentActiveTab === 'production') loadProductionTab();
        }, err => console.error("Firestore Items listener error:", err));

        // Listen to transactions real-time
        unsubscribeTransactions = cloudDb.collection('transactions').orderBy('timestamp', 'desc').limit(500).onSnapshot(snapshot => {
            const txs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                txs.push({ ...data, id: data.id || doc.id });
            });
            cachedTransactions = txs;
            if (currentActiveTab === 'transactions') renderTransactionsTable(txs);
            if (currentActiveTab === 'dashboard') calculateAndRenderDashboardFromCache();
        }, err => console.error("Firestore Transactions listener error:", err));

    } else {
        console.log("🖥️ 로컬 FastAPI 백엔드 모드로 시작합니다.");
        preloadItemOptions();
    }
}

// Mobile Sidebar Drawer Toggle
function toggleMobileSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (sidebar && backdrop) {
        sidebar.classList.toggle('-translate-x-full');
        backdrop.classList.toggle('hidden');
    }
}

// Tab Switching
function switchTab(tabId) {
    currentActiveTab = tabId;

    // Sidebar active styles
    document.querySelectorAll('#main-sidebar nav button').forEach(btn => {
        btn.classList.remove('bg-brand-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-300', 'hover:bg-slate-800');
        const icon = btn.querySelector('i');
        if (icon && !btn.id.includes('cloud')) icon.classList.remove('text-teal-300');
    });

    const activeBtn = document.getElementById(`btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-300', 'hover:bg-slate-800');
        activeBtn.classList.add('bg-brand-600', 'text-white', 'shadow-sm');
        const icon = activeBtn.querySelector('i');
        if (icon) icon.classList.add('text-teal-300');
    }

    // Tab content visibility
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const targetContent = document.getElementById(`tab-${tabId}`);
    if (targetContent) targetContent.classList.add('active');

    // Page titles
    const titles = {
        'dashboard': '대시보드',
        'items': '품목 관리 (생산 부품 및 완제품)',
        'transactions': '입출고 관리 및 수불부',
        'production': '생산 관리 & BOM 조립',
        'monthly': '월별 집계 통계 및 보고서'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titles[tabId] || '재고 관리 시스템';

    // Close mobile sidebar if open
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 1024) {
        toggleMobileSidebar();
    }

    // Load data for active tab
    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'items') loadItems();
    if (tabId === 'transactions') loadTransactions();
    if (tabId === 'production') loadProductionTab();
    if (tabId === 'monthly') loadMonthlyStats();
}

function refreshCurrentTab() {
    switchTab(currentActiveTab);
}

// Modal Helpers
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// ==============================================================================
// 🔥 FIREBASE CLOUD SYNC & CONFIG LOGIC
// ==============================================================================

function updateCloudStatusUI() {
    const headerBtn = document.getElementById('header-cloud-btn');
    const headerText = document.getElementById('header-cloud-status-text');
    const sidebarText = document.getElementById('sidebar-cloud-status');
    const connText = document.getElementById('connection-status-text');

    if (isFirebaseConfigured && cloudDb) {
        if (headerBtn) {
            headerBtn.className = 'hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-emerald-50 text-emerald-700 border-emerald-200';
            headerText.innerText = `클라우드 연동됨 (${firebaseConfig.projectId})`;
        }
        if (sidebarText) sidebarText.innerText = `Firebase 클라우드 연동됨`;
        if (connText) connText.innerText = `클라우드 실시간 동기화`;
    } else {
        if (headerBtn) {
            headerBtn.className = 'hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200';
            headerText.innerText = `클라우드 연동 설정`;
        }
        if (sidebarText) sidebarText.innerText = `Firebase 클라우드 연동`;
        if (connText) connText.innerText = `로컬 서버 작동 중`;
    }
}

function openFirebaseModal() {
    const statusBox = document.getElementById('firebase-status-box');
    const jsonInput = document.getElementById('firebaseConfigJsonInput');

    if (isFirebaseConfigured && cloudDb) {
        const hostingUrl = `https://${firebaseConfig.projectId}.web.app`;
        statusBox.className = 'p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 space-y-2';
        statusBox.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                <strong class="text-xs font-bold">Firebase Cloud Firestore가 성공적으로 연결되어 있습니다!</strong>
            </div>
            <p class="text-xs">프로젝트 ID: <b class="font-mono text-emerald-900">${firebaseConfig.projectId}</b></p>
            <div class="p-2.5 bg-white rounded-lg border border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <span class="text-[11px] text-slate-500 block">다른 장소 PC 접속 주소 (Firebase Hosting):</span>
                    <a href="${hostingUrl}" target="_blank" class="text-xs font-bold text-teal-700 underline font-mono">${hostingUrl}</a>
                </div>
                <button onclick="navigator.clipboard.writeText('${hostingUrl}'); Swal.fire('복사 완료', '접속 주소가 클립보드에 복사되었습니다.', 'success')" class="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-xs font-semibold">
                    주소 복사
                </button>
            </div>
        `;
        jsonInput.value = JSON.stringify(firebaseConfig, null, 2);
    } else {
        statusBox.className = 'p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 space-y-2';
        statusBox.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="fa-solid fa-triangle-exclamation text-amber-600"></i>
                <strong class="text-xs font-bold">현재 로컬 모드로 작동 중입니다.</strong>
            </div>
            <p class="text-xs leading-relaxed">다른 장소(재택근무, 타 공장, 외근)의 PC나 모바일에서 접속하려면 아래에 Firebase 설정을 등록하세요.</p>
        `;
    }

    openModal('firebaseModal');
}

function saveFirebaseConfigFromInput() {
    const raw = document.getElementById('firebaseConfigJsonInput').value.trim();
    if (!raw) {
        Swal.fire('입력 필요', 'Firebase config JSON을 입력해주세요.', 'warning');
        return;
    }

    try {
        let configObj = null;
        if (raw.startsWith('{')) {
            configObj = JSON.parse(raw);
        } else if (raw.includes('apiKey')) {
            // If user pasted const firebaseConfig = { ... }
            const jsonStr = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
            configObj = JSON.parse(jsonStr);
        }

        if (!configObj || !configObj.apiKey || !configObj.projectId) {
            throw new Error('유효한 apiKey 및 projectId가 포함되어야 합니다.');
        }

        localStorage.setItem('custom_firebase_config', JSON.stringify(configObj));
        Swal.fire({
            icon: 'success',
            title: 'Firebase 설정 저장 완료!',
            text: '클라우드 실시간 모드로 전환하기 위해 페이지를 새로고침합니다.',
            timer: 2000,
            showConfirmButton: false
        }).then(() => {
            window.location.reload();
        });

    } catch (e) {
        Swal.fire('형식 오류', 'Firebase Config JSON 형식이 올바르지 않습니다.\n' + e.message, 'error');
    }
}

function resetFirebaseConfig() {
    Swal.fire({
        title: '클라우드 연동 해제',
        text: 'Firebase 클라우드 설정을 초기화하고 로컬 서버 모드로 돌아가시겠습니까?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '초기화',
        cancelButtonText: '취소'
    }).then(res => {
        if (res.isConfirmed) {
            localStorage.removeItem('custom_firebase_config');
            window.location.reload();
        }
    });
}

// One-click Migrate all local SQLite DB items to Firestore
async function uploadAllLocalDataToFirestore() {
    if (!isFirebaseConfigured || !cloudDb) {
        Swal.fire('연동 필요', '먼저 위의 입력창에 Firebase 설정을 입력하고 연결해주세요.', 'warning');
        return;
    }

    try {
        Swal.fire({
            title: '클라우드로 데이터 업로드 중...',
            text: '로컬 데이터베이스의 품목 및 이력을 Firestore로 전송하고 있습니다.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const [itemsRes, txRes, noticesRes] = await Promise.all([
            fetch('/api/items'),
            fetch('/api/transactions?limit=1000'),
            fetch('/api/notices')
        ]);

        const items = await itemsRes.json();
        const txs = await txRes.json();
        const notices = await noticesRes.json();

        // 1. Batch upload items
        const batch = cloudDb.batch();
        items.forEach(item => {
            const ref = cloudDb.collection('items').doc(String(item.id));
            batch.set(ref, item);
        });

        // 2. Upload notices
        notices.forEach(n => {
            const ref = cloudDb.collection('notices').doc(String(n.id));
            batch.set(ref, n);
        });

        await batch.commit();

        // 3. Upload transactions
        for (const tx of txs) {
            await cloudDb.collection('transactions').doc(String(tx.id)).set(tx);
        }

        Swal.fire({
            icon: 'success',
            title: '클라우드 동기화 완료!',
            html: `
                <div class="text-left text-xs space-y-2">
                    <p>총 <b>${items.length}개 품목</b> 및 <b>${txs.length}건의 이력</b>이 Firebase Firestore로 안전하게 업로드되었습니다.</p>
                    <p class="text-slate-500">이제 다른 장소의 PC에서도 동일한 데이터로 실시간 협업이 가능합니다.</p>
                </div>
            `
        });

    } catch (err) {
        Swal.fire('동기화 오류', err.message, 'error');
    }
}

// ==============================================================================
// 1. 대시보드 (DASHBOARD)
// ==============================================================================

async function loadDashboard() {
    if (isFirebaseConfigured && cloudDb) {
        calculateAndRenderDashboardFromCache();
        return;
    }

    try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) throw new Error('대시보드 데이터를 불러오지 못했습니다.');
        const data = await res.json();
        applyDashboardData(data);
    } catch (err) {
        console.error('loadDashboard error:', err);
    }
}

function calculateAndRenderDashboardFromCache() {
    const items = cachedItems || [];
    const allTxs = cachedTransactions || [];

    const total_items = items.length;
    const parts = items.filter(i => i.item_type === 'part');
    const products = items.filter(i => i.item_type === 'product');

    const total_stock_quantity = items.reduce((acc, cur) => acc + (cur.current_stock || 0), 0);
    const parts_stock_quantity = parts.reduce((acc, cur) => acc + (cur.current_stock || 0), 0);
    const products_stock_quantity = products.reduce((acc, cur) => acc + (cur.current_stock || 0), 0);
    const total_stock_value = items.reduce((acc, cur) => acc + ((cur.current_stock || 0) * (cur.unit_price || 0)), 0);

    const low_stock_alerts = items.filter(i => i.safety_stock > 0 && i.current_stock < i.safety_stock).map(item => ({
        id: item.id,
        name: item.name,
        item_code: item.item_code || `ITM-${item.id}`,
        item_type: item.item_type,
        spec: item.spec || '-',
        unit: item.unit || 'EA',
        safety_stock: item.safety_stock,
        current_stock: item.current_stock,
        shortage: Math.max(0, item.safety_stock - item.current_stock),
        location: item.location || '-'
    }));

    const out_of_stock_count = items.filter(i => i.current_stock === 0).length;

    // Daily Trend
    const now = new Date();
    const daily_trend = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        const dayPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const inQty = allTxs.filter(t => t.timestamp && t.timestamp.startsWith(dayPrefix) && t.tx_type === 'in').reduce((a, c) => a + (c.quantity || 0), 0);
        const outQty = allTxs.filter(t => t.timestamp && t.timestamp.startsWith(dayPrefix) && t.tx_type === 'out').reduce((a, c) => a + (c.quantity || 0), 0);
        daily_trend.push({ date: dStr, in_qty: inQty, out_qty: outQty });
    }

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const today_in = allTxs.filter(t => t.timestamp && t.timestamp.startsWith(todayStr) && t.tx_type === 'in').reduce((a, c) => a + (c.quantity || 0), 0);
    const today_out = allTxs.filter(t => t.timestamp && t.timestamp.startsWith(todayStr) && t.tx_type === 'out').reduce((a, c) => a + (c.quantity || 0), 0);
    const month_in = allTxs.filter(t => t.timestamp && t.timestamp.startsWith(monthStr) && t.tx_type === 'in').reduce((a, c) => a + (c.quantity || 0), 0);
    const month_out = allTxs.filter(t => t.timestamp && t.timestamp.startsWith(monthStr) && t.tx_type === 'out').reduce((a, c) => a + (c.quantity || 0), 0);

    const categories_count = {};
    items.forEach(item => {
        const cat = item.category || (item.item_type === 'product' ? '완제품' : '원자재');
        categories_count[cat] = (categories_count[cat] || 0) + (item.current_stock || 0);
    });

    applyDashboardData({
        total_items,
        total_parts: parts.length,
        total_products: products.length,
        total_stock_quantity,
        parts_stock_quantity,
        products_stock_quantity,
        total_stock_value,
        out_of_stock_count,
        today_in,
        today_out,
        month_in,
        month_out,
        low_stock_alerts,
        daily_trend,
        categories_distribution: categories_count
    });

    loadRecentTransactions();
    loadNotices();
}

function applyDashboardData(data) {
    document.getElementById('dash-total-items').innerText = (data.total_items || 0).toLocaleString();
    document.getElementById('dash-total-parts').innerText = (data.total_parts || 0).toLocaleString();
    document.getElementById('dash-total-products').innerText = (data.total_products || 0).toLocaleString();

    document.getElementById('dash-total-stock').innerText = (data.total_stock_quantity || 0).toLocaleString() + ' EA';
    document.getElementById('dash-parts-stock').innerText = (data.parts_stock_quantity || 0).toLocaleString();
    document.getElementById('dash-products-stock').innerText = (data.products_stock_quantity || 0).toLocaleString();
    document.getElementById('dash-stock-value').innerText = '₩' + (data.total_stock_value || 0).toLocaleString();

    document.getElementById('dash-today-in').innerText = (data.today_in || 0).toLocaleString();
    document.getElementById('dash-today-out').innerText = (data.today_out || 0).toLocaleString();
    document.getElementById('dash-month-in').innerText = (data.month_in || 0).toLocaleString();
    document.getElementById('dash-month-out').innerText = (data.month_out || 0).toLocaleString();

    const alertCount = (data.low_stock_alerts || []).length;
    document.getElementById('dash-alert-count').innerText = alertCount.toLocaleString() + '건';
    document.getElementById('dash-out-of-stock-label').innerText = `결품 품목: ${data.out_of_stock_count || 0}건`;
    document.getElementById('low-stock-badge-count').innerText = alertCount + '건';

    const sidebarBadge = document.getElementById('sidebar-alert-badge');
    if (sidebarBadge) {
        if (alertCount > 0) {
            sidebarBadge.innerText = alertCount;
            sidebarBadge.classList.remove('hidden');
        } else {
            sidebarBadge.classList.add('hidden');
        }
    }

    renderTrendChart(data.daily_trend || []);
    renderDistributionChart(data.categories_distribution || {}, data.total_parts, data.total_products);
    renderLowStockAlerts(data.low_stock_alerts || []);

    if (!isFirebaseConfigured) {
        loadRecentTransactions();
        loadNotices();
    }
}

function renderTrendChart(dailyTrend) {
    const ctx = document.getElementById('chart-daily-trend');
    if (!ctx) return;

    const labels = dailyTrend.map(d => d.date);
    const inData = dailyTrend.map(d => d.in_qty);
    const outData = dailyTrend.map(d => d.out_qty);

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '입고 수량',
                    data: inData,
                    backgroundColor: 'rgba(2, 132, 199, 0.85)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
                {
                    label: '출고 수량',
                    data: outData,
                    backgroundColor: 'rgba(225, 29, 72, 0.85)',
                    borderRadius: 6,
                    borderSkipped: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, font: { family: 'Pretendard', size: 11, weight: '500' } }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: 'Pretendard', size: 11 } } },
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { family: 'Pretendard', size: 11 } } }
            }
        }
    });
}

function renderDistributionChart(catDist, totalParts, totalProducts) {
    const ctx = document.getElementById('chart-distribution');
    if (!ctx) return;

    if (distributionChart) distributionChart.destroy();

    const labels = Object.keys(catDist).length > 0 ? Object.keys(catDist) : ['생산 부품', '완제품'];
    const dataValues = Object.keys(catDist).length > 0 ? Object.values(catDist) : [totalParts || 0, totalProducts || 0];

    const colors = ['#0d9488', '#6366f1', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Pretendard', size: 11 } } }
            },
            cutout: '68%'
        }
    });
}

function renderLowStockAlerts(alerts) {
    const container = document.getElementById('dash-low-stock-container');
    if (!container) return;

    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400 text-xs">
                <i class="fa-solid fa-circle-check text-emerald-500 text-3xl mb-2 block"></i>
                현재 모든 품목의 재고가 안전재고 이상으로 원활합니다.
            </div>
        `;
        return;
    }

    let html = '';
    alerts.forEach(item => {
        const isOutOfStock = item.current_stock === 0;
        const ratio = Math.min(100, Math.round((item.current_stock / (item.safety_stock || 1)) * 100));

        html += `
            <div class="p-3 rounded-xl border ${isOutOfStock ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/30'} flex items-center justify-between hover:shadow-xs transition-shadow">
                <div class="flex-1 min-w-0 pr-3">
                    <div class="flex items-center space-x-1.5 mb-1">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${item.item_type === 'product' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}">
                            ${item.item_type === 'product' ? '완제품' : '부품'}
                        </span>
                        <span class="text-xs font-bold text-slate-800 truncate">${item.name}</span>
                    </div>
                    <div class="text-[11px] text-slate-500 flex items-center space-x-2">
                        <span>규격: ${item.spec}</span>
                        <span>|</span>
                        <span>안전: ${item.safety_stock}${item.unit}</span>
                        <span>|</span>
                        <span class="${isOutOfStock ? 'text-rose-600 font-bold' : 'text-amber-700 font-semibold'}">현재: ${item.current_stock}${item.unit}</span>
                    </div>
                    <div class="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div class="${isOutOfStock ? 'bg-rose-500' : 'bg-amber-500'} h-full rounded-full" style="width: ${ratio}%"></div>
                    </div>
                </div>
                <div class="flex flex-col items-end space-y-1">
                    <span class="text-[10px] font-bold text-rose-600">${item.shortage}${item.unit} 부족</span>
                    <button onclick="openInboundModal(${item.id})" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-semibold transition-all shadow-xs active:scale-95">
                        즉시 입고
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function loadRecentTransactions() {
    const container = document.getElementById('dash-recent-tx-container');
    if (!container) return;

    let txs = [];
    if (isFirebaseConfigured && cloudDb) {
        txs = cachedTransactions.slice(0, 8);
    } else {
        try {
            const res = await fetch('/api/transactions/recent?limit=8');
            txs = await res.json();
        } catch (err) {
            console.error(err);
        }
    }

    if (txs.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">최근 입출고 내역이 없습니다.</div>`;
        return;
    }

    let html = '';
    txs.forEach(tx => {
        const isIn = tx.tx_type === 'in';
        html += `
            <div class="p-2.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50/80 flex items-center justify-between transition-colors">
                <div class="flex items-center space-x-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg ${isIn ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'} flex items-center justify-center text-xs font-bold flex-shrink-0">
                        <i class="fa-solid ${isIn ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center space-x-1.5">
                            <span class="text-xs font-bold text-slate-800 truncate">${tx.item_name}</span>
                            <span class="text-[10px] text-slate-400 font-mono">${tx.item_code || ''}</span>
                        </div>
                        <p class="text-[11px] text-slate-500 truncate">${tx.sub_type || (isIn ? '입고' : '출고')} · ${tx.worker || '담당자미지정'} · ${(tx.timestamp || '').substring(5, 16)}</p>
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="text-xs font-extrabold ${isIn ? 'text-sky-700' : 'text-rose-700'}">${isIn ? '+' : '-'}${(tx.quantity || 0).toLocaleString()} ${tx.unit || 'EA'}</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Notice Board
async function loadNotices() {
    const container = document.getElementById('dash-notices-container');
    if (!container) return;

    let notices = [];
    if (isFirebaseConfigured && cloudDb) {
        const snap = await cloudDb.collection('notices').orderBy('created_at', 'desc').get();
        snap.forEach(doc => notices.push({ ...doc.data(), id: doc.id }));
    } else {
        try {
            const res = await fetch('/api/notices');
            notices = await res.json();
        } catch (err) {
            console.error(err);
        }
    }

    if (notices.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">등록된 현장 공지 및 메모가 없습니다.</div>`;
        return;
    }

    let html = '';
    notices.forEach(n => {
        const isResolved = n.is_resolved === 1;
        html += `
            <div class="p-2.5 rounded-xl border ${isResolved ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-teal-50/40 border-teal-100'} flex items-start justify-between space-x-2 transition-all">
                <div class="flex items-start space-x-2 flex-1 min-w-0">
                    <input type="checkbox" ${isResolved ? 'checked' : ''} onchange="toggleNotice('${n.id}')" class="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer">
                    <div class="min-w-0">
                        <p class="text-xs font-medium ${isResolved ? 'line-through text-slate-400' : 'text-slate-800'} break-words">${n.content}</p>
                        <span class="text-[10px] text-slate-400">${n.created_at}</span>
                    </div>
                </div>
                <button onclick="deleteNotice('${n.id}')" class="text-slate-400 hover:text-rose-600 text-xs p-1">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function addNoticePrompt() {
    const { value: text } = await Swal.fire({
        title: '새 현장 메모 / 공지사항 등록',
        input: 'textarea',
        inputPlaceholder: '현장에 공유할 작업 지시 또는 메모 내용을 입력하세요...',
        showCancelButton: true,
        confirmButtonText: '등록',
        cancelButtonText: '취소',
        confirmButtonColor: '#0d9488'
    });

    if (text && text.trim()) {
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
        if (isFirebaseConfigured && cloudDb) {
            await cloudDb.collection('notices').add({
                content: text.trim(),
                is_resolved: 0,
                created_at: nowStr
            });
        } else {
            await fetch('/api/notices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text.trim() })
            });
        }
        loadNotices();
    }
}

async function toggleNotice(id) {
    if (isFirebaseConfigured && cloudDb) {
        const ref = cloudDb.collection('notices').doc(String(id));
        const doc = await ref.get();
        if (doc.exists) {
            const cur = doc.data().is_resolved || 0;
            await ref.update({ is_resolved: cur === 1 ? 0 : 1 });
        }
    } else {
        await fetch(`/api/notices/${id}/toggle`, { method: 'PUT' });
    }
    loadNotices();
}

async function deleteNotice(id) {
    if (isFirebaseConfigured && cloudDb) {
        await cloudDb.collection('notices').doc(String(id)).delete();
    } else {
        await fetch(`/api/notices/${id}`, { method: 'DELETE' });
    }
    loadNotices();
}

function filterLowStockView() {
    switchTab('items');
    currentLowStockOnly = true;
    updateItemFilterUI();
    loadItems();
}

// ==============================================================================
// 2. 품목 관리 (ITEM MASTER)
// ==============================================================================

async function loadItems() {
    const search = document.getElementById('item-search-input')?.value.toLowerCase() || '';
    const category = document.getElementById('item-category-filter')?.value || '';

    let items = [];

    if (isFirebaseConfigured && cloudDb) {
        items = cachedItems.filter(i => {
            if (currentItemTypeFilter && i.item_type !== currentItemTypeFilter) return false;
            if (category && i.category !== category) return false;
            if (currentLowStockOnly && !(i.safety_stock > 0 && i.current_stock < i.safety_stock)) return false;
            if (search) {
                const s = search;
                const match = (i.name && i.name.toLowerCase().includes(s)) ||
                    (i.item_code && i.item_code.toLowerCase().includes(s)) ||
                    (i.spec && i.spec.toLowerCase().includes(s)) ||
                    (i.location && i.location.toLowerCase().includes(s)) ||
                    (i.note && i.note.toLowerCase().includes(s));
                if (!match) return false;
            }
            return true;
        });
    } else {
        let url = `/api/items?`;
        if (currentItemTypeFilter) url += `item_type=${encodeURIComponent(currentItemTypeFilter)}&`;
        if (category) url += `category=${encodeURIComponent(category)}&`;
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (currentLowStockOnly) url += `low_stock_only=true&`;

        try {
            const res = await fetch(url);
            items = await res.json();
            cachedItems = items;
        } catch (err) {
            console.error('loadItems error:', err);
        }
    }

    renderItemsTable(items);
}

function renderItemsTable(items) {
    const tableBody = document.getElementById('items-table-body');
    if (!tableBody) return;

    document.getElementById('item-filtered-count').innerText = items.length.toLocaleString();
    document.getElementById('item-total-master-count').innerText = (cachedItems || []).length.toLocaleString();

    if (items.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="12" class="py-12 text-center text-slate-400">조건에 일치하는 품목이 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    items.forEach(item => {
        const isPart = item.item_type === 'part';
        const isOutOfStock = item.current_stock === 0;
        const isLowStock = item.safety_stock > 0 && item.current_stock < item.safety_stock;

        let statusBadge = '';
        if (isOutOfStock) {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">결품(0)</span>';
        } else if (isLowStock) {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">재고부족</span>';
        } else {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">정상</span>';
        }

        html += `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-4 font-mono font-bold text-teal-700">${item.item_code}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${isPart ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                        ${isPart ? '생산부품' : '완제품'}
                    </span>
                </td>
                <td class="py-3 px-4 text-slate-600">${item.category || '-'}</td>
                <td class="py-3 px-4 font-bold text-slate-900">${item.name}</td>
                <td class="py-3 px-4 text-slate-500 font-mono">${item.spec || '-'}</td>
                <td class="py-3 px-4 text-slate-600">${item.unit || 'EA'}</td>
                <td class="py-3 px-4 text-slate-600"><span class="px-1.5 py-0.5 bg-slate-100 rounded text-[11px]">${item.location || '-'}</span></td>
                <td class="py-3 px-4 text-right text-slate-700">₩${(item.unit_price || 0).toLocaleString()}</td>
                <td class="py-3 px-4 text-right font-extrabold ${isOutOfStock ? 'text-rose-600' : (isLowStock ? 'text-amber-600' : 'text-slate-900')}">
                    ${(item.current_stock || 0).toLocaleString()}
                </td>
                <td class="py-3 px-4 text-right text-slate-500">${(item.safety_stock || 0).toLocaleString()}</td>
                <td class="py-3 px-4 text-center">${statusBadge}</td>
                <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center space-x-1.5">
                        <button onclick="openInboundModal('${item.id}')" class="p-1 text-sky-600 hover:bg-sky-50 rounded" title="입고">
                            <i class="fa-solid fa-arrow-down text-xs"></i>
                        </button>
                        <button onclick="openOutboundModal('${item.id}')" class="p-1 text-rose-600 hover:bg-rose-50 rounded" title="출고">
                            <i class="fa-solid fa-arrow-up text-xs"></i>
                        </button>
                        <button onclick="printItemLabel('${item.id}')" class="p-1 text-slate-600 hover:bg-slate-100 rounded" title="바코드 라벨 인쇄">
                            <i class="fa-solid fa-barcode text-xs"></i>
                        </button>
                        <button onclick="openItemModal('${item.id}')" class="p-1 text-teal-600 hover:bg-teal-50 rounded" title="수정">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="deleteItem('${item.id}', '${item.name}')" class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="삭제">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

function filterItemsByType(type) {
    currentItemTypeFilter = type;
    currentLowStockOnly = false;
    updateItemFilterUI();
    loadItems();
}

function toggleLowStockItemFilter() {
    currentLowStockOnly = !currentLowStockOnly;
    updateItemFilterUI();
    loadItems();
}

function updateItemFilterUI() {
    ['all', 'part', 'product'].forEach(t => {
        const btn = document.getElementById(`item-filter-${t}`);
        if (!btn) return;
        if ((t === 'all' && !currentItemTypeFilter && !currentLowStockOnly) || (t === currentItemTypeFilter && !currentLowStockOnly)) {
            btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 shadow-xs transition-all';
        } else {
            btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 transition-all';
        }
    });

    const lowBtn = document.getElementById('item-filter-low');
    if (lowBtn) {
        if (currentLowStockOnly) {
            lowBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white shadow-xs transition-all';
        } else {
            lowBtn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition-all';
        }
    }
}

let itemSearchTimeout = null;
function handleItemSearch(e) {
    clearTimeout(itemSearchTimeout);
    itemSearchTimeout = setTimeout(() => {
        loadItems();
    }, 300);
}

// Item Create & Update
async function openItemModal(itemId = null) {
    document.getElementById('itemForm').reset();
    document.getElementById('itemFormId').value = '';

    const initialStockDiv = document.getElementById('initialStockDiv');

    if (itemId) {
        document.getElementById('itemModalTitle').innerText = '품목 정보 수정';
        if (initialStockDiv) initialStockDiv.classList.add('hidden');

        let item = cachedItems.find(i => String(i.id) === String(itemId));
        if (!item && !isFirebaseConfigured) {
            const res = await fetch(`/api/items/${itemId}`);
            item = await res.json();
        }

        if (item) {
            document.getElementById('itemFormId').value = item.id;
            document.getElementById('itemFormType').value = item.item_type;
            document.getElementById('itemFormCategory').value = item.category || '';
            document.getElementById('itemFormCode').value = item.item_code || '';
            document.getElementById('itemFormName').value = item.name;
            document.getElementById('itemFormSpec').value = item.spec || '';
            document.getElementById('itemFormUnit').value = item.unit || 'EA';
            document.getElementById('itemFormLocation').value = item.location || '';
            document.getElementById('itemFormUnitPrice').value = item.unit_price || 0;
            document.getElementById('itemFormSafety').value = item.safety_stock || 0;
            document.getElementById('itemFormNote').value = item.note || '';
        }
    } else {
        document.getElementById('itemModalTitle').innerText = '신규 품목 등록';
        if (initialStockDiv) initialStockDiv.classList.remove('hidden');
    }

    openModal('itemModal');
}

async function submitItemForm(e) {
    e.preventDefault();
    const itemId = document.getElementById('itemFormId').value;
    const itemData = {
        name: document.getElementById('itemFormName').value.trim(),
        item_type: document.getElementById('itemFormType').value,
        category: document.getElementById('itemFormCategory').value.trim() || '일반',
        item_code: document.getElementById('itemFormCode').value.trim() || null,
        spec: document.getElementById('itemFormSpec').value.trim() || null,
        unit: document.getElementById('itemFormUnit').value.trim() || 'EA',
        location: document.getElementById('itemFormLocation').value.trim() || null,
        unit_price: parseInt(document.getElementById('itemFormUnitPrice').value) || 0,
        safety_stock: parseInt(document.getElementById('itemFormSafety').value) || 0,
        note: document.getElementById('itemFormNote').value.trim() || null
    };

    if (!itemId) {
        itemData.current_stock = parseInt(document.getElementById('itemFormStock').value) || 0;
    }

    try {
        if (isFirebaseConfigured && cloudDb) {
            if (itemId) {
                await cloudDb.collection('items').doc(String(itemId)).update(itemData);
            } else {
                const newId = Date.now();
                const prefix = itemData.item_type === 'product' ? 'PRD' : 'PRT';
                if (!itemData.item_code) itemData.item_code = `${prefix}-${String(newId).slice(-4)}`;
                itemData.id = newId;
                await cloudDb.collection('items').doc(String(newId)).set(itemData);
            }
        } else {
            let res;
            if (itemId) {
                res = await fetch(`/api/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemData)
                });
            } else {
                res = await fetch('/api/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemData)
                });
            }

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || '저장에 실패했습니다.');
            }
        }

        closeModal('itemModal');
        Swal.fire({
            icon: 'success',
            title: itemId ? '수정 완료' : '등록 완료',
            text: '품목 정보가 정상적으로 저장되었습니다.',
            timer: 1500,
            showConfirmButton: false
        });
        loadItems();
    } catch (err) {
        Swal.fire('오류', err.message, 'error');
    }
}

async function deleteItem(id, name) {
    const result = await Swal.fire({
        title: '품목 삭제 확인',
        html: `<strong>[${name}]</strong> 품목을 삭제하시겠습니까?<br><span class="text-xs text-rose-500">관련된 모든 입출고 이력 및 BOM 구성도 함께 삭제됩니다.</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: '삭제',
        cancelButtonText: '취소'
    });

    if (result.isConfirmed) {
        try {
            if (isFirebaseConfigured && cloudDb) {
                await cloudDb.collection('items').doc(String(id)).delete();
            } else {
                const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('삭제에 실패했습니다.');
            }
            Swal.fire('삭제 완료', '품목이 삭제되었습니다.', 'success');
            loadItems();
        } catch (err) {
            Swal.fire('오류', err.message, 'error');
        }
    }
}

// ==============================================================================
// 3. 입출고 관리 (TRANSACTIONS)
// ==============================================================================

async function preloadItemOptions() {
    let items = cachedItems;
    if (!isFirebaseConfigured || items.length === 0) {
        try {
            const res = await fetch('/api/items');
            items = await res.json();
            cachedItems = items;
        } catch (e) { }
    }

    const inboundSelect = document.getElementById('inboundItemId');
    const outboundSelect = document.getElementById('outboundItemId');
    const prodProductSelect = document.getElementById('prodModalProductId');

    if (inboundSelect) {
        inboundSelect.innerHTML = '<option value="">입고할 품목을 선택하세요</option>' +
            items.map(i => `<option value="${i.id}">[${i.item_code}] ${i.name} (${i.spec || '-'}) - 현재: ${i.current_stock}${i.unit}</option>`).join('');
    }
    if (outboundSelect) {
        outboundSelect.innerHTML = '<option value="">출고할 품목을 선택하세요</option>' +
            items.map(i => `<option value="${i.id}">[${i.item_code}] ${i.name} (${i.spec || '-'}) - 출고가능: ${i.current_stock}${i.unit}</option>`).join('');
    }
    if (prodProductSelect) {
        const products = items.filter(i => i.item_type === 'product');
        prodProductSelect.innerHTML = '<option value="">생산할 완제품을 선택하세요</option>' +
            products.map(i => `<option value="${i.id}">[${i.item_code}] ${i.name} (${i.spec || '-'}) - 현재고: ${i.current_stock}${i.unit}</option>`).join('');
    }
}

function updateInboundItemInfo() {
    const itemId = document.getElementById('inboundItemId').value;
    const item = cachedItems.find(i => String(i.id) === String(itemId));
    const hint = document.getElementById('inboundItemHint');
    if (item && hint) {
        hint.innerHTML = `현재고: <strong class="text-teal-700">${item.current_stock} ${item.unit}</strong> | 위치: <strong>${item.location || '-'}</strong> | 단가: ₩${(item.unit_price || 0).toLocaleString()}`;
        if (item.unit_price && !document.getElementById('inboundUnitPrice').value) {
            document.getElementById('inboundUnitPrice').value = item.unit_price;
        }
    }
}

function updateOutboundItemInfo() {
    const itemId = document.getElementById('outboundItemId').value;
    const item = cachedItems.find(i => String(i.id) === String(itemId));
    const hint = document.getElementById('outboundItemHint');
    if (item && hint) {
        hint.innerHTML = `출고 가능 현재고: <strong class="text-rose-700">${item.current_stock} ${item.unit}</strong> | 위치: <strong>${item.location || '-'}</strong>`;
        if (item.unit_price && !document.getElementById('outboundUnitPrice').value) {
            document.getElementById('outboundUnitPrice').value = item.unit_price;
        }
    }
}

function openInboundModal(preselectedItemId = null) {
    document.getElementById('inboundForm').reset();
    preloadItemOptions().then(() => {
        if (preselectedItemId) {
            document.getElementById('inboundItemId').value = preselectedItemId;
            updateInboundItemInfo();
        }
    });
    openModal('inboundModal');
}

function openOutboundModal(preselectedItemId = null) {
    document.getElementById('outboundForm').reset();
    preloadItemOptions().then(() => {
        if (preselectedItemId) {
            document.getElementById('outboundItemId').value = preselectedItemId;
            updateOutboundItemInfo();
        }
    });
    openModal('outboundModal');
}

async function submitInboundForm(e) {
    e.preventDefault();
    const itemId = document.getElementById('inboundItemId').value;
    const qty = parseInt(document.getElementById('inboundQuantity').value);

    if (!itemId || !qty) return;

    const item = cachedItems.find(i => String(i.id) === String(itemId));
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const data = {
        item_id: parseInt(itemId) || itemId,
        item_code: item ? item.item_code : '',
        item_name: item ? item.name : '',
        item_type: item ? item.item_type : '',
        item_spec: item ? (item.spec || '-') : '-',
        unit: item ? (item.unit || 'EA') : 'EA',
        tx_type: 'in',
        sub_type: document.getElementById('inboundSubType').value,
        quantity: qty,
        unit_price: parseInt(document.getElementById('inboundUnitPrice').value) || 0,
        lot_number: document.getElementById('inboundLot').value.trim(),
        company_name: document.getElementById('inboundCompany').value.trim(),
        worker: document.getElementById('inboundWorker').value.trim(),
        note: document.getElementById('inboundNote').value.trim(),
        timestamp: nowStr
    };

    try {
        if (isFirebaseConfigured && cloudDb) {
            // Update stock and add tx in Firestore
            const itemRef = cloudDb.collection('items').doc(String(itemId));
            const newStock = (item.current_stock || 0) + qty;
            await itemRef.update({ current_stock: newStock });
            await cloudDb.collection('transactions').add(data);
        } else {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '입고 처리에 실패했습니다.');
            }
        }

        closeModal('inboundModal');
        Swal.fire({
            icon: 'success',
            title: '입고 완료',
            text: `수량 ${qty.toLocaleString()}개가 정상 입고 처리되었습니다.`,
            timer: 1500,
            showConfirmButton: false
        });

        if (!isFirebaseConfigured) {
            if (currentActiveTab === 'dashboard') loadDashboard();
            if (currentActiveTab === 'items') loadItems();
            if (currentActiveTab === 'transactions') loadTransactions();
        }
    } catch (err) {
        Swal.fire('입고 오류', err.message, 'error');
    }
}

async function submitOutboundForm(e) {
    e.preventDefault();
    const itemId = document.getElementById('outboundItemId').value;
    const qty = parseInt(document.getElementById('outboundQuantity').value);

    if (!itemId || !qty) return;

    const item = cachedItems.find(i => String(i.id) === String(itemId));
    if (item && item.current_stock < qty) {
        Swal.fire('출고 불가', `현재고(${item.current_stock}${item.unit})보다 많은 수량을 출고할 수 없습니다.`, 'warning');
        return;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const data = {
        item_id: parseInt(itemId) || itemId,
        item_code: item ? item.item_code : '',
        item_name: item ? item.name : '',
        item_type: item ? item.item_type : '',
        item_spec: item ? (item.spec || '-') : '-',
        unit: item ? (item.unit || 'EA') : 'EA',
        tx_type: 'out',
        sub_type: document.getElementById('outboundSubType').value,
        quantity: qty,
        unit_price: parseInt(document.getElementById('outboundUnitPrice').value) || 0,
        lot_number: document.getElementById('outboundLot').value.trim(),
        company_name: document.getElementById('outboundCompany').value.trim(),
        worker: document.getElementById('outboundWorker').value.trim(),
        note: document.getElementById('outboundNote').value.trim(),
        timestamp: nowStr
    };

    try {
        if (isFirebaseConfigured && cloudDb) {
            const itemRef = cloudDb.collection('items').doc(String(itemId));
            const newStock = (item.current_stock || 0) - qty;
            await itemRef.update({ current_stock: newStock });
            await cloudDb.collection('transactions').add(data);
        } else {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '출고 처리에 실패했습니다.');
            }
        }

        closeModal('outboundModal');
        Swal.fire({
            icon: 'success',
            title: '출고 완료',
            text: `수량 ${qty.toLocaleString()}개가 정상 출고 처리되었습니다.`,
            timer: 1500,
            showConfirmButton: false
        });

        if (!isFirebaseConfigured) {
            if (currentActiveTab === 'dashboard') loadDashboard();
            if (currentActiveTab === 'items') loadItems();
            if (currentActiveTab === 'transactions') loadTransactions();
        }
    } catch (err) {
        Swal.fire('출고 오류', err.message, 'error');
    }
}

async function loadTransactions() {
    const search = document.getElementById('tx-search-input')?.value.toLowerCase() || '';
    const txType = document.getElementById('tx-type-filter')?.value || '';
    const itemType = document.getElementById('tx-item-type-filter')?.value || '';
    const startDate = document.getElementById('tx-start-date')?.value || '';
    const endDate = document.getElementById('tx-end-date')?.value || '';

    let txs = [];

    if (isFirebaseConfigured && cloudDb) {
        txs = cachedTransactions.filter(t => {
            if (txType && t.tx_type !== txType) return false;
            if (itemType && t.item_type !== itemType) return false;
            if (startDate && t.timestamp && t.timestamp < startDate) return false;
            if (endDate && t.timestamp && t.timestamp > endDate + ' 23:59:59') return false;
            if (search) {
                const s = search;
                const match = (t.item_name && t.item_name.toLowerCase().includes(s)) ||
                    (t.item_code && t.item_code.toLowerCase().includes(s)) ||
                    (t.lot_number && t.lot_number.toLowerCase().includes(s)) ||
                    (t.worker && t.worker.toLowerCase().includes(s)) ||
                    (t.company_name && t.company_name.toLowerCase().includes(s)) ||
                    (t.note && t.note.toLowerCase().includes(s));
                if (!match) return false;
            }
            return true;
        });
    } else {
        let url = `/api/transactions?`;
        if (txType) url += `tx_type=${txType}&`;
        if (itemType) url += `item_type=${itemType}&`;
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        if (search) url += `search=${encodeURIComponent(search)}&`;

        try {
            const res = await fetch(url);
            txs = await res.json();
            cachedTransactions = txs;
        } catch (err) {
            console.error('loadTransactions error:', err);
        }
    }

    renderTransactionsTable(txs);
}

function renderTransactionsTable(txs) {
    const tableBody = document.getElementById('tx-table-body');
    if (!tableBody) return;

    document.getElementById('tx-count').innerText = txs.length.toLocaleString();

    if (txs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="13" class="py-12 text-center text-slate-400">조회된 입출고 이력이 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    txs.forEach(tx => {
        const isIn = tx.tx_type === 'in';
        const isPart = tx.item_type === 'part';

        html += `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-4 text-slate-500 font-mono text-[11px]">${tx.timestamp}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isIn ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                        ${isIn ? '입고' : '출고'}
                    </span>
                </td>
                <td class="py-3 px-4 font-medium text-slate-700">${tx.sub_type || '-'}</td>
                <td class="py-3 px-4 font-mono text-teal-700 font-semibold">${tx.item_code || ''}</td>
                <td class="py-3 px-4 font-bold text-slate-900">${tx.item_name}</td>
                <td class="py-3 px-4">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${isPart ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}">
                        ${isPart ? '부품' : '완제품'}
                    </span>
                </td>
                <td class="py-3 px-4 text-slate-500">${tx.item_spec || '-'}</td>
                <td class="py-3 px-4 text-right font-extrabold ${isIn ? 'text-sky-700' : 'text-rose-700'}">
                    ${isIn ? '+' : '-'}${(tx.quantity || 0).toLocaleString()} ${tx.unit || 'EA'}
                </td>
                <td class="py-3 px-4 font-mono text-slate-600 text-[11px]">${tx.lot_number || '-'}</td>
                <td class="py-3 px-4 text-slate-700">${tx.company_name || '-'}</td>
                <td class="py-3 px-4 text-slate-600">${tx.worker || '-'}</td>
                <td class="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate" title="${tx.note}">${tx.note || '-'}</td>
                <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center space-x-1">
                        <button onclick="openEditTxModal('${tx.id}')" class="p-1 text-slate-600 hover:text-teal-600 rounded" title="수정">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </button>
                        <button onclick="cancelTransaction('${tx.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded" title="거래 취소 및 재고 롤백">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

function setTxDateRange(preset) {
    const today = new Date();
    const pad = n => n < 10 ? '0' + n : n;
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    ['all', 'today', '7days', 'month'].forEach(p => {
        const btn = document.getElementById(`tx-range-${p}`);
        if (btn) {
            if (p === preset) {
                btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 shadow-xs';
            } else {
                btn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900';
            }
        }
    });

    const startInput = document.getElementById('tx-start-date');
    const endInput = document.getElementById('tx-end-date');

    if (preset === 'all') {
        startInput.value = '';
        endInput.value = '';
    } else if (preset === 'today') {
        startInput.value = fmt(today);
        endInput.value = fmt(today);
    } else if (preset === '7days') {
        const d = new Date(today);
        d.setDate(d.getDate() - 7);
        startInput.value = fmt(d);
        endInput.value = fmt(today);
    } else if (preset === 'month') {
        const d = new Date(today.getFullYear(), today.getMonth(), 1);
        startInput.value = fmt(d);
        endInput.value = fmt(today);
    }
    loadTransactions();
}

let txSearchTimeout = null;
function handleTxSearch(e) {
    clearTimeout(txSearchTimeout);
    txSearchTimeout = setTimeout(() => {
        loadTransactions();
    }, 300);
}

function openEditTxModal(txId) {
    const tx = cachedTransactions.find(t => String(t.id) === String(txId));
    if (!tx) return;

    document.getElementById('editTxId').value = tx.id;
    document.getElementById('editTxQuantity').value = tx.quantity;
    document.getElementById('editTxLot').value = tx.lot_number || '';
    document.getElementById('editTxCompany').value = tx.company_name || '';
    document.getElementById('editTxWorker').value = tx.worker || '';
    document.getElementById('editTxNote').value = tx.note || '';

    openModal('editTxModal');
}

async function submitEditTxForm(e) {
    e.preventDefault();
    const txId = document.getElementById('editTxId').value;
    const tx = cachedTransactions.find(t => String(t.id) === String(txId));
    const newQty = parseInt(document.getElementById('editTxQuantity').value);

    const updateData = {
        quantity: newQty,
        lot_number: document.getElementById('editTxLot').value.trim(),
        company_name: document.getElementById('editTxCompany').value.trim(),
        worker: document.getElementById('editTxWorker').value.trim(),
        note: document.getElementById('editTxNote').value.trim()
    };

    try {
        if (isFirebaseConfigured && cloudDb) {
            const delta = newQty - (tx.quantity || 0);
            const item = cachedItems.find(i => String(i.id) === String(tx.item_id));
            if (item) {
                const newStock = tx.tx_type === 'in' ? item.current_stock + delta : item.current_stock - delta;
                await cloudDb.collection('items').doc(String(item.id)).update({ current_stock: newStock });
            }
            await cloudDb.collection('transactions').doc(String(txId)).update(updateData);
        } else {
            const res = await fetch(`/api/transactions/${txId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '수정에 실패했습니다.');
            }
        }

        closeModal('editTxModal');
        Swal.fire('수정 완료', '입출고 이력 및 현재고가 정정되었습니다.', 'success');
        loadTransactions();
    } catch (err) {
        Swal.fire('오류', err.message, 'error');
    }
}

async function cancelTransaction(txId) {
    const tx = cachedTransactions.find(t => String(t.id) === String(txId));
    if (!tx) return;

    const result = await Swal.fire({
        title: '거래 이력 취소 확인',
        text: '해당 거래를 취소하면 재고가 거래 이전 상태로 자동 복원됩니다. 계속하시겠습니까?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: '거래 취소 및 재고 롤백',
        cancelButtonText: '닫기'
    });

    if (result.isConfirmed) {
        try {
            if (isFirebaseConfigured && cloudDb) {
                const item = cachedItems.find(i => String(i.id) === String(tx.item_id));
                if (item) {
                    const newStock = tx.tx_type === 'in' ? item.current_stock - tx.quantity : item.current_stock + tx.quantity;
                    await cloudDb.collection('items').doc(String(item.id)).update({ current_stock: newStock });
                }
                await cloudDb.collection('transactions').doc(String(txId)).delete();
            } else {
                const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || '거래 취소에 실패했습니다.');
                }
            }
            Swal.fire('취소 완료', '거래가 취소되고 재고가 정상 복원되었습니다.', 'success');
            loadTransactions();
        } catch (err) {
            Swal.fire('오류', err.message, 'error');
        }
    }
}

// ==============================================================================
// 4. 생산 관리 & BOM 조립 (PRODUCTION)
// ==============================================================================

let allProductsList = [];

async function loadProductionTab() {
    allProductsList = (cachedItems || []).filter(i => i.item_type === 'product');
    const countEl = document.getElementById('bom-product-count');
    if (countEl) countEl.innerText = `총 ${allProductsList.length}개`;

    renderBOMProductList(allProductsList);

    if (allProductsList.length > 0 && !selectedBOMProductId) {
        selectProductForBOM(allProductsList[0].id);
    } else if (selectedBOMProductId) {
        selectProductForBOM(selectedBOMProductId);
    }
}

function renderBOMProductList(products) {
    const container = document.getElementById('bom-product-list');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">등록된 완제품이 없습니다.</div>`;
        return;
    }

    let html = '';
    products.forEach(p => {
        const isSelected = String(p.id) === String(selectedBOMProductId);
        html += `
            <button onclick="selectProductForBOM('${p.id}')" class="w-full text-left p-3 rounded-xl border transition-all ${isSelected ? 'bg-teal-50/80 border-teal-500 shadow-xs' : 'bg-white border-slate-200/80 hover:bg-slate-50'}">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-[11px] font-bold font-mono text-teal-700">${p.item_code}</span>
                    <span class="text-[11px] text-slate-500 font-semibold">재고: ${p.current_stock} ${p.unit}</span>
                </div>
                <h4 class="text-xs font-bold text-slate-900 truncate">${p.name}</h4>
                <p class="text-[11px] text-slate-500 truncate">${p.spec || '-'}</p>
            </button>
        `;
    });
    container.innerHTML = html;
}

function filterBOMProductList() {
    const q = document.getElementById('bom-search-input')?.value.toLowerCase() || '';
    const filtered = allProductsList.filter(p => p.name.toLowerCase().includes(q) || (p.item_code && p.item_code.toLowerCase().includes(q)) || (p.spec && p.spec.toLowerCase().includes(q)));
    renderBOMProductList(filtered);
}

async function selectProductForBOM(productId) {
    selectedBOMProductId = productId;
    renderBOMProductList(allProductsList);

    const item = cachedItems.find(i => String(i.id) === String(productId));
    if (!item) return;

    document.getElementById('bom-detail-code').innerText = item.item_code;
    document.getElementById('bom-detail-name').innerText = item.name;
    document.getElementById('bom-detail-spec').innerText = `규격: ${item.spec || '-'} | 적재위치: ${item.location || '-'} | 현재고: ${item.current_stock} ${item.unit}`;

    // Fetch BOM
    let bomList = [];
    if (isFirebaseConfigured && cloudDb) {
        const snap = await cloudDb.collection('bom_items').where('product_id', '==', String(productId)).get();
        snap.forEach(doc => {
            const b = doc.data();
            const part = cachedItems.find(p => String(p.id) === String(b.part_id));
            if (part) {
                bomList.push({
                    id: doc.id,
                    part_id: part.id,
                    part_code: part.item_code,
                    part_name: part.name,
                    spec: part.spec,
                    unit: part.unit,
                    current_stock: part.current_stock,
                    quantity_required: b.quantity_required
                });
            }
        });
    } else {
        try {
            const bomRes = await fetch(`/api/bom/${productId}`);
            bomList = await bomRes.json();
        } catch (e) { }
    }

    currentBOMData = bomList;
    const tableBody = document.getElementById('bom-parts-table-body');
    if (bomList.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="py-10 text-center text-slate-400 text-xs">
                    <i class="fa-solid fa-layer-group text-slate-300 text-2xl mb-2 block"></i>
                    설정된 부품 소요량(BOM)이 없습니다.<br>
                    <button onclick="openEditBOMModal()" class="mt-2 text-brand-600 hover:underline font-bold">+ BOM 부품 구성 설정하기</button>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    bomList.forEach(b => {
        const hasStock = b.current_stock >= b.quantity_required;
        html += `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-2.5 px-3 font-mono font-semibold text-indigo-700">${b.part_code}</td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${b.part_name}</td>
                <td class="py-2.5 px-3 text-slate-500">${b.spec}</td>
                <td class="py-2.5 px-3 text-right font-extrabold text-teal-700">${b.quantity_required} ${b.unit}</td>
                <td class="py-2.5 px-3 text-right font-semibold ${hasStock ? 'text-slate-800' : 'text-rose-600'}">${b.current_stock} ${b.unit}</td>
                <td class="py-2.5 px-3 text-center">
                    ${hasStock ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">충족</span>' : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">부족</span>'}
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// Production Modal & Execution
function openProductionModal(preselectedId = null) {
    document.getElementById('productionForm').reset();
    preloadItemOptions().then(() => {
        const prodSelect = document.getElementById('prodModalProductId');
        if (preselectedId) {
            prodSelect.value = preselectedId;
        } else if (selectedBOMProductId) {
            prodSelect.value = selectedBOMProductId;
        }
        calculateProductionRequirements();
    });
    openModal('productionModal');
}

function quickProduceSelectedProduct() {
    if (selectedBOMProductId) {
        openProductionModal(selectedBOMProductId);
    }
}

async function calculateProductionRequirements() {
    const productId = document.getElementById('prodModalProductId').value;
    const qty = parseInt(document.getElementById('prodModalQuantity').value) || 0;
    const previewContainer = document.getElementById('prod-parts-preview');
    const badge = document.getElementById('prod-stock-check-badge');
    const submitBtn = document.getElementById('btn-execute-production');

    if (!productId || qty <= 0) {
        previewContainer.innerHTML = '<p class="text-slate-400 text-center py-2">완제품과 수량을 지정하세요.</p>';
        return;
    }

    let bomList = [];
    if (isFirebaseConfigured && cloudDb) {
        const snap = await cloudDb.collection('bom_items').where('product_id', '==', String(productId)).get();
        snap.forEach(doc => {
            const b = doc.data();
            const part = cachedItems.find(p => String(p.id) === String(b.part_id));
            if (part) bomList.push({ ...b, part_name: part.name, spec: part.spec, unit: part.unit, current_stock: part.current_stock });
        });
    } else {
        const res = await fetch(`/api/bom/${productId}`);
        bomList = await res.json();
    }

    if (bomList.length === 0) {
        previewContainer.innerHTML = '<p class="text-rose-500 text-center py-2">이 완제품에 설정된 BOM(부품 소요량)이 없습니다.</p>';
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700';
        badge.innerText = 'BOM 없음';
        return;
    }

    let allSufficient = true;
    let html = '';

    bomList.forEach(b => {
        const needed = b.quantity_required * qty;
        const isOk = b.current_stock >= needed;
        if (!isOk) allSufficient = false;

        html += `
            <div class="flex items-center justify-between py-1 border-b border-slate-200/60 last:border-0">
                <span class="text-slate-800 font-medium">${b.part_name} (${b.spec})</span>
                <div class="text-right">
                    <span class="text-slate-500">필요: <b>${needed}</b> ${b.unit}</span>
                    <span class="ml-2 ${isOk ? 'text-emerald-600' : 'text-rose-600 font-bold'}">
                        (현재: ${b.current_stock} ${b.unit})
                    </span>
                </div>
            </div>
        `;
    });

    previewContainer.innerHTML = html;

    if (allSufficient) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700';
        badge.innerText = '재고 충족 (생산 가능)';
        submitBtn.disabled = false;
    } else {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse';
        badge.innerText = '부품 재고 부족!';
    }
}

async function submitProductionForm(e) {
    e.preventDefault();
    const productId = document.getElementById('prodModalProductId').value;
    const qty = parseInt(document.getElementById('prodModalQuantity').value);
    const lot = document.getElementById('prodModalLot').value.trim() || `LOT-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`;
    const worker = document.getElementById('prodModalWorker').value.trim() || '생산팀';
    const note = document.getElementById('prodModalNote').value.trim();

    if (!productId || qty <= 0) return;

    try {
        if (isFirebaseConfigured && cloudDb) {
            const product = cachedItems.find(i => String(i.id) === String(productId));
            const snap = await cloudDb.collection('bom_items').where('product_id', '==', String(productId)).get();
            const bomList = [];
            snap.forEach(d => bomList.push(d.data()));

            if (bomList.length === 0) throw new Error('BOM 구성이 없습니다.');

            const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

            // Deduct parts
            for (const b of bomList) {
                const part = cachedItems.find(p => String(p.id) === String(b.part_id));
                const totalNeeded = b.quantity_required * qty;
                await cloudDb.collection('items').doc(String(part.id)).update({ current_stock: part.current_stock - totalNeeded });
                await cloudDb.collection('transactions').add({
                    item_id: part.id,
                    item_code: part.item_code,
                    item_name: part.name,
                    item_type: 'part',
                    item_spec: part.spec || '-',
                    unit: part.unit || 'EA',
                    tx_type: 'out',
                    sub_type: '생산투입출고',
                    quantity: totalNeeded,
                    worker: worker,
                    lot_number: lot,
                    company_name: '사내생산라인',
                    timestamp: nowStr,
                    note: `[${product.name}] ${qty}개 생산 투입 소모`
                });
            }

            // Add product
            await cloudDb.collection('items').doc(String(productId)).update({ current_stock: product.current_stock + qty });
            await cloudDb.collection('transactions').add({
                item_id: product.id,
                item_code: product.item_code,
                item_name: product.name,
                item_type: 'product',
                item_spec: product.spec || '-',
                unit: product.unit || 'EA',
                tx_type: 'in',
                sub_type: '생산완료입고',
                quantity: qty,
                worker: worker,
                lot_number: lot,
                company_name: '사내생산라인',
                timestamp: nowStr,
                note: note || `완제품 ${qty}개 생산 완료`
            });

        } else {
            const res = await fetch('/api/production', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: parseInt(productId),
                    quantity: qty,
                    lot_number: lot,
                    worker: worker,
                    note: note
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || '생산 처리에 실패했습니다.');
        }

        closeModal('productionModal');
        Swal.fire({
            icon: 'success',
            title: '생산 작업 완료!',
            html: `
                <div class="text-left text-xs space-y-2 mt-2">
                    <p class="text-sm font-bold text-slate-800">완제품 ${qty}개 생산 입고 및 소요 부품 차감이 완료되었습니다.</p>
                    <div class="p-3 bg-slate-100 rounded-xl font-mono">
                        발급된 LOT: <strong class="text-teal-700">${lot}</strong>
                    </div>
                </div>
            `,
            confirmButtonColor: '#0d9488'
        });

        loadProductionTab();
    } catch (err) {
        Swal.fire('생산 실행 오류', err.message, 'error');
    }
}

// Edit BOM Configuration
async function openEditBOMModal() {
    if (!selectedBOMProductId) return;

    document.getElementById('editBomProductId').value = selectedBOMProductId;
    const prod = allProductsList.find(p => String(p.id) === String(selectedBOMProductId));
    if (prod) {
        document.getElementById('editBomModalSubtitle').innerText = `[${prod.name}] 1개 생산 시 소요되는 부품을 구성하세요.`;
    }

    const container = document.getElementById('editBomRowsContainer');
    container.innerHTML = '';

    const allParts = (cachedItems || []).filter(i => i.item_type === 'part');
    window._cachedPartsForBOM = allParts;

    if (currentBOMData.length === 0) {
        addBOMRow(allParts);
    } else {
        currentBOMData.forEach(b => {
            addBOMRow(allParts, b.part_id, b.quantity_required);
        });
    }

    openModal('editBomModal');
}

function addBOMRow(parts = null, selectedPartId = null, qty = 1) {
    const allParts = parts || window._cachedPartsForBOM || [];
    const container = document.getElementById('editBomRowsContainer');
    const rowId = 'bom-row-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5);

    const div = document.createElement('div');
    div.id = rowId;
    div.className = 'flex items-center space-x-2 p-2 bg-slate-50 rounded-xl border border-slate-200';

    div.innerHTML = `
        <select class="bom-part-select flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs">
            <option value="">부품을 선택하세요</option>
            ${allParts.map(p => `<option value="${p.id}" ${String(p.id) === String(selectedPartId) ? 'selected' : ''}>[${p.item_code}] ${p.name} (${p.spec || '-'})</option>`).join('')}
        </select>
        <div class="flex items-center space-x-1">
            <span class="text-xs text-slate-500 font-medium">소요량:</span>
            <input type="number" value="${qty}" min="1" class="bom-part-qty w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-teal-700">
        </div>
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-1.5 text-slate-400 hover:text-rose-600 rounded">
            <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
    `;
    container.appendChild(div);
}

async function saveBOMConfiguration() {
    const productId = document.getElementById('editBomProductId').value;
    const rows = document.querySelectorAll('#editBomRowsContainer > div');
    const parts = [];

    rows.forEach(r => {
        const partId = r.querySelector('.bom-part-select').value;
        const qty = parseInt(r.querySelector('.bom-part-qty').value);
        if (partId && qty > 0) {
            parts.push({ part_id: partId, quantity_required: qty });
        }
    });

    try {
        if (isFirebaseConfigured && cloudDb) {
            // Delete old BOM
            const snap = await cloudDb.collection('bom_items').where('product_id', '==', String(productId)).get();
            const batch = cloudDb.batch();
            snap.forEach(d => batch.delete(d.ref));
            await batch.commit();

            // Add new BOM
            for (const p of parts) {
                await cloudDb.collection('bom_items').add({
                    product_id: String(productId),
                    part_id: String(p.part_id),
                    quantity_required: p.quantity_required
                });
            }
        } else {
            const res = await fetch('/api/bom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: parseInt(productId), parts: parts })
            });
            if (!res.ok) throw new Error('BOM 저장에 실패했습니다.');
        }

        closeModal('editBomModal');
        Swal.fire('저장 완료', 'BOM 부품 구성이 성공적으로 등록되었습니다.', 'success');
        selectProductForBOM(productId);
    } catch (err) {
        Swal.fire('오류', err.message, 'error');
    }
}

// ==============================================================================
// 5. 월별 통계 및 보고서 (MONTHLY)
// ==============================================================================

async function loadMonthlyStats() {
    const year = parseInt(document.getElementById('monthly-year-select')?.value) || 2026;
    let stats = [];

    if (isFirebaseConfigured && cloudDb) {
        const statsMap = {};
        cachedTransactions.forEach(tx => {
            if (!tx.timestamp || !tx.timestamp.startsWith(String(year))) return;
            const month = tx.timestamp.substring(0, 7);
            const key = `${month}_${tx.item_id}`;
            const item = cachedItems.find(i => String(i.id) === String(tx.item_id)) || {};

            if (!statsMap[key]) {
                statsMap[key] = {
                    month,
                    item_code: tx.item_code || item.item_code || `ITM-${tx.item_id}`,
                    item_name: tx.item_name || item.name || '',
                    item_type: tx.item_type || item.item_type || 'part',
                    spec: tx.item_spec || item.spec || '-',
                    unit: tx.unit || item.unit || 'EA',
                    total_in: 0,
                    total_out: 0,
                    current_stock: item.current_stock || 0
                };
            }
            if (tx.tx_type === 'in') statsMap[key].total_in += (tx.quantity || 0);
            else statsMap[key].total_out += (tx.quantity || 0);
        });
        stats = Object.values(statsMap);
        stats.sort((a, b) => b.month.localeCompare(a.month) || a.item_name.localeCompare(b.item_name));
    } else {
        try {
            const res = await fetch(`/api/statistics/monthly?year=${year}`);
            stats = await res.json();
        } catch (err) {
            console.error('loadMonthlyStats error:', err);
        }
    }

    const tableBody = document.getElementById('monthly-table-body');
    if (!tableBody) return;

    if (stats.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">해당 연도의 집계 데이터가 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    stats.forEach(s => {
        const isPart = s.item_type === 'part';
        html += `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-4 font-mono font-bold text-slate-800">${s.month}</td>
                <td class="py-3 px-4 font-mono text-teal-700 font-semibold">${s.item_code}</td>
                <td class="py-3 px-4 font-bold text-slate-900">${s.item_name}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${isPart ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}">
                        ${isPart ? '부품' : '완제품'}
                    </span>
                </td>
                <td class="py-3 px-4 text-slate-500">${s.spec || '-'}</td>
                <td class="py-3 px-4 text-right font-extrabold text-sky-700">+${(s.total_in || 0).toLocaleString()} ${s.unit}</td>
                <td class="py-3 px-4 text-right font-extrabold text-rose-700">-${(s.total_out || 0).toLocaleString()} ${s.unit}</td>
                <td class="py-3 px-4 text-right font-bold text-slate-900">${(s.current_stock || 0).toLocaleString()} ${s.unit}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// ==============================================================================
// 6. 바코드 & QR 라벨 인쇄 (BARCODE & QR)
// ==============================================================================

async function printItemLabel(itemId) {
    try {
        let item = cachedItems.find(i => String(i.id) === String(itemId));
        if (!item && !isFirebaseConfigured) {
            const res = await fetch(`/api/items/${itemId}`);
            item = await res.json();
        }

        document.getElementById('label-type-badge').innerText = item.item_type === 'product' ? '완제품' : '생산부품';
        document.getElementById('label-location').innerText = item.location ? `위치: ${item.location}` : '';
        document.getElementById('label-item-name').innerText = item.name;
        document.getElementById('label-item-spec').innerText = `규격: ${item.spec || '-'} | 단위: ${item.unit || 'EA'}`;
        document.getElementById('label-safety').innerText = `${item.safety_stock} ${item.unit || 'EA'}`;
        document.getElementById('label-code-str').innerText = item.item_code;

        // 1. Generate Barcode with JsBarcode
        JsBarcode('#label-barcode-svg', item.item_code, {
            format: 'CODE128',
            width: 2,
            height: 45,
            displayValue: true,
            fontSize: 12,
            font: 'monospace',
            textMargin: 3
        });

        // 2. Generate QR Code with QRCode.js
        const qrContainer = document.getElementById('label-qrcode-container');
        qrContainer.innerHTML = '';
        const qrPayload = JSON.stringify({
            code: item.item_code,
            name: item.name,
            spec: item.spec,
            type: item.item_type
        });

        new QRCode(qrContainer, {
            text: qrPayload,
            width: 80,
            height: 80,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        openModal('labelModal');
    } catch (err) {
        Swal.fire('오류', '라벨 생성에 실패했습니다.', 'error');
    }
}

// ==============================================================================
// 7. 바코드 / QR 카메라 스캐너
// ==============================================================================

function openScannerModal() {
    openModal('scannerModal');
    setTimeout(() => {
        startQrScanner();
    }, 300);
}

function closeScannerModal() {
    stopQrScanner();
    closeModal('scannerModal');
}

function startQrScanner() {
    const readerDiv = document.getElementById('qr-reader');
    if (!readerDiv) return;

    if (!html5QrScanner) {
        html5QrScanner = new Html5Qrcode('qr-reader');
    }

    const qrConfig = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrScanner.start(
        { facingMode: 'environment' },
        qrConfig,
        (decodedText) => {
            stopQrScanner();
            closeModal('scannerModal');
            handleScannedBarcode(decodedText);
        },
        (errorMessage) => { }
    ).catch(err => {
        readerDiv.innerHTML = `
            <div class="p-6 text-center text-xs text-slate-300">
                <i class="fa-solid fa-camera-slash text-2xl text-slate-400 mb-2 block"></i>
                카메라에 접근할 수 없거나 웹캠이 비활성화 상태입니다.<br>
                아래에 바코드 번호를 직접 입력하거나 스캐너 건을 사용하세요.
            </div>
        `;
    });
}

function stopQrScanner() {
    if (html5QrScanner && html5QrScanner.isScanning) {
        html5QrScanner.stop().catch(err => console.log(err));
    }
}

function handleManualBarcodeKey(e) {
    if (e.key === 'Enter') {
        handleManualBarcodeSearch();
    }
}

function handleManualBarcodeSearch() {
    const text = document.getElementById('manualBarcodeInput')?.value.trim();
    if (text) {
        closeScannerModal();
        handleScannedBarcode(text);
    }
}

async function handleScannedBarcode(barcodeText) {
    let searchCode = barcodeText;
    try {
        const obj = JSON.parse(barcodeText);
        if (obj.code) searchCode = obj.code;
    } catch (e) { }

    const item = (cachedItems || []).find(i => i.item_code === searchCode || (i.name && i.name.includes(searchCode)));

    if (!item) {
        Swal.fire('품목 미발견', `스캔된 코드 [${searchCode}]에 해당하는 품목이 없습니다.`, 'warning');
        return;
    }

    const { value: action } = await Swal.fire({
        title: `[${item.item_code}] ${item.name}`,
        html: `규격: <b>${item.spec || '-'}</b> | 현재고: <strong class="text-teal-700 font-bold">${item.current_stock} ${item.unit}</strong><br>원하시는 작업을 선택하세요.`,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-arrow-down mr-1"></i> 입고 등록',
        denyButtonText: '<i class="fa-solid fa-arrow-up mr-1"></i> 출고 등록',
        cancelButtonText: '품목 상세 보기',
        confirmButtonColor: '#0284c7',
        denyButtonColor: '#e11d48'
    });

    if (action === true) {
        openInboundModal(item.id);
    } else if (action === false) {
        openOutboundModal(item.id);
    } else {
        switchTab('items');
        document.getElementById('item-search-input').value = item.item_code;
        loadItems();
    }
}

// ==============================================================================
// 8. 모바일 / 태블릿 현장 접속 안내 (NETWORK)
// ==============================================================================

async function openNetworkModal() {
    try {
        let url = window.location.origin;
        if (isFirebaseConfigured && firebaseConfig.projectId) {
            url = `https://${firebaseConfig.projectId}.web.app`;
        } else {
            const res = await fetch('/api/system/network-info');
            const net = await res.json();
            url = net.url;
        }

        document.getElementById('network-url-display').innerText = url;
        const qrContainer = document.getElementById('network-qrcode');
        qrContainer.innerHTML = '';

        new QRCode(qrContainer, {
            text: url,
            width: 140,
            height: 140,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        openModal('networkModal');
    } catch (err) {
        Swal.fire('오류', '네트워크 정보를 가져오지 못했습니다.', 'error');
    }
}

// ==============================================================================
// 9. 엑셀 연동 (EXCEL SHEETJS IMPORT & EXPORT)
// ==============================================================================

function downloadExcelTemplate() {
    const headers = [
        ["구분(part/product)", "품명", "규격", "카테고리", "단위", "적재위치", "단가", "초기재고", "안전재고", "비고"],
        ["part", "의료용 실리콘 튜브", "OD 2.0mm", "원자재", "M", "창고 A-01", 1200, 500, 200, "예시 데이터"],
        ["product", "경막외카테터", "EDEN-NC305", "완제품", "EA", "완제품실 B-1", 45000, 100, 50, "예시 데이터"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "품목등록양식");
    XLSX.writeFile(wb, "품목일괄등록_표준양식.xlsx");
}

function openExcelImportModal() {
    document.getElementById('excelFileInput').value = '';
    openModal('excelImportModal');
}

async function processExcelUpload() {
    const fileInput = document.getElementById('excelFileInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        Swal.fire('파일 선택', '업로드할 엑셀 파일을 선택해주세요.', 'warning');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rows.length < 2) {
                throw new Error('엑셀 파일에 유효한 데이터가 없습니다.');
            }

            const itemsToCreate = [];
            for (let i = 1; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length === 0 || !r[1]) continue;

                let type = (r[0] || 'part').toString().trim().toLowerCase();
                if (type.includes('완') || type.includes('prod')) type = 'product';
                else type = 'part';

                itemsToCreate.push({
                    item_type: type,
                    name: String(r[1]).trim(),
                    spec: r[2] ? String(r[2]).trim() : null,
                    category: r[3] ? String(r[3]).trim() : (type === 'product' ? '완제품' : '원자재'),
                    unit: r[4] ? String(r[4]).trim() : 'EA',
                    location: r[5] ? String(r[5]).trim() : null,
                    unit_price: parseInt(r[6]) || 0,
                    current_stock: parseInt(r[7]) || 0,
                    safety_stock: parseInt(r[8]) || 0,
                    note: r[9] ? String(r[9]).trim() : null
                });
            }

            if (itemsToCreate.length === 0) {
                throw new Error('등록할 품목 데이터가 없습니다.');
            }

            if (isFirebaseConfigured && cloudDb) {
                const batch = cloudDb.batch();
                itemsToCreate.forEach((item, idx) => {
                    const newId = Date.now() + idx;
                    const prefix = item.item_type === 'product' ? 'PRD' : 'PRT';
                    item.id = newId;
                    item.item_code = `${prefix}-${String(newId).slice(-4)}`;
                    const ref = cloudDb.collection('items').doc(String(newId));
                    batch.set(ref, item);
                });
                await batch.commit();
            } else {
                const res = await fetch('/api/items/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemsToCreate)
                });
                await res.json();
            }

            closeModal('excelImportModal');
            Swal.fire({
                icon: 'success',
                title: '일괄 등록 완료',
                text: `총 ${itemsToCreate.length}개 품목이 성공적으로 등록되었습니다.`
            });

            loadItems();
        } catch (err) {
            Swal.fire('엑셀 처리 오류', err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// Full Excel Backup
async function downloadAllDataExcel() {
    try {
        Swal.fire({
            title: '엑셀 백업 파일 생성 중...',
            text: '잠시만 기다려주세요.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const items = cachedItems || [];
        const txs = cachedTransactions || [];

        const wb = XLSX.utils.book_new();

        // 1. Items Sheet
        const itemsData = [
            ["품목코드", "구분", "카테고리", "품명", "규격/사양", "단위", "적재위치", "단가(원)", "현재고", "안전재고", "비고"]
        ];
        items.forEach(i => {
            itemsData.push([
                i.item_code,
                i.item_type === 'product' ? '완제품' : '생산부품',
                i.category,
                i.name,
                i.spec,
                i.unit,
                i.location,
                i.unit_price,
                i.current_stock,
                i.safety_stock,
                i.note
            ]);
        });
        const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
        XLSX.utils.book_append_sheet(wb, wsItems, "품목마스터");

        // 2. Transactions Sheet
        const txData = [
            ["일시", "거래구분", "세부유형", "품목코드", "품명", "구분", "규격", "수량", "단위", "LOT번호", "거래처/출하처", "담당자", "비고"]
        ];
        txs.forEach(t => {
            txData.push([
                t.timestamp,
                t.tx_type === 'in' ? '입고' : '출고',
                t.sub_type,
                t.item_code,
                t.item_name,
                t.item_type === 'product' ? '완제품' : '생산부품',
                t.item_spec,
                t.quantity,
                t.unit,
                t.lot_number,
                t.company_name,
                t.worker,
                t.note
            ]);
        });
        const wsTx = XLSX.utils.aoa_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, wsTx, "입출고수불부");

        const todayStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `스마트재고관리_데이터백업_${todayStr}.xlsx`);
        Swal.close();

    } catch (err) {
        Swal.fire('다운로드 오류', '엑셀 백업 생성 중 문제가 발생했습니다.', 'error');
    }
}

function exportItemsExcel() {
    const itemsData = [
        ["품목코드", "구분", "카테고리", "품명", "규격/사양", "단위", "적재위치", "단가(원)", "현재고", "안전재고", "비고"]
    ];
    (cachedItems || []).forEach(i => {
        itemsData.push([
            i.item_code,
            i.item_type === 'product' ? '완제품' : '생산부품',
            i.category,
            i.name,
            i.spec,
            i.unit,
            i.location,
            i.unit_price,
            i.current_stock,
            i.safety_stock,
            i.note
        ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(itemsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "품목목록");
    XLSX.writeFile(wb, `품목마스터_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportTransactionsExcel() {
    const txData = [
        ["일시", "거래구분", "세부유형", "품목코드", "품명", "구분", "규격", "수량", "단위", "LOT번호", "거래처/출하처", "담당자", "비고"]
    ];
    (cachedTransactions || []).forEach(t => {
        txData.push([
            t.timestamp,
            t.tx_type === 'in' ? '입고' : '출고',
            t.sub_type,
            t.item_code,
            t.item_name,
            t.item_type === 'product' ? '완제품' : '생산부품',
            t.item_spec,
            t.quantity,
            t.unit,
            t.lot_number,
            t.company_name,
            t.worker,
            t.note
        ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(txData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "수불부");
    XLSX.writeFile(wb, `입출고수불부_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function exportMonthlyStatsExcel() {
    const year = parseInt(document.getElementById('monthly-year-select')?.value) || 2026;
    const res = await fetch(`/api/statistics/monthly?year=${year}`);
    const stats = await res.json();

    const data = [
        ["기준월", "품목코드", "품명", "구분", "규격", "월간총입고", "월간총출고", "현재고", "단위"]
    ];
    stats.forEach(m => {
        data.push([
            m.month,
            m.item_code,
            m.item_name,
            m.item_type === 'product' ? '완제품' : '생산부품',
            m.spec,
            m.total_in,
            m.total_out,
            m.current_stock,
            m.unit
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}년_월별집계`);
    XLSX.writeFile(wb, `월별통계보고서_${year}년.xlsx`);
}
