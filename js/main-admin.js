/**
 * ==============================================================================
 * SISTEM PENGURUSAN KEJOHANAN OLAHRAGA TAHUNAN (KOT)
 * FAIL: main-admin.js
 * FUNGSI: Menguruskan antaramuka Admin, Setup, Acara, Keputusan & Utiliti Data
 * DIKEMASKINI DENGAN: Fungsi Backup, Restore, dan Padam Data
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
    writeBatch, // <--- Ditambah untuk fungsi Restore dan Padam Data secara pukal
    deleteDoc   // <--- Ditambah untuk fungsi Padam Data
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ==============================================================================
// 0. TETAPAN TAHUN AKTIF & INISIALISASI
// ==============================================================================
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString(); 

console.info("========================================");
console.info("Sistem STORMS (Admin) dimulakan...");
console.info("Tahun dari Storan:", sessionStorage.getItem("tahun_aktif"));
console.info("Tahun aktif digunakan:", tahunAktif);
console.info("========================================");

const contentArea = document.getElementById('content-area');

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
    renderSenaraiAcara('urus');
});

document.getElementById('menu-keputusan')?.addEventListener('click', () => {
    switchActive('menu-keputusan');
    renderSenaraiAcara('keputusan');
});

/**
 * Fungsi untuk menukar kelas 'active' pada menu sidebar
 * @param {string} activeId - ID elemen menu yang aktif
 */
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

    // Halang butang ditekan dua kali
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        const records = [];

        // Loop melalui setiap baris CSV (Abaikan baris 0 / Header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Format dijangka: REKOD, ACARA, KATEGORI, TAHUN, NAMA
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
                
                // Tutup modal secara automatik
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
        
        // Kembalikan butang kepada asal
        btn.disabled = false;
        btn.innerText = "Mula Proses";
        fileInput.value = ""; // Reset input fail
    };
    reader.readAsText(file);
});


// ==============================================================================
// 3. FUNGSI UTILITI BARU - BACKUP DATA (EKSPORT KE JSON)
// ==============================================================================
document.getElementById('btn-laksana-backup')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-laksana-backup');
    const selectTahun = document.getElementById('select-backup-tahun');
    const tahunPilihan = selectTahun ? selectTahun.value : "";
    
    // UI Loading State
    const teksAsal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyediakan Backup...';
    btn.disabled = true;

    try {
        console.log(`Memulakan proses Backup... Tahun: ${tahunPilihan || "SEMUA"}`);
        let backupData = {};
        
        // Senarai tahun yang perlu disedut. Jika tiada pilihan, kita letak tahunAktif sahaja untuk keselamatan 
        // (atau kita boleh benarkan pilihan semua tahun jika database tak terlalu besar).
        const senaraiTahun = tahunPilihan ? [tahunPilihan] : [tahunAktif]; 

        for (const tahun of senaraiTahun) {
            backupData[tahun] = { peserta: {}, acara: {}, rumah: {} };

            // 3.1 Dapatkan Data Peserta
            console.log(`Menyedut data peserta untuk tahun ${tahun}...`);
            const pesertaSnap = await getDocs(collection(db, "kejohanan", tahun, "peserta"));
            pesertaSnap.forEach(doc => {
                backupData[tahun].peserta[doc.id] = doc.data();
            });

            // 3.2 Dapatkan Data Rumah Sukan
            console.log(`Menyedut data rumah untuk tahun ${tahun}...`);
            const rumahSnap = await getDocs(collection(db, "kejohanan", tahun, "rumah"));
            rumahSnap.forEach(doc => {
                backupData[tahun].rumah[doc.id] = doc.data();
            });

            // 3.3 Dapatkan Data Acara (Beserta Saringan/Heats)
            console.log(`Menyedut data acara untuk tahun ${tahun}...`);
            const acaraSnap = await getDocs(collection(db, "kejohanan", tahun, "acara"));
            
            for (const acaraDoc of acaraSnap.docs) {
                const acaraData = acaraDoc.data();
                backupData[tahun].acara[acaraDoc.id] = {
                    ...acaraData,
                    saringan: {} // Subcollection untuk saringan
                };

                // Dapatkan Saringan untuk setiap acara
                const saringanSnap = await getDocs(collection(db, "kejohanan", tahun, "acara", acaraDoc.id, "saringan"));
                saringanSnap.forEach(saringanDoc => {
                    backupData[tahun].acara[acaraDoc.id].saringan[saringanDoc.id] = saringanDoc.data();
                });
            }
        }

        // 3.4 Tukar objek JavaScript ke bentuk JSON String
        const dataStr = JSON.stringify(backupData, null, 2);
        
        // 3.5 Cipta fungsi "Muat Turun" dalam pelayar web
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `Backup_KOT_${tahunPilihan || "Semua"}_${new Date().toISOString().slice(0,10)}.json`;

        let linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click(); // Trigger muat turun automatik

        alert("Berjaya! Fail backup telah sedia dimuat turun.");
        
        // Tutup modal
        const modalEl = document.getElementById('modalBackup');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

    } catch (error) {
        console.error("Ralat semasa Backup:", error);
        alert("Gagal melakukan backup. Sila lihat konsol untuk butiran. Mesej: " + error.message);
    } finally {
        btn.innerHTML = teksAsal;
        btn.disabled = false;
    }
});


