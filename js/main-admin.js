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
// 10. PENGURUSAN PAPARAN SARINGAN & KEPUTUSAN (INTEGRATED)
// ==============================================================================

// Import senarai acara untuk rujukan jenis (Pastikan variable ini wujud/diimport)
// Jika error, boleh hardcode array ini di sini sementara waktu:
const LIST_ACARA_PADANG = ["Lompat Jauh", "Lontar Peluru", "Rejam Lembing", "Lempar Cakera", "Lompat Kijang"];
const LIST_ACARA_KHAS = ["Lompat Tinggi"]; 

window.pilihSaringan = async (eventId, heatId, labelAcara, mode) => {
    // 1. Paparan Loading
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan data borang...</p></div>';

    try {
        const isEditMode = (mode === 'input'); // True jika Input Keputusan, False jika Urus/Cetak
        const tStr = tahunAktif.toString();

        // 2. Dapatkan Data
        const heatRef = doc(db, "kejohanan", tStr, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);

        if (!heatSnap.exists()) {
            contentArea.innerHTML = '<div class="alert alert-danger">Data saringan tidak dijumpai.</div>';
            return;
        }

        const data = heatSnap.data();
        // Simpan data dalam variable global untuk fungsi simpan nanti
        window.currentHeatData = data; 
        window.currentHeatId = heatId;
        window.currentEventId = eventId;
        window.currentLabel = labelAcara;

        // 3. Tentukan Jenis Acara & Borang
        // Bersihkan nama acara untuk pengecekan
        const cleanName = labelAcara.replace(/L\d+|P\d+/g, '').trim(); // Buang L18/P15 dsb
        
        const isHighJump = LIST_ACARA_KHAS.some(x => labelAcara.includes(x));
        const isField = LIST_ACARA_PADANG.some(x => labelAcara.includes(x));
        const isFinal = (data.jenis === 'akhir');

        // Tentukan Tajuk
        let tajukKecil = `Saringan ${data.noSaringan}`;
        let badge = `<span class="badge bg-secondary ms-2">Saringan</span>`;
        
        if (isFinal) {
            tajukKecil = "ACARA AKHIR";
            badge = `<span class="badge bg-warning text-dark ms-2">AKHIR</span>`;
        }

        // 4. HEADER (Sama untuk semua)
        let htmlHeader = `
            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2 d-print-none">
                <div>
                    <button class="btn btn-sm btn-outline-secondary me-2" onclick="pilihAcara('${eventId}', '${labelAcara}', '${mode}')">
                        <i class="bi bi-arrow-left"></i> Kembali
                    </button>
                    <h5 class="d-inline-block fw-bold text-primary mb-0">${labelAcara}</h5>
                </div>
                <div>
                    ${badge}
                    <button class="btn btn-sm btn-success ms-2" onclick="window.print()">
                        <i class="bi bi-printer"></i> Cetak Borang
                    </button>
                </div>
            </div>

            <div class="text-center mb-4">
                <h3 class="fw-bold text-uppercase">${labelAcara}</h3>
                <h4 class="fw-bold text-dark bg-light py-2 border border-dark rounded d-inline-block px-5">${tajukKecil}</h4>
                ${!isEditMode ? '<p class="small text-muted d-print-none mt-2">(Mod Cetakan: Input dikunci)</p>' : ''}
            </div>
        `;

        // 5. BODY (Pilih ikut jenis acara)
        let htmlBody = '';
        
        // --- LOGIK PEMILIHAN BORANG ---
        if (isHighJump) {
            htmlBody = renderBorangLompatTinggi(data, !isEditMode);
        } else if (isField) {
            htmlBody = renderBorangPadang(data, !isEditMode);
        } else {
            htmlBody = renderBorangBalapan(data, !isEditMode);
        }

        contentArea.innerHTML = htmlHeader + htmlBody;

        // 6. EVENT LISTENERS (Untuk Butang Simpan)
        // Kita pasang listener secara manual sebab HTML string susah nak pass object
        const btnSimpan = document.getElementById('btn-save-results');
        if (btnSimpan) {
            btnSimpan.addEventListener('click', () => {
                simpanKeputusanUmum(eventId, heatId, labelAcara);
            });
        }
        
        // Listener Khas untuk butang tambah aras (High Jump)
        const btnAddHeight = document.getElementById('btn-add-height');
        if (btnAddHeight) {
            btnAddHeight.addEventListener('click', () => {
                const height = prompt("Masukkan ketinggian baru (meter):", "1.xx");
                if (height && !isNaN(height)) {
                    // Tambah key kosong pada semua peserta
                    window.currentHeatData.peserta.forEach(p => {
                        if (!p.rekodLompatan) p.rekodLompatan = {};
                        if (!p.rekodLompatan[height]) p.rekodLompatan[height] = [];
                    });
                    // Refresh paparan
                    // (Secara ideal simpan ke DB dulu, tapi untuk UI pantas kita refresh HTML)
                    const newBody = renderBorangLompatTinggi(window.currentHeatData, false);
                    // Cari div body dan ganti (cara malas: panggil pilihSaringan semula)
                    simpanKeputusanUmum(eventId, heatId, labelAcara, true); // Simpan & Refresh
                }
            });
        }

    } catch (error) {
        console.error("Ralat pilihSaringan:", error);
        contentArea.innerHTML = `<div class="alert alert-danger">Ralat: ${error.message}</div>`;
    }
};

