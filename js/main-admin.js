/**
 * ==============================================================================
 * SISTEM PENGURUSAN KEJOHANAN OLAHRAGA TAHUNAN (KOT)
 * FAIL: main-admin.js
 * VERSI: ULTIMATE (Lengkap dengan Olahragawan & Fix UI)
 * ==============================================================================
 */

// ==============================================================================
// 1. IMPORT MODUL & FIREBASE
// ==============================================================================
import { 
    initializeTournament, 
    getHeatsData, 
    saveHeatResults,
    saveBulkRecords,
    generateHeats
} from './modules/admin.js';

import { db } from './firebase-config.js';

import { 
    doc, getDoc, updateDoc, setDoc, collection, getDocs, writeBatch, deleteDoc, query, where 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ==============================================================================
// 2. PEMBOLEHUBAH GLOBAL
// ==============================================================================
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString(); 
const contentArea = document.getElementById('content-area');

// State Management (Untuk simpan data sementara semasa edit)
window.currentHeatData = null;
window.currentHeatId = null;
window.currentEventId = null;
window.currentLabel = null;
window.currentMode = 'input'; 
window.currentRecordData = null; // Menyimpan info rekod kejohanan semasa

// ==============================================================================
// 3. INIT & NAVIGASI UTAMA
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Admin System Init. Tahun:", tahunAktif);

    // Kemaskini Label Tahun
    const labelTahun = document.getElementById('tahun-label');
    if(labelTahun) labelTahun.innerText = `Tahun: ${tahunAktif}`;

    // Sembunyikan view Olahragawan by default
    toggleView('main');
});

// Helper: Tukar View antara Content Area (Asal) dan View Olahragawan (Baru)
function toggleView(viewName) {
    const mainContent = document.getElementById('content-area');
    const olahragawanView = document.getElementById('view-olahragawan');
    
    if (viewName === 'olahragawan') {
        mainContent.classList.add('d-none');
        olahragawanView.classList.remove('d-none');
    } else {
        mainContent.classList.remove('d-none');
        olahragawanView.classList.add('d-none');
    }
}

// --- EVENT LISTENERS MENU SIDEBAR ---

// Menu Setup
document.getElementById('menu-setup')?.addEventListener('click', () => {
    toggleView('main');
    renderSetupForm();
});

// Menu Keputusan Acara
document.getElementById('menu-acara')?.addEventListener('click', () => {
    toggleView('main');
    renderSenaraiAcara('input');
});

// Menu Olahragawan (BARU)
document.getElementById('menu-olahragawan')?.addEventListener('click', () => {
    toggleView('olahragawan');
    // Kita tidak auto-kira, tunggu user tekan butang
});

// Log Keluar
document.getElementById('btn-logout')?.addEventListener('click', () => {
    if(confirm("Log keluar dari sistem?")) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
});

// ==============================================================================
// 4. FUNGSI SETUP, UTILITI & RUMAH SUKAN (Fungsi Asal Kekal)
// ==============================================================================
function renderSetupForm() {
    contentArea.innerHTML = `
        <div class="row g-4">
            <div class="col-md-6">
                <div class="card p-4 h-100 shadow-sm border-0">
                    <h5 class="text-primary"><i class="bi bi-database me-2"></i>Setup Database</h5>
                    <p class="text-muted small">Jana struktur awal untuk tahun ${tahunAktif}.</p>
                    <button class="btn btn-primary mt-auto" id="btn-init">Jana Struktur</button>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card p-4 h-100 shadow-sm border-0">
                    <h5 class="text-success"><i class="bi bi-shield-lock me-2"></i>Rumah Sukan</h5>
                    <p class="text-muted small">Urus kata laluan rumah sukan.</p>
                    <button class="btn btn-success mt-auto" onclick="renderSenaraiRumah()">Urus Kata Laluan</button>
                </div>
            </div>
            <div class="col-md-12">
                <div class="card p-4 shadow-sm border-0">
                    <h5 class="text-dark mb-3"><i class="bi bi-hdd-network me-2"></i>Utiliti Data</h5>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-outline-dark" id="btn-laksana-backup"><i class="bi bi-download me-2"></i>Backup JSON</button>
                        <button class="btn btn-outline-danger" data-bs-toggle="modal" data-bs-target="#modalPadam"><i class="bi bi-trash me-2"></i>Padam Data</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="house-list" class="mt-4"></div>`;

    document.getElementById('btn-init').onclick = async () => {
        if(!confirm("Anda pasti mahu menjana database baru?")) return;
        const res = await initializeTournament(tahunAktif, []);
        alert(res.success ? "Berjaya!" : "Ralat: " + res.message);
    };

    // Backup Listener
    document.getElementById('btn-laksana-backup').onclick = async () => {
        const btn = document.getElementById('btn-laksana-backup');
        btn.disabled = true; btn.innerText = "Processing...";
        try {
            let data = {};
            const collections = ["peserta", "rumah", "acara"];
            for(let col of collections) {
                data[col] = {};
                const snap = await getDocs(collection(db, "kejohanan", tahunAktif, col));
                snap.forEach(d => data[col][d.id] = d.data());
            }
            const url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: "application/json"}));
            const a = document.createElement('a'); a.href=url; a.download=`BACKUP_${tahunAktif}.json`; a.click();
            alert("Backup Selesai!");
        } catch(e) { alert("Ralat Backup: "+e.message); }
        finally { btn.disabled = false; btn.innerText = "Backup JSON"; }
    };
}

