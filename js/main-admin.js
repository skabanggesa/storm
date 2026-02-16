/**
 * ==============================================================================
 * SISTEM PENGURUSAN KEJOHANAN OLAHRAGA TAHUNAN (KOT) - VERSI PRO 2.0
 * ==============================================================================
 * * FAIL: main-admin.js
 * PENERANGAN:
 * Fail ini adalah "otak" utama untuk panel pentadbir (Admin Dashboard).
 * Ia mengawal semua interaksi UI, aliran data ke Firebase, dan logik perniagaan
 * untuk pengurusan kejohanan.
 * * KEMASKINI TERKINI:
 * 1. Penggabungan Modul: Menu 'Input Keputusan' telah diserap masuk ke dalam 'Urus Acara'.
 * 2. Input Data: Admin kini boleh memasukkan keputusan terus dari paparan saringan.
 * 3. Mod Cetakan: Sistem kini mempunyai butang 'Preview Cetak' untuk menyembunyikan
 * kotak input semasa mencetak borang rasmi.
 * 4. Verbose Logging: Penambahan sistem log dalaman untuk pemantauan ralat.
 * * ==============================================================================
 */

// ==============================================================================
// BAHAGIAN A: IMPORT MODUL DAN PENGISYTIHARAN PEMBOLEHUBAH
// ==============================================================================

import { 
    initializeTournament, 
    getEventsReadyForResults, 
    getHeatsData, 
    saveHeatResults,
    getEventDetail,
    saveBulkRecords,
    generateHeats,
    ACARA_PADANG,
    ACARA_KHAS
} from './modules/admin.js';

import { highJumpLogic } from './modules/highjump-logic.js'; 
import { db } from './firebase-config.js';

// Import fungsi-fungsi Firestore dari URL CDN
import { 
    doc, 
    getDoc, 
    updateDoc, 
    setDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    writeBatch,
    deleteDoc,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- PEMBOLEHUBAH GLOBAL ---

/**
 * Tahun aktif yang sedang diuruskan.
 * Diambil dari sessionStorage atau tahun semasa.
 */
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();

/**
 * Pembolehubah sementara untuk menyimpan data saringan yang sedang dibuka.
 * Digunakan untuk tujuan 'cache' sebelum disimpan ke database.
 */
let currentHeatDataCache = null;

/**
 * ID elemen utama di mana kandungan akan dipaparkan.
 */
const contentArea = document.getElementById('content-area');

// Inisialisasi awal sistem
console.group("Sistem STORMS (Admin) - Inisialisasi");
console.info("Masa Mula:", new Date().toLocaleString());
console.info("Tahun Aktif:", tahunAktif);
console.groupEnd();

// Menyuntik CSS Khas untuk Cetakan secara Dinamik
injectPrintStyles();

// ==============================================================================
// BAHAGIAN B: PENGURUSAN NAVIGASI & SESI
// ==============================================================================

// 1. Event Listener: Log Keluar
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
}

/**
 * Fungsi untuk mengendalikan proses log keluar.
 * Membersihkan sesi dan mengembalikan pengguna ke halaman login.
 */
function handleLogout() {
    const confirmation = confirm(
        "Adakah anda pasti mahu log keluar?\n\n" +
        "Sebarang perubahan yang belum disimpan mungkin akan hilang."
    );

    if (confirmation) {
        logSystemAction("LOGOUT", "Pengguna log keluar dari sistem.");
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}

// 2. Event Listener: Menu Navigasi Sidebar

// Menu: Setup & Utiliti
const menuSetup = document.getElementById('menu-setup');
if (menuSetup) {
    menuSetup.addEventListener('click', () => {
        setActiveMenu('menu-setup');
        renderSetupDashboard();
    });
}

// Menu: Urus Acara & Keputusan (Digabungkan)
const menuAcara = document.getElementById('menu-acara');
if (menuAcara) {
    menuAcara.innerHTML = '<i class="bi bi-trophy me-2"></i>Urus Acara & Keputusan';
    menuAcara.addEventListener('click', () => {
        setActiveMenu('menu-acara');
        renderSenaraiAcara();
    });
}

// Menu Lama: Keputusan (Dibuang/Disembunyikan)
const menuKeputusan = document.getElementById('menu-keputusan');
if (menuKeputusan) {
    menuKeputusan.style.display = 'none'; // Sembunyikan dari pandangan
}

/**
 * Fungsi utiliti untuk menukar kelas 'active' pada sidebar.
 * @param {string} activeId - ID elemen menu yang dipilih.
 */
function setActiveMenu(activeId) {
    const menus = ['menu-setup', 'menu-acara'];
    menus.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === activeId) {
                el.classList.add('active');
                el.classList.add('bg-primary');
                el.classList.add('text-white');
            } else {
                el.classList.remove('active');
                el.classList.remove('bg-primary');
                el.classList.remove('text-white');
            }
        }
    });
}

// ==============================================================================
// BAHAGIAN C: DASHBOARD UTAMA & SETUP (STATISTIK)
// ==============================================================================

/**
 * Memaparkan papan pemuka (dashboard) utama.
 * Mengandungi statistik ringkas dan menu utiliti sistem.
 */
