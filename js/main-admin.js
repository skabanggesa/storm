/**
 * ==============================================================================
 * SISTEM PENGURUSAN KEJOHANAN OLAHRAGA TAHUNAN (KOT)
 * FAIL: main-admin.js
 * VERSI: FINAL (GABUNGAN FUNGSI ASAL + PEMBAIKAN INPUT)
 * ==============================================================================
 */

import { 
    initializeTournament, 
    getEventsReadyForResults, 
    getHeatsData, 
    saveHeatResults,
    getEventDetail,
    getEventRecord,
    saveBulkRecords,
    generateHeats,
    ACARA_PADANG,
    ACARA_KHAS
} from './modules/admin.js';

import { highJumpLogic } from './modules/highjump-logic.js'; 
import { db } from './firebase-config.js';

// --- IMPORT FIRESTORE ---
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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ==============================================================================
// GLOBAL VARIABLES
// ==============================================================================
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString(); 
const contentArea = document.getElementById('content-area');

// Variable Global untuk Simpanan Sementara Data (Penting untuk Save/Edit)
window.currentHeatData = null;
window.currentHeatId = null;
window.currentEventId = null;
window.currentLabel = null;
window.currentMode = 'input'; 

// ==============================================================================
// 1. INITIALIZATION & NAVIGASI
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Sembunyikan tab Input Keputusan lama jika ada (elak keliru)
    const btnInput = document.getElementById('btn-menu-input'); 
    if(btnInput) btnInput.style.display = 'none';

    // Tukar nama tab Admin
    const btnUrus = document.getElementById('btn-menu-admin');
    if(btnUrus) btnUrus.innerHTML = '<i class="bi bi-pencil-square me-2"></i>Urus & Isi Keputusan';
    
    // Papar Tahun
    const labelTahun = document.getElementById('tahun-label');
    if(labelTahun) labelTahun.innerText = `Tahun: ${tahunAktif}`;

    console.log("Sistem Admin Sedia. Tahun:", tahunAktif);
});

// Logout
document.getElementById('btn-logout')?.addEventListener('click', () => {
    if(confirm("Log keluar?")) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
});

// Sidebar Navigation
document.getElementById('menu-setup')?.addEventListener('click', () => {
    renderSetupForm();
});

document.getElementById('menu-acara')?.addEventListener('click', () => {
    // Kita paksa mod 'input' di sini supaya admin boleh edit
    renderSenaraiAcara('input'); 
});

// ==============================================================================
// 2. FUNGSI UTILITI (CSV, BACKUP, RESTORE, PADAM) - KEKAL SEPERTI ASAL
// ==============================================================================

// CSV Upload
document.getElementById('btn-proses-csv')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-csv');
    const btn = document.getElementById('btn-proses-csv');
    if (!fileInput.files[0]) return alert("Pilih fail dahulu.");

    btn.disabled = true; btn.innerText = 'Memproses...';
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const lines = e.target.result.split('\n');
            const records = [];
            for (let i = 1; i < lines.length; i++) {
                const [rekod, acara, kategori, thn, nama] = lines[i].split(',');
                if (rekod && acara) records.push({ rekod: rekod.trim(), acara: acara.trim(), kategori: kategori.trim(), nama: nama?.trim()||'-' });
            }
            await saveBulkRecords(records);
            alert("Berjaya muat naik rekod!");
            location.reload();
        } catch(err) { alert("Ralat CSV: " + err.message); }
        finally { btn.disabled = false; btn.innerText = "Mula Proses"; }
    };
    reader.readAsText(fileInput.files[0]);
});

// Backup
document.getElementById('btn-laksana-backup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-laksana-backup');
    btn.disabled = true; btn.innerText = 'Backing up...';
    try {
        let backupData = {};
        const cols = ["peserta", "rumah", "acara"];
        for(let c of cols) {
            backupData[c] = {};
            const snap = await getDocs(collection(db, "kejohanan", tahunAktif, c));
            snap.forEach(d => backupData[c][d.id] = d.data());
        }
        const blob = new Blob([JSON.stringify(backupData)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=`BACKUP_${tahunAktif}.json`; a.click();
        alert("Backup selesai.");
    } catch(e) { alert("Ralat Backup: "+e.message); }
    finally { btn.disabled = false; btn.innerText = "Laksana Backup"; }
});

