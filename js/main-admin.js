/**
 * ==============================================================================
 * SISTEM PENGURUSAN KEJOHANAN OLAHRAGA TAHUNAN (KOT)
 * FAIL: main-admin.js
 * FUNGSI: Menguruskan antaramuka Admin, Setup, Acara, Keputusan & Utiliti Data
 * VERSI: PENUH (GABUNGAN ASAL + FIX LOMPAT TINGGI + INPUT MODE)
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
// 0. TETAPAN TAHUN AKTIF & INISIALISASI
// ==============================================================================
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString(); 
const contentArea = document.getElementById('content-area');

// Variable Global untuk Simpanan Sementara Data Saringan
window.currentHeatData = null;
window.currentHeatId = null;
window.currentEventId = null;
window.currentLabel = null;
window.currentMode = 'input'; // Default input

document.addEventListener('DOMContentLoaded', async () => {
    // Sembunyikan butang menu 'Input Keputusan' (Tab 3)
    const btnInput = document.getElementById('btn-menu-input'); 
    if(btnInput) btnInput.style.display = 'none';

    // Tukar nama butang Admin kepada Urus & Isi
    const btnUrus = document.getElementById('btn-menu-admin');
    if(btnUrus) btnUrus.innerHTML = '<i class="bi bi-pencil-square me-2"></i>Urus & Isi Keputusan';
    
    // Log Info
    console.info("========================================");
    console.info("Sistem STORMS (Admin) dimulakan...");
    console.info("Tahun aktif digunakan:", tahunAktif);
    console.info("========================================");
});

// Fungsi Log Keluar
document.getElementById('btn-logout')?.addEventListener('click', () => {
    if(confirm("Adakah anda pasti mahu log keluar dari panel admin?")) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
});

// ==============================================================================
// 1. PENGURUSAN NAVIGASI SIDEBAR
// ==============================================================================
document.getElementById('menu-setup')?.addEventListener('click', () => {
    switchActive('menu-setup');
    renderSetupForm();
});

document.getElementById('menu-acara')?.addEventListener('click', () => {
    switchActive('menu-acara');
    // KITA PAKSA MOD 'input' DI SINI
    renderSenaraiAcara('input');
});

// Tab Keputusan (disembunyikan, tapi kita kekalkan kod event listener kalau perlu)
document.getElementById('menu-keputusan')?.addEventListener('click', () => {
    switchActive('menu-keputusan');
    renderSenaraiAcara('input');
});

function switchActive(activeId) {
    const menus = ['menu-setup', 'menu-acara', 'menu-keputusan'];
    menus.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.toggle('active', id === activeId);
    });
}

// ==============================================================================
// 2. FUNGSI UTILITI - MUAT NAIK REKOD (CSV)
// ==============================================================================
document.getElementById('btn-proses-csv')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-csv');
    const btn = document.getElementById('btn-proses-csv');
    const file = fileInput.files[0];

    if (!file) return alert("Sila pilih fail CSV rekod dahulu!");

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const [rekod, acara, kategori, tahun, nama] = line.split(',');
            if (rekod && acara && kategori) {
                records.push({
                    rekod: rekod.trim(),
                    acara: acara.trim(),
                    kategori: kategori.trim(),
                    tahun: tahun?.trim() || '-',
                    nama: nama?.trim() || '-'
                });
            }
        }

        if (records.length > 0) {
            try {
                await saveBulkRecords(records);
                alert(`Tahniah! ${records.length} Rekod Berjaya Dikemaskini.`);
                const modalEl = document.getElementById('modalCSV');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if(modal) modal.hide();
            } catch (err) {
                console.error("Ralat CSV:", err);
                alert("Ralat semasa memproses fail: " + err.message);
            }
        } else {
            alert("Tiada data sah dijumpai dalam fail CSV tersebut.");
        }
        btn.disabled = false;
        btn.innerText = "Mula Proses";
        fileInput.value = ""; 
    };
    reader.readAsText(file);
});


// ==============================================================================
// 3. FUNGSI UTILITI - BACKUP DATA
// ==============================================================================
document.getElementById('btn-laksana-backup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-laksana-backup');
    const selectTahun = document.getElementById('select-backup-tahun');
    const tahunPilihan = selectTahun ? selectTahun.value : "";
    
    const teksAsal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyediakan Backup...';
    btn.disabled = true;

    try {
        let backupData = {};
        const senaraiTahun = tahunPilihan ? [tahunPilihan] : [tahunAktif]; 

        for (const tahun of senaraiTahun) {
            backupData[tahun] = { peserta: {}, acara: {}, rumah: {} };
            const pesertaSnap = await getDocs(collection(db, "kejohanan", tahun, "peserta"));
            pesertaSnap.forEach(doc => { backupData[tahun].peserta[doc.id] = doc.data(); });

            const rumahSnap = await getDocs(collection(db, "kejohanan", tahun, "rumah"));
            rumahSnap.forEach(doc => { backupData[tahun].rumah[doc.id] = doc.data(); });

            const acaraSnap = await getDocs(collection(db, "kejohanan", tahun, "acara"));
            for (const acaraDoc of acaraSnap.docs) {
                const acaraData = acaraDoc.data();
                backupData[tahun].acara[acaraDoc.id] = { ...acaraData, saringan: {} };
                const saringanSnap = await getDocs(collection(db, "kejohanan", tahun, "acara", acaraDoc.id, "saringan"));
                saringanSnap.forEach(saringanDoc => {
                    backupData[tahun].acara[acaraDoc.id].saringan[saringanDoc.id] = saringanDoc.data();
                });
            }
        }

        const dataStr = JSON.stringify(backupData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `Backup_KOT_${tahunPilihan || "Semua"}_${new Date().toISOString().slice(0,10)}.json`;

        let linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();

        alert("Berjaya! Fail backup telah sedia dimuat turun.");
        const modalEl = document.getElementById('modalBackup');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

    } catch (error) {
        console.error("Ralat Backup:", error);
        alert("Gagal melakukan backup: " + error.message);
    } finally {
        btn.innerHTML = teksAsal;
        btn.disabled = false;
    }
});


// ==============================================================================
// 4. FUNGSI UTILITI - RESTORE DATA
// ==============================================================================
document.getElementById('btn-laksana-restore')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-restore');
    const btn = document.getElementById('btn-laksana-restore');
    const file = fileInput.files[0];

    if (!file) return alert("Sila pilih fail backup (.json) terlebih dahulu!");
    if (!confirm("AMARAN: Data sedia ada akan ditulis ganti. Teruskan?")) return;

    const teksAsal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memuat Naik...';
    btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backupData = JSON.parse(e.target.result);
            let batch = writeBatch(db);
            let operasiBatchSemasa = 0;
            let jumlahOperasi = 0;

            const semakBatch = async () => {
                if (operasiBatchSemasa >= 450) {
                    await batch.commit();
                    batch = writeBatch(db);
                    operasiBatchSemasa = 0;
                }
            };

            for (const [tahun, dataTahun] of Object.entries(backupData)) {
                if (dataTahun.peserta) {
                    for (const [id, data] of Object.entries(dataTahun.peserta)) {
                        batch.set(doc(db, "kejohanan", tahun, "peserta", id), data, { merge: true });
                        operasiBatchSemasa++; jumlahOperasi++; await semakBatch();
                    }
                }
                if (dataTahun.rumah) {
                    for (const [id, data] of Object.entries(dataTahun.rumah)) {
                        batch.set(doc(db, "kejohanan", tahun, "rumah", id), data, { merge: true });
                        operasiBatchSemasa++; jumlahOperasi++; await semakBatch();
                    }
                }
                if (dataTahun.acara) {
                    for (const [idAcara, dataAcara] of Object.entries(dataTahun.acara)) {
                        const { saringan, ...dataAcaraTulen } = dataAcara;
                        batch.set(doc(db, "kejohanan", tahun, "acara", idAcara), dataAcaraTulen, { merge: true });
                        operasiBatchSemasa++; jumlahOperasi++; await semakBatch();

                        if (saringan) {
                            for (const [idSar, dataSar] of Object.entries(saringan)) {
                                batch.set(doc(db, "kejohanan", tahun, "acara", idAcara, "saringan", idSar), dataSar, { merge: true });
                                operasiBatchSemasa++; jumlahOperasi++; await semakBatch();
                            }
                        }
                    }
                }
            }
            if (operasiBatchSemasa > 0) await batch.commit();

            alert(`Restore Selesai! ${jumlahOperasi} dokumen dimuat naik.`);
            const modalEl = document.getElementById('modalRestore');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();
        } catch (error) {
            console.error("Ralat Restore:", error);
            alert("Ralat memproses fail JSON: " + error.message);
        } finally {
            btn.innerHTML = teksAsal;
            btn.disabled = false;
            fileInput.value = "";
        }
    };
    reader.readAsText(file);
});


// ==============================================================================
// 5. FUNGSI UTILITI - PADAM DATA
// ==============================================================================
document.getElementById('btn-laksana-padam')?.addEventListener('click', async () => {
    const jenisPadam = document.getElementById('select-padam-jenis').value;
    const pengesahan = document.getElementById('input-pengesahan-padam').value;
    const btn = document.getElementById('btn-laksana-padam');

    if (pengesahan !== 'SAH PADAM') return; 

    const teksAsal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memadam...';
    btn.disabled = true;

    try {
        const padamKoleksi = async (pathRef) => {
            const snapshot = await getDocs(pathRef);
            let batch = writeBatch(db);
            let counter = 0;
            for (const docSnap of snapshot.docs) {
                batch.delete(docSnap.ref);
                counter++;
                if (counter >= 450) { await batch.commit(); batch = writeBatch(db); counter = 0; }
            }
            if (counter > 0) await batch.commit();
        };

        if (jenisPadam === 'peserta' || jenisPadam === 'semua') {
            await padamKoleksi(collection(db, "kejohanan", tahunAktif, "peserta"));
        }
        if (jenisPadam === 'keputusan' || jenisPadam === 'semua') {
            const acaraSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
            for (const docAcara of acaraSnap.docs) {
                await padamKoleksi(collection(db, "kejohanan", tahunAktif, "acara", docAcara.id, "saringan"));
            }
        }
        if (jenisPadam === 'semua') {
            await padamKoleksi(collection(db, "kejohanan", tahunAktif, "acara"));
            await padamKoleksi(collection(db, "kejohanan", tahunAktif, "rumah"));
        }

        alert(`Proses Padam Selesai!`);
        document.getElementById('input-pengesahan-padam').value = '';
        const modalEl = document.getElementById('modalPadam');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();
        if (jenisPadam === 'semua') location.reload();

    } catch (error) {
        console.error("Ralat Padam:", error);
        alert("Ralat memadam data: " + error.message);
    } finally {
        btn.innerHTML = teksAsal;
        btn.disabled = false;
    }
});


// ==============================================================================
// 6. SETUP KEJOHANAN & RUMAH SUKAN
// ==============================================================================
function renderSetupForm() {
    contentArea.innerHTML = `
        <div class="row">
            <div class="col-md-6 mb-4">
                <div class="card p-4 shadow-sm border-0 h-100">
                    <h4 class="text-primary"><i class="bi bi-database-fill-gear me-2"></i>Setup Awal</h4>
                    <p class="text-muted small">Jana struktur database (acara & rumah) untuk tahun ${tahunAktif}.</p>
                    <button class="btn btn-primary mt-auto" id="btn-init"><i class="bi bi-magic me-2"></i>Jana Struktur Data</button>
                </div>
            </div>
            <div class="col-md-6 mb-4">
                <div class="card p-4 shadow-sm border-0 h-100">
                    <h4 class="text-success"><i class="bi bi-shield-lock-fill me-2"></i>Akses Rumah Sukan</h4>
                    <p class="text-muted small">Tetapkan kata laluan Guru Rumah Sukan.</p>
                    <button class="btn btn-success mt-auto" id="btn-manage-house"><i class="bi bi-key-fill me-2"></i>Urus Kata Laluan</button>
                </div>
            </div>
        </div>
        <div id="house-list-container" class="mt-4"></div>
    `;
    
    document.getElementById('btn-init').onclick = async () => {
        if(!confirm(`Jana struktur data untuk tahun ${tahunAktif}?`)) return;
        const defaultEvents = [
            { nama: "100m", kategori: "L12", jenis: "Balapan" },
            { nama: "Lompat Tinggi", kategori: "L12", jenis: "Padang" },
            { nama: "Lompat Jauh", kategori: "L12", jenis: "Padang" },
            { nama: "Lontar Peluru", kategori: "P12", jenis: "Padang" }
        ];
        const res = await initializeTournament(tahunAktif, defaultEvents);
        if(res.success) alert("Struktur database berjaya dijana.");
        else alert("Ralat: " + res.message);
    };

    document.getElementById('btn-manage-house').onclick = () => { renderSenaraiRumah(); };
}

// ==============================================================================
// 7. PENGURUSAN AKSES RUMAH SUKAN
// ==============================================================================
async function renderSenaraiRumah() {
    const container = document.getElementById('house-list-container');
    container.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-success"></div><p>Memuatkan data...</p></div>`;

    const rumahIds = ['merah', 'biru', 'hijau', 'kuning'];
    let html = `
        <div class="card border-0 shadow-sm"><div class="card-header bg-white fw-bold py-3 border-bottom">Senarai Kod Akses Rumah</div>
        <div class="card-body p-0"><div class="table-responsive"><table class="table table-striped mb-0 align-middle"><thead class="table-light"><tr><th class="ps-4">Rumah</th><th>Kod Akses</th><th class="text-center">Tindakan</th></tr></thead><tbody>
    `;

    for (const id of rumahIds) {
        const docRef = doc(db, "kejohanan", tahunAktif, "rumah", id);
        const docSnap = await getDoc(docRef);
        let kodSemasa = docSnap.exists() ? (docSnap.data().kod || '') : '';
        let badgeColor = id==='merah'?'danger':id==='biru'?'primary':id==='hijau'?'success':'warning text-dark';

        html += `
            <tr>
                <td class="ps-4"><span class="badge bg-${badgeColor} p-2 rounded-pill text-uppercase">${id}</span></td>
                <td><input type="text" class="form-control form-control-sm" id="input-kod-${id}" value="${kodSemasa}" placeholder="${id.toUpperCase()}2024"></td>
                <td class="text-center"><button class="btn btn-sm btn-dark rounded-pill" onclick="simpanKodRumah('${id}')">Simpan</button></td>
            </tr>`;
    }
    html += `</tbody></table></div></div></div>`;
    container.innerHTML = html;
}

window.simpanKodRumah = async (idRumah) => {
    const inputEl = document.getElementById(`input-kod-${idRumah}`);
    const kodBaru = inputEl.value.trim();
    if (!kodBaru) return alert("Sila masukkan kod yang sah!");

    try {
        await setDoc(doc(db, "kejohanan", tahunAktif, "rumah", idRumah), { kod: kodBaru, nama: idRumah.toUpperCase() }, { merge: true });
        alert("Kod disimpan!");
    } catch (error) {
        alert("Ralat: " + error.message);
    }
};

// ==============================================================================
// 8. SENARAI ACARA (MOD INPUT DIPAKSA)
// ==============================================================================
window.renderSenaraiAcara = async (modeAsal) => {
    // KITA PAKSA SEMUA MOD JADI 'input' UNTUK MEMBENARKAN EDIT
    const modePaksa = 'input'; 

    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan acara...</p></div>';

    try {
        let events = [];
        const eventsRef = collection(db, "kejohanan", tahunAktif.toString(), "acara");
        const snapshot = await getDocs(eventsRef);
        snapshot.forEach(doc => { events.push({ id: doc.id, ...doc.data() }); });

        const trackEvents = events.filter(e => e.kategori === 'balapan');
        const fieldEvents = events.filter(e => e.kategori === 'padang');

        const renderCard = (ev) => `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card h-100 shadow-sm border-0 hover-effect" 
                     onclick="pilihAcara('${ev.id}', '${ev.nama}', '${modePaksa}')" 
                     style="cursor: pointer;">
                    <div class="card-body">
                        <span class="badge bg-${ev.status === 'selesai' ? 'success' : 'secondary'} float-end">${ev.status === 'selesai' ? 'Selesai' : 'Belum'}</span>
                        <h6 class="card-title fw-bold text-uppercase text-primary mb-1">${ev.nama}</h6>
                        <small class="text-muted">${ev.kelas} | ${ev.jenis || 'Akhir'}</small>
                    </div>
                    <div class="card-footer bg-light border-0 py-2">
                        <small class="text-primary fw-bold">Klik untuk urus/isi keputusan <i class="bi bi-arrow-right"></i></small>
                    </div>
                </div>
            </div>`;

        let html = `<div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2"><h4 class="fw-bold"><i class="bi bi-pencil-square me-2"></i>Urus & Isi Keputusan</h4></div>`;

        html += `<h5 class="fw-bold text-success mt-4 mb-3">Acara Padang & Lompat Tinggi</h5><div class="row">`;
        if(fieldEvents.length === 0) html += `<p class="text-muted">Tiada acara padang.</p>`;
        else fieldEvents.forEach(ev => html += renderCard(ev));
        html += `</div>`;

        html += `<h5 class="fw-bold text-danger mt-5 mb-3">Acara Balapan</h5><div class="row">`;
        if(trackEvents.length === 0) html += `<p class="text-muted">Tiada acara balapan.</p>`;
        else trackEvents.forEach(ev => html += renderCard(ev));
        html += `</div>`;

        contentArea.innerHTML = html;
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${e.message}</div>`;
    }
};

// ==============================================================================
// 9. PEMILIHAN ACARA & SARINGAN (DIPERBAIKI)
// ==============================================================================
window.pilihAcara = async (eventId, label, mode) => {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-info"></div><p>Memuatkan data...</p></div>';
    
    try {
        const heats = await getHeatsData(tahunAktif, eventId);
        
        let htmlHeader = `
            <div class="d-flex align-items-center mb-3 pb-2 border-bottom d-print-none">
                <button class="btn btn-sm btn-light border me-3 shadow-sm" onclick="renderSenaraiAcara('${mode}')">
                    <i class="bi bi-arrow-left"></i> Kembali
                </button>
                <h5 class="mb-0 fw-bold text-primary">${label}</h5>
            </div>
        `;

        let htmlContent = '';

        if (heats.length === 0) {
            htmlContent = `
                <div class="text-center py-5 border rounded bg-white shadow-sm mt-4">
                    <i class="bi bi-shuffle text-muted" style="font-size: 3rem;"></i>
                    <h4 class="mt-3 text-dark fw-bold">Belum Ada Saringan</h4>
                    <button id="btn-jana-saringan" class="btn btn-primary btn-lg px-5 rounded-pill shadow mt-3"><i class="bi bi-magic me-2"></i>Jana Saringan</button>
                </div>`;
        } else {
            htmlContent += `<div class="list-group shadow-sm border-0">`;
            heats.sort((a,b) => parseInt(a.noSaringan) - parseInt(b.noSaringan));

            heats.forEach(h => {
                const statusColor = h.status === 'selesai' ? 'success' : 'warning';
                let labelPaparan = h.jenis === 'akhir' ? "ACARA AKHIR" : `Saringan ${h.noSaringan}`;
                
                // PASSING MODE DENGAN BETUL
                htmlContent += `
                    <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3 border-start border-4 border-${statusColor}" 
                            onclick="pilihSaringan('${eventId}', '${h.id}', '${label}', '${mode}')">
                        <div>
                            <span class="fw-bold fs-5"><i class="bi bi-flag-fill me-2 text-dark"></i>${labelPaparan}</span>
                            <div class="small text-muted mt-1"><i class="bi bi-people-fill me-1"></i> ${h.peserta ? h.peserta.length : 0} Peserta</div>
                        </div>
                        <span class="badge rounded-pill bg-${statusColor} ${statusColor==='warning'?'text-dark':''} p-2 d-print-none shadow-sm">
                            ${h.status === 'selesai' ? 'Selesai' : 'Input'} <i class="bi bi-chevron-right ms-1"></i>
                        </span>
                    </button>
                `;
            });
            htmlContent += `</div>`;
        }

        contentArea.innerHTML = htmlHeader + htmlContent;

        const btnJana = document.getElementById('btn-jana-saringan');
        if (btnJana) {
            btnJana.addEventListener('click', async () => {
                 if(confirm("Jana saringan sekarang?")) {
                     btnJana.disabled = true;
                     btnJana.innerHTML = 'Memproses...';
                     try {
                         const { generateHeats } = await import('./modules/admin.js');
                         const res = await generateHeats(tahunAktif, eventId);
                         if(res.success) { alert(res.message); pilihAcara(eventId, label, mode); }
                         else { alert("Ralat: " + res.message); btnJana.disabled = false; }
                     } catch (err) { console.error(err); btnJana.disabled = false; }
                 }
            });
        }
    } catch (error) {
        console.error("Ralat pilihAcara:", error);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${error.message}</div>`;
    }
};

// ==============================================================================
// 10. PILIH SARINGAN (DIPERBAIKI UNTUK LOMPAT TINGGI)
// ==============================================================================
window.pilihSaringan = async (eventId, heatId, labelAcara, mode) => {
    console.log(`Memilih Saringan: ${labelAcara}, Mode: ${mode}`);
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan borang...</p></div>';

    try {
        const isEditMode = (mode === 'input');
        const tStr = tahunAktif.toString();

        const heatRef = doc(db, "kejohanan", tStr, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);

        if (!heatSnap.exists()) {
            contentArea.innerHTML = '<div class="alert alert-danger">Data saringan tidak dijumpai.</div>';
            return;
        }

        const data = heatSnap.data();
        
        // Simpan global
        window.currentHeatData = data; 
        window.currentHeatId = heatId;
        window.currentEventId = eventId;
        window.currentLabel = labelAcara;
        window.currentMode = mode; 

        // Logic Pengesanan Acara
        const namaAcaraUpper = labelAcara.toUpperCase();
        const isHighJump = namaAcaraUpper.includes('LOMPAT TINGGI');
        const isField = (namaAcaraUpper.includes('LOMPAT') || namaAcaraUpper.includes('LONTAR') || namaAcaraUpper.includes('REJAM') || namaAcaraUpper.includes('LEMPAR')) && !isHighJump;
        
        let htmlHeader = `
            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2 d-print-none">
                <div>
                    <button class="btn btn-sm btn-outline-secondary me-2" onclick="pilihAcara('${eventId}', '${labelAcara}', '${mode}')">
                        <i class="bi bi-arrow-left"></i> Kembali
                    </button>
                    <h5 class="d-inline-block fw-bold text-primary mb-0">${labelAcara}</h5>
                </div>
                <div>
                    <button class="btn btn-sm btn-success ms-2" onclick="window.print()">
                        <i class="bi bi-printer"></i> Cetak Borang
                    </button>
                </div>
            </div>
            <div class="text-center mb-4">
                <h3 class="fw-bold text-uppercase">${labelAcara}</h3>
                <h4 class="fw-bold text-dark bg-light py-2 border border-dark rounded d-inline-block px-5">${data.jenis === 'akhir' ? "ACARA AKHIR" : "Saringan " + data.noSaringan}</h4>
            </div>
        `;

        let htmlBody = '';
        if (isHighJump) {
            // !isEditMode bermaksud jika Edit=True, maka ReadOnly=False
            htmlBody = renderBorangLompatTinggi(data, !isEditMode);
        } else if (isField) {
            htmlBody = renderBorangPadang(data, !isEditMode);
        } else {
            htmlBody = renderBorangBalapan(data, !isEditMode);
        }

        contentArea.innerHTML = htmlHeader + htmlBody;

    } catch (e) {
        console.error("Ralat pilihSaringan:", e);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${e.message}</div>`;
    }
};

// ==============================================================================
// RENDER 1: BALAPAN (TRACK)
// ==============================================================================
function renderBorangBalapan(h, isReadOnly) {
    let t = `<div class="table-responsive bg-white shadow-sm p-3 rounded"><table class="table table-bordered text-center align-middle mb-0">
    <thead class="table-dark"><tr>
        <th width="50">Lorong</th>
        <th width="80">No Bib</th>
        <th>Nama Peserta</th>
        <th width="150">Keputusan</th>
        <th width="80">Kedudukan</th>
    </tr></thead><tbody>`;

    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="5">Tiada peserta.</td></tr>`;
    } else {
        h.peserta.sort((a,b) => a.lorong - b.lorong);
        h.peserta.forEach((p, idx) => {
            t += `
            <tr data-idx="${idx}">
                <td class="fw-bold fs-5">${p.lorong}</td>
                <td class="fw-bold">${p.noBib || '-'}</td>
                <td class="text-start">
                    <div class="fw-bold text-uppercase">${p.nama}</div>
                    <small class="text-muted">${p.sekolah || (p.idRumah ? 'Rmh '+p.idRumah : '-')}</small>
                </td>
                <td>
                    ${isReadOnly ? (p.pencapaian || '') : `<input type="text" class="form-control text-center fw-bold res-input" placeholder="00.00s" value="${p.pencapaian||''}" data-idx="${idx}">`}
                </td>
                <td>
                    ${isReadOnly ? (p.kedudukan || '') : `<input type="number" class="form-control text-center fw-bold ked-input" value="${p.kedudukan > 0 ? p.kedudukan : ''}" data-idx="${idx}">`}
                </td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;
    
    if (!isReadOnly) t += `<div class="d-grid mt-3"><button class="btn btn-primary py-2" id="btn-save-results"><i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN</button></div>`;
    return t;
}

// ==============================================================================
// RENDER 2: PADANG (FIELD)
// ==============================================================================
function renderBorangPadang(h, isReadOnly) {
    let t = `<div class="table-responsive bg-white shadow-sm p-3 rounded"><table class="table table-bordered text-center align-middle mb-0">
    <thead class="table-dark"><tr>
        <th width="50">No</th>
        <th width="80">No Bib</th>
        <th>Nama Peserta</th>
        <th width="100">Jarak/Tinggi (m)</th>
        <th width="80">Kedudukan</th>
    </tr></thead><tbody>`;

    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="5">Tiada peserta.</td></tr>`;
    } else {
        h.peserta.sort((a,b) => (a.noBib||'').localeCompare(b.noBib||''));
        h.peserta.forEach((p, idx) => {
            t += `
            <tr data-idx="${idx}">
                <td>${idx + 1}</td>
                <td class="fw-bold">${p.noBib || '-'}</td>
                <td class="text-start">
                    <div class="fw-bold text-uppercase">${p.nama}</div>
                    <small class="text-muted">${p.sekolah || (p.idRumah ? 'Rmh '+p.idRumah : '-')}</small>
                </td>
                <td>
                    ${isReadOnly ? (p.pencapaian || '') : `<input type="text" class="form-control text-center fw-bold res-input" placeholder="0.00" value="${p.pencapaian||''}" data-idx="${idx}">`}
                </td>
                <td>
                    ${isReadOnly ? (p.kedudukan || '') : `<input type="number" class="form-control text-center fw-bold ked-input" value="${p.kedudukan > 0 ? p.kedudukan : ''}" data-idx="${idx}">`}
                </td>
            </tr>`;
        });
    }
    t += `</tbody></table></div>`;
    
    if (!isReadOnly) t += `<div class="d-grid mt-3"><button class="btn btn-primary py-2" id="btn-save-results"><i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN</button></div>`;
    return t;
}

// ==============================================================================
// RENDER 3: LOMPAT TINGGI (VERSI FINAL - FIXED)
// ==============================================================================
function renderBorangLompatTinggi(h, isReadOnly) {
    let allHeights = new Set();
    
    if(h.peserta) {
        h.peserta.forEach(p => {
            if(p.rekodLompatan) Object.keys(p.rekodLompatan).forEach(ht => allHeights.add(ht));
        });
    }

    let sorted = Array.from(allHeights).sort((a,b) => parseFloat(a) - parseFloat(b));
    let cols = [];
    let isEmptyForm = false;

    if (isReadOnly && sorted.length === 0) {
        cols = Array(10).fill(''); 
        isEmptyForm = true;
    } else {
        cols = sorted;
    }

    let t = ``;

    if (!isReadOnly) {
        t += `
        <div class="alert alert-info py-2 small mb-2 d-flex justify-content-between align-items-center d-print-none">
            <span><i class="bi bi-info-circle me-2"></i>Sila tambah ketinggian palang sebelum memasukkan keputusan O/X.</span>
            <button class="btn btn-sm btn-dark rounded-pill shadow-sm" id="btn-add-height">
                <i class="bi bi-plus-lg text-success"></i> Tambah Ketinggian
            </button>
        </div>
        `;
    }

    t += `
        <div class="table-responsive bg-white shadow-sm p-3 rounded">
            <table class="table table-bordered text-center align-middle mb-0 table-sm border-dark">
                <thead class="table-dark small">
                    <tr>
                        <th width="40">No</th>
                        <th width="60">Bib</th>
                        <th class="text-start" style="min-width: 200px;">Nama Peserta</th> 
                        ${cols.map(ht => {
                            let headerLabel = (ht === '') ? '' : parseFloat(ht).toFixed(2) + 'm';
                            return `<th style="min-width:50px; height: 30px;">${headerLabel}</th>`;
                        }).join('')}
                        <th width="80" class="bg-primary border-start border-light">Best</th>
                        <th width="60">Rank</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="${5 + cols.length}">Tiada peserta.</td></tr>`;
    } else {
        h.peserta.sort((a,b) => (a.noBib || '').localeCompare(b.noBib || ''));
        h.peserta.forEach((p, idx) => {
            t += `
                <tr data-idx="${idx}">
                    <td>${idx + 1}</td>
                    <td class="fw-bold">${p.noBib || '-'}</td>
                    <td class="text-start text-wrap py-2" style="line-height: 1.2;">
                        <div class="fw-bold text-uppercase">${p.nama}</div>
                        <small class="text-muted d-block mt-1">${p.sekolah || (p.idRumah ? 'Rmh ' + p.idRumah : '-')}</small>
                    </td>
                    ${cols.map(ht => {
                        if (ht === '') return `<td class="border-end"></td>`;
                        const val = p.rekodLompatan?.[ht] ? p.rekodLompatan[ht].join('') : '';
                        let cellContent = isReadOnly 
                            ? `<div style="height:35px; line-height:35px; font-weight:bold;">${val}</div>`
                            : `<input type="text" class="form-control form-control-sm border-0 text-center hj-input p-0 fw-bold" 
                                style="height:35px; letter-spacing:2px; text-transform:uppercase; background-color: #fff;"
                                data-ht="${ht}" value="${val}" maxlength="3">`;
                        return `<td class="p-0">${cellContent}</td>`;
                    }).join('')}
                    <td class="bg-primary bg-opacity-10 p-1 border-start border-secondary fw-bold">
                         ${isReadOnly ? (p.pencapaian || '') : `<input type="text" class="form-control form-control-sm text-center fw-bold res-input" data-idx="${idx}" value="${p.pencapaian||''}">`}
                    </td>
                    <td class="p-1 fw-bold">
                        ${isReadOnly ? (p.kedudukan || '') : `<input type="number" class="form-control form-control-sm text-center ked-input" data-idx="${idx}" value="${p.kedudukan > 0 ? p.kedudukan : ''}">`}
                    </td>
                </tr>
            `;
        });
    }

    t += `</tbody></table></div>`;

    if (!isReadOnly) {
        t += `
        <div class="alert alert-light border mt-3 small d-print-none">
            <i class="bi bi-info-circle-fill text-primary"></i> <strong>Panduan:</strong> Taip 'O' (Lepas), 'X' (Gagal), '-' (Pass).
        </div>
        <div class="d-grid mt-2">
            <button class="btn btn-primary shadow-sm" id="btn-save-results">
                <i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN
            </button>
        </div>
        `;
    } else {
        if (isEmptyForm) {
            t += `
            <div class="mt-4 row d-print-flex">
                <div class="col-6"><p class="mb-5">Tandatangan Hakim Ketua:</p><div class="border-bottom border-dark w-75"></div></div>
                <div class="col-6"><p class="mb-5">Tandatangan Refri:</p><div class="border-bottom border-dark w-75"></div></div>
            </div>`;
        }
    }
    return t;
}

// ==============================================================================
// SYSTEM LOGIC: SIMPAN KEPUTUSAN & BUTANG TAMBAH KETINGGIAN
// ==============================================================================
document.addEventListener('click', async function(e) {
    
    // --- 1. LOGIK BUTANG SIMPAN KEPUTUSAN ---
    if (e.target && (e.target.id === 'btn-save-results' || e.target.closest('#btn-save-results'))) {
        e.preventDefault();
        
        if (!window.currentHeatData) return alert("Tiada data untuk disimpan.");
        
        const btn = document.querySelector('#btn-save-results');
        btn.disabled = true; 
        btn.innerHTML = 'Menyimpan...';

        try {
            const inputsRes = document.querySelectorAll('.res-input');
            const inputsKed = document.querySelectorAll('.ked-input');
            const inputsHJ = document.querySelectorAll('.hj-input'); 

            let pesertaData = window.currentHeatData.peserta;

            inputsRes.forEach(inp => {
                const idx = inp.dataset.idx;
                if(pesertaData[idx]) pesertaData[idx].pencapaian = inp.value.trim();
            });
            inputsKed.forEach(inp => {
                const idx = inp.dataset.idx;
                if(pesertaData[idx]) pesertaData[idx].kedudukan = inp.value ? parseInt(inp.value) : 0;
            });

            if (inputsHJ.length > 0) {
                inputsHJ.forEach(inp => {
                    const row = inp.closest('tr');
                    const idx = row.dataset.idx;
                    const ht = inp.dataset.ht;
                    const val = inp.value.toUpperCase().split(''); 
                    
                    if(pesertaData[idx]) {
                        if(!pesertaData[idx].rekodLompatan) pesertaData[idx].rekodLompatan = {};
                        pesertaData[idx].rekodLompatan[ht] = val;
                    }
                });
            }

            await saveHeatResults(tahunAktif, window.currentEventId, window.currentHeatId, pesertaData);
            
            alert("Keputusan berjaya disimpan!");
            pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);

        } catch (err) {
            console.error(err);
            alert("Gagal simpan: " + err.message);
            btn.disabled = false; 
            btn.innerHTML = 'Cuba Lagi';
        }
    }

    // --- 2. LOGIK BUTANG TAMBAH KETINGGIAN (HIGH JUMP) ---
    if (e.target && (e.target.id === 'btn-add-height' || e.target.closest('#btn-add-height'))) {
        e.preventDefault();
        
        let inputVal = prompt("Masukkan ketinggian baru (contoh: 1.25):");
        if (!inputVal) return;

        let heightKey = parseFloat(inputVal).toFixed(2);
        if (isNaN(heightKey)) return alert("Sila masukkan nombor yang sah.");

        if (window.currentHeatData && window.currentHeatData.peserta) {
            window.currentHeatData.peserta.forEach(p => {
                if (!p.rekodLompatan) p.rekodLompatan = {};
                if (!p.rekodLompatan[heightKey]) p.rekodLompatan[heightKey] = []; 
            });

            pilihSaringan(window.currentEventId, window.currentHeatId, window.currentLabel, window.currentMode);
        }
    }
});