async function renderSetupDashboard() {
    // Paparan Loading Sementara
    contentArea.innerHTML = renderLoadingSpinner("Memuatkan Papan Pemuka...");

    // Dapatkan statistik ringkas (count)
    let stats = {
        totalAcara: 0,
        totalPeserta: 0,
        totalRumah: 4
    };

    try {
        // Kira Acara
        const acaraSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
        stats.totalAcara = acaraSnap.size;

        // Kira Peserta (Batch limit untuk performance jika perlu, di sini kita ambil saiz sahaja)
        const pesertaSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "peserta"));
        stats.totalPeserta = pesertaSnap.size;

    } catch (e) {
        console.error("Gagal memuatkan statistik:", e);
    }

    const html = `
        <div class="container-fluid animate__animated animate__fadeIn">
            <div class="row mb-4">
                <div class="col-12">
                    <h3 class="fw-bold text-dark border-start border-5 border-primary ps-3">
                        Papan Pemuka & Tetapan (${tahunAktif})
                    </h3>
                    <p class="text-muted ms-3 mb-0">Pusat kawalan utama sistem pengurusan kejohanan.</p>
                </div>
            </div>

            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card shadow-sm border-0 bg-primary text-white h-100">
                        <div class="card-body d-flex align-items-center">
                            <div class="display-4 me-3"><i class="bi bi-people-fill"></i></div>
                            <div>
                                <h5 class="card-title mb-0">Jumlah Atlet</h5>
                                <h2 class="fw-bold mb-0">${stats.totalPeserta}</h2>
                                <small>Peserta Berdaftar</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card shadow-sm border-0 bg-success text-white h-100">
                        <div class="card-body d-flex align-items-center">
                            <div class="display-4 me-3"><i class="bi bi-trophy-fill"></i></div>
                            <div>
                                <h5 class="card-title mb-0">Jumlah Acara</h5>
                                <h2 class="fw-bold mb-0">${stats.totalAcara}</h2>
                                <small>Dipertandingkan</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card shadow-sm border-0 bg-info text-white h-100">
                        <div class="card-body d-flex align-items-center">
                            <div class="display-4 me-3"><i class="bi bi-house-door-fill"></i></div>
                            <div>
                                <h5 class="card-title mb-0">Rumah Sukan</h5>
                                <h2 class="fw-bold mb-0">${stats.totalRumah}</h2>
                                <small>Pasukan Bertanding</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-lg-6 mb-4">
                    <div class="card shadow-sm h-100">
                        <div class="card-header bg-white fw-bold">
                            <i class="bi bi-database-gear me-2 text-primary"></i>Operasi Pangkalan Data
                        </div>
                        <div class="card-body">
                            <p class="text-muted small">Fungsi untuk memulakan tahun baru atau mengemaskini struktur data asas.</p>
                            
                            <button class="btn btn-outline-primary w-100 mb-2 text-start" id="btn-init">
                                <i class="bi bi-magic me-2"></i>Jana Struktur Awal (Tahun Baru)
                            </button>
                            
                            <button class="btn btn-outline-success w-100 mb-2 text-start" id="btn-manage-house">
                                <i class="bi bi-key me-2"></i>Urus Kata Laluan Rumah Sukan
                            </button>

                            <hr>

                            <p class="text-muted small">Zon Bahaya & Penyelenggaraan:</p>
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-warning flex-fill" data-bs-toggle="modal" data-bs-target="#modalBackup">
                                    <i class="bi bi-download me-1"></i>Backup
                                </button>
                                <button class="btn btn-sm btn-secondary flex-fill" data-bs-toggle="modal" data-bs-target="#modalRestore">
                                    <i class="bi bi-upload me-1"></i>Restore
                                </button>
                                <button class="btn btn-sm btn-danger flex-fill" data-bs-toggle="modal" data-bs-target="#modalPadam">
                                    <i class="bi bi-trash me-1"></i>Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-lg-6 mb-4">
                    <div class="card shadow-sm h-100">
                        <div class="card-header bg-white fw-bold">
                            <i class="bi bi-file-earmark-spreadsheet me-2 text-success"></i>Import Data Pukal
                        </div>
                        <div class="card-body">
                            <p class="text-muted small">Muat naik fail CSV untuk mengemaskini rekod kejohanan terdahulu.</p>
                            <div class="alert alert-light border small">
                                <strong>Format CSV:</strong><br>
                                <code>REKOD, ACARA, KATEGORI, TAHUN, NAMA</code>
                            </div>
                            <button class="btn btn-success w-100" data-bs-toggle="modal" data-bs-target="#modalCSV">
                                <i class="bi bi-cloud-upload me-2"></i>Muat Naik CSV Rekod
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="house-list-container" class="mt-2"></div>

        </div>
    `;

    contentArea.innerHTML = html;

    // --- BIND EVENT LISTENERS UNTUK DASHBOARD ---

    // 1. Tombol Inisialisasi
    document.getElementById('btn-init').onclick = async () => {
        if(!confirm(`AMARAN PENTING:\n\nAdakah anda pasti mahu menjana struktur data untuk tahun ${tahunAktif}?\n\nJika data sudah wujud, ia TIDAK akan dipadam, tetapi acara default mungkin ditambah.`)) return;
        
        const defaultEvents = [
            { nama: "100m", kategori: "L1", jenis: "Balapan" },
            { nama: "200m", kategori: "L1", jenis: "Balapan" },
            { nama: "4x100m", kategori: "L1", jenis: "Balapan" },
            { nama: "Lompat Jauh", kategori: "L1", jenis: "Padang" },
            { nama: "Lontar Peluru", kategori: "L1", jenis: "Padang" }
        ];

        contentArea.innerHTML = renderLoadingSpinner("Menjana Struktur...");
        const res = await initializeTournament(tahunAktif, defaultEvents);
        
        if(res.success) {
            alert("Proses Selesai: Struktur database telah dijana.");
            renderSetupDashboard(); // Refresh
        } else {
            alert("Ralat: " + res.message);
            renderSetupDashboard();
        }
    };

    // 2. Tombol Urus Rumah
    document.getElementById('btn-manage-house').onclick = () => {
        renderSenaraiRumah();
    };
}

// ==============================================================================
// BAHAGIAN D: PENGURUSAN RUMAH SUKAN
// ==============================================================================

/**
 * Memaparkan senarai rumah sukan dan borang pengurusan kata laluan.
 */
async function renderSenaraiRumah() {
    const container = document.getElementById('house-list-container');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-success spinner-border-sm"></div>
            <span class="ms-2 text-muted">Mengambil data rumah sukan...</span>
        </div>
    `;

    // ID Rumah Standard (Boleh diubah mengikut keperluan sekolah)
    const rumahIds = ['merah', 'biru', 'hijau', 'kuning'];
    
    let tableHtml = `
        <div class="card border-0 shadow-sm animate__animated animate__fadeInUp">
            <div class="card-header bg-dark text-white py-2">
                <i class="bi bi-shield-lock me-2"></i>Konfigurasi Akses Rumah Sukan
            </div>
            <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle">
                    <thead class="table-light">
                        <tr>
                            <th class="ps-4">Rumah</th>
                            <th>Kod Akses (Password)</th>
                            <th>Status Data</th>
                            <th class="text-center">Tindakan</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    for (const id of rumahIds) {
        // Fetch data untuk setiap rumah
        const docRef = doc(db, "kejohanan", tahunAktif, "rumah", id);
        const docSnap = await getDoc(docRef);
        let kodSemasa = '';
        let dataWujud = false;
        
        if (docSnap.exists()) {
            kodSemasa = docSnap.data().kod || '';
            dataWujud = true;
        }

        // Setup UI colors
        let badgeColor = 'secondary';
        if(id==='merah') badgeColor='danger';
        if(id==='biru') badgeColor='primary';
        if(id==='hijau') badgeColor='success';
        if(id==='kuning') badgeColor='warning text-dark';

        tableHtml += `
            <tr>
                <td class="ps-4">
                    <span class="badge bg-${badgeColor} p-2 px-3 rounded-pill text-uppercase shadow-sm" style="min-width: 80px;">
                        ${id}
                    </span>
                </td>
                <td>
                    <div class="input-group input-group-sm" style="max-width: 200px;">
                        <span class="input-group-text bg-white"><i class="bi bi-key text-muted"></i></span>
                        <input type="text" class="form-control font-monospace fw-bold" 
                               id="input-kod-${id}" 
                               value="${kodSemasa}" 
                               placeholder="Set Password...">
                    </div>
                </td>
                <td>
                    ${dataWujud ? 
                        '<span class="badge bg-light text-success border border-success"><i class="bi bi-check-circle me-1"></i>Aktif</span>' : 
                        '<span class="badge bg-light text-muted border"><i class="bi bi-dash-circle me-1"></i>Belum Setup</span>'
                    }
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-primary px-3 rounded-pill shadow-sm" onclick="simpanKodRumah('${id}')">
                        <i class="bi bi-save me-1"></i> Simpan
                    </button>
                </td>
            </tr>
        `;
    }

    tableHtml += `
                    </tbody>
                </table>
            </div>
            <div class="card-footer bg-light text-muted small">
                Nota: Kod akses ini perlu diberikan kepada Ketua Rumah Sukan masing-masing untuk pendaftaran atlet.
            </div>
        </div>
    `;

    container.innerHTML = tableHtml;
}

