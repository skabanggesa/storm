/**
 * ==============================================================================
 * SISTEM PENGURUSAN KEJOHANAN OLAHRAGA TAHUNAN (KOT)
 * FAIL: main-admin.js
 * VERSI: 3.0 (FULL EXTENDED)
 * PENERANGAN:
 * Fail ini menguruskan segala logik di bahagian Admin termasuk:
 * 1. Setup & Init Database
 * 2. Pengurusan Rumah Sukan
 * 3. Paparan Senarai Acara & Saringan
 * 4. Input Keputusan (Balapan, Padang, Lompat Tinggi)
 * 5. Utiliti Data (Backup, Restore, CSV, Padam)
 * 6. (BARU) Penentuan Olahragawan & Statistik Pingat
 * ==============================================================================
 */

// ==============================================================================
// BAHAGIAN A: IMPORT MODUL DAN LIBRARY
// ==============================================================================

// Import fungsi dari modul admin tempatan
import { 
    initializeTournament, 
    getHeatsData, 
    saveHeatResults,
    saveBulkRecords,
    generateHeats
} from './modules/admin.js';

// Import konfigurasi Firebase
import { db } from './firebase-config.js';

// Import fungsi Firestore dari CDN (Versi 11.1.0)
import { 
    doc, 
    getDoc, 
    updateDoc, 
    setDoc, 
    collection, 
    getDocs, 
    writeBatch, 
    deleteDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ==============================================================================
// BAHAGIAN B: PEMBOLEHUBAH GLOBAL (STATE MANAGEMENT)
// ==============================================================================

// Tahun aktif kejohanan (default kepada tahun semasa jika tiada dalam session)
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString(); 
const contentArea = document.getElementById('content-area');

// Variable untuk menyimpan data sementara (State)
// Ini penting untuk memastikan data tidak hilang semasa proses edit
window.currentHeatData = null;      // Data saringan semasa
window.currentHeatId = null;        // ID Saringan
window.currentEventId = null;       // ID Acara induk
window.currentLabel = null;         // Nama acara (tajuk)
window.currentMode = 'input';       // Mod paparan (input/view)
window.currentRecordData = null;    // Data rekod kejohanan (untuk perbandingan)

// ==============================================================================
// BAHAGIAN C: INITIALIZATION & NAVIGATION
// ==============================================================================

/**
 * Fungsi ini dijalankan sebaik sahaja halaman dimuatkan (DOM Ready).
 * Ia menyediakan UI asas dan menu navigasi.
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log("============================================");
    console.log(" SISTEM ADMIN DIMUATKAN ");
    console.log(" Tahun Kejohanan: " + tahunAktif);
    console.log("============================================");

    // 1. Kemaskini Label Tahun di Sidebar
    const labelTahun = document.getElementById('tahun-label');
    if(labelTahun) {
        labelTahun.innerText = `Tahun Operasi: ${tahunAktif}`;
    }

    // 2. Setup Default View
    // Pastikan view olahragawan disembunyikan pada permulaan
    const viewOlahragawan = document.getElementById('view-olahragawan');
    if(viewOlahragawan) viewOlahragawan.classList.add('d-none');
    
    const contentAreaDiv = document.getElementById('content-area');
    if(contentAreaDiv) contentAreaDiv.classList.remove('d-none');
});

// --- PENGURUSAN KLIK MENU SIDEBAR ---

// 1. Menu Setup & Database
document.getElementById('menu-setup')?.addEventListener('click', () => {
    console.log("Navigasi: Menu Setup diklik.");
    toggleView('main'); // Tunjuk content area biasa
    renderSetupForm();  // Papar borang setup
});

// 2. Menu Keputusan Acara
document.getElementById('menu-acara')?.addEventListener('click', () => {
    console.log("Navigasi: Menu Acara diklik.");
    toggleView('main'); // Tunjuk content area biasa
    renderSenaraiAcara('input'); // Papar senarai acara
});

// 3. Menu Olahragawan (CIRI BARU)
document.getElementById('menu-olahragawan')?.addEventListener('click', () => {
    console.log("Navigasi: Menu Olahragawan diklik.");
    toggleView('olahragawan'); // Tukar ke paparan dashboard olahragawan
});

// 4. Butang Log Keluar
document.getElementById('btn-logout')?.addEventListener('click', () => {
    if(confirm("Adakah anda pasti mahu log keluar dari sistem Admin?")) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
});

/**
 * Fungsi Helper: Menukar paparan antara Content Utama dan View Olahragawan
 * @param {string} viewName - 'main' atau 'olahragawan'
 */
function toggleView(viewName) {
    const mainContent = document.getElementById('content-area');
    const olahragawanView = document.getElementById('view-olahragawan');
    
    if (viewName === 'olahragawan') {
        // Sembunyikan Main, Tunjuk Olahragawan
        if(mainContent) mainContent.classList.add('d-none');
        if(olahragawanView) olahragawanView.classList.remove('d-none');
    } else {
        // Sembunyikan Olahragawan, Tunjuk Main
        if(mainContent) mainContent.classList.remove('d-none');
        if(olahragawanView) olahragawanView.classList.add('d-none');
    }
}

// ==============================================================================
// BAHAGIAN D: SETUP, UTILITI & RUMAH SUKAN
// ==============================================================================

/**
 * Memaparkan borang Setup, Backup, dan Restore.
 * Ini adalah pusat kawalan data sistem.
 */
function renderSetupForm() {
    // Bina HTML untuk papan pemuka setup
    let html = `
        <div class="row g-4">
            <div class="col-md-6">
                <div class="card p-4 h-100 shadow-sm border-0">
                    <h5 class="text-primary fw-bold"><i class="bi bi-database me-2"></i>Setup Database</h5>
                    <p class="text-muted small">
                        Gunakan fungsi ini untuk menjana struktur awal pangkalan data bagi tahun ${tahunAktif}.
                        <br>Ia akan mencipta koleksi acara, rumah sukan, dan peserta jika belum wujud.
                    </p>
                    <button class="btn btn-primary mt-auto w-100" id="btn-init">
                        <i class="bi bi-play-circle me-2"></i>Jana Struktur Database
                    </button>
                </div>
            </div>

            <div class="col-md-6">
                <div class="card p-4 h-100 shadow-sm border-0">
                    <h5 class="text-success fw-bold"><i class="bi bi-shield-lock me-2"></i>Rumah Sukan</h5>
                    <p class="text-muted small">
                        Tetapkan kata laluan untuk setiap Rumah Sukan.
                        <br>Guru Rumah perlu menggunakan kata laluan ini untuk mendaftar peserta.
                    </p>
                    <button class="btn btn-success mt-auto w-100" onclick="renderSenaraiRumah()">
                        <i class="bi bi-key me-2"></i>Urus Kata Laluan
                    </button>
                </div>
            </div>

            <div class="col-md-12">
                <div class="card p-4 shadow-sm border-0">
                    <h5 class="text-dark mb-3 fw-bold"><i class="bi bi-hdd-network me-2"></i>Utiliti & Penyelenggaraan Data</h5>
                    <div class="alert alert-warning small">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Sila berhati-hati. Pastikan anda membuat Backup sebelum melakukan Padam Data atau Restore.
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-outline-dark" id="btn-laksana-backup">
                            <i class="bi bi-download me-2"></i>Muat Turun Backup (JSON)
                        </button>
                        
                        <button class="btn btn-outline-danger" data-bs-toggle="modal" data-bs-target="#modalPadam">
                            <i class="bi bi-trash me-2"></i>Zon Bahaya: Padam Data
                        </button>
                    </div>

                    <hr>
                    <div class="mt-3">
                        <label class="form-label small fw-bold">Restore Data (Upload JSON Backup):</label>
                        <div class="input-group">
                            <input type="file" class="form-control" id="file-restore" accept=".json">
                            <button class="btn btn-secondary" id="btn-laksana-restore">Restore</button>
                        </div>
                    </div>
                    
                    <hr>
                    <div class="mt-3">
                        <label class="form-label small fw-bold">Muat Naik Rekod Kejohanan (CSV):</label>
                        <div class="input-group">
                            <input type="file" class="form-control" id="file-csv" accept=".csv">
                            <button class="btn btn-info text-white" id="btn-proses-csv">Upload CSV</button>
                        </div>
                        <small class="text-muted">Format: Rekod, Acara, Kategori, Tahun, Nama</small>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="house-list" class="mt-4"></div>
    `;

    contentArea.innerHTML = html;

    // --- LOGIC BUTANG SETUP ---
    document.getElementById('btn-init').onclick = async () => {
        if(!confirm("Adakah anda pasti mahu menjana struktur database baru? Ini mungkin mengambil masa.")) return;
        
        const btn = document.getElementById('btn-init');
        btn.disabled = true;
        btn.innerHTML = "Sedang Menjana...";
        
        try {
            const res = await initializeTournament(tahunAktif, []);
            if(res.success) {
                alert("Berjaya! Struktur pangkalan data telah siap dibina.");
            } else {
                alert("Ralat: " + res.message);
            }
        } catch(err) {
            console.error(err);
            alert("Ralat Sistem: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Jana Struktur Database';
        }
    };

    // --- LOGIC BUTANG BACKUP ---
    document.getElementById('btn-laksana-backup').onclick = async () => {
        const btn = document.getElementById('btn-laksana-backup');
        btn.disabled = true; 
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses Backup...';
        
        try {
            console.log("Memulakan proses backup...");
            let dataBackup = {};
            const collectionsToBackup = ["peserta", "rumah", "acara"];
            
            // Loop setiap collection dan tarik data
            for(let col of collectionsToBackup) {
                dataBackup[col] = {};
                const snap = await getDocs(collection(db, "kejohanan", tahunAktif, col));
                snap.forEach(d => {
                    dataBackup[col][d.id] = d.data();
                });
                console.log(`Backup: Collection ${col} selesai (${snap.size} dokumen).`);
            }
            
            // Convert ke JSON String dan download
            const jsonString = JSON.stringify(dataBackup, null, 2);
            const blob = new Blob([jsonString], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a'); 
            a.href = url; 
            a.download = `KOT_BACKUP_${tahunAktif}_${new Date().toISOString().slice(0,10)}.json`; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            alert("Backup berjaya dimuat turun!");

        } catch(e) { 
            console.error("Backup Error:", e);
            alert("Ralat Backup: "+e.message); 
        } finally { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="bi bi-download me-2"></i>Muat Turun Backup (JSON)'; 
        }
    };
}

// --- FUNGSI URUS RUMAH SUKAN ---
window.renderSenaraiRumah = async () => {
    const container = document.getElementById('house-list');
    container.innerHTML = '<div class="text-center"><div class="spinner-border text-primary"></div><p>Memuatkan senarai rumah...</p></div>';
    
    try {
        const rumahColors = ['merah', 'biru', 'hijau', 'kuning'];
        let html = `
        <div class="card border-0 shadow-sm">
            <div class="card-header bg-white fw-bold py-3">Senarai Rumah Sukan & Kod Akses</div>
            <div class="table-responsive">
                <table class="table table-bordered mb-0 align-middle">
                    <thead class="table-light">
                        <tr>
                            <th width="20%">Rumah Sukan</th>
                            <th>Kod Akses (Password)</th>
                            <th width="15%">Tindakan</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        for(let r of rumahColors) {
            // Tarik data rumah dari DB
            const docRef = doc(db, "kejohanan", tahunAktif, "rumah", r);
            const snap = await getDoc(docRef);
            const kodSediaAda = snap.exists() ? (snap.data().kod || '') : '';
            
            // Tetapkan warna teks ikut rumah
            let textClass = "";
            if(r === 'merah') textClass = "text-danger";
            else if(r === 'biru') textClass = "text-primary";
            else if(r === 'hijau') textClass = "text-success";
            else if(r === 'kuning') textClass = "text-warning";

            html += `
                <tr>
                    <td class="text-uppercase fw-bold ${textClass}">${r}</td>
                    <td>
                        <input id="kod-${r}" type="text" class="form-control" value="${kodSediaAda}" placeholder="Masukkan kod...">
                    </td>
                    <td>
                        <button class="btn btn-dark w-100" onclick="simpanKodRumah('${r}')">
                            <i class="bi bi-save me-1"></i>Simpan
                        </button>
                    </td>
                </tr>`;
        }
        
        html += `</tbody></table></div></div>`;
        container.innerHTML = html;

    } catch(err) {
        console.error(err);
        container.innerHTML = `<div class="alert alert-danger">Gagal memuatkan rumah sukan.</div>`;
    }
};

window.simpanKodRumah = async (idRumah) => {
    const inputKod = document.getElementById(`kod-${idRumah}`);
    if(!inputKod) return;
    
    const val = inputKod.value.trim();
    if(!val) return alert("Sila masukkan kod terlebih dahulu.");

    try {
        await setDoc(doc(db, "kejohanan", tahunAktif, "rumah", idRumah), {
            kod: val, 
            nama: idRumah.toUpperCase(),
            updatedAt: new Date().toISOString()
        }, {merge: true});
        
        alert(`Kod akses untuk rumah ${idRumah.toUpperCase()} berjaya disimpan.`);
    } catch(e) {
        console.error(e);
        alert("Gagal simpan: " + e.message);
    }
};

// --- GLOBAL EVENT LISTENERS UNTUK UTILITI (CSV / RESTORE / PADAM) ---

// 1. CSV UPLOAD LISTENER
document.getElementById('btn-proses-csv')?.addEventListener('click', async () => {
    const input = document.getElementById('file-csv');
    if(!input.files[0]) return alert("Sila pilih fail CSV dahulu.");
    
    const btn = document.getElementById('btn-proses-csv');
    btn.disabled = true; btn.innerText = "Processing...";

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const lines = e.target.result.split('\n');
            let records = [];
            // Parse CSV baris demi baris
            for(let i=1; i<lines.length; i++) {
                const line = lines[i].trim();
                if(!line) continue;
                
                // Format: Rekod, Acara, Kategori, Tahun, Nama
                const cols = line.split(',');
                if(cols.length >= 2) {
                    records.push({
                        rekod: cols[0]?.trim() || '',
                        acara: cols[1]?.trim() || '',
                        kategori: cols[2]?.trim() || '',
                        tahun: cols[3]?.trim() || '',
                        nama: cols[4]?.trim() || '-'
                    });
                }
            }
            
            if(records.length > 0) {
                await saveBulkRecords(records);
                alert(`Berjaya memuat naik ${records.length} rekod kejohanan!`);
            } else {
                alert("Tiada rekod sah dijumpai dalam fail CSV.");
            }
        } catch(err) { 
            console.error(err);
            alert("Ralat CSV: "+err.message); 
        } finally {
            btn.disabled = false; btn.innerText = "Upload CSV";
        }
    };
    reader.readAsText(input.files[0]);
});

// 2. RESTORE DATA LISTENER
document.getElementById('btn-laksana-restore')?.addEventListener('click', async () => {
    const input = document.getElementById('file-restore');
    if(!input.files[0]) return alert("Sila pilih fail JSON dahulu.");
    if(!confirm("AMARAN: Restore akan menimpa data sedia ada. Teruskan?")) return;

    const btn = document.getElementById('btn-laksana-restore');
    btn.disabled = true; btn.innerText = "Memulihkan...";

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            let batch = writeBatch(db);
            let count = 0;
            let totalRestored = 0;

            // Loop setiap collection dalam backup
            for(let col in data) {
                const docs = data[col];
                for(let id in docs) {
                    const docRef = doc(db, "kejohanan", tahunAktif, col, id);
                    batch.set(docRef, docs[id], {merge:true});
                    count++;
                    totalRestored++;

                    // Firestore batch limit (500)
                    if(count >= 400) { 
                        await batch.commit(); 
                        batch = writeBatch(db); 
                        count = 0; 
                    }
                }
            }
            if(count > 0) await batch.commit();
            
            alert(`Restore Selesai! Sebanyak ${totalRestored} dokumen telah dipulihkan.`);
            location.reload();

        } catch(err) { 
            console.error(err);
            alert("Ralat Restore: "+err.message); 
        } finally {
            btn.disabled = false; btn.innerText = "Restore";
        }
    };
    reader.readAsText(input.files[0]);
});

// 3. PADAM DATA LISTENER
document.getElementById('btn-laksana-padam')?.addEventListener('click', async () => {
    const jenis = document.getElementById('select-padam-jenis').value;
    const sah = document.getElementById('input-pengesahan-padam').value;
    
    // Validasi Keselamatan
    if(sah !== 'SAH PADAM') {
        return alert("Sila taip 'SAH PADAM' dengan tepat untuk meneruskan.");
    }
    if(!confirm("AMARAN TERAKHIR: Data yang dipadam TIDAK BOLEH dikembalikan melainkan anda ada backup. Teruskan?")) return;
    
    const btn = document.getElementById('btn-laksana-padam');
    btn.disabled = true; btn.innerText = "Memadam...";

    try {
        // Fungsi helper untuk padam collection secara batch
        const deleteCol = async (pathRef) => {
            const snap = await getDocs(pathRef);
            if(snap.empty) return;

            let batch = writeBatch(db);
            let c = 0;
            snap.forEach(d => { 
                batch.delete(d.ref); 
                c++; 
                if(c >= 400){
                    batch.commit(); 
                    batch = writeBatch(db); 
                    c=0;
                } 
            });
            if(c > 0) await batch.commit();
        };

        // Logic Padam Mengikut Pilihan
        if(jenis === 'peserta' || jenis === 'semua') {
            await deleteCol(collection(db, "kejohanan", tahunAktif, "peserta"));
        }
        
        if(jenis === 'keputusan' || jenis === 'semua') {
            // Padam subcollection saringan dalam setiap acara
            const evSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
            for(let ev of evSnap.docs) {
                await deleteCol(collection(db, "kejohanan", tahunAktif, "acara", ev.id, "saringan"));
            }
        }
        
        if(jenis === 'semua') {
            await deleteCol(collection(db, "kejohanan", tahunAktif, "acara"));
            await deleteCol(collection(db, "kejohanan", tahunAktif, "rumah"));
        }

        alert("Operasi Pemadaman Data Berjaya.");
        location.reload();

    } catch(e) { 
        console.error(e);
        alert("Ralat Padam: "+e.message); 
        btn.disabled = false; btn.innerText = "Padam Sekarang";
    }
});

// ==============================================================================
// BAHAGIAN E: SENARAI ACARA & SARINGAN
// ==============================================================================

/**
 * Memaparkan senarai acara yang ada dalam database.
 * Diasingkan mengikut kategori Balapan dan Padang.
 */
window.renderSenaraiAcara = async (mode = 'input') => {
    // Kita paksa 'input' mode untuk admin panel supaya boleh klik & edit
    const internalMode = 'input'; 
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Sedang memuatkan senarai acara...</p></div>';

    try {
        let events = [];
        // Ambil semua acara
        const snap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
        snap.forEach(d => events.push({id: d.id, ...d.data()}));

        // Sort ikut nama
        events.sort((a,b) => a.nama.localeCompare(b.nama));

        // Filter Kategori
        const track = events.filter(e => e.kategori === 'balapan');
        const field = events.filter(e => e.kategori === 'padang');

        // Fungsi Helper untuk buat Kad HTML
        const renderCard = (ev) => {
            const statusClass = ev.status === 'selesai' ? 'success' : 'secondary';
            const statusLabel = ev.status === 'selesai' ? 'Selesai' : 'Baru';
            
            return `
            <div class="col-md-4 mb-3">
                <div class="card h-100 shadow-sm border-0 hover-effect" onclick="pilihAcara('${ev.id}', '${ev.nama}', '${internalMode}')" style="cursor:pointer; transition: transform 0.2s;">
                    <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="badge bg-primary">${ev.kelas || 'Terbuka'}</span>
                            <span class="badge bg-${statusClass}">${statusLabel}</span>
                        </div>
                        <h6 class="fw-bold text-dark mb-1">${ev.nama}</h6>
                        <small class="text-muted">${ev.jenis || 'Akhir'}</small>
                    </div>
                    <div class="card-footer bg-light border-0 py-2 small text-primary fw-bold text-end">
                        Urus Keputusan <i class="bi bi-arrow-right ms-1"></i>
                    </div>
                </div>
            </div>`;
        };

        let html = `<h4 class="mb-3 border-bottom pb-2">Pengurusan Keputusan Acara</h4>`;
        
        // Render Padang
        html += `<div class="mb-4">
                    <h5 class="text-success fw-bold"><i class="bi bi-flower1 me-2"></i>Acara Padang</h5>
                    <div class="row">${field.length > 0 ? field.map(renderCard).join('') : '<div class="col-12"><div class="alert alert-light">Tiada acara padang dijumpai.</div></div>'}</div>
                 </div>`;
        
        // Render Balapan
        html += `<div class="mb-4">
                    <h5 class="text-danger fw-bold"><i class="bi bi-stopwatch me-2"></i>Acara Balapan</h5>
                    <div class="row">${track.length > 0 ? track.map(renderCard).join('') : '<div class="col-12"><div class="alert alert-light">Tiada acara balapan dijumpai.</div></div>'}</div>
                 </div>`;

        contentArea.innerHTML = html;

    } catch(e) { 
        console.error(e);
        contentArea.innerHTML = `<div class="alert alert-danger shadow-sm">Ralat Memuatkan Acara: ${e.message}</div>`; 
    }
};

/**
 * Memaparkan senarai saringan (Heats) bagi acara yang dipilih.
 */
window.pilihAcara = async (eventId, label, mode) => {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border"></div><p>Memuatkan saringan...</p></div>';
    try {
        const heats = await getHeatsData(tahunAktif, eventId);
        
        let html = `
            <button class="btn btn-sm btn-outline-secondary mb-3" onclick="renderSenaraiAcara('${mode}')">
                <i class="bi bi-arrow-left me-1"></i> Kembali ke Senarai Acara
            </button>
            <h4 class="text-primary fw-bold mb-3 border-bottom pb-2">${label}</h4>
        `;

        if (heats.length === 0) {
            html += `
            <div class="alert alert-warning text-center p-5">
                <h4><i class="bi bi-exclamation-circle"></i></h4>
                <p>Tiada saringan dijumpai untuk acara ini.</p>
                <button id="btn-jana" class="btn btn-dark mt-2">
                    <i class="bi bi-magic me-2"></i>Jana Saringan Automatik
                </button>
            </div>`;
        } else {
            html += `<p class="text-muted mb-3">Sila pilih saringan untuk memasukkan keputusan:</p>`;
            html += `<div class="list-group shadow-sm">`;
            
            // Sort saringan mengikut nombor
            heats.sort((a,b) => parseInt(a.noSaringan) - parseInt(b.noSaringan));
            
            heats.forEach(h => {
                const badgeColor = h.status === 'selesai' ? 'success' : 'warning';
                const badgeText = h.status === 'selesai' ? 'SELESAI' : 'MENUNGGU KEPUTUSAN';
                const labelSaringan = h.jenis === 'akhir' ? 'PERINGKAT AKHIR' : `SARINGAN ${h.noSaringan}`;
                
                html += `
                <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3 mb-2 border rounded" 
                    onclick="pilihSaringan('${eventId}', '${h.id}', '${label}', '${mode}')">
                    
                    <div>
                        <span class="fw-bold fs-5 text-dark">${labelSaringan}</span>
                        <div class="small text-muted"><i class="bi bi-people me-1"></i> ${h.peserta?.length||0} Peserta Berdaftar</div>
                    </div>
                    
                    <span class="badge bg-${badgeColor} rounded-pill px-3 py-2">${badgeText}</span>
                </button>`;
            });
            html += `</div>`;
        }
        contentArea.innerHTML = html;

        // Logic Butang Jana Saringan (Jika tiada saringan)
        const btnJana = document.getElementById('btn-jana');
        if(btnJana) {
            btnJana.onclick = async () => {
                if(!confirm("Adakah anda pasti mahu menjana saringan secara automatik?")) return;
                
                btnJana.disabled = true;
                btnJana.innerText = "Sedang Memproses...";
                try {
                    await generateHeats(tahunAktif, eventId);
                    alert("Saringan berjaya dijana!");
                    // Refresh paparan
                    pilihAcara(eventId, label, mode);
                } catch(err) {
                    alert("Gagal jana saringan: " + err.message);
                    btnJana.disabled = false;
                }
            };
        }
    } catch(e) { 
        console.error(e);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${e.message}</div>`; 
    }
};

// ==============================================================================
// BAHAGIAN F: PAPARAN BORANG INPUT (BORANG UTAMA)
// ==============================================================================

/**
 * Memaparkan borang input keputusan.
 * Fungsi ini mengesan jenis acara (Balapan/Padang/Lompat Tinggi) dan memilih
 * layout jadual yang sesuai.
 */
window.pilihSaringan = async (eventId, heatId, label, mode) => {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success"></div><p>Membuka borang keputusan...</p></div>';
    
    try {
        const isEditMode = (mode === 'input');
        
        // 1. Dapatkan Data Saringan dari DB
        const snap = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId));
        if(!snap.exists()) {
            contentArea.innerHTML = `<div class="alert alert-danger">Data saringan tidak dijumpai dalam database.</div>`;
            return;
        }
        const data = snap.data();

        // 2. Dapatkan Info Rekod Kejohanan (Ciri Baru)
        let recordText = "Tiada Rekod";
        window.currentRecordData = null; // Reset
        try {
            const eventDoc = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId));
            if(eventDoc.exists()) {
                const eData = eventDoc.data();
                if(eData.rekodSemasa) {
                    // Simpan data rekod untuk logic comparison nanti
                    window.currentRecordData = eData.rekodSemasa; 
                    recordText = `<strong>${eData.rekodSemasa.catatan}</strong> (${eData.rekodSemasa.pemegang}, ${eData.rekodSemasa.tahun})`;
                }
            }
        } catch(err) { console.warn("Gagal tarik info rekod:", err); }

        // 3. Simpan State Global
        window.currentHeatData = data;
        window.currentHeatId = heatId;
        window.currentEventId = eventId;
        window.currentLabel = label;
        window.currentMode = mode;

        // 4. Pengesanan Jenis Acara
        const nama = label.toUpperCase();
        // Adakah ia Lompat Tinggi?
        const isHighJump = nama.includes("LOMPAT TINGGI");
        // Adakah ia acara Padang lain? (Lompat Jauh, Lontar Peluru, dll)
        const isField = (nama.includes("LOMPAT") || nama.includes("LONTAR") || nama.includes("REJAM") || nama.includes("LEMPAR")) && !isHighJump;

        // 5. Render Header Borang
        let html = `
            <div class="d-flex justify-content-between mb-4 d-print-none">
                <button class="btn btn-sm btn-outline-secondary" onclick="pilihAcara('${eventId}', '${label}', '${mode}')">
                    <i class="bi bi-chevron-left"></i> Kembali
                </button>
                <div class="d-flex gap-2">
                    ${!data.peserta?.length ? `<button class="btn btn-sm btn-warning fw-bold text-dark" onclick="agihLorongAuto('${eventId}','${heatId}','${label}','${mode}')"><i class="bi bi-shuffle me-1"></i>Tarik Peserta Auto</button>` : ''}
                    <button class="btn btn-sm btn-success fw-bold" onclick="window.print()">
                        <i class="bi bi-printer me-1"></i>Cetak Borang
                    </button>
                </div>
            </div>
            
            <div class="text-center mb-4 border-bottom pb-3">
                <h3 class="fw-bold text-uppercase m-0 font-monospace">${label}</h3>
                <div class="d-flex justify-content-center gap-3 mt-2 align-items-center">
                    <span class="badge bg-dark fs-6 rounded-pill px-3">${data.jenis==='akhir'?'PERINGKAT AKHIR':`SARINGAN ${data.noSaringan}`}</span>
                    <div class="bg-light px-3 py-1 rounded border small text-muted">
                        <i class="bi bi-trophy-fill text-warning me-1"></i>Rekod Kejohanan: ${recordText}
                    </div>
                </div>
                
                <div id="new-record-alert" class="alert alert-warning mt-3 d-none fw-bold animate__animated animate__flash shadow-sm border-warning text-dark">
                    <h5 class="mb-0"><i class="bi bi-star-fill text-danger me-2"></i>TAHNIAH! REKOD BARU KEJOHANAN DIKESAN!</h5>
                </div>
            </div>
        `;

        // 6. Pilih Template Table yang sesuai
        if(isHighJump) {
            html += renderBorangLompatTinggi(data, !isEditMode);
        } else if(isField) {
            html += renderBorangPadang(data, !isEditMode);
        } else {
            html += renderBorangBalapan(data, !isEditMode);
        }

        contentArea.innerHTML = html;

    } catch(e) { 
        console.error(e);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat Membuka Borang: ${e.message}</div>`; 
    }
};

// --- FUNGSI RENDER: TABLE BALAPAN (TRACK) ---
function renderBorangBalapan(h, readOnly) {
    // Header Table
    let t = `
    <div class="table-responsive">
    <table class="table table-bordered text-center align-middle mb-0 shadow-sm">
        <thead class="table-dark">
            <tr>
                <th width="10%">Lorong</th>
                <th width="50%" class="text-start ps-3">Nama Peserta</th>
                <th width="20%">Masa (s)</th>
                <th width="20%">Kedudukan</th>
            </tr>
        </thead>
        <tbody>`;
    
    if(!h.peserta?.length) {
        t+=`<tr><td colspan="4" class="py-4 text-muted fst-italic">Tiada peserta didaftarkan dalam saringan ini.</td></tr>`;
    } else {
        // Susun ikut lorong
        h.peserta.sort((a,b) => parseInt(a.lorong) - parseInt(b.lorong));
        
        h.peserta.forEach((p,i) => {
            const isRecord = p.pecahRekod ? 'table-warning' : ''; // Highlight jika rekod pecah
            t += `
            <tr data-idx="${i}" class="${isRecord}">
                <td class="fw-bold fs-5 bg-light">${p.lorong}</td>
                <td class="text-start ps-3">
                    <div class="fw-bold text-uppercase">${p.nama}</div>
                    <div class="small text-muted d-flex gap-2">
                        <span class="badge bg-secondary">${p.noBib||'-'}</span>
                        <span>${p.sekolah || p.idRumah || ''}</span>
                    </div>
                </td>
                <td>
                    ${readOnly ? 
                        (p.pencapaian || '-') : 
                        `<input type="text" class="form-control text-center fw-bold res-input" data-idx="${i}" value="${p.pencapaian||''}" placeholder="00.00">`
                    }
                </td>
                <td>
                    ${readOnly ? 
                        (p.kedudukan || '-') : 
                        `<input type="number" class="form-control text-center fw-bold ked-input" data-idx="${i}" value="${p.kedudukan||''}" min="0" max="20">`
                    }
                </td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;
    
    if(!readOnly) {
        t += `<div class="d-grid mt-3 d-print-none">
                <button class="btn btn-primary btn-lg" id="btn-save-results">
                    <i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN
                </button>
              </div>`;
    }
    return t;
}