// ==============================================================================
// 4. FUNGSI UTILITI BARU - RESTORE DATA (IMPORT DARI JSON)
// ==============================================================================
document.getElementById('btn-laksana-restore')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-restore');
    const btn = document.getElementById('btn-laksana-restore');
    const file = fileInput.files[0];

    if (!file) return alert("Sila pilih fail backup (.json) terlebih dahulu!");
    if (!confirm("AMARAN TERAKHIR: Proses ini akan menulis ganti (overwrite) data sedia ada di pangkalan data anda. Adakah anda pasti?")) return;

    // UI Loading State
    const teksAsal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memuat Naik...';
    btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const rawData = e.target.result;
            const backupData = JSON.parse(rawData); // Parse teks JSON ke bentuk Objek

            console.log("Struktur data berjaya di-parse. Memulakan muat naik ke Firestore...");
            let jumlahOperasi = 0;

            // Kita gunakan Firebase Batch untuk memuat naik data dengan efisien.
            // Nota: Firebase batch ada had maksimum 500 operasi serentak.
            // Untuk memastikan ia tidak ralat, kita buat 'chunking' (bahagian).
            let batch = writeBatch(db);
            let operasiBatchSemasa = 0;

            // Fungsi helper untuk commit batch jika cecah had
            const semakBatch = async () => {
                if (operasiBatchSemasa >= 450) { // Letak 450 sbg margin selamat
                    console.log("Menghantar batch ke server...");
                    await batch.commit();
                    batch = writeBatch(db); // Buka batch baru
                    operasiBatchSemasa = 0;
                }
            };

            // Loop melalui setiap Tahun dalam fail JSON
            for (const [tahun, dataTahun] of Object.entries(backupData)) {
                
                // 4.1 Restore Peserta
                if (dataTahun.peserta) {
                    for (const [idPeserta, dataPeserta] of Object.entries(dataTahun.peserta)) {
                        const ref = doc(db, "kejohanan", tahun, "peserta", idPeserta);
                        batch.set(ref, dataPeserta, { merge: true });
                        operasiBatchSemasa++;
                        jumlahOperasi++;
                        await semakBatch();
                    }
                }

                // 4.2 Restore Rumah
                if (dataTahun.rumah) {
                    for (const [idRumah, dataRumah] of Object.entries(dataTahun.rumah)) {
                        const ref = doc(db, "kejohanan", tahun, "rumah", idRumah);
                        batch.set(ref, dataRumah, { merge: true });
                        operasiBatchSemasa++;
                        jumlahOperasi++;
                        await semakBatch();
                    }
                }

                // 4.3 Restore Acara & Saringan
                if (dataTahun.acara) {
                    for (const [idAcara, dataAcara] of Object.entries(dataTahun.acara)) {
                        // Asingkan subcollection 'saringan' sebelum simpan acara
                        const { saringan, ...dataAcaraTulen } = dataAcara; 
                        
                        const refAcara = doc(db, "kejohanan", tahun, "acara", idAcara);
                        batch.set(refAcara, dataAcaraTulen, { merge: true });
                        operasiBatchSemasa++;
                        jumlahOperasi++;
                        await semakBatch();

                        // Restore subcollection saringan
                        if (saringan) {
                            for (const [idSaringan, dataSaringan] of Object.entries(saringan)) {
                                const refSaringan = doc(db, "kejohanan", tahun, "acara", idAcara, "saringan", idSaringan);
                                batch.set(refSaringan, dataSaringan, { merge: true });
                                operasiBatchSemasa++;
                                jumlahOperasi++;
                                await semakBatch();
                            }
                        }
                    }
                }
            }

            // Commit mana-mana baki yang tinggal dalam batch terakhir
            if (operasiBatchSemasa > 0) {
                await batch.commit();
            }

            alert(`Proses Restore Selesai! Sebanyak ${jumlahOperasi} dokumen telah dimuat naik.`);
            
            // Tutup modal
            const modalEl = document.getElementById('modalRestore');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();

        } catch (error) {
            console.error("Ralat semasa Restore:", error);
            alert("Ralat memproses fail JSON. Sila pastikan format fail adalah tepat. Mesej: " + error.message);
        } finally {
            btn.innerHTML = teksAsal;
            btn.disabled = false;
            fileInput.value = ""; // Reset file input
        }
    };
    reader.readAsText(file);
});