// Restore
document.getElementById('btn-laksana-restore')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-restore');
    if(!fileInput.files[0]) return alert("Pilih fail JSON.");
    if(!confirm("Data sedia ada akan diganti. Teruskan?")) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            let batch = writeBatch(db);
            let count = 0;
            // Logik restore ringkas (peserta, rumah, acara)
            for(let col in data) {
                for(let id in data[col]) {
                    batch.set(doc(db, "kejohanan", tahunAktif, col, id), data[col][id], {merge:true});
                    count++;
                    if(count>=450) { await batch.commit(); batch = writeBatch(db); count=0; }
                }
            }
            if(count>0) await batch.commit();
            alert("Restore selesai!");
        } catch(err) { alert("Ralat Restore: "+err.message); }
    };
    reader.readAsText(fileInput.files[0]);
});

// Padam Data
document.getElementById('btn-laksana-padam')?.addEventListener('click', async () => {
    const jenis = document.getElementById('select-padam-jenis').value;
    const sah = document.getElementById('input-pengesahan-padam').value;
    if(sah !== 'SAH PADAM') return;

    if(!confirm("Anda pasti mahu memadam data ini?")) return;
    
    try {
        const deleteCol = async (path) => {
            const snap = await getDocs(path);
            let batch = writeBatch(db);
            let c = 0;
            snap.forEach(d => { batch.delete(d.ref); c++; if(c>=450){batch.commit(); batch=writeBatch(db); c=0;} });
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
        alert("Data dipadam.");
        location.reload();
    } catch(e) { alert("Ralat Padam: "+e.message); }
});

// ==============================================================================
// 3. SETUP & RUMAH SUKAN
// ==============================================================================
function renderSetupForm() {
    contentArea.innerHTML = `
        <div class="row g-4">
            <div class="col-md-6"><div class="card p-4 h-100 shadow-sm">
                <h4>Setup Awal</h4><p>Jana struktur DB tahun ${tahunAktif}.</p>
                <button class="btn btn-primary" id="btn-init">Jana Struktur</button>
            </div></div>
            <div class="col-md-6"><div class="card p-4 h-100 shadow-sm">
                <h4>Rumah Sukan</h4><p>Urus kata laluan.</p>
                <button class="btn btn-success" onclick="renderSenaraiRumah()">Urus Rumah</button>
            </div></div>
        </div>
        <div id="house-list" class="mt-4"></div>`;
    
    document.getElementById('btn-init').onclick = async () => {
        if(!confirm("Jana database?")) return;
        const res = await initializeTournament(tahunAktif, []);
        alert(res.success ? "Berjaya." : res.message);
    };
}

window.renderSenaraiRumah = async () => {
    const div = document.getElementById('house-list');
    div.innerHTML = 'Loading...';
    const rumah = ['merah','biru','hijau','kuning'];
    let html = `<table class="table table-bordered bg-white"><tr><th>Rumah</th><th>Kod Akses</th><th>Tindakan</th></tr>`;
    for(let r of rumah) {
        const d = await getDoc(doc(db, "kejohanan", tahunAktif, "rumah", r));
        html += `<tr><td class="text-uppercase fw-bold">${r}</td>
        <td><input id="kod-${r}" value="${d.exists()?d.data().kod||'':''}" class="form-control form-control-sm"></td>
        <td><button class="btn btn-sm btn-dark" onclick="simpanKod('${r}')">Simpan</button></td></tr>`;
    }
    div.innerHTML = html + `</table>`;
};

window.simpanKod = async (id) => {
    const kod = document.getElementById(`kod-${id}`).value;
    await setDoc(doc(db, "kejohanan", tahunAktif, "rumah", id), {kod:kod, nama:id.toUpperCase()}, {merge:true});
    alert("Disimpan.");
};

// ==============================================================================
// 4. SENARAI ACARA (MOD INPUT DIPAKSA)
// ==============================================================================
window.renderSenaraiAcara = async (modeAsal) => {
    // PAKSA MOD INPUT (Supaya admin boleh edit)
    const mode = 'input'; 

    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan acara...</p></div>';

    try {
        let events = [];
        const snapshot = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
        snapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));

        // Asingkan Balapan vs Padang
        const track = events.filter(e => e.kategori === 'balapan');
        const field = events.filter(e => e.kategori === 'padang');

        const renderCard = (ev) => `
            <div class="col-md-4 mb-3">
                <div class="card h-100 shadow-sm border-0 hover-effect" onclick="pilihAcara('${ev.id}', '${ev.nama}', '${mode}')" style="cursor: pointer;">
                    <div class="card-body">
                        <span class="badge bg-${ev.status==='selesai'?'success':'secondary'} float-end">${ev.status||'Baru'}</span>
                        <h6 class="fw-bold text-primary mb-1">${ev.nama}</h6>
                        <small class="text-muted">${ev.kelas} | ${ev.jenis||'Akhir'}</small>
                    </div>
                    <div class="card-footer bg-light border-0 py-1 small text-primary">Klik untuk isi keputusan <i class="bi bi-arrow-right"></i></div>
                </div>
            </div>`;

        let html = `<h4 class="mb-4 border-bottom pb-2">Pengurusan Keputusan</h4>`;
        
        html += `<h5 class="text-success mt-3">Padang & Lompat Tinggi</h5><div class="row">${field.map(renderCard).join('') || '<p>Tiada data.</p>'}</div>`;
        html += `<h5 class="text-danger mt-4">Balapan</h5><div class="row">${track.map(renderCard).join('') || '<p>Tiada data.</p>'}</div>`;

        contentArea.innerHTML = html;
    } catch (e) {
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${e.message}</div>`;
    }
};

// ==============================================================================
// 5. PILIH ACARA (Saringan List)
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

        // Logic Butang Jana
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
// 6. PAPARAN BORANG (RENDER FUNCTIONS)
// ==============================================================================
window.pilihSaringan = async (eventId, heatId, label, mode) => {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border"></div></div>';
    
    try {
        const isEditMode = (mode === 'input');
        const snap = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId));
        
        if(!snap.exists()) return contentArea.innerHTML = "Data saringan hilang.";
        const data = snap.data();

        // SIMPAN STATE GLOBAL (Penting untuk butang Save/Tambah)
        window.currentHeatData = data;
        window.currentHeatId = heatId;
        window.currentEventId = eventId;
        window.currentLabel = label;
        window.currentMode = mode;

        // Detect Jenis Acara
        const nama = label.toUpperCase();
        const isHighJump = nama.includes("LOMPAT TINGGI");
        const isField = (nama.includes("LOMPAT") || nama.includes("LONTAR") || nama.includes("REJAM") || nama.includes("LEMPAR")) && !isHighJump;

        // Header
        let html = `
            <div class="d-flex justify-content-between mb-3 d-print-none">
                <button class="btn btn-sm btn-secondary" onclick="pilihAcara('${eventId}', '${label}', '${mode}')">Kembali</button>
                <div>
                    ${!data.peserta?.length ? `<button class="btn btn-sm btn-warning me-2" onclick="agihLorongAuto('${eventId}','${heatId}','${label}','${mode}')">Tarik Peserta</button>` : ''}
                    <button class="btn btn-sm btn-success" onclick="window.print()">Cetak</button>
                </div>
            </div>
            <div class="text-center mb-4">
                <h3 class="fw-bold text-uppercase">${label}</h3>
                <span class="badge bg-dark fs-6">${data.jenis==='akhir'?'AKHIR':`SARINGAN ${data.noSaringan}`}</span>
            </div>
        `;

        // Render Body - !isEditMode bermaksud readOnly=false (boleh edit)
        if(isHighJump) html += renderBorangLompatTinggi(data, !isEditMode);
        else if(isField) html += renderBorangPadang(data, !isEditMode);
        else html += renderBorangBalapan(data, !isEditMode);

        contentArea.innerHTML = html;

    } catch(e) { contentArea.innerHTML = "Ralat Borang: " + e.message; }
};

// A. BALAPAN
function renderBorangBalapan(h, readOnly) {
    let t = `<table class="table table-bordered text-center align-middle mb-0"><thead class="table-dark"><tr><th>Lorong</th><th>Nama</th><th>Masa</th><th>Rank</th></tr></thead><tbody>`;
    if(!h.peserta?.length) t+=`<tr><td colspan="4">Tiada peserta.</td></tr>`;
    else {
        h.peserta.sort((a,b)=>a.lorong-b.lorong);
        h.peserta.forEach((p,i) => {
            t+=`<tr data-idx="${i}"><td class="fw-bold fs-5">${p.lorong}</td>
            <td class="text-start">${p.nama}<br><small>${p.noBib||'-'} (${p.sekolah||p.idRumah})</small></td>
            <td>${readOnly?p.pencapaian||'':`<input class="form-control text-center res-input" data-idx="${i}" value="${p.pencapaian||''}" placeholder="00.00">`}</td>
            <td>${readOnly?p.kedudukan||'':`<input type="number" class="form-control text-center ked-input" data-idx="${i}" value="${p.kedudukan||''}">`}</td></tr>`;
        });
    }
    t+=`</tbody></table>`;
    if(!readOnly) t+=`<button class="btn btn-primary w-100 mt-3" id="btn-save-results">SIMPAN KEPUTUSAN</button>`;
    return t;
}

// B. PADANG
function renderBorangPadang(h, readOnly) {
    let t = `<table class="table table-bordered text-center align-middle mb-0"><thead class="table-dark"><tr><th>No</th><th>Nama</th><th>Jarak (m)</th><th>Rank</th></tr></thead><tbody>`;
    if(!h.peserta?.length) t+=`<tr><td colspan="4">Tiada peserta.</td></tr>`;
    else {
        h.peserta.sort((a,b)=>(a.noBib||'').localeCompare(b.noBib||''));
        h.peserta.forEach((p,i) => {
            t+=`<tr data-idx="${i}"><td>${i+1}</td>
            <td class="text-start">${p.nama}<br><small>${p.noBib||'-'} (${p.sekolah||p.idRumah})</small></td>
            <td>${readOnly?p.pencapaian||'':`<input class="form-control text-center res-input" data-idx="${i}" value="${p.pencapaian||''}" placeholder="0.00">`}</td>
            <td>${readOnly?p.kedudukan||'':`<input type="number" class="form-control text-center ked-input" data-idx="${i}" value="${p.kedudukan||''}">`}</td></tr>`;
        });
    }
    t+=`</tbody></table>`;
    if(!readOnly) t+=`<button class="btn btn-primary w-100 mt-3" id="btn-save-results">SIMPAN KEPUTUSAN</button>`;
    return t;
}

// C. LOMPAT TINGGI (DIPERBAIKI)
function renderBorangLompatTinggi(h, readOnly) {
    let heights = new Set();
    if(h.peserta) h.peserta.forEach(p => { if(p.rekodLompatan) Object.keys(p.rekodLompatan).forEach(k=>heights.add(k)); });
    
    let cols = Array.from(heights).sort((a,b)=>parseFloat(a)-parseFloat(b));
    if(readOnly && cols.length===0) cols = Array(10).fill(''); // Dummy cols untuk cetakan

    let t = ``;
    if(!readOnly) {
        t += `<div class="d-flex justify-content-between alert alert-info py-2 d-print-none align-items-center">
            <small>Masukkan ketinggian palang dahulu.</small>
            <button class="btn btn-sm btn-dark rounded-pill" id="btn-add-height"><i class="bi bi-plus"></i> Tambah Ketinggian</button>
        </div>`;
    }

    t += `<div class="table-responsive bg-white shadow-sm p-2"><table class="table table-bordered text-center align-middle table-sm border-dark mb-0">
    <thead class="table-dark small"><tr>
        <th width="40">No</th><th class="text-start" style="min-width:150px">Nama</th>
        ${cols.map(c=>`<th>${c===''?'':parseFloat(c).toFixed(2)+'m'}</th>`).join('')}
        <th width="60" class="bg-primary border-start">Best</th><th width="50">Rank</th>
    </tr></thead><tbody>`;

    if(!h.peserta?.length) t+=`<tr><td colspan="${4+cols.length}">Tiada peserta.</td></tr>`;
    else {
        h.peserta.sort((a,b)=>(a.noBib||'').localeCompare(b.noBib||''));
        h.peserta.forEach((p,i) => {
            t+=`<tr data-idx="${i}"><td>${i+1}</td>
            <td class="text-start text-wrap"><div class="fw-bold">${p.nama}</div><small>${p.noBib||'-'}</small></td>
            ${cols.map(c => {
                if(c==='') return `<td class="border-end"></td>`;
                const val = p.rekodLompatan?.[c]?.join('') || '';
                // Input untuk grid
                return `<td class="p-0">${readOnly ? `<div style="font-weight:bold;">${val}</div>` : 
                `<input type="text" class="form-control form-control-sm border-0 text-center fw-bold hj-input p-0" style="height:35px;text-transform:uppercase;letter-spacing:2px;" data-ht="${c}" value="${val}" maxlength="3">`}</td>`;
            }).join('')}
            <td class="bg-primary bg-opacity-10 fw-bold border-start border-secondary">${readOnly?p.pencapaian||'':`<input class="form-control form-control-sm text-center fw-bold res-input" data-idx="${i}" value="${p.pencapaian||''}">`}</td>
            <td class="fw-bold">${readOnly?p.kedudukan||'':`<input type="number" class="form-control form-control-sm text-center ked-input" data-idx="${i}" value="${p.kedudukan>0?p.kedudukan:''}">`}</td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;

    if(!readOnly) t += `<button class="btn btn-primary w-100 mt-3 d-print-none" id="btn-save-results">SIMPAN KEPUTUSAN</button>`;
    else t += `<div class="row mt-5 d-print-flex"><div class="col-6">Tandatangan Hakim:<br>_____________</div><div class="col-6">Tandatangan Refri:<br>_____________</div></div>`;
    
    return t;
}