// ==============================================================================
// FUNGSI SIMPAN (SATU UNTUK SEMUA)
// ==============================================================================
window.simpanKeputusanUmum = async (eventId, heatId, label, silent = false) => {
    const btn = document.getElementById('btn-save-results');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';
    }

    try {
        // Kumpul data dari input field ke dalam object window.currentHeatData
        
        // 1. INPUT BIASA (Masa/Jarak & Kedudukan)
        const inputsRes = document.querySelectorAll('.res-input');
        inputsRes.forEach(el => {
            const idx = el.getAttribute('data-idx');
            window.currentHeatData.peserta[idx].pencapaian = el.value;
        });

        const inputsKed = document.querySelectorAll('.ked-input'); // Pastikan tambah class ked-input di render functions
        // Nota: Dalam render function di bawah saya akan tambah class ked-input
        
        // 2. INPUT ACARA PADANG (Percubaan)
        const inputsTrial = document.querySelectorAll('.trial-input');
        inputsTrial.forEach(el => {
            // structure: tr inside row data-idx
            const tr = el.closest('tr');
            const idx = tr.getAttribute('data-idx');
            const trialIdx = el.getAttribute('data-trial');
            
            if(!window.currentHeatData.peserta[idx].percubaan) window.currentHeatData.peserta[idx].percubaan = [];
            window.currentHeatData.peserta[idx].percubaan[trialIdx] = el.value;
        });

        // 3. INPUT LOMPAT TINGGI (Grid)
        const inputsHJ = document.querySelectorAll('.hj-input');
        inputsHJ.forEach(el => {
            const tr = el.closest('tr');
            const idx = tr.getAttribute('data-idx');
            const ht = el.getAttribute('data-ht');
            const val = el.value.toUpperCase(); // O, X, -
            
            if(!window.currentHeatData.peserta[idx].rekodLompatan) window.currentHeatData.peserta[idx].rekodLompatan = {};
            // Split string to array (cth: "XXO" -> ["X","X","O"])
            window.currentHeatData.peserta[idx].rekodLompatan[ht] = val.split('');
        });

        // Hantar ke Database
        const { saveHeatResults } = await import('./modules/admin.js');
        const res = await saveHeatResults(tahunAktif, eventId, heatId, window.currentHeatData.peserta);

        if (res.success) {
            if(!silent) alert("Data berjaya disimpan!");
            pilihSaringan(eventId, heatId, label, 'input'); // Refresh
        } else {
            alert("Gagal simpan: " + res.message);
            if(btn) btn.disabled = false;
        }

    } catch (e) {
        console.error(e);
        alert("Ralat sistem semasa menyimpan.");
        if(btn) btn.disabled = false;
    }
};