// Fungsi Senarai Rumah
window.renderSenaraiRumah = async () => {
    const container = document.getElementById('house-list');
    container.innerHTML = 'Loading...';
    const rumah = ['merah', 'biru', 'hijau', 'kuning'];
    let html = `<div class="card"><div class="card-header bg-white fw-bold">Senarai Rumah Sukan</div>
    <div class="table-responsive"><table class="table table-bordered mb-0"><tr><th>Rumah</th><th>Kod Laluan</th><th>Tindakan</th></tr>`;
    
    for(let r of rumah) {
        const snap = await getDoc(doc(db, "kejohanan", tahunAktif, "rumah", r));
        const kod = snap.exists() ? snap.data().kod || '' : '';
        html += `<tr><td class="text-uppercase fw-bold text-${r==='kuning'?'warning':r}">${r}</td>
        <td><input id="kod-${r}" type="text" class="form-control form-control-sm" value="${kod}"></td>
        <td><button class="btn btn-sm btn-dark" onclick="simpanKodRumah('${r}')">Simpan</button></td></tr>`;
    }
    container.innerHTML = html + `</table></div></div>`;
};

window.simpanKodRumah = async (id) => {
    const val = document.getElementById(`kod-${id}`).value;
    await setDoc(doc(db, "kejohanan", tahunAktif, "rumah", id), {kod: val, nama: id.toUpperCase()}, {merge: true});
    alert("Disimpan.");
};

// Fungsi Padam Data (Global)
document.getElementById('btn-laksana-padam')?.addEventListener('click', async () => {
    const jenis = document.getElementById('select-padam-jenis').value;
    const sah = document.getElementById('input-pengesahan-padam').value;
    if(sah !== 'SAH PADAM') return;
    if(!confirm("AMARAN TERAKHIR: Data akan dipadam kekal. Teruskan?")) return;
    
    try {
        const deleteCol = async (path) => {
            const snap = await getDocs(path);
            let batch = writeBatch(db);
            let c = 0;
            snap.forEach(d => { batch.delete(d.ref); c++; if(c>=400){batch.commit(); batch=writeBatch(db); c=0;} });
            if(c>0) await batch.commit();
        };

        if(jenis === 'peserta' || jenis === 'semua') await deleteCol(collection(db, "kejohanan", tahunAktif, "peserta"));
        if(jenis === 'keputusan' || jenis === 'semua') {
            const evSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
            for(let ev of evSnap.docs) await deleteCol(collection(db, "kejohanan", tahunAktif, "acara", ev.id, "saringan"));
        }
        if(jenis === 'semua') {
            await deleteCol(collection(db, "kejohanan", tahunAktif, "acara"));
            await deleteCol(collection(db, "kejohanan", tahunAktif, "rumah"));
        }
        alert("Data berjaya dipadam.");
        location.reload();
    } catch(e) { alert("Ralat Padam: "+e.message); }
});