// --- FUNGSI RENDER: TABLE PADANG (FIELD) ---
function renderBorangPadang(h, readOnly) {
    let t = `
    <div class="table-responsive">
    <table class="table table-bordered text-center align-middle mb-0 shadow-sm">
        <thead class="table-dark">
            <tr>
                <th width="10%">No.</th>
                <th width="50%" class="text-start ps-3">Nama Peserta</th>
                <th width="20%">Jarak (m)</th>
                <th width="20%">Kedudukan</th>
            </tr>
        </thead>
        <tbody>`;
    
    if(!h.peserta?.length) {
        t+=`<tr><td colspan="4" class="py-4 text-muted">Tiada peserta.</td></tr>`;
    } else {
        // Susun ikut No Bib
        h.peserta.sort((a,b) => (a.noBib||'').localeCompare(b.noBib||''));
        
        h.peserta.forEach((p,i) => {
            const isRecord = p.pecahRekod ? 'table-warning' : '';
            t += `
            <tr data-idx="${i}" class="${isRecord}">
                <td class="bg-light">${i+1}</td>
                <td class="text-start ps-3">
                    <div class="fw-bold text-uppercase">${p.nama}</div>
                    <div class="small text-muted"><span class="badge bg-secondary">${p.noBib||'-'}</span> (${p.sekolah || p.idRumah || ''})</div>
                </td>
                <td>
                    ${readOnly ? 
                        (p.pencapaian || '-') : 
                        `<input type="text" class="form-control text-center fw-bold res-input" data-idx="${i}" value="${p.pencapaian||''}" placeholder="0.00">`
                    }
                </td>
                <td>
                    ${readOnly ? 
                        (p.kedudukan || '-') : 
                        `<input type="number" class="form-control text-center fw-bold ked-input" data-idx="${i}" value="${p.kedudukan||''}" min="0">`
                    }
                </td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;
    
    if(!readOnly) {
        t += `<div class="d-grid mt-3 d-print-none">
                <button class="btn btn-primary btn-lg" id="btn-save-results">SIMPAN KEPUTUSAN</button>
              </div>`;
    }
    return t;
}

// --- FUNGSI RENDER: TABLE LOMPAT TINGGI (DIPERBAIKI) ---
function renderBorangLompatTinggi(h, readOnly) {
    // 1. Kumpul semua ketinggian yang ada
    let heights = new Set();
    if(h.peserta) {
        h.peserta.forEach(p => { 
            if(p.rekodLompatan) {
                Object.keys(p.rekodLompatan).forEach(k => heights.add(k)); 
            }
        });
    }
    
    // Susun ketinggian secara numerik (rendah ke tinggi)
    let cols = Array.from(heights).sort((a,b) => parseFloat(a) - parseFloat(b));
    
    let t = ``;
    // Butang Tambah Ketinggian (Hanya mode edit)
    if(!readOnly) {
        t += `<div class="d-flex justify-content-between alert alert-info py-2 d-print-none align-items-center mb-2">
            <small><i class="bi bi-info-circle me-1"></i>Sila klik "Tambah Ketinggian" untuk menambah lajur palang baru.</small>
            <button class="btn btn-sm btn-dark rounded-pill shadow-sm" id="btn-add-height">
                <i class="bi bi-plus-lg me-1"></i>Tambah Ketinggian
            </button>
        </div>`;
    }

    // Menggunakan Wrapper CSS 'table-highjump-wrapper' (dari admin.html) untuk scrolling
    t += `
    <div class="table-highjump-wrapper bg-white shadow-sm p-0 border rounded">
        <table class="table table-bordered text-center align-middle table-sm border-dark mb-0" style="min-width: 100%;">
            <thead class="table-dark small">
                <tr>
                    <th style="min-width:40px; position:sticky; left:0; z-index:10;" class="bg-dark text-white border-end">No</th>
                    <th class="text-start" style="min-width:200px; position:sticky; left:40px; z-index:10;" class="bg-dark text-white border-end">Nama Peserta</th>
                    
                    ${cols.map(c => `<th style="min-width:60px; font-family:monospace;">${parseFloat(c).toFixed(2)}m</th>`).join('')}
                    
                    <th class="th-fixed col-best-fixed bg-primary text-white" style="border-left:2px solid #aaa;">Best</th>
                    <th class="th-fixed col-rank-fixed bg-dark text-white">Rank</th>
                </tr>
            </thead>
            <tbody>`;

    if(!h.peserta?.length) {
        t += `<tr><td colspan="${4+cols.length}" class="py-5 text-muted">Tiada peserta didaftarkan.</td></tr>`;
    } else {
        // Susun peserta ikut No Bib
        h.peserta.sort((a,b) => (a.noBib||'').localeCompare(b.noBib||''));
        
        h.peserta.forEach((p,i) => {
            const isRecord = p.pecahRekod ? 'bg-warning bg-opacity-25' : '';
            
            t += `<tr data-idx="${i}" class="${isRecord}">
                <td style="position:sticky; left:0; background:#fff; z-index:5;" class="border-end">${i+1}</td>
                <td class="text-start text-wrap border-end" style="position:sticky; left:40px; background:#fff; z-index:5;">
                    <div class="fw-bold">${p.nama}</div>
                    <small class="text-muted font-monospace">${p.noBib||'-'}</small>
                </td>
                
                ${cols.map(c => {
                    const val = p.rekodLompatan?.[c]?.join('') || '';
                    return `<td class="p-0">
                        ${readOnly ? 
                            `<div class="fw-bold py-2">${val}</div>` : 
                            `<input type="text" class="form-control form-control-sm border-0 text-center fw-bold hj-input p-0" 
                              style="height:38px; text-transform:uppercase; letter-spacing:2px; font-family:monospace;" 
                              data-ht="${c}" value="${val}" maxlength="3">`
                        }
                    </td>`;
                }).join('')}
                
                <td class="td-fixed col-best-fixed bg-light border-start border-secondary">
                    ${readOnly ? 
                        (p.pencapaian||'') : 
                        `<input class="form-control form-control-sm text-center fw-bold res-input" data-idx="${i}" value="${p.pencapaian||''}">`
                    }
                </td>
                <td class="td-fixed col-rank-fixed bg-light border-start">
                    ${readOnly ? 
                        (p.kedudukan||'') : 
                        `<input type="number" class="form-control form-control-sm text-center ked-input" data-idx="${i}" value="${p.kedudukan>0?p.kedudukan:''}">`
                    }
                </td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;

    if(!readOnly) {
        t += `<button class="btn btn-primary w-100 mt-3 d-print-none btn-lg shadow" id="btn-save-results">
                <i class="bi bi-save2 me-2"></i>SIMPAN KEPUTUSAN LOMPAT TINGGI
              </button>`;
    }
    
    // Footer untuk cetakan tandatangan rasmi
    t += `<div class="row mt-5 d-none d-print-flex" style="page-break-inside: avoid;">
            <div class="col-6 text-center">
                <br><br>_______________________<br>
                <strong>Tandatangan Hakim</strong>
            </div>
            <div class="col-6 text-center">
                <br><br>_______________________<br>
                <strong>Tandatangan Refri</strong>
            </div>
          </div>`;
    
    return t;
}

// ==============================================================================
// BAHAGIAN G: LOGIK SIMPAN DATA (CORE LOGIC)
// ==============================================================================

/**
 * Event Listener Utama untuk butang-butang interaktif dalam borang.
 * Mengendalikan Simpan Keputusan, Tambah Ketinggian, dan Kira Olahragawan.
 */
document.addEventListener('click', async (e) => {
    
    // --- 1. LOGIK SIMPAN KEPUTUSAN ---
    if(e.target.closest('#btn-save-results')) {
        e.preventDefault();
        const btn = document.querySelector('#btn-save-results');
        
        // UX: Disable butang supaya user tak spam click
        btn.disabled = true; 
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...`;

        try {
            if(!window.currentHeatData) throw new Error("Tiada data saringan aktif untuk disimpan.");
            
            // Clone data peserta untuk elak mutasi langsung yang tak diingini
            let peserta = JSON.parse(JSON.stringify(window.currentHeatData.peserta || []));
            let recordBroken = false;

            // Dapatkan nilai rekod semasa untuk perbandingan
            const currentRecVal = window.currentRecordData ? parseFloat(window.currentRecordData.catatan) : null;
            
            // Loop setiap peserta untuk ambil nilai input
            peserta.forEach((p, idx) => {
                // Cari input element berdasarkan data-idx
                const resInput = document.querySelector(`.res-input[data-idx="${idx}"]`);
                const kedInput = document.querySelector(`.ked-input[data-idx="${idx}"]`);
                
                // Update Data
                if(resInput) p.pencapaian = resInput.value.trim().toUpperCase();
                if(kedInput) p.kedudukan = kedInput.value ? parseInt(kedInput.value) : 0;

                // --- CHECK REKOD BARU ---
                p.pecahRekod = false; // Reset flag
                if(p.pencapaian && currentRecVal && !isNaN(parseFloat(p.pencapaian))) {
                    const val = parseFloat(p.pencapaian);
                    
                    // Logic berbeza untuk Padang vs Balapan
                    const isField = window.currentLabel.toUpperCase().includes("LOMPAT") || window.currentLabel.toUpperCase().includes("LONTAR") || window.currentLabel.toUpperCase().includes("REJAM");
                    
                    if(!isField) {
                        // Balapan: Masa MESTI LEBIH KECIL dari rekod
                        if(val < currentRecVal && val > 0) { 
                            p.pecahRekod = true; 
                            recordBroken = true; 
                        }
                    } else {
                        // Padang: Jarak MESTI LEBIH BESAR dari rekod
                        if(val > currentRecVal) { 
                            p.pecahRekod = true; 
                            recordBroken = true; 
                        }
                    }
                }

                // Logic Khas Lompat Tinggi (Ambil data grid)
                if(window.currentLabel.toUpperCase().includes("LOMPAT TINGGI")) {
                    const row = document.querySelector(`tr[data-idx="${idx}"]`);
                    if(row) {
                        row.querySelectorAll('.hj-input').forEach(hjEl => {
                            const ht = hjEl.dataset.ht;
                            if(!p.rekodLompatan) p.rekodLompatan = {};
                            // Simpan sebagai array char (cth: ['X','O'])
                            p.rekodLompatan[ht] = hjEl.value.toUpperCase().split('');
                        });
                    }
                }
            });

            // Simpan ke Firestore
            await saveHeatResults(tahunAktif, window.currentEventId, window.currentHeatId, peserta);
            
            // Auto Update Status Acara Induk
            // Jika ini Acara Akhir, tandakan acara sebagai 'Selesai' supaya dashboard Olahragawan boleh kira
            if(window.currentHeatData.jenis === 'akhir') {
                 await updateDoc(doc(db, "kejohanan", tahunAktif, "acara", window.currentEventId), { 
                     status: 'selesai',
                     updatedAt: new Date().toISOString()
                 });
            }

            alert("Data keputusan berjaya disimpan!");

            // Papar notifikasi jika rekod pecah
            if(recordBroken) {
                const alertBox = document.getElementById('new-record-alert');
                if(alertBox) {
                    alertBox.classList.remove('d-none');
                    alertBox.scrollIntoView({ behavior: 'smooth' });
                }
            }

            // Refresh Borang untuk nampak perubahan
            pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);

        } catch(err) {
            console.error(err);
            alert("Gagal Simpan: " + err.message);
            btn.disabled = false; 
            btn.innerHTML = `<i class="bi bi-save me-2"></i>Cuba Lagi`;
        }
    }

    // --- 2. LOGIK TAMBAH KETINGGIAN (LOMPAT TINGGI) ---
    if(e.target.closest('#btn-add-height')) {
        e.preventDefault();
        const val = prompt("Masukkan ketinggian baru (contoh: 1.25):");
        
        if(val) {
            const num = parseFloat(val).toFixed(2); // Paksa 2 titik perpuluhan
            if(isNaN(num)) return alert("Sila masukkan nombor yang sah.");
            
            // Tambah key ketinggian kosong pada semua peserta
            if(window.currentHeatData?.peserta) {
                window.currentHeatData.peserta.forEach(p => {
                    if(!p.rekodLompatan) p.rekodLompatan = {};
                    if(!p.rekodLompatan[num]) p.rekodLompatan[num] = [];
                });
                
                // Refresh UI untuk tunjuk kolum baru
                pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);
            }
        }
    }
    
    // --- 3. LOGIK KIRA OLAHRAGAWAN (CIRI BARU) ---
    if(e.target.id === 'btn-kira-olahragawan') {
        kiraStatistikPemenang();
    }
});

// ==============================================================================
// BAHAGIAN H: DASHBOARD OLAHRAGAWAN & STATISTIK
// ==============================================================================

/**
 * Mengira pemenang Olahragawan dan Olahragawati berdasarkan logik:
 * 1. Jumlah Rekod Baru (Utama)
 * 2. Jumlah Emas
 * 3. Jumlah Perak
 * 4. Jumlah Gangsa
 */
async function kiraStatistikPemenang() {
    const btn = document.getElementById('btn-kira-olahragawan');
    btn.disabled = true; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sedang Mengira Data...';

    try {
        console.log("Memulakan pengiraan statistik...");
        
        // 1. Tarik SEMUA acara
        const eventsSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
        
        // Objek untuk kumpul statistik setiap murid
        // Format Key: ID Peserta, Value: { nama, rumah, kat, emas, perak, gangsa, rekod }
        let allPesertaStats = {}; 

        // Loop melalui setiap acara
        for(let evDoc of eventsSnap.docs) {
            const ev = evDoc.data();
            
            // Hanya kira jika acara sudah 'selesai' untuk jimat resource (optional)
            // Tapi lebih selamat check semua saringan akhir
            
            const heatSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara", evDoc.id, "saringan"));
            
            heatSnap.forEach(hDoc => {
                const h = hDoc.data();
                
                // KITA HANYA KIRA KEPUTUSAN ACARA AKHIR SAHAJA
                if(h.jenis === 'akhir' && h.peserta && Array.isArray(h.peserta)) {
                    
                    h.peserta.forEach(p => {
                        // Skip jika tiada ID (peserta hantu?)
                        if(!p.idPeserta) return;
                        
                        // Initialize data peserta jika belum ada dalam map
                        if(!allPesertaStats[p.idPeserta]) {
                            allPesertaStats[p.idPeserta] = {
                                nama: p.nama,
                                rumah: p.idRumah,
                                kategori: ev.kategori, // Ambil kategori dari acara induk
                                emas: 0, 
                                perak: 0, 
                                gangsa: 0, 
                                rekod: 0
                            };
                        }

                        // Logik Tambah Pingat
                        if(p.kedudukan === 1) allPesertaStats[p.idPeserta].emas++;
                        else if(p.kedudukan === 2) allPesertaStats[p.idPeserta].perak++;
                        else if(p.kedudukan === 3) allPesertaStats[p.idPeserta].gangsa++;

                        // Logik Tambah Rekod (Flag ini datang dari fungsi Save tadi)
                        if(p.pecahRekod === true) allPesertaStats[p.idPeserta].rekod++;
                    });
                }
            });
        }

        // 2. Fungsi Sorting Custom (Rekod > Emas > Perak > Gangsa)
        const sortWinners = (list) => {
            return list.sort((a, b) => {
                if(b.rekod !== a.rekod) return b.rekod - a.rekod; // Utamakan Rekod
                if(b.emas !== a.emas) return b.emas - a.emas;     // Kemudian Emas
                if(b.perak !== a.perak) return b.perak - a.perak; // Kemudian Perak
                return b.gangsa - a.gangsa;                       // Akhir sekali Gangsa
            });
        };

        // Tukar object ke array untuk sorting
        const statsArray = Object.values(allPesertaStats);
        
        // 3. Cari Pemenang Ikut Kategori

        // A. Olahragawan 12T (L12)
        const calonL12 = statsArray.filter(p => p.kategori === 'L12');
        const winnerL12 = sortWinners(calonL12)[0];
        updateWinnerCard('winner-L12', 'stats-L12', winnerL12);

        // B. Olahragawati 12T (P12)
        const calonP12 = statsArray.filter(p => p.kategori === 'P12');
        const winnerP12 = sortWinners(calonP12)[0];
        updateWinnerCard('winner-P12', 'stats-P12', winnerP12);

        // C. Olahragawan Harapan (Gabungan L9 & L10)
        const calonHarapanL = statsArray.filter(p => ['L9','L10'].includes(p.kategori));
        const winnerHarapanL = sortWinners(calonHarapanL)[0];
        updateWinnerCard('winner-harapan-L', 'stats-harapan-L', winnerHarapanL);

        // D. Olahragawati Harapan (Gabungan P9 & P10)
        const calonHarapanP = statsArray.filter(p => ['P9','P10'].includes(p.kategori));
        const winnerHarapanP = sortWinners(calonHarapanP)[0];
        updateWinnerCard('winner-harapan-P', 'stats-harapan-P', winnerHarapanP);

        // 4. Paparkan Jadual Penuh (Top 20 Keseluruhan)
        // Kita sort semua peserta tanpa mengira kategori untuk ranking umum
        const allSorted = sortWinners(statsArray).slice(0, 20); // Ambil Top 20
        const tbody = document.querySelector('#table-ranking-full tbody');
        
        if(allSorted.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-3">Tiada data keputusan dijumpai.</td></tr>`;
        } else {
            tbody.innerHTML = allSorted.map((p, i) => `
                <tr>
                    <td>${i+1}</td>
                    <td class="fw-bold">${p.nama}</td>
                    <td><span class="badge bg-secondary">${p.kategori}</span></td>
                    <td class="text-uppercase fw-bold text-${p.rumah==='kuning'?'warning':p.rumah}">${p.rumah}</td>
                    <td class="text-center fw-bold bg-danger bg-opacity-10 text-danger">${p.rekod > 0 ? p.rekod : '-'}</td>
                    <td class="text-center text-warning fw-bold fs-5">${p.emas}</td>
                    <td class="text-center fw-bold text-secondary fs-5">${p.perak}</td>
                    <td class="text-center fw-bold fs-5" style="color:#cd7f32">${p.gangsa}</td>
                </tr>
            `).join('');
        }

        alert("Pengiraan statistik selesai!");

    } catch(e) {
        console.error("Ralat Pengiraan:", e);
        alert("Ralat Pengiraan: " + e.message);
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="bi bi-calculator me-2"></i>Kira Pemenang';
    }
}

// Fungsi Helper untuk Update Kad Pemenang di HTML
function updateWinnerCard(idTitle, idStats, data) {
    if(data) {
        // Jika ada pemenang
        document.getElementById(idTitle).innerHTML = `
            <h5 class="mb-0 fw-bold text-dark">${data.nama}</h5>
            <small class="text-uppercase text-muted fw-bold">${data.rumah}</small>
        `;
        document.getElementById(idStats).innerHTML = `
            <div class="d-flex justify-content-between mt-2">
                <span class="badge bg-danger rounded-pill">Rekod: ${data.rekod}</span>
                <span class="badge bg-warning text-dark rounded-pill">Emas: ${data.emas}</span>
            </div>
            <div class="d-flex justify-content-between mt-1">
                <span class="badge bg-secondary rounded-pill">Perak: ${data.perak}</span>
                <span class="badge rounded-pill" style="background:#cd7f32">Gangsa: ${data.gangsa}</span>
            </div>
        `;
    } else {
        // Jika tiada data
        document.getElementById(idTitle).innerHTML = `<h5 class="mb-0 text-muted fst-italic">Tiada Calon</h5>`;
        document.getElementById(idStats).innerHTML = `<small class="text-muted">Belum ada pingat dimenangi.</small>`;
    }
}

// ==============================================================================
// BAHAGIAN I: FUNGSI AGIHAN LORONG AUTOMATIK
// ==============================================================================

/**
 * Fungsi ini menarik peserta dari senarai pendaftaran (koleksi 'peserta')
 * dan memasukkan mereka ke dalam saringan secara automatik.
 * Digunakan jika guru rumah sudah daftar nama, tetapi Admin belum buat saringan.
 */
window.agihLorongAuto = async (eventId, heatId, label, mode) => {
    if(!confirm("Adakah anda pasti mahu menarik peserta secara automatik? \nAMARAN: Data sedia ada dalam saringan ini akan digantikan.")) return;
    
    try {
        // 1. Dapatkan info acara induk untuk tahu Kategori (L12, P10, dll)
        const evSnap = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId));
        if(!evSnap.exists()) return alert("Acara tidak wujud.");
        const evData = evSnap.data();
        
        console.log(`Mengambil peserta untuk kategori: ${evData.kategori}`);

        // 2. Query semua peserta dalam kategori tersebut
        const q = query(collection(db, "kejohanan", tahunAktif, "peserta"), where("kategori", "==", evData.kategori));
        const pSnap = await getDocs(q);
        
        let validParticipants = [];
        
        // 3. Filter peserta yang mendaftar untuk acara ini
        pSnap.forEach(d => {
            const p = d.data();
            let isRegistered = false;
            
            // Semak struktur data pendaftaran peserta
            // Kadang-kadang format { "100m": true } atau array ["100m"]
            if(p.acara) {
                if(typeof p.acara === 'object' && !Array.isArray(p.acara) && p.acara[evData.nama]) {
                    isRegistered = true;
                } else if (Array.isArray(p.acara) && p.acara.includes(evData.nama)) {
                    isRegistered = true;
                }
            }
            
            if(isRegistered) {
                validParticipants.push({
                    idPeserta: d.id, 
                    nama: p.nama, 
                    noBib: p.noBib||'-', 
                    idRumah: p.rumah||p.idRumah||'', 
                    sekolah: p.sekolah||'',
                    lorong: 0, // Akan diset kemudian
                    pencapaian: '',
                    kedudukan: 0
                });
            }
        });

        if(validParticipants.length === 0) return alert("Tiada peserta ditemui yang mendaftar untuk acara ini.");
        
        // 4. Assign Lorong (1 - 8)
        // Kita limitkan max 8 lorong untuk standard, atau ikut jumlah peserta
        validParticipants = validParticipants.map((p,i) => ({
            ...p, 
            lorong: i+1
        }));

        // 5. Simpan ke Database
        await updateDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId), { 
            peserta: validParticipants,
            updatedAt: new Date().toISOString()
        });
        
        alert(`Berjaya menarik ${validParticipants.length} peserta ke dalam saringan.`);
        
        // Refresh UI
        pilihSaringan(eventId, heatId, label, mode);

    } catch(e) { 
        console.error(e);
        alert("Ralat Agihan Auto: " + e.message); 
    }
};

/* TAMAT FAIL main-admin.js */