// ==============================================================================
// RENDER 1: BALAPAN (TRACK)
// ==============================================================================
function renderBorangBalapan(h, isReadOnly) {
    let t = `
        <div class="table-responsive bg-white shadow-sm p-3 rounded">
            <table class="table table-bordered table-hover align-middle mb-0">
                <thead class="table-dark text-center">
                    <tr>
                        <th width="80" class="py-3">Lorong</th>
                        <th width="100" class="py-3">No. Bib</th>
                        <th class="text-start py-3">Nama Peserta</th>
                        <th width="200" class="py-3">Masa / Keputusan</th>
                        <th width="100" class="py-3">Kedudukan</th>
                    </tr>
                </thead>
                <tbody>
    `;
       
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="5" class="text-center py-5 text-danger">Tiada peserta.</td></tr>`;
    } else {
        h.peserta.sort((a,b) => a.lorong - b.lorong);
        
        h.peserta.forEach((p, idx) => {
            t += `
                <tr>
                    <td class="text-center fs-5 fw-bold bg-light">${p.lorong}</td>
                    <td class="text-center fw-bold text-secondary">${p.noBib || '-'}</td>
                    <td>
                        <div class="fw-bold">${p.nama}</div>
                        <div class="small text-muted">Rumah ${p.idRumah || '-'}</div>
                    </td>
                    <td class="p-2">
                        ${isReadOnly ? 
                            `<div class="text-center text-muted py-2" style="border-bottom:1px dashed #ccc;">${p.pencapaian || ''}</div>` 
                            : 
                            `<input type="text" class="form-control text-center fw-bold res-input" 
                                data-idx="${idx}" value="${p.pencapaian || ''}" placeholder="--.--">`
                        }
                    </td>
                    <td class="p-2">
                         ${isReadOnly ? 
                            `<div class="text-center text-muted py-2" style="border-bottom:1px dashed #ccc;">${p.kedudukan || ''}</div>` 
                            : 
                            `<input type="number" class="form-control text-center fw-bold ked-input" 
                                data-idx="${idx}" value="${p.kedudukan > 0 ? p.kedudukan : ''}" min="0">`
                        }
                    </td>
                </tr>
            `;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `
        <div class="d-grid mt-4">
            <button class="btn btn-primary btn-lg shadow-sm" id="btn-save-results"><i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN</button>
        </div>
    `);
}

// ==============================================================================
// RENDER 2: PADANG (FIELD) - LOMPAT JAUH, LONTAR PELURU, DLL
// ==============================================================================
function renderBorangPadang(h, isReadOnly) {
    let t = `
        <div class="table-responsive bg-white shadow-sm p-3 rounded">
            <table class="table table-bordered table-hover text-center align-middle mb-0">
                <thead class="table-dark">
                    <tr>
                        <th width="80">Giliran</th>
                        <th width="100">Bib</th>
                        <th class="text-start">Nama</th>
                        <th>Cb 1</th> <th>Cb 2</th> <th>Cb 3</th>
                        ${h.jenis==='akhir' ? '<th>Cb 4</th><th>Cb 5</th><th>Cb 6</th>' : ''}
                        <th class="bg-primary bg-opacity-75">Terbaik</th>
                        <th width="80">Ked</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Default 3 cubaan, kalau akhir 6 cubaan (boleh adjust ikut peraturan sekolah)
    const numTrials = h.jenis === 'akhir' ? 6 : 3;
    const trialsArr = Array.from({length: numTrials}, (_, i) => i);

    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="${5 + numTrials}" class="text-center py-5">Tiada peserta.</td></tr>`;
    } else {
        // Susun ikut giliran (guna lorong field as giliran)
        h.peserta.sort((a,b) => a.lorong - b.lorong);

        h.peserta.forEach((p, idx) => {
            const tr = p.percubaan || [];
            
            t += `
                <tr data-idx="${idx}">
                    <td class="fw-bold bg-light">${p.lorong}</td>
                    <td class="fw-bold text-secondary">${p.noBib || '-'}</td>
                    <td class="text-start">
                        <div class="fw-bold text-truncate" style="max-width:180px;">${p.nama}</div>
                        <small class="text-muted">Rumah ${p.idRumah || '-'}</small>
                    </td>
                    ${trialsArr.map(i => `
                        <td class="p-1">
                             ${isReadOnly ? 
                                `<div style="height:30px; border-bottom:1px dashed #ccc;"></div>` 
                                : 
                                `<input type="number" step="0.01" class="form-control text-center p-1 trial-input" 
                                    data-trial="${i}" value="${tr[i] || ''}">`
                            }
                        </td>
                    `).join('')}
                    
                    <td class="p-1 bg-primary bg-opacity-10">
                        ${isReadOnly ? 
                            p.pencapaian || '' 
                            : 
                            `<input type="number" step="0.01" class="form-control text-center fw-bold res-input" 
                                data-idx="${idx}" value="${p.pencapaian || ''}">`
                        }
                    </td>
                    <td class="p-1">
                        ${isReadOnly ? 
                            p.kedudukan || '' 
                            : 
                            `<input type="number" class="form-control text-center fw-bold ked-input" 
                                data-idx="${idx}" value="${p.kedudukan > 0 ? p.kedudukan : ''}">`
                        }
                    </td>
                </tr>
            `;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `
        <div class="d-grid mt-4">
            <button class="btn btn-primary btn-lg shadow-sm" id="btn-save-results"><i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN PADANG</button>
        </div>
    `);
}

// ==============================================================================
// RENDER 3: LOMPAT TINGGI (HIGH JUMP) - PEMBETULAN INPUT
// ==============================================================================
function renderBorangLompatTinggi(h, isReadOnly) {
    let allHeights = new Set();
    
    // 1. Kumpulkan ketinggian yang SUDAH ADA dalam database
    if(h.peserta) {
        h.peserta.forEach(p => {
            if(p.rekodLompatan) Object.keys(p.rekodLompatan).forEach(ht => allHeights.add(ht));
        });
    }

    // Susun ketinggian ikut urutan (1.10, 1.15, ...)
    let sorted = Array.from(allHeights).sort((a,b) => parseFloat(a) - parseFloat(b));

    // LOGIK PENTING:
    // Jika ReadOnly (Cetak), kita nak nampak kotak kosong kalau data tiada.
    // Jika Input, kita TIDAK MAHU kotak kosong. Kita nak user tambah ketinggian valid.
    let cols = [];
    
    if (isReadOnly && sorted.length === 0) {
        cols = Array(10).fill(''); // 10 Kolum hantu untuk cetakan
    } else {
        cols = sorted; // Guna data sebenar
    }

    let t = `
        ${isReadOnly ? '' : `
        <div class="alert alert-info py-2 small mb-2 d-flex justify-content-between align-items-center d-print-none">
            <span><i class="bi bi-info-circle me-2"></i>Sila tambah ketinggian palang sebelum memasukkan keputusan O/X.</span>
            <button class="btn btn-sm btn-dark rounded-pill shadow-sm" id="btn-add-height">
                <i class="bi bi-plus-lg text-success"></i> Tambah Ketinggian
            </button>
        </div>
        `}
        <div class="table-responsive bg-white shadow-sm p-3 rounded">
            <table class="table table-bordered text-center align-middle mb-0 table-sm border-dark">
                <thead class="table-dark small">
                    <tr>
                        <th width="40">No</th>
                        <th width="60">Bib</th>
                        <th class="text-start" style="min-width: 200px;">Nama Peserta</th> 
                        
                        ${cols.map(ht => {
                            let headerLabel = (ht === '') ? '' : `${parseFloat(ht).toFixed(2)}m`;
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
        // Susun peserta ikut No Bib
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
                        // Jika kolum hantu (untuk cetak sahaja)
                        if (ht === '') {
                            return `<td class="border-end"></td>`;
                        }

                        // Jika kolum sebenar (ada ketinggian)
                        const val = p.rekodLompatan?.[ht] ? p.rekodLompatan[ht].join('') : '';
                        
                        return `
                        <td class="p-0">
                            ${isReadOnly ? 
                                `<div style="height:35px; line-height:35px; font-weight:bold;">${val}</div>` 
                                : 
                                // INPUT LOMPATAN (GRID)
                                `<input type="text" class="form-control form-control-sm border-0 text-center hj-input p-0 fw-bold" 
                                    style="height:35px; letter-spacing:2px; text-transform:uppercase; background-color: #fff;"
                                    data-ht="${ht}" value="${val}" maxlength="3">`
                            }
                        </td>`;
                    }).join('')}
                    
                    <td class="bg-primary bg-opacity-10 p-1 border-start border-secondary fw-bold">
                         ${isReadOnly ? (p.pencapaian || '') : 
                         `<input type="text" class="form-control form-control-sm text-center fw-bold res-input" data-idx="${idx}" value="${p.pencapaian||''}">`}
                    </td>
                    
                    <td class="p-1 fw-bold">
                        ${isReadOnly ? (p.kedudukan || '') : 
                        `<input type="number" class="form-control form-control-sm text-center ked-input" data-idx="${idx}" value="${p.kedudukan > 0 ? p.kedudukan : ''}">`}
                    </td>
                </tr>
            `;
        });
    }

    t += `</tbody></table></div>`;

    if (!isReadOnly) {
        t += `
        <div class="d-grid mt-3">
            <button class="btn btn-primary shadow-sm py-2" id="btn-save-results">
                <i class="bi bi-save me-2"></i>SIMPAN KEPUTUSAN
            </button>
        </div>
        `;
    }

    return t;
}
    t += `</tbody></table></div>`;

    // BAHAGIAN BAWAH (PANDUAN & BUTANG)
    if (!isReadOnly) {
        // Mode INPUT: Ada butang simpan
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
        // Mode CETAK: Ada ruang tandatangan
        if (isEmptyForm) {
            t += `
            <div class="mt-4 row d-print-flex">
                <div class="col-6">
                    <p class="mb-5">Tandatangan Hakim Ketua:</p>
                    <div class="border-bottom border-dark w-75"></div>
                    <p class="small mt-1">(Nama: ....................................................)</p>
                </div>
                <div class="col-6">
                    <p class="mb-5">Tandatangan Refri:</p>
                    <div class="border-bottom border-dark w-75"></div>
                    <p class="small mt-1">(Nama: ....................................................)</p>
                </div>
            </div>
            `;
        }
    }

    return t;
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