// ==============================================================================
// 5. SENARAI ACARA
// ==============================================================================
window.renderSenaraiAcara = async (mode) => {
    mode = 'input'; // Paksa mode input untuk admin
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan acara...</p></div>';

    try {
        let events = [];
        const snap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
        snap.forEach(d => events.push({id: d.id, ...d.data()}));

        const track = events.filter(e => e.kategori === 'balapan');
        const field = events.filter(e => e.kategori === 'padang');

        const card = (ev) => `
        <div class="col-md-4 mb-3">
            <div class="card h-100 shadow-sm border-0 hover-effect" onclick="pilihAcara('${ev.id}', '${ev.nama}', '${mode}')" style="cursor:pointer">
                <div class="card-body">
                    <span class="badge bg-${ev.status==='selesai'?'success':'secondary'} float-end">${ev.status||'Baru'}</span>
                    <h6 class="fw-bold text-primary">${ev.nama}</h6>
                    <small class="text-muted">${ev.kelas} | ${ev.jenis||'Akhir'}</small>
                </div>
            </div>
        </div>`;

        let html = `<h4 class="mb-3 border-bottom pb-2">Senarai Acara</h4>`;
        html += `<h5 class="text-success mt-3">Padang</h5><div class="row">${field.map(card).join('')||'<p>Tiada data</p>'}</div>`;
        html += `<h5 class="text-danger mt-4">Balapan</h5><div class="row">${track.map(card).join('')||'<p>Tiada data</p>'}</div>`;
        contentArea.innerHTML = html;

    } catch(e) { contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${e.message}</div>`; }
};

// ==============================================================================
// 6. PILIH SARINGAN
// ==============================================================================
window.pilihAcara = async (eventId, label, mode) => {
    contentArea.innerHTML = 'Loading...';
    try {
        const heats = await getHeatsData(tahunAktif, eventId);
        let html = `
            <button class="btn btn-sm btn-light border mb-3" onclick="renderSenaraiAcara('${mode}')"><i class="bi bi-arrow-left"></i> Kembali</button>
            <h4 class="text-primary mb-3">${label}</h4>
        `;

        if (heats.length === 0) {
            html += `<div class="alert alert-warning">Tiada saringan. <button id="btn-jana" class="btn btn-dark btn-sm ms-2">Jana Saringan</button></div>`;
        } else {
            html += `<div class="list-group">`;
            heats.sort((a,b)=>parseInt(a.noSaringan)-parseInt(b.noSaringan));
            heats.forEach(h => {
                html += `
                <button class="list-group-item list-group-item-action d-flex justify-content-between p-3" 
                    onclick="pilihSaringan('${eventId}', '${h.id}', '${label}', '${mode}')">
                    <span class="fw-bold">${h.jenis==='akhir'?'ACARA AKHIR':`Saringan ${h.noSaringan}`} (${h.peserta?.length||0} Peserta)</span>
                    <span class="badge bg-${h.status==='selesai'?'success':'warning'}">${h.status==='selesai'?'Selesai':'Input'}</span>
                </button>`;
            });
            html += `</div>`;
        }
        contentArea.innerHTML = html;

        const btnJana = document.getElementById('btn-jana');
        if(btnJana) {
            btnJana.onclick = async () => {
                btnJana.innerText = "Memproses...";
                await generateHeats(tahunAktif, eventId);
                pilihAcara(eventId, label, mode);
            };
        }
    } catch(e) { contentArea.innerHTML = "Ralat: " + e.message; }
};

// ==============================================================================
// 7. PAPARAN BORANG INPUT (DIPERBAIKI DENGAN REKOD & UI)
// ==============================================================================
window.pilihSaringan = async (eventId, heatId, label, mode) => {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border"></div></div>';
    
    try {
        const isEditMode = (mode === 'input');
        
        // 1. Dapatkan Data Saringan
        const snap = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId));
        if(!snap.exists()) return contentArea.innerHTML = "Data saringan hilang.";
        const data = snap.data();

        // 2. Dapatkan Rekod Kejohanan (Logic Baru)
        let recordText = "Tiada Rekod";
        window.currentRecordData = null; // Reset
        try {
            // Cari dokumen acara induk untuk dapatkan info kategori/kelas
            const eventDoc = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId));
            if(eventDoc.exists()) {
                const eData = eventDoc.data();
                // Cari dalam koleksi 'rekod' jika wujud (anda mungkin perlu setup collection ini)
                // ATAU gunakan field 'rekodSemasa' jika disimpan dalam event
                if(eData.rekodSemasa) {
                    window.currentRecordData = eData.rekodSemasa; // { pemegang: 'Ali', tahun: '2023', catatan: '10.5' }
                    recordText = `${eData.rekodSemasa.catatan}s - ${eData.rekodSemasa.pemegang} (${eData.rekodSemasa.tahun})`;
                }
            }
        } catch(err) { console.log("Rekod fetch error", err); }

        // 3. Simpan State Global
        window.currentHeatData = data;
        window.currentHeatId = heatId;
        window.currentEventId = eventId;
        window.currentLabel = label;
        window.currentMode = mode;

        // 4. Detect Jenis Acara
        const nama = label.toUpperCase();
        const isHighJump = nama.includes("LOMPAT TINGGI");
        const isField = (nama.includes("LOMPAT") || nama.includes("LONTAR") || nama.includes("REJAM") || nama.includes("LEMPAR")) && !isHighJump;

        // 5. Render Header Borang (Dengan Paparan Rekod)
        let html = `
            <div class="d-flex justify-content-between mb-3 d-print-none">
                <button class="btn btn-sm btn-secondary" onclick="pilihAcara('${eventId}', '${label}', '${mode}')">Kembali</button>
                <div>
                    ${!data.peserta?.length ? `<button class="btn btn-sm btn-warning me-2" onclick="agihLorongAuto('${eventId}','${heatId}','${label}','${mode}')">Tarik Peserta</button>` : ''}
                    <button class="btn btn-sm btn-success" onclick="window.print()">Cetak Borang</button>
                </div>
            </div>
            
            <div class="text-center mb-4 border-bottom pb-3">
                <h3 class="fw-bold text-uppercase m-0">${label}</h3>
                <div class="d-flex justify-content-center gap-3 mt-2">
                    <span class="badge bg-dark fs-6">${data.jenis==='akhir'?'AKHIR':`SARINGAN ${data.noSaringan}`}</span>
                    <span class="badge bg-info text-dark fs-6"><i class="bi bi-trophy me-1"></i>Rekod: ${recordText}</span>
                </div>
                <div id="new-record-alert" class="alert alert-warning mt-2 d-none fw-bold animate__animated animate__flash">
                    <i class="bi bi-star-fill me-2"></i>REKOD BARU KEJOHANAN DIKESAN!
                </div>
            </div>
        `;

        // 6. Render Body Mengikut Jenis
        if(isHighJump) html += renderBorangLompatTinggi(data, !isEditMode);
        else if(isField) html += renderBorangPadang(data, !isEditMode);
        else html += renderBorangBalapan(data, !isEditMode);

        contentArea.innerHTML = html;

    } catch(e) { contentArea.innerHTML = "Ralat Borang: " + e.message; }
};

// --- HELPER RENDERING (DIPERBAIKI) ---

// A. BALAPAN
function renderBorangBalapan(h, readOnly) {
    let t = `<table class="table table-bordered text-center align-middle mb-0"><thead class="table-dark"><tr><th>Lorong</th><th>Nama</th><th>Masa</th><th>Rank</th></tr></thead><tbody>`;
    if(!h.peserta?.length) t+=`<tr><td colspan="4">Tiada peserta.</td></tr>`;
    else {
        h.peserta.sort((a,b)=>a.lorong-b.lorong);
        h.peserta.forEach((p,i) => {
            const isRecord = p.pecahRekod ? 'bg-warning bg-opacity-25' : '';
            t+=`<tr data-idx="${i}" class="${isRecord}"><td class="fw-bold fs-5">${p.lorong}</td>
            <td class="text-start">${p.nama}<br><small>${p.noBib||'-'} (${p.sekolah||p.idRumah})</small></td>
            <td>${readOnly?p.pencapaian||'':`<input class="form-control text-center res-input" data-idx="${i}" value="${p.pencapaian||''}" placeholder="00.00">`}</td>
            <td>${readOnly?p.kedudukan||'':`<input type="number" class="form-control text-center ked-input" data-idx="${i}" value="${p.kedudukan||''}">`}</td></tr>`;
        });
    }
    t+=`</tbody></table>`;
    if(!readOnly) t+=`<button class="btn btn-primary w-100 mt-3 d-print-none" id="btn-save-results">SIMPAN KEPUTUSAN</button>`;
    return t;
}

// B. PADANG
function renderBorangPadang(h, readOnly) {
    let t = `<table class="table table-bordered text-center align-middle mb-0"><thead class="table-dark"><tr><th>No</th><th>Nama</th><th>Jarak (m)</th><th>Rank</th></tr></thead><tbody>`;
    if(!h.peserta?.length) t+=`<tr><td colspan="4">Tiada peserta.</td></tr>`;
    else {
        h.peserta.sort((a,b)=>(a.noBib||'').localeCompare(b.noBib||''));
        h.peserta.forEach((p,i) => {
            const isRecord = p.pecahRekod ? 'bg-warning bg-opacity-25' : '';
            t+=`<tr data-idx="${i}" class="${isRecord}"><td>${i+1}</td>
            <td class="text-start">${p.nama}<br><small>${p.noBib||'-'} (${p.sekolah||p.idRumah})</small></td>
            <td>${readOnly?p.pencapaian||'':`<input class="form-control text-center res-input" data-idx="${i}" value="${p.pencapaian||''}" placeholder="0.00">`}</td>
            <td>${readOnly?p.kedudukan||'':`<input type="number" class="form-control text-center ked-input" data-idx="${i}" value="${p.kedudukan||''}">`}</td></tr>`;
        });
    }
    t+=`</tbody></table>`;
    if(!readOnly) t+=`<button class="btn btn-primary w-100 mt-3 d-print-none" id="btn-save-results">SIMPAN KEPUTUSAN</button>`;
    return t;
}

// C. LOMPAT TINGGI (FIXED LAYOUT CSS)
function renderBorangLompatTinggi(h, readOnly) {
    let heights = new Set();
    if(h.peserta) h.peserta.forEach(p => { if(p.rekodLompatan) Object.keys(p.rekodLompatan).forEach(k=>heights.add(k)); });
    
    // Susun ketinggian ikut nombor
    let cols = Array.from(heights).sort((a,b)=>parseFloat(a)-parseFloat(b));
    
    let t = ``;
    if(!readOnly) {
        t += `<div class="d-flex justify-content-between alert alert-info py-2 d-print-none align-items-center">
            <small>Klik "Tambah Ketinggian" dahulu.</small>
            <button class="btn btn-sm btn-dark rounded-pill" id="btn-add-height"><i class="bi bi-plus"></i> Tambah Ketinggian</button>
        </div>`;
    }

    // GUNAKAN WRAPPER CSS BARU
    t += `<div class="table-highjump-wrapper bg-white shadow-sm p-0 border">
    <table class="table table-bordered text-center align-middle table-sm border-dark mb-0" style="min-width: 100%;">
    <thead class="table-dark small"><tr>
        <th style="min-width:40px; position:sticky; left:0; z-index:5;">No</th>
        <th class="text-start" style="min-width:180px; position:sticky; left:40px; z-index:5;">Nama</th>
        ${cols.map(c=>`<th style="min-width:50px">${parseFloat(c).toFixed(2)}m</th>`).join('')}
        <th class="th-fixed col-best-fixed bg-primary text-white">Best</th>
        <th class="th-fixed col-rank-fixed bg-dark text-white">Rank</th>
    </tr></thead><tbody>`;

    if(!h.peserta?.length) t+=`<tr><td colspan="${4+cols.length}">Tiada peserta.</td></tr>`;
    else {
        h.peserta.sort((a,b)=>(a.noBib||'').localeCompare(b.noBib||''));
        h.peserta.forEach((p,i) => {
            const isRecord = p.pecahRekod ? 'bg-warning bg-opacity-25' : '';
            t+=`<tr data-idx="${i}" class="${isRecord}">
            <td style="position:sticky; left:0; background:#fff;">${i+1}</td>
            <td class="text-start text-wrap" style="position:sticky; left:40px; background:#fff;">
                <div class="fw-bold">${p.nama}</div><small>${p.noBib||'-'}</small>
            </td>
            ${cols.map(c => {
                const val = p.rekodLompatan?.[c]?.join('') || '';
                return `<td class="p-0">${readOnly ? `<div style="font-weight:bold;">${val}</div>` : 
                `<input type="text" class="form-control form-control-sm border-0 text-center fw-bold hj-input p-0" 
                style="height:35px;text-transform:uppercase;letter-spacing:2px;" data-ht="${c}" value="${val}" maxlength="3">`}</td>`;
            }).join('')}
            
            <td class="td-fixed col-best-fixed bg-light border-start">
                ${readOnly?p.pencapaian||'':`<input class="form-control form-control-sm text-center fw-bold res-input" data-idx="${i}" value="${p.pencapaian||''}">`}
            </td>
            <td class="td-fixed col-rank-fixed bg-light">
                ${readOnly?p.kedudukan||'':`<input type="number" class="form-control form-control-sm text-center ked-input" data-idx="${i}" value="${p.kedudukan>0?p.kedudukan:''}">`}
            </td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;

    if(!readOnly) t += `<button class="btn btn-primary w-100 mt-3 d-print-none" id="btn-save-results">SIMPAN KEPUTUSAN</button>`;
    
    // Footer Tandatangan
    t += `<div class="row mt-5 d-none d-print-flex" style="page-break-inside: avoid;">
            <div class="col-6 text-center"><br>_______________________<br>Tandatangan Hakim</div>
            <div class="col-6 text-center"><br>_______________________<br>Tandatangan Refri</div>
          </div>`;
    
    return t;
}

// ==============================================================================
// 8. LOGIK SIMPAN KEPUTUSAN (DENGAN PENGESAN REKOD BARU)
// ==============================================================================
document.addEventListener('click', async (e) => {
    
    // BUTANG SIMPAN KEPUTUSAN
    if(e.target.closest('#btn-save-results')) {
        e.preventDefault();
        const btn = document.querySelector('#btn-save-results');
        btn.disabled = true; btn.innerText = "Menyimpan...";

        try {
            if(!window.currentHeatData) throw new Error("Tiada data saringan aktif.");
            
            let peserta = window.currentHeatData.peserta || [];
            let recordBroken = false;

            // Dapatkan info rekod semasa (jika ada) untuk perbandingan
            const currentRecVal = window.currentRecordData ? parseFloat(window.currentRecordData.catatan) : null;
            
            // Logic Simpan Data
            peserta.forEach((p, idx) => {
                // 1. Ambil Input (Res & Rank)
                const resInput = document.querySelector(`.res-input[data-idx="${idx}"]`);
                const kedInput = document.querySelector(`.ked-input[data-idx="${idx}"]`);
                
                if(resInput) p.pencapaian = resInput.value.trim().toUpperCase();
                if(kedInput) p.kedudukan = kedInput.value ? parseInt(kedInput.value) : 0;

                // 2. Logic Check Rekod Baru
                p.pecahRekod = false; // Reset dulu
                if(p.pencapaian && currentRecVal && !isNaN(parseFloat(p.pencapaian))) {
                    const val = parseFloat(p.pencapaian);
                    const isField = window.currentLabel.toUpperCase().includes("LOMPAT") || window.currentLabel.toUpperCase().includes("LONTAR");
                    
                    // Balapan: Masa lagi rendah = Rekod | Padang: Jarak lagi tinggi = Rekod
                    if(!isField && val < currentRecVal) { p.pecahRekod = true; recordBroken = true; }
                    if(isField && val > currentRecVal) { p.pecahRekod = true; recordBroken = true; }
                }

                // 3. Ambil Input Lompat Tinggi (Jika ada)
                if(window.currentLabel.toUpperCase().includes("LOMPAT TINGGI")) {
                    const row = document.querySelector(`tr[data-idx="${idx}"]`);
                    if(row) {
                        row.querySelectorAll('.hj-input').forEach(hjEl => {
                            const ht = hjEl.dataset.ht;
                            if(!p.rekodLompatan) p.rekodLompatan = {};
                            p.rekodLompatan[ht] = hjEl.value.toUpperCase().split('');
                        });
                    }
                }
            });

            // Update DB
            await saveHeatResults(tahunAktif, window.currentEventId, window.currentHeatId, peserta);
            
            // Update Status Acara Induk (Jika Akhir & Ada Pemenang)
            if(window.currentHeatData.jenis === 'akhir') {
                 await updateDoc(doc(db, "kejohanan", tahunAktif, "acara", window.currentEventId), { status: 'selesai' });
            }

            alert("Keputusan Disimpan!");

            // Jika ada rekod baru, update UI alert
            if(recordBroken) {
                const alertBox = document.getElementById('new-record-alert');
                if(alertBox) alertBox.classList.remove('d-none');
            }

            // Refresh UI
            pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);

        } catch(err) {
            console.error(err);
            alert("Gagal Simpan: " + err.message);
            btn.disabled = false; btn.innerText = "Cuba Lagi";
        }
    }

    // BUTANG TAMBAH KETINGGIAN (Lompat Tinggi)
    if(e.target.closest('#btn-add-height')) {
        e.preventDefault();
        const val = prompt("Masukkan ketinggian (contoh: 1.25):");
        if(val) {
            const num = parseFloat(val).toFixed(2);
            if(isNaN(num)) return alert("Nombor tidak sah.");
            
            if(window.currentHeatData?.peserta) {
                window.currentHeatData.peserta.forEach(p => {
                    if(!p.rekodLompatan) p.rekodLompatan = {};
                    if(!p.rekodLompatan[num]) p.rekodLompatan[num] = [];
                });
                pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);
            }
        }
    }
    
    // BUTANG KIRA OLAHRAGAWAN (BARU)
    if(e.target.id === 'btn-kira-olahragawan') {
        kiraStatistikPemenang();
    }
});