/**
 * Fungsi global untuk menyimpan kod rumah sukan ke Firestore.
 * Dilampirkan pada window object supaya boleh dipanggil dari HTML string event handler.
 * @param {string} idRumah - ID rumah sukan (cth: 'merah').
 */
window.simpanKodRumah = async (idRumah) => {
    const inputEl = document.getElementById(`input-kod-${idRumah}`);
    const kodBaru = inputEl.value.trim();
    
    // Validasi Input
    if (!kodBaru) {
        inputEl.classList.add('is-invalid');
        alert("Sila masukkan kod akses yang sah (Tidak boleh kosong).");
        return;
    } else {
        inputEl.classList.remove('is-invalid');
    }

    // UI Loading pada butang yang ditekan
    const btn = event.currentTarget; 
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;

    try {
        const docRef = doc(db, "kejohanan", tahunAktif, "rumah", idRumah);
        
        // Simpan (Merge true penting untuk elak data lain hilang)
        await setDoc(docRef, { 
            kod: kodBaru,
            nama: idRumah.toUpperCase(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        // Feedback Visual Berjaya
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        btn.innerHTML = '<i class="bi bi-check-lg"></i> OK';
        
        logSystemAction("UPDATE_HOUSE", `Kod akses rumah ${idRumah} dikemaskini.`);

        setTimeout(() => {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-primary');
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }, 1500);

    } catch (error) {
        console.error("Ralat menyimpan kod rumah:", error);
        alert("Ralat pelayan: " + error.message);
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
};

// ==============================================================================
// BAHAGIAN E: SENARAI ACARA & PENGURUSAN UTAMA
// ==============================================================================

/**
 * Memaparkan senarai semua acara yang terdapat dalam sistem.
 * Senarai ini menggabungkan fungsi pengurusan saringan dan input keputusan.
 */
async function renderSenaraiAcara() {
    contentArea.innerHTML = renderLoadingSpinner("Menyediakan senarai acara...");
    
    // Dapatkan data acara
    let acara = [];
    try {
        acara = await getEventsReadyForResults(tahunAktif);
    } catch (err) {
        console.error(err);
        contentArea.innerHTML = renderErrorAlert("Gagal memuatkan senarai acara. Sila semak sambungan internet.");
        return;
    }

    // Susun acara: Nama (A-Z) -> Kategori (L/P)
    acara.sort((a, b) => {
        const namaA = a.nama.toUpperCase();
        const namaB = b.nama.toUpperCase();
        if (namaA !== namaB) return namaA < namaB ? -1 : 1;
        
        const katA = a.kategori.toUpperCase();
        const katB = b.kategori.toUpperCase();
        return katA < katB ? -1 : 1;
    });

    let html = `
        <div class="container-fluid animate__animated animate__fadeIn">
            <div class="row align-items-center mb-4 pb-3 border-bottom">
                <div class="col-md-7">
                    <h4 class="fw-bold text-dark mb-1">
                        <i class="bi bi-list-check me-2 text-primary"></i>Senarai Acara
                    </h4>
                    <p class="text-muted small mb-0">
                        Pilih acara untuk mengurus saringan, mencetak borang, atau memasukkan keputusan rasmi.
                    </p>
                </div>
                <div class="col-md-5 mt-3 mt-md-0 d-print-none">
                    <div class="input-group shadow-sm">
                        <span class="input-group-text bg-white border-end-0 text-muted">
                            <i class="bi bi-search"></i>
                        </span>
                        <input type="text" id="search-acara" class="form-control border-start-0" 
                               placeholder="Cari acara (Cth: 100m, L1, Padang)...">
                    </div>
                </div>
            </div>

            <div class="row g-3" id="container-acara">
    `;
    
    if(acara.length === 0) {
        html += `
            <div class="col-12 text-center py-5">
                <div class="mb-3">
                    <i class="bi bi-clipboard-x text-muted" style="font-size: 4rem; opacity: 0.5;"></i>
                </div>
                <h5 class="text-muted fw-bold">Tiada Acara Dijumpai</h5>
                <p class="text-muted small">
                    Pangkalan data acara kosong untuk tahun ${tahunAktif}.<br>
                    Sila pergi ke menu <strong>Setup</strong> untuk menjana data awal.
                </p>
            </div>
        `;
    } else {
        acara.forEach(a => {
            // Tentukan ikon berdasarkan jenis
            let iconJenis = 'bi-stopwatch'; // Default Balapan
            let warnaBadge = 'bg-info bg-opacity-10 text-info border-info';
            
            if (a.jenis === 'Padang') {
                iconJenis = 'bi-bullseye';
                warnaBadge = 'bg-success bg-opacity-10 text-success border-success';
            }

            html += `
                <div class="col-xl-3 col-lg-4 col-md-6 acara-card-container">
                    <div class="card shadow-sm border-0 h-100 hover-elevate transition-all">
                        <div class="card-body d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="badge ${warnaBadge} border px-2 py-1 rounded-pill">
                                    <i class="bi ${iconJenis} me-1"></i>${a.jenis || 'Umum'}
                                </span>
                                <span class="badge bg-secondary bg-opacity-10 text-dark border px-2 py-1 rounded-pill">
                                    ${a.kategori}
                                </span>
                            </div>
                            
                            <h5 class="card-title fw-bold text-dark text-truncate mb-1" title="${a.nama}">
                                ${a.nama}
                            </h5>
                            
                            <p class="card-text text-muted small flex-grow-1">
                                Klik untuk urus saringan dan keputusan.
                            </p>

                            <button class="btn btn-outline-primary w-100 fw-bold rounded-3 mt-3 stretched-link" 
                                    onclick="bukaSaringan('${a.id}', '${a.nama} ${a.kategori}')">
                                <i class="bi bi-pencil-square me-2"></i>Urus & Keputusan
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    html += `</div></div>`; // Tutup row & container
    
    contentArea.innerHTML = html;

    // Logik Carian (Client-Side Filtering)
    const searchInput = document.getElementById('search-acara');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('.acara-card-container');
            
            let foundCount = 0;
            cards.forEach(card => {
                const text = card.innerText.toLowerCase();
                if (text.includes(keyword)) {
                    card.style.display = "block";
                    card.classList.add("animate__animated", "animate__fadeIn");
                    foundCount++;
                } else {
                    card.style.display = "none";
                }
            });
        });
    }
}

// ==============================================================================
// BAHAGIAN F: PENGURUSAN SARINGAN (HEATS)
// ==============================================================================

/**
 * Memaparkan senarai saringan yang tersedia bagi acara yang dipilih.
 * Jika tiada saringan, memaparkan butang untuk menjana saringan.
 * * @param {string} eventId - ID dokumen acara.
 * @param {string} label - Nama paparan acara (Cth: "100m L1").
 */
window.bukaSaringan = async (eventId, label) => {
    contentArea.innerHTML = renderLoadingSpinner("Menyemak status saringan...");
    
    let heats = [];
    try {
        heats = await getHeatsData(tahunAktif, eventId);
    } catch (e) {
        console.error("Ralat data saringan:", e);
        contentArea.innerHTML = renderErrorAlert("Ralat pelayan semasa memuatkan saringan.");
        return;
    }
    
    // Header UI
    let htmlHeader = `
        <div class="container-fluid animate__animated animate__fadeIn">
            <div class="d-flex align-items-center mb-4 pb-2 border-bottom d-print-none">
                <button class="btn btn-light border shadow-sm me-3 rounded-circle p-2" 
                        onclick="renderSenaraiAcara()" title="Kembali ke Senarai">
                    <i class="bi bi-arrow-left"></i>
                </button>
                <div>
                    <h4 class="mb-0 fw-bold text-primary">${label}</h4>
                    <span class="text-muted small">Pengurusan Saringan & Keputusan</span>
                </div>
            </div>
    `;

    let htmlContent = '';

    // KES 1: Tiada Saringan Wujud
    if (heats.length === 0) {
        htmlContent = `
            <div class="row justify-content-center mt-5">
                <div class="col-md-8 text-center">
                    <div class="card border-0 shadow-lg p-5 rounded-4 bg-light">
                        <div class="mb-3">
                            <span class="d-inline-block bg-white p-4 rounded-circle shadow-sm">
                                <i class="bi bi-shuffle text-primary" style="font-size: 3rem;"></i>
                            </span>
                        </div>
                        <h3 class="fw-bold text-dark">Saringan Belum Dijana</h3>
                        <p class="text-muted mb-4 px-md-5">
                            Sistem mendapati belum ada saringan atau undian lorong untuk acara ini. 
                            Anda boleh menjana saringan secara automatik berdasarkan pendaftaran peserta.
                        </p>
                        
                        <button id="btn-jana-saringan" class="btn btn-primary btn-lg px-5 rounded-pill shadow hover-scale">
                            <i class="bi bi-magic me-2"></i>Jana Saringan Automatik
                        </button>
                    </div>
                </div>
            </div>
        `;
    } 
    // KES 2: Saringan Sudah Ada
    else {
        // Susun saringan (Saringan 1, 2, ... Akhir)
        heats.sort((a,b) => parseInt(a.noSaringan) - parseInt(b.noSaringan));

        htmlContent += `
            <div class="row justify-content-center">
                <div class="col-lg-10">
                    <div class="alert alert-info border-0 shadow-sm d-flex align-items-center mb-4">
                        <i class="bi bi-info-circle-fill fs-4 me-3"></i>
                        <div>
                            <strong>Pilih Sesi:</strong>
                            Klik pada saringan di bawah untuk melihat senarai nama, mencetak borang, atau memasukkan keputusan.
                        </div>
                    </div>
                    
                    <div class="list-group shadow-sm border-0 rounded-3 overflow-hidden">
        `;

        heats.forEach(h => {
            const isDone = (h.status === 'selesai');
            const statusBadge = isDone 
                ? `<span class="badge bg-success rounded-pill"><i class="bi bi-check-lg me-1"></i>Selesai</span>`
                : `<span class="badge bg-warning text-dark rounded-pill"><i class="bi bi-hourglass-split me-1"></i>Belum Selesai</span>`;
            
            let displayTitle = h.jenis === 'akhir' ? "ACARA AKHIR" : `SARINGAN ${h.noSaringan}`;
            let icon = h.jenis === 'akhir' ? 'bi-trophy-fill text-warning' : 'bi-flag-fill text-secondary';

            htmlContent += `
                <button class="list-group-item list-group-item-action p-4 d-flex justify-content-between align-items-center border-bottom"
                        onclick="paparkanPerincianSaringan('${eventId}', '${h.id}', '${label}', '${h.jenis}')">
                    <div class="d-flex align-items-center">
                        <div class="bg-light p-3 rounded-3 me-4 text-center" style="min-width: 60px;">
                            <i class="bi ${icon} fs-4"></i>
                        </div>
                        <div>
                            <h5 class="fw-bold mb-1 text-dark">${displayTitle}</h5>
                            <p class="mb-0 text-muted small">Klik untuk urus</p>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        ${statusBadge}
                        <i class="bi bi-chevron-right text-muted"></i>
                    </div>
                </button>
            `;
        });
        htmlContent += `</div></div></div>`;
    }

    contentArea.innerHTML = htmlHeader + htmlContent + `</div>`;

    // Bind Event: Jana Saringan
    const btnJana = document.getElementById('btn-jana-saringan');
    if (btnJana) {
        btnJana.onclick = async () => {
             if(confirm("Pengesahan: Adakah anda mahu menjana saringan untuk acara ini?")) {
                 btnJana.disabled = true;
                 btnJana.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';
                 
                 try {
                     const res = await generateHeats(tahunAktif, eventId);
                     if(res.success) {
                         alert(`Berjaya! ${res.message}`);
                         bukaSaringan(eventId, label); // Refresh page
                     } else {
                         alert("Ralat: " + res.message);
                         btnJana.disabled = false;
                         btnJana.innerText = "Cuba Lagi";
                     }
                 } catch (err) {
                     console.error(err);
                     alert("Ralat sistem tidak dijangka.");
                 }
             }
        };
    }
};

// ==============================================================================
// BAHAGIAN G: PAPARAN TERPERINCI & INPUT KEPUTUSAN
// ==============================================================================

/**
 * Fungsi Utama untuk memaparkan borang saringan.
 * Mengendalikan logik paparan input, mod cetak, dan simpan.
 * * @param {string} eventId - ID Acara
 * @param {string} heatId - ID Saringan
 * @param {string} labelAcara - Nama Acara
 * @param {string} jenisSaringan - 'saringan' atau 'akhir'
 */
window.paparkanPerincianSaringan = async (eventId, heatId, labelAcara, jenisSaringan) => {
    contentArea.innerHTML = renderLoadingSpinner("Memuatkan data borang...");

    try {
        // Fetch Data Saringan
        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);

        if (!heatSnap.exists()) {
            contentArea.innerHTML = renderErrorAlert("Data saringan tidak dijumpai.");
            return;
        }

        const data = heatSnap.data();
        
        // Simpan dalam Global Cache untuk operasi Simpan nanti
        window.currentHeatDataCache = data;
        window.activeContext = { eventId, heatId, labelAcara, jenisSaringan };

        // Tentukan Jenis Borang
        const isHighJump = ACARA_KHAS.some(x => labelAcara.includes(x)); // Lompat Tinggi
        const isField = ACARA_PADANG.some(x => labelAcara.includes(x)); // Lompat Jauh, Lontar Peluru
        
        // Tajuk Paparan
        let subTitle = (data.jenis === 'akhir') ? "ACARA AKHIR" : `SARINGAN ${data.noSaringan}`;
        let badgeType = (data.jenis === 'akhir') ? "bg-warning text-dark" : "bg-secondary";

        // HTML Header (Controls)
        let htmlHeader = `
            <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom d-print-none sticky-top bg-white py-3" style="z-index: 1020;">
                <div class="d-flex align-items-center">
                    <button class="btn btn-outline-secondary me-3 shadow-sm" onclick="bukaSaringan('${eventId}', '${labelAcara}')">
                        <i class="bi bi-arrow-left me-1"></i> Kembali
                    </button>
                    <div>
                        <h5 class="fw-bold mb-0 text-dark">${labelAcara}</h5>
                        <span class="badge ${badgeType} small">${subTitle}</span>
                    </div>
                </div>
                
                <div class="d-flex gap-2">
                    <div class="dropdown">
                        <button class="btn btn-light border dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            <i class="bi bi-gear-fill me-1"></i> Utiliti
                        </button>
                        <ul class="dropdown-menu shadow">
                            <li><a class="dropdown-item" href="#" onclick="jalankanSync('${eventId}', '${heatId}', '${labelAcara}')"><i class="bi bi-arrow-repeat me-2"></i>Sync No. Bib</a></li>
                            <li><a class="dropdown-item text-danger" href="#" onclick="agihanAuto('${eventId}', '${heatId}', '${labelAcara}')"><i class="bi bi-people-fill me-2"></i>Tarik Semua Peserta (Reset)</a></li>
                        </ul>
                    </div>

                    <button class="btn btn-info text-white shadow-sm" id="btn-toggle-print" onclick="togglePrintMode()">
                        <i class="bi bi-printer me-2"></i>Preview Cetak
                    </button>

                    <button class="btn btn-success shadow-sm fw-bold" id="btn-simpan-utama" onclick="laksanaSimpan()">
                        <i class="bi bi-save me-2"></i>SIMPAN
                    </button>
                </div>
            </div>

            <div class="text-center mb-4 print-header">
                <h2 class="fw-bold text-uppercase mb-1">${labelAcara}</h2>
                <div class="d-inline-block border border-dark border-2 px-4 py-1 rounded">
                    <h4 class="fw-bold mb-0">${subTitle}</h4>
                </div>
            </div>
        `;

        // Render Body mengikut jenis acara
        let htmlBody = '';
        if (isHighJump) {
            htmlBody = generateHighJumpTable(data);
        } else if (isField) {
            htmlBody = generateFieldTable(data);
        } else {
            htmlBody = generateTrackTable(data);
        }

        // Render Footer (Tandatangan untuk cetakan)
        let htmlFooter = `
            <div class="row mt-5 pt-5 d-none d-print-flex">
                <div class="col-6 text-center">
                    <p class="mb-5 fw-bold">Tandatangan Hakim Ketua:</p>
                    <div class="border-bottom border-dark w-50 mx-auto"></div>
                </div>
                <div class="col-6 text-center">
                    <p class="mb-5 fw-bold">Tandatangan Refri:</p>
                    <div class="border-bottom border-dark w-50 mx-auto"></div>
                </div>
            </div>
        `;

        contentArea.innerHTML = htmlHeader + htmlBody + htmlFooter;

    } catch (err) {
        console.error(err);
        contentArea.innerHTML = renderErrorAlert("Ralat kritikal semasa menjana borang.");
    }
};

// ==============================================================================
// BAHAGIAN H: GENERATOR JADUAL (TRACK, FIELD, HIGH JUMP)
// ==============================================================================

/**
 * Menjana HTML jadual untuk acara balapan (Track).
 * Mengandungi input Masa dan Kedudukan.
 */
function generateTrackTable(data) {
    if (!data.peserta || data.peserta.length === 0) {
        return `<div class="alert alert-warning text-center">Tiada peserta dalam saringan ini.</div>`;
    }

    // Susun mengikut lorong
    data.peserta.sort((a,b) => a.lorong - b.lorong);

    let html = `
        <div class="table-responsive shadow-sm bg-white rounded p-1">
            <table class="table table-bordered table-striped align-middle mb-0" id="table-results">
                <thead class="table-dark text-center">
                    <tr>
                        <th width="70">Lorong</th>
                        <th width="90">No. Bib</th>
                        <th class="text-start">Nama Peserta</th>
                        <th width="200">Masa / Keputusan</th>
                        <th width="100">Kedudukan</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.peserta.forEach((p, idx) => {
        html += `
            <tr data-idx="${idx}">
                <td class="text-center fw-bold h5 bg-light">${p.lorong}</td>
                <td class="text-center fw-bold text-secondary font-monospace">${p.noBib || '-'}</td>
                <td>
                    <div class="fw-bold text-dark">${p.nama}</div>
                    <div class="small text-muted text-uppercase">RUMAH ${p.idRumah || '-'}</div>
                </td>
                <td class="p-2">
                    <div class="print-only fw-bold text-center fs-5">${p.pencapaian || ''}</div>
                    
                    <input type="text" class="form-control text-center fw-bold input-result screen-only" 
                           placeholder="--.--" value="${p.pencapaian || ''}">
                </td>
                <td class="p-2">
                    <div class="print-only fw-bold text-center fs-5">${p.kedudukan || ''}</div>

                    <input type="number" class="form-control text-center fw-bold input-rank screen-only" 
                           min="0" max="10" value="${p.kedudukan > 0 ? p.kedudukan : ''}">
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    return html;
}

/**
 * Menjana HTML jadual untuk acara padang (Lompat Jauh, Peluru, dll).
 * Mengandungi input untuk percubaan (trials).
 */
function generateFieldTable(data) {
    if (!data.peserta || data.peserta.length === 0) return `<div class="alert alert-warning">Tiada Data.</div>`;

    // Tentukan jumlah percubaan (Default 3, Akhir mungkin 6)
    const numTrials = data.jenis === 'akhir' ? 6 : 3;
    const trialsArr = Array.from({length: numTrials}, (_, i) => i);

    let headerCols = trialsArr.map(i => `<th>${i+1}</th>`).join('');

    let html = `
        <div class="table-responsive shadow-sm bg-white rounded p-1">
            <table class="table table-bordered table-hover text-center align-middle mb-0" id="table-results">
                <thead class="table-dark small">
                    <tr>
                        <th width="50">No</th>
                        <th width="80">Bib</th>
                        <th class="text-start">Nama</th>
                        ${headerCols}
                        <th class="bg-primary bg-opacity-75">Terbaik</th>
                        <th width="70">Rank</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.peserta.forEach((p, idx) => {
        // Pastikan array percubaan wujud
        const tr = p.percubaan || [];

        let trialInputs = trialsArr.map(i => {
            const val = tr[i] || '';
            return `
                <td class="p-1" style="min-width: 60px;">
                    <div class="print-only fw-bold">${val}</div>
                    <input type="number" step="0.01" class="form-control form-control-sm text-center input-trial screen-only" 
                           data-trial-idx="${i}" value="${val}">
                </td>
            `;
        }).join('');

        html += `
            <tr data-idx="${idx}">
                <td class="fw-bold bg-light">${idx + 1}</td>
                <td class="fw-bold">${p.noBib || '-'}</td>
                <td class="text-start">
                    <div class="fw-bold text-truncate" style="max-width: 180px;">${p.nama}</div>
                    <small class="text-muted">${p.idRumah}</small>
                </td>
                ${trialInputs}
                <td class="bg-primary bg-opacity-10 fw-bold">
                    <div class="print-only">${p.pencapaian || ''}</div>
                    <input type="number" class="form-control form-control-sm text-center fw-bold input-result screen-only" 
                           value="${p.pencapaian || ''}" readonly tabindex="-1"> 
                           </td>
                <td class="p-1">
                    <div class="print-only fw-bold">${p.kedudukan || ''}</div>
                    <input type="number" class="form-control form-control-sm text-center input-rank screen-only" 
                           value="${p.kedudukan > 0 ? p.kedudukan : ''}">
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    
    // Tambah sedikit nota panduan
    html += `<div class="mt-2 text-muted small d-print-none"><i class="bi bi-info-circle me-1"></i>Masukkan jarak dalam meter. Sistem akan menyimpan data percubaan.</div>`;

    return html;
}

/**
 * ==============================================================================
 * GENERATOR JADUAL: LOMPAT TINGGI (HIGH JUMP) - VERSI KEMASKINI
 * ==============================================================================
 */
function generateHighJumpTable(data) {
    // 1. Dapatkan semua ketinggian unik yang pernah direkodkan
    let allHeights = new Set();
    if(data.peserta) {
        data.peserta.forEach(p => {
            if(p.rekodLompatan) Object.keys(p.rekodLompatan).forEach(ht => allHeights.add(ht));
        });
    }
    
    // Susun ketinggian (1.00, 1.05...)
    let sortedCols = Array.from(allHeights).sort((a,b) => parseFloat(a) - parseFloat(b));
    
    // Jika tiada data langsung, sediakan 8 kolom kosong
    if(sortedCols.length === 0) sortedCols = Array(8).fill('');

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-2 d-print-none bg-light p-2 rounded border">
            <small class="text-muted"><i class="bi bi-info-circle me-1"></i>Gunakan butang '+' untuk menambah ketinggian palang.</small>
            <button class="btn btn-sm btn-dark rounded-pill shadow-sm" onclick="tambahKetinggianBaru()">
                <i class="bi bi-plus-lg text-success"></i> Tambah Ketinggian
            </button>
        </div>

        <div class="table-responsive shadow-sm bg-white rounded p-1">
            <table class="table table-bordered text-center align-middle mb-0 table-sm border-secondary" id="hj-table">
                <thead class="bg-white text-dark border-bottom border-dark small">
                    <tr>
                        <th width="40" class="py-2">No</th>
                        <th width="60" class="py-2">Bib</th>
                        <th class="text-start py-2" style="min-width: 180px;">Nama</th>
                        
                        ${sortedCols.map(ht => {
                            let label = ht ? parseFloat(ht).toFixed(2) + 'm' : '';
                            return `<th class="col-height py-2" data-val="${ht}" style="min-width:45px;">${label}</th>`;
                        }).join('')}
                        
                        <th width="70" class="bg-light border-start border-secondary py-2">Best</th>
                        <th width="50" class="py-2">Rank</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (!data.peserta || data.peserta.length === 0) {
        html += `<tr><td colspan="${5 + sortedCols.length}">Tiada Peserta.</td></tr>`;
    } else {
        data.peserta.forEach((p, idx) => {
            html += `<tr data-idx="${idx}">
                <td>${idx+1}</td>
                <td class="fw-bold">${p.noBib||'-'}</td>
                <td class="text-start">
                    <div class="fw-bold text-truncate">${p.nama}</div>
                    <small class="text-muted">${p.idRumah}</small>
                </td>
            `;

            // Loop columns
            sortedCols.forEach(ht => {
                let cellVal = '';
                if(ht && p.rekodLompatan && p.rekodLompatan[ht]) {
                    cellVal = p.rekodLompatan[ht].join('');
                }
                
                html += `
                    <td class="p-0 position-relative">
                        <div class="print-only fw-bold" style="min-height:25px; line-height:25px;">${cellVal}</div>
                        <input type="text" class="form-control form-control-sm border-0 text-center p-0 screen-only input-hj font-monospace fw-bold text-uppercase" 
                               style="letter-spacing:2px; height:100%; min-height: 30px;"
                               data-ht="${ht}" value="${cellVal}" maxlength="3">
                    </td>
                `;
            });

            html += `
                <td class="bg-light fw-bold border-start border-secondary">
                    ${p.pencapaian || ''}
                </td>
                <td>
                    <div class="print-only">${p.kedudukan || ''}</div>
                    <input type="number" class="form-control form-control-sm text-center screen-only input-rank" 
                           value="${p.kedudukan > 0 ? p.kedudukan : ''}">
                </td>
            </tr>`;
        });
    }

    html += `</tbody></table></div>`;
    return html;
}

/**
 * Fungsi Tambah Ketinggian (Lompat Tinggi)
 * Menggunakan manipulasi DOM terus untuk update pantas tanpa refresh
 */
window.tambahKetinggianBaru = () => {
    const val = prompt("Masukkan ketinggian palang (m):", "1.xx");
    if (!val || isNaN(val)) return;
    
    const formatted = parseFloat(val).toFixed(2);
    
    // 1. Update Cache Data (Supaya bila tekan SIMPAN, kolom baru ini wujud)
    if(window.currentHeatDataCache && window.currentHeatDataCache.peserta) {
        window.currentHeatDataCache.peserta.forEach(p => {
            if(!p.rekodLompatan) p.rekodLompatan = {};
            // Init empty array untuk ketinggian baru
            if(!p.rekodLompatan[formatted]) p.rekodLompatan[formatted] = [];
        });
    }

    // 2. Update Interface (DOM) Terus - Lebih Pantas & Stabil
    const table = document.getElementById('hj-table');
    if (!table) return;

    // A. Tambah Header (Sebelum 2 kolom terakhir: Best & Rank)
    const theadRow = table.querySelector('thead tr');
    const insertIdx = theadRow.children.length - 2; // Posisi sebelum Best
    
    const th = document.createElement('th');
    th.className = "col-height py-2 animate__animated animate__fadeIn";
    th.setAttribute('data-val', formatted);
    th.style.minWidth = "45px";
    th.innerText = formatted + 'm';
    
    theadRow.insertBefore(th, theadRow.children[insertIdx]);

    // B. Tambah Input pada setiap baris peserta
    const tbodyRows = table.querySelectorAll('tbody tr');
    tbodyRows.forEach(row => {
        const td = document.createElement('td');
        td.className = "p-0 position-relative animate__animated animate__fadeIn";
        td.innerHTML = `
            <div class="print-only fw-bold" style="min-height:25px; line-height:25px;"></div>
            <input type="text" class="form-control form-control-sm border-0 text-center p-0 screen-only input-hj font-monospace fw-bold text-uppercase" 
                   style="letter-spacing:2px; height:100%; min-height: 30px;"
                   data-ht="${formatted}" value="" maxlength="3">
        `;
        row.insertBefore(td, row.children[insertIdx]);
    });
};


// ==============================================================================
// BAHAGIAN I: LOGIK SIMPAN & CETAK
// ==============================================================================

/**
 * Mengumpul semua data dari input dalam jadual dan menghantar ke Firebase.
 */
window.laksanaSimpan = async () => {
    const btn = document.getElementById('btn-simpan-utama');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';

    try {
        const { eventId, heatId } = window.activeContext;
        const currentData = window.currentHeatDataCache.peserta;
        
        // Clone array untuk elak mutasi langsung yang pelik
        let updatedPeserta = JSON.parse(JSON.stringify(currentData));

        // Kesan jenis table berdasarkan elemen DOM yang wujud
        const isTrack = document.querySelector('.input-result') && !document.querySelector('.input-trial');
        const isField = document.querySelector('.input-trial');
        const isHJ = document.querySelector('#hj-table');

        // 1. LOGIK TRACK
        if (isTrack && !isField && !isHJ) {
            document.querySelectorAll('#table-results tbody tr').forEach(row => {
                const idx = row.getAttribute('data-idx');
                const res = row.querySelector('.input-result').value;
                const rank = row.querySelector('.input-rank').value;
                
                updatedPeserta[idx].pencapaian = res.toUpperCase();
                updatedPeserta[idx].kedudukan = rank ? parseInt(rank) : 0;
            });
        }

        // 2. LOGIK FIELD
        if (isField) {
            document.querySelectorAll('#table-results tbody tr').forEach(row => {
                const idx = row.getAttribute('data-idx');
                const rank = row.querySelector('.input-rank').value;
                
                // Ambil trials
                let trials = [];
                row.querySelectorAll('.input-trial').forEach(inp => {
                    const val = parseFloat(inp.value);
                    trials.push(isNaN(val) ? 0 : val); // Simpan nombor
                });

                updatedPeserta[idx].percubaan = trials;
                updatedPeserta[idx].kedudukan = rank ? parseInt(rank) : 0;
                
                // Auto-Calculate Best
                const max = Math.max(...trials);
                updatedPeserta[idx].pencapaian = max > 0 ? max.toFixed(2) : "";
            });
        }

        // 3. LOGIK HIGH JUMP
        if (isHJ) {
            document.querySelectorAll('#hj-table tbody tr').forEach(row => {
                const idx = row.getAttribute('data-idx');
                const rank = row.querySelector('.input-rank').value;
                
                let jumps = {};
                row.querySelectorAll('.input-hj').forEach(inp => {
                    const h = inp.getAttribute('data-ht');
                    const val = inp.value.toUpperCase();
                    if(h && val) {
                        jumps[h] = val.split(''); // 'XO' -> ['X','O']
                    }
                });

                updatedPeserta[idx].rekodLompatan = jumps;
                updatedPeserta[idx].kedudukan = rank ? parseInt(rank) : 0;
                // Kalkulasi Best Height guna modul luaran
                updatedPeserta[idx].pencapaian = highJumpLogic.getBestHeight(jumps);
            });
        }

        // Hantar ke Firebase
        const res = await saveHeatResults(tahunAktif, eventId, heatId, updatedPeserta);

        if (res.success) {
            // Update cache tempatan
            window.currentHeatDataCache.peserta = updatedPeserta;
            
            // UI Feedback
            btn.classList.remove('btn-success');
            btn.classList.add('btn-dark');
            btn.innerHTML = '<i class="bi bi-check-all me-2"></i>Data Disimpan!';
            
            setTimeout(() => {
                btn.classList.remove('btn-dark');
                btn.classList.add('btn-success');
                btn.innerHTML = originalText;
                btn.disabled = false;
                
                // Refresh Paparan untuk update nilai calculated (macam Best Height)
                paparkanPerincianSaringan(window.activeContext.eventId, window.activeContext.heatId, window.activeContext.labelAcara, window.activeContext.jenisSaringan);
            }, 1000);
        } else {
            throw new Error(res.message);
        }

    } catch (e) {
        console.error(e);
        alert("Gagal menyimpan data: " + e.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

/**
 * Togol antara Mod Paparan Biasa (Input) dan Mod Preview (Text).
 * Apabila mod preview aktif, butang cetak sebenar akan dipanggil.
 */
window.togglePrintMode = () => {
    const btn = document.getElementById('btn-toggle-print');
    const isPreviewing = btn.classList.contains('btn-danger'); // Flag based on class

    if (!isPreviewing) {
        // Masuk Mod Preview
        document.body.classList.add('print-preview-active');
        btn.classList.remove('btn-info');
        btn.classList.add('btn-danger');
        btn.innerHTML = '<i class="bi bi-x-circle me-2"></i>Tutup Preview';
        
        // Panggil window.print() secara automatik selepas delay sedikit
        setTimeout(() => {
            window.print();
        }, 500);

    } else {
        // Keluar Mod Preview
        document.body.classList.remove('print-preview-active');
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-info');
        btn.innerHTML = '<i class="bi bi-printer me-2"></i>Preview Cetak';
    }
};

// ==============================================================================
// BAHAGIAN J: UTILITI TAMBAHAN & HELPER FUNCTIONS
// ==============================================================================

/**
 * Menyuntik CSS untuk mengawal paparan semasa mencetak (Hide Inputs, Show Text).
 * Ini memastikan borang nampak profesional bila dicetak walaupun input form wujud.
 */
function injectPrintStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* Default: Sembunyikan text print-only */
        .print-only { display: none; }
        .print-header { display: none; }

        /* Semasa Preview Cetak (Class di body) atau Media Print */
        @media print, screen and (min-width: 0px) { 
            body.print-preview-active .screen-only,
            body.print-preview-active .btn, 
            body.print-preview-active .navbar,
            body.print-preview-active .d-print-none {
                display: none !important;
            }

            body.print-preview-active .print-only {
                display: block !important;
            }

            body.print-preview-active .print-header {
                display: block !important;
            }
            
            body.print-preview-active .card, 
            body.print-preview-active .shadow-sm {
                box-shadow: none !important;
                border: none !important;
            }
        }

        /* Native Print Dialog Override */
        @media print {
            .screen-only, .btn, .no-print, header, nav { display: none !important; }
            .print-only { display: block !important; }
            .print-header { display: block !important; }
            .card { border: none !important; box-shadow: none !important; }
            .table-dark { color: black !important; background-color: transparent !important; border-bottom: 2px solid black; }
            body { background: white; -webkit-print-color-adjust: exact; }
            
            /* Paksa page break */
            .page-break { page-break-after: always; }
        }
    `;
    document.head.appendChild(style);
}

// Utiliti: Spinner HTML
function renderLoadingSpinner(text) {
    return `
        <div class="d-flex flex-column align-items-center justify-content-center py-5" style="min-height: 300px;">
            <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;"></div>
            <h5 class="text-muted animate__animated animate__pulse animate__infinite">${text}</h5>
        </div>
    `;
}

// Utiliti: Error Alert
function renderErrorAlert(msg) {
    return `
        <div class="alert alert-danger shadow-sm m-4" role="alert">
            <h4 class="alert-heading"><i class="bi bi-exclamation-triangle-fill me-2"></i>Ralat Sistem</h4>
            <p>${msg}</p>
            <hr>
            <button class="btn btn-outline-danger btn-sm" onclick="window.location.reload()">Muat Semula Halaman</button>
        </div>
    `;
}

// Utiliti: Log System (Boleh dikembangkan untuk simpan ke Firestore jika perlu)
function logSystemAction(type, desc) {
    const logEntry = `[${new Date().toLocaleTimeString()}] [${type}] ${desc}`;
    console.log(logEntry);
    
    // Simpan history log dalam session storage untuk debug
    let logs = JSON.parse(sessionStorage.getItem('sys_logs') || '[]');
    logs.push(logEntry);
    sessionStorage.setItem('sys_logs', JSON.stringify(logs.slice(-50))); // Simpan last 50
}

// ==============================================================================
// BAHAGIAN K: UTILITI IMPORT/EXPORT & SYNC (Code Lama Dikemaskini)
// ==============================================================================

// Fungsi Sync No Bip
window.jalankanSync = async (eventId, heatId, label) => {
    if(!confirm(`Adakah anda pasti mahu mengemaskini No. Bip semua peserta dalam saringan ini berdasarkan data pendaftaran induk?`)) return;

    try {
        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);
        
        if (heatSnap.exists()) {
            const data = heatSnap.data();
            
            // Promise.all untuk concurrent fetching
            const updated = await Promise.all(data.peserta.map(async (p) => {
                const atletRef = doc(db, "kejohanan", tahunAktif, "peserta", p.idPeserta);
                const atletSnap = await getDoc(atletRef);
                
                if (atletSnap.exists()) {
                    const atletData = atletSnap.data();
                    const realBib = atletData.noBib || atletData.noBip || p.noBib;
                    return { ...p, noBib: realBib, noBip: realBib };
                }
                return p;
            }));

            await updateDoc(heatRef, { peserta: updated });
            alert("Sync Selesai!");
            paparkanPerincianSaringan(eventId, heatId, label, window.activeContext.jenisSaringan);
        }
    } catch (e) {
        console.error(e);
        alert("Ralat Sync: " + e.message);
    }
};

// Fungsi Agihan Auto (Tarik Semula Peserta)
window.agihanAuto = async (eventId, heatId, label) => {
    const detail = await getEventDetail(tahunAktif, eventId);
    
    if (!confirm(`AMARAN KERAS: Data keputusan sedia ada dalam saringan ini akan HILANG. Sistem akan menarik semula semua peserta kategori ${detail.kategori} yang mendaftar acara ini. Teruskan?`)) return;

    try {
        const q = query(
            collection(db, "kejohanan", tahunAktif, "peserta"),
            where("kategori", "==", detail.kategori),
            where("acaraDaftar", "array-contains", detail.nama)
        );

        const snap = await getDocs(q);
        
        // Randomize order a bit or just list them
        const newData = snap.docs.map((d, i) => {
            const dVal = d.data();
            return {
                idPeserta: d.id,
                nama: dVal.nama,
                noBib: dVal.noBib || dVal.noBip || '-',
                idRumah: dVal.rumah || dVal.idRumah,
                lorong: i + 1,
                pencapaian: "",
                kedudukan: 0
            };
        });

        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        await updateDoc(heatRef, { peserta: newData });

        alert(`Reset Selesai. ${newData.length} peserta dimasukkan.`);
        paparkanPerincianSaringan(eventId, heatId, label, window.activeContext.jenisSaringan);

    } catch (e) {
        alert("Ralat: " + e.message);
    }
};

// Fungsi CSV Upload (Kekal sama tapi lebih kemas)
document.getElementById('btn-proses-csv')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-csv');
    const btn = document.getElementById('btn-proses-csv');
    const file = fileInput.files[0];

    if (!file) return alert("Sila pilih fail CSV.");

    btn.disabled = true;
    btn.innerHTML = 'Memproses...';

    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split('\n');
        const records = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const [rekod, acara, kat, thn, nama] = line.split(',');
            if (rekod) records.push({ rekod, acara, kategori: kat, tahun: thn, nama });
        }

        if (records.length > 0) {
            await saveBulkRecords(records);
            alert("CSV Berjaya Diimport.");
            bootstrap.Modal.getInstance(document.getElementById('modalCSV')).hide();
        }
        
        btn.disabled = false;
        btn.innerHTML = 'Mula Proses';
        fileInput.value = "";
    };
    reader.readAsText(file);
});

// ==============================================================================
// BAHAGIAN L: INIT
// ==============================================================================

// Pastikan DOM sedia sebelum memuatkan data
document.addEventListener('DOMContentLoaded', () => {
    // Mulakan di dashboard setup
    renderSetupDashboard();
});

// End of File