// ==============================================================================
// 7. AGIHAN LORONG AUTO (KEKAL)
// ==============================================================================
window.agihLorongAuto = async (eventId, heatId, label, mode) => {
    if(!confirm("Tarik peserta secara automatik?")) return;
    try {
        const evSnap = await getDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId));
        if(!evSnap.exists()) return;
        const evData = evSnap.data();
        
        // Cari peserta berdaftar
        const q = query(collection(db, "kejohanan", tahunAktif, "peserta"), where("kategori", "==", evData.kategori));
        const pSnap = await getDocs(q);
        
        let validParticipants = [];
        pSnap.forEach(d => {
            const p = d.data();
            if(p.acara && p.acara[evData.nama]) validParticipants.push({id: d.id, ...p});
        });

        if(validParticipants.length === 0) return alert("Tiada peserta mendaftar untuk acara ini.");

        // Map format
        const newList = validParticipants.map((p, idx) => ({
            idPeserta: p.id,
            nama: p.nama,
            noBib: p.noBib||'-',
            idRumah: p.rumah||p.idRumah||'',
            lorong: idx + 1,
            pencapaian: ''
        }));

        await updateDoc(doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId), { peserta: newList });
        alert(`Berjaya tarik ${newList.length} peserta.`);
        pilihSaringan(eventId, heatId, label, mode);

    } catch(e) { alert("Ralat Auto: " + e.message); }
};