// ==============================================================================
// 9. DASHBOARD OLAHRAGAWAN & STATISTIK (FUNGSI BARU)
// ==============================================================================
async function kiraStatistikPemenang() {
    const btn = document.getElementById('btn-kira-olahragawan');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mengira...';

    try {
        // 1. Dapatkan Semua Acara Selesai
        const eventsSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
        let allPesertaStats = {}; // Map: { idPeserta: { nama, rumah, kat, emas, perak, gangsa, rekod } }

        // Loop setiap acara
        for(let evDoc of eventsSnap.docs) {
            const ev = evDoc.data();
            // Ambil subcollection saringan
            const heatSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara", evDoc.id, "saringan"));
            
            heatSnap.forEach(hDoc => {
                const h = hDoc.data();
                // Kira hanya jika Acara Akhir & status selesai
                if(h.jenis === 'akhir' && h.peserta) {
                    h.peserta.forEach(p => {
                        if(!p.idPeserta) return;
                        
                        // Init object peserta jika belum ada
                        if(!allPesertaStats[p.idPeserta]) {
                            allPesertaStats[p.idPeserta] = {
                                nama: p.nama,
                                rumah: p.idRumah,
                                kategori: ev.kategori, // Guna kategori acara sebagai rujukan
                                emas: 0, perak: 0, gangsa: 0, rekod: 0
                            };
                        }

                        // Tambah pingat
                        if(p.kedudukan === 1) allPesertaStats[p.idPeserta].emas++;
                        else if(p.kedudukan === 2) allPesertaStats[p.idPeserta].perak++;
                        else if(p.kedudukan === 3) allPesertaStats[p.idPeserta].gangsa++;

                        // Tambah rekod baru (Flag dari fungsi Simpan Keputusan)
                        if(p.pecahRekod === true) allPesertaStats[p.idPeserta].rekod++;
                    });
                }
            });
        }

        // 2. Fungsi Sorting (Rekod > Emas > Perak > Gangsa)
        const sortWinners = (list) => {
            return list.sort((a, b) => {
                if(b.rekod !== a.rekod) return b.rekod - a.rekod; // Rekod paling utama
                if(b.emas !== a.emas) return b.emas - a.emas;
                if(b.perak !== a.perak) return b.perak - a.perak;
                return b.gangsa - a.gangsa;
            });
        };

        // 3. Kategori Pemenang
        const statsArray = Object.values(allPesertaStats);
        
        // A. Olahragawan 12T (L12)
        const topL12 = sortWinners(statsArray.filter(p => p.kategori === 'L12'))[0];
        updateWinnerCard('winner-L12', 'stats-L12', topL12);

        // B. Olahragawati 12T (P12)
        const topP12 = sortWinners(statsArray.filter(p => p.kategori === 'P12'))[0];
        updateWinnerCard('winner-P12', 'stats-P12', topP12);

        // C. Olahragawan Harapan (L9 + L10)
        const topHarapanL = sortWinners(statsArray.filter(p => ['L9','L10'].includes(p.kategori)))[0];
        updateWinnerCard('winner-harapan-L', 'stats-harapan-L', topHarapanL);

        // D. Olahragawati Harapan (P9 + P10)
        const topHarapanP = sortWinners(statsArray.filter(p => ['P9','P10'].includes(p.kategori)))[0];
        updateWinnerCard('winner-harapan-P', 'stats-harapan-P', topHarapanP);

        // 4. Update Jadual Penuh (Top 10)
        const allSorted = sortWinners(statsArray).slice(0, 10);
        const tbody = document.querySelector('#table-ranking-full tbody');
        tbody.innerHTML = allSorted.map((p, i) => `
            <tr>
                <td>${i+1}</td>
                <td class="fw-bold">${p.nama}</td>
                <td>${p.kategori}</td>
                <td class="text-uppercase">${p.rumah}</td>
                <td class="text-center fw-bold text-danger">${p.rekod > 0 ? p.rekod : '-'}</td>
                <td class="text-center text-warning fw-bold">${p.emas}</td>
                <td class="text-center">${p.perak}</td>
                <td class="text-center" style="color:#cd7f32">${p.gangsa}</td>
            </tr>
        `).join('');

        alert("Pengiraan Selesai!");

    } catch(e) {
        console.error(e);
        alert("Ralat Pengiraan: " + e.message);
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-calculator me-2"></i>Kira Pemenang';
    }
}