// ==============================================================================
// 5. FUNGSI UTILITI BARU - PADAM DATA (DANGER ZONE)
// ==============================================================================
document.getElementById('btn-laksana-padam')?.addEventListener('click', async () => {
    const jenisPadam = document.getElementById('select-padam-jenis').value;
    const pengesahan = document.getElementById('input-pengesahan-padam').value;
    const btn = document.getElementById('btn-laksana-padam');

    if (pengesahan !== 'SAH PADAM') return; // Double check sekiranya dipintas

    const teksAsal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memadam...';
    btn.disabled = true;

    try {
        console.warn(`Memulakan proses Padam Data: Jenis -> ${jenisPadam}, Tahun -> ${tahunAktif}`);
        let jumlahDipadam = 0;

        // Fungsi Helper untuk padam koleksi besar 
        // Menggunakan batch untuk mempercepatkan proses padam berbanding satu-satu
        const padamKoleksi = async (pathRef) => {
            const snapshot = await getDocs(pathRef);
            let batch = writeBatch(db);
            let counter = 0;

            for (const docSnap of snapshot.docs) {
                batch.delete(docSnap.ref);
                counter++;
                jumlahDipadam++;
                
                if (counter >= 450) {
                    await batch.commit();
                    batch = writeBatch(db);
                    counter = 0;
                }
            }
            if (counter > 0) await batch.commit();
        };

        if (jenisPadam === 'peserta' || jenisPadam === 'semua') {
            console.log("Memadam Koleksi Peserta...");
            await padamKoleksi(collection(db, "kejohanan", tahunAktif, "peserta"));
        }

        if (jenisPadam === 'keputusan' || jenisPadam === 'semua') {
            console.log("Memadam Keputusan (Saringan)...");
            // Untuk saringan, kita perlu cari semua acara dahulu
            const acaraSnap = await getDocs(collection(db, "kejohanan", tahunAktif, "acara"));
            for (const docAcara of acaraSnap.docs) {
                // Padam Saringan dalam setiap acara
                await padamKoleksi(collection(db, "kejohanan", tahunAktif, "acara", docAcara.id, "saringan"));
            }
        }

        if (jenisPadam === 'semua') {
            console.log("Memadam Acara Utama dan Rumah...");
            await padamKoleksi(collection(db, "kejohanan", tahunAktif, "acara"));
            await padamKoleksi(collection(db, "kejohanan", tahunAktif, "rumah"));
        }

        alert(`Proses Padam Selesai! ${jumlahDipadam} rekod telah dipadam dari pangkalan data tahun ${tahunAktif}.`);
        
        // Reset UI & Tutup
        document.getElementById('input-pengesahan-padam').value = '';
        btn.classList.add('disabled');
        const modalEl = document.getElementById('modalPadam');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

        // Refresh halaman jika padam semua
        if (jenisPadam === 'semua') location.reload();

    } catch (error) {
        console.error("Ralat Padam Data:", error);
        alert("Ralat semasa memadam data. Sila lihat konsol. Mesej: " + error.message);
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
                    <p class="text-muted small">Jana struktur database (acara & rumah) untuk tahun ${tahunAktif}. Proses ini diperlukan setiap kali membuka tahun baru.</p>
                    <button class="btn btn-primary mt-auto" id="btn-init">
                        <i class="bi bi-magic me-2"></i>Jana Struktur Data
                    </button>
                </div>
            </div>
            <div class="col-md-6 mb-4">
                <div class="card p-4 shadow-sm border-0 h-100">
                    <h4 class="text-success"><i class="bi bi-shield-lock-fill me-2"></i>Akses Rumah Sukan</h4>
                    <p class="text-muted small">Tetapkan atau kemaskini kata laluan untuk Guru Rumah Sukan bagi proses pendaftaran atlet.</p>
                    <button class="btn btn-success mt-auto" id="btn-manage-house">
                        <i class="bi bi-key-fill me-2"></i>Urus Kata Laluan Rumah
                    </button>
                </div>
            </div>
        </div>
        
        <div id="house-list-container" class="mt-4"></div>
    `;
    
    // Event: Jana Struktur (Pre-load data)
    document.getElementById('btn-init').onclick = async () => {
        if(!confirm(`Adakah anda pasti mahu menjana struktur data untuk tahun ${tahunAktif}? Data acara kosong akan dimasukkan.`)) return;
        
        // Contoh Data Acara Default
        const defaultEvents = [
            { nama: "100m", kategori: "L12", jenis: "Balapan" },
            { nama: "Lompat Tinggi", kategori: "L12", jenis: "Padang" },
            { nama: "Lompat Jauh", kategori: "L12", jenis: "Padang" },
            { nama: "Lontar Peluru", kategori: "P12", jenis: "Padang" }
        ];

        const res = await initializeTournament(tahunAktif, defaultEvents);
        if(res.success) alert("Tahniah! Struktur database berjaya dijana. Sila pergi ke menu Urus Acara.");
        else alert("Ralat: " + res.message);
    };

    // Event: Urus Rumah Sukan
    document.getElementById('btn-manage-house').onclick = () => {
        renderSenaraiRumah();
    };
}

// ==============================================================================
// 7. PENGURUSAN AKSES RUMAH SUKAN (KATA LALUAN)
// ==============================================================================
async function renderSenaraiRumah() {
    const container = document.getElementById('house-list-container');
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-success"></div>
            <p class="mt-2 text-muted">Memuatkan data rumah dari pelayan...</p>
        </div>
    `;

    // Senarai ID Rumah (Standard sekolah di Malaysia, ubah jika perlu)
    const rumahIds = ['merah', 'biru', 'hijau', 'kuning'];
    
    let html = `
        <div class="card border-0 shadow-sm animate__animated animate__fadeIn">
            <div class="card-header bg-white fw-bold py-3 border-bottom">
                <i class="bi bi-key-fill me-2 text-warning"></i>Senarai Kod Akses Rumah Sukan (${tahunAktif})
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-striped table-hover mb-0 align-middle">
                        <thead class="table-light">
                            <tr>
                                <th class="ps-4">Rumah Sukan</th>
                                <th>Kod Akses (Kata Laluan)</th>
                                <th width="150" class="text-center">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody>
    `;

    for (const id of rumahIds) {
        // Dapatkan data rumah semasa dari Firestore
        const docRef = doc(db, "kejohanan", tahunAktif, "rumah", id);
        const docSnap = await getDoc(docRef);
        let kodSemasa = '';
        
        if (docSnap.exists()) {
            kodSemasa = docSnap.data().kod || '';
        }

        // Tetapkan warna badge rumah
        let badgeColor = 'secondary';
        if(id==='merah') badgeColor='danger';
        if(id==='biru') badgeColor='primary';
        if(id==='hijau') badgeColor='success';
        if(id==='kuning') badgeColor='warning text-dark';

        html += `
            <tr>
                <td class="ps-4">
                    <span class="badge bg-${badgeColor} p-2 px-3 rounded-pill text-uppercase shadow-sm" style="min-width: 80px;">
                        ${id}
                    </span>
                </td>
                <td>
                    <div class="input-group input-group-sm w-75">
                        <span class="input-group-text bg-white"><i class="bi bi-lock text-muted"></i></span>
                        <input type="text" class="form-control font-monospace fw-bold text-secondary" 
                               id="input-kod-${id}" 
                               value="${kodSemasa}" 
                               placeholder="Cth: ${id.toUpperCase()}2024">
                    </div>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-dark px-3 rounded-pill" onclick="simpanKodRumah('${id}')">
                        <i class="bi bi-save me-1"></i> Simpan
                    </button>
                </td>
            </tr>
        `;
    }

    html += `
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="card-footer bg-light text-muted small p-3">
                <i class="bi bi-info-circle me-1"></i> Kod akses ini akan digunakan oleh Guru Rumah Sukan semasa proses Log Masuk untuk mendaftarkan atlet mereka.
            </div>
        </div>
    `;
    container.innerHTML = html;
}

// Global Window Function untuk butang "Simpan Kod" di baris jadual
window.simpanKodRumah = async (idRumah) => {
    const inputEl = document.getElementById(`input-kod-${idRumah}`);
    const kodBaru = inputEl.value.trim();
    
    if (!kodBaru) {
        inputEl.classList.add('is-invalid');
        return alert("Sila masukkan kod akses yang sah!");
    } else {
        inputEl.classList.remove('is-invalid');
    }

    const btn = event.currentTarget; 
    const originalText = btn.innerHTML;
    
    // UI Button Loading
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;

    try {
        const docRef = doc(db, "kejohanan", tahunAktif, "rumah", idRumah);
        
        // Simpan ke Firestore menggunakan setDoc dgn merge:true supaya data pingat (jika ada) tidak hilang.
        await setDoc(docRef, { 
            kod: kodBaru,
            nama: idRumah.toUpperCase() 
        }, { merge: true });

        // Tunjukkan feedback visual sukses sementara
        btn.classList.remove('btn-dark');
        btn.classList.add('btn-success');
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Berjaya';
        
        setTimeout(() => {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-dark');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error("Ralat menyimpan kod rumah:", error);
        alert("Ralat pelayan. Gagal menyimpan kod: " + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ==============================================================================
// 8. SENARAI ACARA (MOD URUS vs KEPUTUSAN)
// ==============================================================================
async function renderSenaraiAcara(mode) {
    contentArea.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
            <p class="mt-3 text-muted">Mencari senarai acara dari pangkalan data...</p>
        </div>
    `;
    
    let acara = await getEventsReadyForResults(tahunAktif);

    // Susun mengikut Nama kemudian Kategori untuk kekemasan
    acara.sort((a, b) => {
        const namaA = a.nama.toUpperCase();
        const namaB = b.nama.toUpperCase();
        if (namaA !== namaB) return namaA < namaB ? -1 : 1;
        const katA = a.kategori.toUpperCase();
        const katB = b.kategori.toUpperCase();
        return katA < katB ? -1 : 1;
    });

    let title = mode === 'urus' ? 'Urus Acara & Cetak Borang' : 'Input Keputusan Kejohanan';
    let btnText = mode === 'urus' ? 'Pilih Acara' : 'Masukkan Keputusan';
    let btnIcon = mode === 'urus' ? 'bi-printer' : 'bi-pencil-square';
    let btnClass = mode === 'urus' ? 'btn-outline-primary' : 'btn-primary shadow-sm';

    let html = `
        <div class="row align-items-center mb-4 pb-2 border-bottom">
            <div class="col-md-6">
                <h4 class="fw-bold text-dark mb-0"><i class="bi ${btnIcon} me-2"></i>${title}</h4>
                <div class="mt-1">
                    <span class="badge bg-secondary me-2">Tahun: ${tahunAktif}</span>
                    <span class="badge bg-primary rounded-pill">${acara.length} Acara Direkodkan</span>
                </div>
            </div>
            <div class="col-md-6 mt-3 mt-md-0 d-print-none">
                <div class="input-group">
                    <span class="input-group-text bg-white border-end-0 text-muted"><i class="bi bi-search"></i></span>
                    <input type="text" id="search-acara" class="form-control border-start-0" placeholder="Taip untuk menapis nama acara / kategori...">
                </div>
            </div>
        </div>
        <div class="row" id="container-acara">
    `;
    
    if(acara.length === 0) {
        html += `
            <div class="col-12 text-center py-5">
                <i class="bi bi-folder-x text-muted" style="font-size: 4rem;"></i>
                <h5 class="text-muted mt-3">Tiada Acara Dijumpai</h5>
                <p class="small">Sila pergi ke <b>Setup Tahun Baru</b> untuk menjana struktur database.</p>
            </div>
        `;
    } else {
        acara.forEach(a => {
            html += `
                <div class="col-md-4 col-sm-6 mb-3 acara-card-container">
                    <div class="card shadow-sm border-0 h-100 hover-card">
                        <div class="card-body d-flex flex-column justify-content-between p-3">
                            <div class="mb-3">
                                <h6 class="fw-bold text-dark mb-1 text-truncate" title="${a.nama}">${a.nama}</h6>
                                <span class="badge bg-light text-dark border border-secondary px-2 py-1">${a.kategori}</span>
                                <span class="badge bg-light text-muted border px-2 py-1"><i class="bi bi-tag-fill me-1"></i>${a.jenis || 'Balapan'}</span>
                            </div>
                            <button class="btn btn-sm ${btnClass} w-100 fw-bold rounded-pill" 
                                    onclick="pilihAcara('${a.id}', '${a.nama} ${a.kategori}', '${mode}')">
                                <i class="bi ${btnIcon} me-1"></i> ${btnText}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    contentArea.innerHTML = html + `</div>`;

    // Carian Client-side
    document.getElementById('search-acara')?.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        document.querySelectorAll('.acara-card-container').forEach(card => {
            const cardText = card.innerText.toLowerCase();
            card.style.display = cardText.includes(keyword) ? "block" : "none";
        });
    });
}

// ==============================================================================
// 9. PEMILIHAN SARINGAN (HEAT) & CETAKAN (DIKEMASKINI DENGAN BUTANG JANA)
// ==============================================================================
window.pilihAcara = async (eventId, label, mode) => {
    // Paparan Loading
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-info"></div><p>Memuatkan data...</p></div>';
    
    // Dapatkan data saringan dari DB
    const heats = await getHeatsData(tahunAktif, eventId);
    
    // Header HTML (Tajuk & Butang Kembali)
    let htmlHeader = `
        <div class="d-flex align-items-center mb-3 pb-2 border-bottom d-print-none">
            <button class="btn btn-sm btn-light border me-3 shadow-sm" onclick="renderSenaraiAcara('${mode}')">
                <i class="bi bi-arrow-left"></i> Kembali
            </button>
            <h5 class="mb-0 fw-bold text-primary">${label} <span class="text-muted fw-normal ms-2">(${tahunAktif})</span></h5>
        </div>
    `;

    // --- LOGIK UTAMA: PAPAR BUTANG JIKA TIADA SARINGAN ---
    let htmlContent = '';

    if (heats.length === 0) {
        // PAPARAN JIKA KOSONG -> TUNJUK BUTANG JANA
        htmlContent = `
            <div class="text-center py-5 border rounded bg-white shadow-sm mt-4">
                <i class="bi bi-shuffle text-muted" style="font-size: 3rem;"></i>
                <h4 class="mt-3 text-dark fw-bold">Belum Ada Saringan / Undian</h4>
                <p class="text-muted">Peserta mungkin sudah mendaftar, tetapi lorong & giliran belum diundi.</p>
                
                <button id="btn-jana-saringan" class="btn btn-primary btn-lg px-5 rounded-pill shadow mt-3">
                    <i class="bi bi-magic me-2"></i>Jana Saringan & Undi Lorong
                </button>
            </div>
        `;
    } else {
        // PAPARAN JIKA SUDAH ADA DATA -> TUNJUK SENARAI (MACAM BIASA)
        htmlContent += `
            <div class="row mb-3 d-print-none">
                <div class="col-12">
                    <div class="alert alert-secondary py-2 small">
                        <i class="bi bi-info-circle-fill me-2"></i>Sila pilih sesi di bawah.
                    </div>
                </div>
            </div>
            <div class="list-group shadow-sm border-0">
        `;

        // Susun saringan ikut nombor
        heats.sort((a,b) => parseInt(a.noSaringan) - parseInt(b.noSaringan));

        heats.forEach(h => {
            const statusColor = h.status === 'selesai' ? 'success' : 'warning';
            const statusText = h.status === 'selesai' ? 'Selesai' : 'Sedang Berlangsung';
            
            // Label Paparan: "Saringan 1" atau "ACARA AKHIR"
            let labelPaparan = `Saringan ${h.noSaringan}`;
            if (h.jenis === 'akhir') {
                labelPaparan = "ACARA AKHIR";
            }
            
            htmlContent += `
                <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3 border-start border-4 border-${statusColor}" 
                        onclick="pilihSaringan('${eventId}', '${h.id}', '${label}', '${mode}')">
                    <div>
                        <span class="fw-bold fs-5">
                            <i class="bi bi-flag-fill me-2 text-dark"></i>${labelPaparan}
                        </span>
                    </div>
                    <span class="badge rounded-pill bg-${statusColor} ${statusColor==='warning'?'text-dark':''} p-2 d-print-none shadow-sm">
                        ${statusText} <i class="bi bi-chevron-right ms-1"></i>
                    </span>
                </button>
            `;
        });
        htmlContent += `</div>`;
    }

    // Gabungkan Header + Content dan masukkan ke HTML
    contentArea.innerHTML = htmlHeader + htmlContent;

    // --- LEKATKAN EVENT LISTENER PADA BUTANG JANA (JIKA WUJUD) ---
    const btnJana = document.getElementById('btn-jana-saringan');
    if (btnJana) {
        btnJana.onclick = async () => {
             if(confirm("Adakah anda pasti mahu menjana saringan? Proses ini akan mengundi lorong untuk semua peserta yang telah mendaftar.")) {
                 // UI Loading pada butang
                 btnJana.disabled = true;
                 btnJana.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';
                 
                 // PANGGIL FUNGSI DARI MODULE (admin.js)
                 const res = await generateHeats(tahunAktif, eventId);
                 
                 if(res.success) {
                     alert(res.message); // "10 peserta berjaya disusun..."
                     pilihAcara(eventId, label, mode); // Refresh halaman ini
                 } else {
                     alert("Ralat: " + res.message);
                     // Reset butang jika gagal
                     btnJana.disabled = false;
                     btnJana.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Cuba Lagi';
                 }
             }
        };
    }
};

// ==============================================================================
// 10. PAPARKAN DATA SARINGAN (INPUT KEPUTUSAN / LIHAT PESERTA)
// ==============================================================================
window.pilihSaringan = async (eventId, heatId, labelAcara, mode) => {
    // 1. Paparan Loading
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan data saringan...</p></div>';

    try {
        // 2. Dapatkan Data Saringan Spesifik
        const tStr = tahunAktif.toString();
        const heatRef = doc(db, "kejohanan", tStr, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);

        if (!heatSnap.exists()) {
            contentArea.innerHTML = '<div class="alert alert-danger">Data saringan tidak dijumpai.</div>';
            return;
        }

        const data = heatSnap.data();
        const peserta = data.peserta || [];

        // --- PEMBETULAN: Tentukan Tajuk (Saringan vs Akhir) ---
        let tajukSaringan = `Saringan ${data.noSaringan}`;
        let badgeJenis = `<span class="badge bg-secondary ms-2">Saringan</span>`;

        // Jika database kata ini adalah "akhir"
        if (data.jenis === 'akhir') {
            tajukSaringan = "ACARA AKHIR";
            badgeJenis = `<span class="badge bg-warning text-dark ms-2">AKHIR</span>`;
        }

        // 3. Header HTML
        let html = `
            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2 d-print-none">
                <div>
                    <button class="btn btn-sm btn-outline-secondary me-2" onclick="pilihAcara('${eventId}', '${labelAcara}', '${mode}')">
                        <i class="bi bi-arrow-left"></i> Kembali
                    </button>
                    <h5 class="d-inline-block fw-bold text-primary mb-0">${labelAcara}</h5>
                </div>
                <div>
                    ${badgeJenis}
                    <button class="btn btn-sm btn-success ms-2" onclick="window.print()">
                        <i class="bi bi-printer"></i> Cetak
                    </button>
                </div>
            </div>

            <div class="text-center mb-4">
                <h3 class="fw-bold text-uppercase">${labelAcara}</h3>
                <h4 class="fw-bold text-dark bg-light py-2 border border-dark rounded">${tajukSaringan}</h4>
            </div>
        `;

        // 4. Input Markah / Paparan Peserta
        if (peserta.length === 0) {
            html += `<div class="alert alert-warning text-center">Tiada peserta dalam saringan ini.</div>`;
        } else {
            // Sort peserta ikut lorong
            peserta.sort((a, b) => a.lorong - b.lorong);

            html += `
            <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle">
                    <thead class="table-dark text-center">
                        <tr>
                            <th style="width: 80px;">Lorong</th>
                            <th style="width: 100px;">No. Bib</th>
                            <th>Nama Peserta</th>
                            <th>Pasukan/Rumah</th>
                            <th style="width: 150px;">Keputusan</th>
                            <th style="width: 100px;">Kedudukan</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            peserta.forEach((p, index) => {
                // Input Keputusan (Masa/Jarak)
                const nilaiMasa = p.pencapaian || ""; 
                const nilaiKedudukan = p.kedudukan || "";
                
                // Warna baris jika sudah ada keputusan
                const highlight = nilaiKedudukan > 0 ? "table-success" : "";

                html += `
                    <tr class="${highlight}">
                        <td class="text-center fw-bold fs-5">${p.lorong}</td>
                        <td class="text-center">${p.noBib || '-'}</td>
                        <td>
                            <div class="fw-bold">${p.nama}</div>
                            <small class="text-muted d-block d-print-none">${p.sekolah || ''}</small>
                        </td>
                        <td class="text-center">${p.idRumah ? p.idRumah.toUpperCase() : '-'}</td>
                        
                        <td>
                            <input type="text" class="form-control text-center input-keputusan" 
                                id="masa-${index}" 
                                value="${nilaiMasa}" 
                                placeholder="--.--"
                                onchange="kemaskiniDataTempatan('${index}', 'pencapaian', this.value)">
                        </td>

                        <td>
                            <input type="number" class="form-control text-center input-kedudukan fw-bold" 
                                id="kd-${index}" 
                                value="${nilaiKedudukan > 0 ? nilaiKedudukan : ''}" 
                                min="0" max="20"
                                onchange="kemaskiniDataTempatan('${index}', 'kedudukan', this.value)">
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            </div>

            <div class="d-flex justify-content-end mt-4 d-print-none">
                <button id="btn-simpan-result" class="btn btn-primary btn-lg shadow" onclick="simpanKeputusanSaringan('${eventId}', '${heatId}', '${labelAcara}')">
                    <i class="bi bi-save me-2"></i> Simpan Keputusan
                </button>
            </div>
            `;
        }

        contentArea.innerHTML = html;

        // Simpan data peserta dalam variable global sementara untuk tujuan edit
        window.currentPesertaData = peserta;

    } catch (error) {
        console.error("Ralat papar saringan:", error);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${error.message}</div>`;
    }
};

// Fungsi bantuan untuk kemaskini array sementara (supaya tidak perlu query DB setiap kali taip)
window.kemaskiniDataTempatan = (index, field, value) => {
    if (window.currentPesertaData && window.currentPesertaData[index]) {
        window.currentPesertaData[index][field] = value;
    }
};

// Fungsi Simpan ke Database
window.simpanKeputusanSaringan = async (eventId, heatId, labelAcara) => {
    const btn = document.getElementById('btn-simpan-result');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';

    try {
        const { saveHeatResults } = await import('./modules/admin.js');
        const res = await saveHeatResults(tahunAktif, eventId, heatId, window.currentPesertaData);

        if (res.success) {
            alert("Keputusan berjaya disimpan!");
            pilihSaringan(eventId, heatId, labelAcara, 'input'); // Refresh page
        } else {
            alert("Gagal menyimpan: " + res.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-save me-2"></i> Simpan Keputusan';
        }
    } catch (e) {
        console.error(e);
        alert("Ralat sistem.");
        btn.disabled = false;
    }
};

// ------------------------------------------------------------------------------
// RENDER HTML: ACARA BALAPAN
// ------------------------------------------------------------------------------
function renderBorangBalapan(h, isReadOnly) {
    let t = `
        <div class="table-responsive bg-white shadow-sm p-3 rounded" style="border:1px solid #ddd;">
            <table class="table table-bordered table-hover align-middle mb-0" id="table-balapan">
                <thead class="table-dark text-center">
                    <tr>
                        <th width="80" class="py-3">Lorong</th>
                        <th width="120" class="py-3">No. Bip</th>
                        <th class="text-start py-3">Nama Atlet / Maklumat Rumah</th>
                        <th width="200" class="py-3">Keputusan Masa (s)</th>
                    </tr>
                </thead>
                <tbody>
    `;
        
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="4" class="text-center py-5 text-danger fw-bold"><i class="bi bi-exclamation-triangle me-2"></i>Tiada peserta berdaftar dalam saringan ini. Sila tarik data.</td></tr>`;
    } else {
        h.peserta.forEach((p, idx) => {
            const bipDisplay = p.noBip || p.noBib || '-';
            t += `
                <tr>
                    <td class="text-center fs-5 fw-bold bg-light">${p.lorong || (idx + 1)}</td>
                    <td class="text-center fs-5 text-secondary fw-bold border-end border-2">${bipDisplay}</td>
                    <td>
                        <div class="fw-bold text-dark fs-6">${p.nama.toUpperCase()}</div>
                        <div class="small text-muted text-uppercase d-flex align-items-center mt-1">
                            <i class="bi bi-house-door-fill me-1"></i> RUMAH ${p.idRumah || p.rumah || 'TIADA'}
                        </div>
                    </td>
                    <td class="p-3">
                        ${isReadOnly ? 
                            '<div style="border-bottom: 2px dashed #999; height: 35px; margin-top:5px; width:100%;"></div>' 
                            : 
                            `<div class="input-group">
                                <input type="number" step="0.01" class="form-control form-control-lg text-center res-input text-primary fw-bold" 
                                       data-idx="${idx}" 
                                       value="${p.pencapaian || ''}" 
                                       placeholder="00.00" 
                                       style="background-color: #f8f9fa;">
                                <span class="input-group-text bg-white text-muted">s</span>
                            </div>`
                        }
                    </td>
                </tr>
            `;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `
        <div class="d-grid mt-4">
            <button class="btn btn-primary btn-lg py-3 fw-bold shadow-sm rounded-pill" id="btn-save-results">
                <i class="bi bi-cloud-arrow-up-fill me-2"></i>SIMPAN KEPUTUSAN RASMI
            </button>
        </div>
    `);
}

// ------------------------------------------------------------------------------
// RENDER HTML: ACARA PADANG (Lompat Jauh, Lontar Peluru, dll)
// ------------------------------------------------------------------------------
function renderBorangPadang(h, isReadOnly) {
    let t = `
        <div class="table-responsive bg-white shadow-sm p-3 rounded" style="border:1px solid #ddd;">
            <table class="table table-bordered table-hover text-center align-middle mb-0">
                <thead class="table-dark">
                    <tr>
                        <th width="100" class="py-3">No. Bip</th>
                        <th class="text-start py-3">Atlet / Rumah</th>
                        <th width="100" class="py-3 bg-secondary">T 1 (m)</th>
                        <th width="100" class="py-3 bg-secondary">T 2 (m)</th>
                        <th width="100" class="py-3 bg-secondary">T 3 (m)</th>
                        <th width="150" class="py-3 bg-primary">Terbaik (m)</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="6" class="text-center py-5 text-danger fw-bold">Tiada peserta. Klik butang 'Tarik Data'.</td></tr>`;
    } else {
        h.peserta.forEach((p, idx) => {
            const bipDisplay = p.noBip || p.noBib || '-';
            const tr = p.percubaan || ['', '', ''];
            
            t += `
                <tr data-idx="${idx}">
                    <td class="text-center fw-bold fs-5 text-secondary border-end border-2">${bipDisplay}</td>
                    <td class="text-start">
                        <div class="fw-bold text-dark fs-6">${p.nama.toUpperCase()}</div>
                        <div class="small text-muted text-uppercase mt-1">RUMAH ${p.idRumah || p.rumah || ''}</div>
                    </td>
                    ${[0,1,2].map(i => `
                        <td class="bg-light">
                            ${isReadOnly ? 
                                '<div style="border-bottom: 2px dashed #999; height:35px;"></div>' 
                                : 
                                `<input type="number" step="0.01" class="form-control text-center trial-input" data-trial="${i}" value="${tr[i] || ''}">`
                            }
                        </td>
                    `).join('')}
                    <td class="fw-bold fs-4 text-primary bg-primary bg-opacity-10 align-middle">
                        ${p.pencapaian ? parseFloat(p.pencapaian).toFixed(2) : '-.--'}
                    </td>
                </tr>
            `;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `
        <div class="d-grid mt-4">
            <button class="btn btn-primary btn-lg py-3 fw-bold shadow-sm rounded-pill" id="btn-save-results">
                <i class="bi bi-save2-fill me-2"></i>SIMPAN KEPUTUSAN PADANG
            </button>
        </div>
    `);
}

// ------------------------------------------------------------------------------
// RENDER HTML: LOMPAT TINGGI (Dinamik Columns)
// ------------------------------------------------------------------------------
function renderBorangLompatTinggi(h, isReadOnly) {
    let allHeights = new Set();
    
    // Kumpulkan semua aras ketinggian yang pernah direkodkan untuk peserta ini
    h.peserta.forEach(p => {
        if(p.rekodLompatan) Object.keys(p.rekodLompatan).forEach(ht => allHeights.add(ht));
    });
    
    // Susun secara menaik
    let sorted = Array.from(allHeights).sort((a,b) => parseFloat(a) - parseFloat(b));

    let t = `
        ${isReadOnly ? '' : `
        <div class="mb-3 d-flex justify-content-end d-print-none">
            <button class="btn btn-outline-dark fw-bold rounded-pill shadow-sm" id="btn-add-height">
                <i class="bi bi-plus-circle-fill me-1 text-success"></i> Tambah Aras Lompatan Baru
            </button>
        </div>
        `}
        <div class="table-responsive bg-white shadow-sm p-3 rounded" style="border:1px solid #ddd;">
            <table class="table table-bordered text-center align-middle mb-0" id="high-jump-table">
                <thead class="table-dark">
                    <tr>
                        <th width="100" class="py-3">No. Bip</th>
                        <th class="text-start py-3" style="min-width: 250px;">Atlet / Rumah</th>
                        ${sorted.map(ht => `<th class="py-3 bg-secondary" style="min-width: 60px;">${parseFloat(ht).toFixed(2)}m</th>`).join('')}
                        <th width="120" class="py-3 bg-primary">Terbaik</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="${sorted.length + 3}" class="text-center py-5 text-danger fw-bold">Tiada peserta. Klik 'Tarik Data'.</td></tr>`;
    } else {
        h.peserta.forEach((p, idx) => {
            const bipDisplay = p.noBip || p.noBib || '-';
            t += `
                <tr data-idx="${idx}">
                    <td class="fw-bold fs-5 text-secondary border-end border-2">${bipDisplay}</td>
                    <td class="text-start border-end border-2">
                        <div class="fw-bold text-dark fs-6 text-truncate" style="max-width: 200px;" title="${p.nama}">${p.nama.toUpperCase()}</div>
                        <div class="small text-muted text-uppercase mt-1">RUMAH ${p.idRumah || p.rumah || ''}</div>
                    </td>
                    ${sorted.map(ht => `
                        <td class="bg-light p-1">
                            ${isReadOnly ? 
                                `<div class="fw-bold">${p.rekodLompatan?.[ht]?.join(' ') || ''}</div>` 
                                : 
                                `<input type="text" class="form-control form-control-sm hj-input text-center text-uppercase fw-bold text-dark" 
                                        style="letter-spacing: 2px;"
                                        data-ht="${ht}" 
                                        value="${p.rekodLompatan?.[ht]?.join('') || ''}"
                                        maxlength="3"
                                        placeholder="OX-">`
                            }
                        </td>
                    `).join('')}
                    <td class="fw-bold fs-4 text-primary bg-primary bg-opacity-10">
                        ${p.pencapaian ? parseFloat(p.pencapaian).toFixed(2) : '-.--'}
                    </td>
                </tr>
            `;
        });
    }
    
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `
        <div class="alert alert-info mt-3 small d-print-none border-0 shadow-sm">
            <i class="bi bi-info-circle-fill me-2"></i> <strong>PANDUAN INPUT:</strong> Gunakan <strong>O</strong> (Lepas), <strong>X</strong> (Batal), dan <strong>-</strong> (Pass). Maksimum 3 percubaan.
        </div>
        <div class="d-grid mt-3">
            <button class="btn btn-primary btn-lg py-3 fw-bold shadow-sm rounded-pill" id="btn-save-results">
                <i class="bi bi-trophy-fill me-2"></i>SIMPAN KEPUTUSAN LOMPAT TINGGI
            </button>
        </div>
    `);
}

// ==============================================================================
// 11. LOGIK SIMPAN KEPUTUSAN BERGANTUNG PADA JENIS ACARA
// ==============================================================================
function attachEvents(h, eventId, heatId, label, jenisAcara) {
    
    // BUTANG: Simpan Keputusan
    document.getElementById('btn-save-results').onclick = async () => {
        const btn = document.getElementById('btn-save-results');
        const textAsal = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan Data...';
        btn.disabled = true;

        const updated = [...h.peserta];

        try {
            if (ACARA_KHAS.includes(jenisAcara)) {
                // Logik proses Lompat Tinggi
                document.querySelectorAll('#high-jump-table tbody tr').forEach(row => {
                    const idx = row.dataset.idx;
                    let jumps = {};
                    row.querySelectorAll('.hj-input').forEach(inp => {
                        // Tapis input, hanya benarkan O, X, -
                        const val = inp.value.toUpperCase().split('').filter(v => ['O','X','-'].includes(v));
                        if (val.length > 0) jumps[inp.dataset.ht] = val;
                    });
                    updated[idx].rekodLompatan = jumps;
                    updated[idx].pencapaian = highJumpLogic.getBestHeight(jumps); // Guna modul external
                });
            } 
            else if (ACARA_PADANG.includes(jenisAcara)) {
                // Logik proses Acara Padang
                document.querySelectorAll('tbody tr').forEach(row => {
                    const idx = row.dataset.idx;
                    const trials = Array.from(row.querySelectorAll('.trial-input')).map(i => parseFloat(i.value) || 0);
                    updated[idx].percubaan = trials;
                    
                    // Cari nilai maksimum dari 3 percubaan
                    const highest = Math.max(...trials);
                    updated[idx].pencapaian = highest > 0 ? highest.toFixed(2) : "";
                });
            } 
            else {
                // Logik proses Acara Balapan (Masa)
                document.querySelectorAll('.res-input').forEach(inp => { 
                    updated[inp.dataset.idx].pencapaian = inp.value; 
                });
            }
            
            // Hantar ke Firestore
            const res = await saveHeatResults(tahunAktif, eventId, heatId, updated);
            if(res.success) {
                // Beri respon visual
                btn.classList.replace('btn-primary', 'btn-success');
                btn.innerHTML = '<i class="bi bi-check-circle-fill me-2"></i>Tersimpan!';
                setTimeout(() => {
                    pilihSaringan(eventId, heatId, label, 'keputusan'); // Refresh view
                }, 1000);
            } else {
                throw new Error(res.message);
            }

        } catch (error) {
            console.error(error);
            alert("Ralat semasa menyimpan: " + error.message);
            btn.innerHTML = textAsal;
            btn.disabled = false;
        }
    };

    // BUTANG: Tambah Aras Lompat Tinggi (Dinamik HTML Table)
    document.getElementById('btn-add-height')?.addEventListener('click', () => {
        const val = prompt("Sila masukkan ketinggian palang baru (m):\nContoh: 1.15", "1.10");
        if (!val || isNaN(val)) {
            if(val) alert("Nilai tidak sah. Mesti nombor.");
            return;
        }
        
        const floatVal = parseFloat(val).toFixed(2);
        
        // Tambah column Header
        const head = document.querySelector('#high-jump-table thead tr');
        const th = document.createElement('th'); 
        th.className = "py-3 bg-secondary text-white";
        th.innerText = floatVal + "m";
        head.insertBefore(th, head.lastElementChild);
        
        // Tambah column Data (Input) di setiap baris (Peserta)
        document.querySelectorAll('#high-jump-table tbody tr').forEach(row => {
            const td = document.createElement('td');
            td.className = "bg-light p-1";
            td.innerHTML = `
                <input type="text" class="form-control form-control-sm hj-input text-center text-uppercase fw-bold text-dark" 
                       style="letter-spacing: 2px;"
                       data-ht="${floatVal}" 
                       value="" 
                       maxlength="3"
                       placeholder="OX-">
            `;
            row.insertBefore(td, row.lastElementChild);
        });
    });
}

// ==============================================================================
// 12. FUNGSI SYNC NO BIP & AGIHAN AUTO (DARI PENDAFTARAN RUMAH)
// ==============================================================================

// Sync Nombor Bip (Kadangkala Guru kemaskini No Bip selepas Admin cipta saringan)
window.jalankanSync = async (eventId, heatId, label, mode) => {
    if(!confirm(`Tindakan ini akan menyemak profil setiap peserta di dalam saringan ini dan mengemas kini Nombor Bip mereka berdasarkan data terkini yang dimasukkan oleh Guru Rumah. Teruskan?`)) return;
    
    console.info(`--- PROSES SYNC NO BIP BERMULA (Tahun: ${tahunAktif}) ---`);
    try {
        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);
        
        if (heatSnap.exists()) {
            const data = heatSnap.data();
            
            // Loop secara asinkronus menggunakan Promise.all untuk kelajuan
            const pesertaUpdated = await Promise.all(data.peserta.map(async (p) => {
                const atletRef = doc(db, "kejohanan", tahunAktif, "peserta", p.idPeserta);
                const atletSnap = await getDoc(atletRef);
                
                if (atletSnap.exists()) {
                    const atletData = atletSnap.data();
                    // Ambil noBib (format lama) atau noBip (format baru)
                    const bibBetul = atletData.noBib || atletData.noBip || p.idPeserta;
                    return { ...p, noBip: bibBetul, noBib: bibBetul };
                } else {
                    return p; // Kekalkan data lama jika profil hilang
                }
            }));

            // Tulis ganti array peserta dalam dokumen saringan
            await updateDoc(heatRef, { peserta: pesertaUpdated });
            alert("Sync Selesai! Semua Nombor Bip telah dikemaskini.");
            pilihSaringan(eventId, heatId, label, mode); // Refresh UI
        }
    } catch (e) {
        console.error(e);
        alert("Gagal melakukan proses Sync: " + e.message);
    }
};

// Auto Tarik (Agihan Auto) - Tarik peserta dari koleksi 'peserta' masuk ke dalam 'saringan'
window.agihanAuto = async (eventId, heatId, label, mode) => {
    const eventDetail = await getEventDetail(tahunAktif, eventId);
    
    if (!confirm(`AMARAN: Tindakan ini akan membuang senarai peserta sedia ada dalam saringan ini dan menggantikannya dengan SEMUA peserta berdaftar (Rumah Sukan) untuk acara ${eventDetail.nama} (${eventDetail.kategori}). Adakah anda pasti?`)) return;

    console.info("Memulakan proses Tarik Data (Agihan Auto)...");
    try {
        // Bina Query: Cari peserta di tahun aktif, kategori sama, dan array 'acaraDaftar' mempunyai nama acara ini
        const q = query(
            collection(db, "kejohanan", tahunAktif, "peserta"),
            where("kategori", "==", eventDetail.kategori),
            where("acaraDaftar", "array-contains", eventDetail.nama)
        );

        const snap = await getDocs(q);
        
        // Format semula data Firestore menjadi array objek yang difahami oleh sistem Saringan
        const senaraiBaru = snap.docs.map((d, index) => {
            const data = d.data();
            return {
                idPeserta: d.id,
                nama: data.nama || 'Tiada Nama',
                noBip: data.noBib || data.noBip || '-',
                idRumah: data.rumah || data.idRumah || '',
                lorong: index + 1, // Susun secara rawak mengikut index query
                pencapaian: ""
            };
        });

        if (senaraiBaru.length === 0) {
            alert(`Tiada peserta ditemui bagi kategori ${eventDetail.kategori} yang mendaftar untuk acara ${eventDetail.nama}. Sila minta Guru Rumah mengemaskini pendaftaran.`);
            return;
        }

        // Tulis data ke Firestore (Overwrite field 'peserta')
        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        await updateDoc(heatRef, { peserta: senaraiBaru });

        alert(`Tahniah! ${senaraiBaru.length} peserta telah berjaya ditarik masuk ke dalam saringan ini.`);
        pilihSaringan(eventId, heatId, label, mode); // Refresh UI

    } catch (e) {
        console.error("Ralat Agihan Auto:", e);
        alert("Gagal melakukan agihan auto. Mesej pelayan: " + e.message);
    }
};

// ==============================================================================
// START SISTEM
// ==============================================================================
// Muatkan paparan setup apabila fail JS siap dijalankan
document.addEventListener('DOMContentLoaded', () => {
    renderSetupForm();
});