// ==============================================================================
// 8. GLOBAL EVENT LISTENER (OTAK BUTANG) - PENTING!
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

            // 1. Simpan Result Biasa (Res & Rank)
            document.querySelectorAll('.res-input').forEach(el => {
                const idx = el.dataset.idx;
                if(peserta[idx]) peserta[idx].pencapaian = el.value.trim().toUpperCase();
            });
            document.querySelectorAll('.ked-input').forEach(el => {
                const idx = el.dataset.idx;
                if(peserta[idx]) peserta[idx].kedudukan = el.value ? parseInt(el.value) : 0;
            });

            // 2. Simpan Result Lompat Tinggi (Grid O/X)
            document.querySelectorAll('.hj-input').forEach(el => {
                const row = el.closest('tr');
                const idx = row.dataset.idx;
                const ht = el.dataset.ht;
                if(peserta[idx]) {
                    if(!peserta[idx].rekodLompatan) peserta[idx].rekodLompatan = {};
                    peserta[idx].rekodLompatan[ht] = el.value.toUpperCase().split('');
                }
            });

            // Update DB
            await saveHeatResults(tahunAktif, window.currentEventId, window.currentHeatId, peserta);
            alert("Keputusan Disimpan!");
            // Refresh
            pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);

        } catch(err) {
            console.error(err);
            alert("Gagal Simpan: " + err.message);
            btn.disabled = false; btn.innerText = "Cuba Lagi";
        }
    }

    // BUTANG TAMBAH KETINGGIAN (High Jump)
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
                // Refresh untuk tunjuk kolum baru
                pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);
            }
        }
    }
});