function updateWinnerCard(idTitle, idStats, data) {
    if(data) {
        document.getElementById(idTitle).innerHTML = `<h5 class="mb-0 fw-bold">${data.nama}</h5><small>${data.rumah.toUpperCase()}</small>`;
        document.getElementById(idStats).innerHTML = `
            <span class="badge bg-danger me-1">Rekod: ${data.rekod}</span>
            <span class="badge bg-warning text-dark">Emas: ${data.emas}</span>
            <span class="badge bg-secondary">Perak: ${data.perak}</span>
            <span class="badge" style="background:#cd7f32">Gangsa: ${data.gangsa}</span>
        `;
    } else {
        document.getElementById(idTitle).innerHTML = `<h5 class="mb-0">Tiada Data</h5>`;
        document.getElementById(idStats).innerHTML = `-`;
    }
}

// ==============================================================================
// 10. AUTO AGIHAN LORONG
// ==============================================================================
window.agihLorongAuto = async (eventId, heatId, label, mode) => {
    if(!confirm("Tarik peserta secara automatik? Data sedia ada akan ditulis ganti.")) return;
    try {
        const evSnap = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId));
        if(!evSnap.exists()) return;
        const evData = evSnap.data();
        
        // Cari peserta
        const q = query(collection(db, "kejohanan", tahunAktif, "peserta"), where("kategori", "==", evData.kategori));
        const pSnap = await getDocs(q);
        
        let valid = [];
        pSnap.forEach(d => {
            const p = d.data();
            // Semak if peserta daftar acara ini
            let isRegistered = false;
            // Support format acara object { "100m": true } atau string
            if(p.acara && typeof p.acara === 'object' && p.acara[evData.nama]) isRegistered = true;
            
            if(isRegistered) {
                valid.push({
                    idPeserta: d.id, 
                    nama: p.nama, 
                    noBib: p.noBib||'-', 
                    idRumah: p.rumah||p.idRumah||'', 
                    sekolah: p.sekolah||'',
                    lorong: 0, 
                    pencapaian: '',
                    kedudukan: 0
                });
            }
        });

        if(valid.length === 0) return alert("Tiada peserta mendaftar.");
        
        // Assign Lorong (Rawak/Urutan)
        valid = valid.map((p,i) => ({...p, lorong: i+1}));

        await updateDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId), { peserta: valid });
        alert(`Berjaya tarik ${valid.length} peserta.`);
        pilihSaringan(eventId, heatId, label, mode);

    } catch(e) { alert("Ralat Auto: " + e.message); }
};
