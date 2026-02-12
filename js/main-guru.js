import { 
    registerParticipant, 
    updateParticipant, 
    getEventsByCategory, 
    getRegisteredParticipants,
    deleteParticipant // Pastikan module guru.js anda ada fungsi ini, jika tiada boleh abaikan
} from './modules/guru.js';

// =========================================================
// BAHAGIAN 1: KONFIGURASI & KAWALAN AKSES
// =========================================================

// Ambil data dari Session Storage
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();
const idRumah = sessionStorage.getItem("user_rumah");
const namaRumah = sessionStorage.getItem("nama_rumah");
const userRole = sessionStorage.getItem("user_role");

// Semakan Keselamatan: Halang akses jika bukan Guru
if (userRole !== 'guru' || !idRumah) {
    alert("Sesi anda telah tamat atau anda tiada kebenaran. Sila log masuk semula.");
    window.location.href = 'login.html';
}

// Global Variable untuk simpanan sementara data (Cache)
let globalPesertaList = []; 

// Tetapan UI Awal
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nama-rumah').innerText = `Rumah: ${namaRumah}`;
    document.getElementById('display-tahun').innerText = tahunAktif;
    
    // Mula memuatkan data peserta sebaik sahaja page ready
    muatSenaraiPeserta();
});

// =========================================================
// BAHAGIAN 2: REFERENSI ELEMEN DOM (DOM CACHING)
// =========================================================
const el = {
    // Borang
    form: document.getElementById('form-daftar-atlet'),
    id: document.getElementById('edit-id-peserta'),
    nama: document.getElementById('nama-atlet'),
    kat: document.getElementById('kategori-atlet'),
    bib: document.getElementById('no-bib'),
    
    // Checkbox Acara
    containerAcara: document.getElementById('senarai-acara-checkbox'),
    labelCountAcara: document.getElementById('count-acara'),
    
    // Butang
    btnDaftar: document.getElementById('btn-daftar'),
    btnBatal: document.getElementById('btn-batal'),
    
    // Toolbar Senarai
    filterKat: document.getElementById('filter-kategori'),
    inputCarian: document.getElementById('carian-nama'),
    labelJumlah: document.getElementById('jumlah-peserta'),
    
    // Jadual
    tbody: document.querySelector('#list-peserta table tbody'),

    // Modal CSV
    inputCsv: document.getElementById('failCsv'),
    statusCsv: document.getElementById('status-upload')
};

// =========================================================
// BAHAGIAN 3: PENGURUSAN ACARA (CHECKBOX LOGIC)
// =========================================================

/**
 * Fungsi untuk memuatkan checkbox acara berdasarkan kategori jantina/umur
 */
async function muatAcara(kategori, acaraTerpilih = []) {
    // Reset paparan
    el.containerAcara.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary"></div><span class="ms-2 small">Memuatkan acara...</span></div>';
    el.labelCountAcara.innerText = "0/5 dipilih";
    el.labelCountAcara.className = "form-text mt-1 text-end small text-muted";

    if (!kategori) {
        el.containerAcara.innerHTML = '<div class="text-muted small fst-italic p-2">Sila pilih kategori atlet dahulu untuk melihat acara.</div>';
        return;
    }

    try {
        // Panggil Database/API
        const senaraiAcara = await getEventsByCategory(tahunAktif, kategori);
        
        if (!senaraiAcara || senaraiAcara.length === 0) {
            el.containerAcara.innerHTML = '<div class="alert alert-warning py-1 small mb-0"><i class="bi bi-exclamation-circle"></i> Tiada acara didaftarkan untuk kategori ini.</div>';
            return;
        }

        // Pastikan acaraTerpilih adalah array
        const currentSelection = Array.isArray(acaraTerpilih) ? acaraTerpilih : [];

        // Bina HTML Checkbox
        let html = '';
        senaraiAcara.forEach(acara => {
            const isChecked = currentSelection.includes(acara.nama) ? 'checked' : '';
            html += `
                <div class="form-check mb-2">
                    <input class="form-check-input input-acara" type="checkbox" value="${acara.nama}" id="ev-${acara.id}" ${isChecked}>
                    <label class="form-check-label small" for="ev-${acara.id}">
                        ${acara.nama}
                    </label>
                </div>`;
        });
        
        el.containerAcara.innerHTML = html;
        
        // Update kaunter sekiranya ini mode Edit
        kemaskiniKaunterAcara();

    } catch (err) {
        console.error(err);
        el.containerAcara.innerHTML = `<div class="text-danger small p-2">Ralat memuatkan acara: ${err.message}</div>`;
    }
}

/**
 * Event Listener untuk Logik Had 5 Acara
 */
el.containerAcara.addEventListener('change', (e) => {
    if (e.target.classList.contains('input-acara')) {
        const checkboxes = el.containerAcara.querySelectorAll('.input-acara:checked');
        
        if (checkboxes.length > 5) {
            e.target.checked = false; // Batalkan selection terakhir
            alert("Harap maaf. Seorang atlet hanya dibenarkan menyertai maksimum 5 acara sahaja.");
        }
        
        kemaskiniKaunterAcara();
    }
});

function kemaskiniKaunterAcara() {
    const total = el.containerAcara.querySelectorAll('.input-acara:checked').length;
    el.labelCountAcara.innerText = `${total}/5 dipilih`;

    if (total === 5) {
        el.labelCountAcara.className = "form-text mt-1 text-end small text-danger fw-bold";
    } else if (total > 0) {
        el.labelCountAcara.className = "form-text mt-1 text-end small text-primary fw-bold";
    } else {
        el.labelCountAcara.className = "form-text mt-1 text-end small text-muted";
    }
}

// Trigger muat acara bila dropdown kategori berubah
el.kat.addEventListener('change', (e) => {
    muatAcara(e.target.value);
});


// =========================================================
// BAHAGIAN 4: PENDAFTARAN & KEMASKINI (CRUD)
// =========================================================

el.form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Ambil Data dari Borang
    const idPeserta = el.id.value;
    const nama = el.nama.value.toUpperCase().trim();
    const kategori = el.kat.value;
    const noBib = el.bib.value.toUpperCase().trim();
    
    // Ambil semua checkbox yang ditanda
    const checkboxes = el.containerAcara.querySelectorAll('.input-acara:checked');
    const acaraDaftar = Array.from(checkboxes).map(cb => cb.value);

    // 2. Validasi Asas
    if (!nama || !kategori || !noBib) {
        alert("Sila lengkapkan semua butiran wajib (Nama, Kategori, No Bib).");
        return;
    }

    // 3. Penyediaan Objek Data
    const dataPeserta = {
        nama: nama,
        kategori: kategori,
        noBib: noBib,
        idRumah: idRumah,
        rumah: namaRumah,
        acaraDaftar: acaraDaftar,
        kemaskiniOleh: 'guru', // Audit trail
        tarikhKemaskini: new Date().toISOString()
    };

    if (!idPeserta) {
        dataPeserta.tarikhDaftar = new Date().toISOString();
    }

    // 4. Proses Simpan ke Database
    try {
        // UI Loading
        kunciBorang(true, "Sedang Menyimpan...");

        let result;
        if (idPeserta) {
            // Mode EDIT
            result = await updateParticipant(tahunAktif, idPeserta, dataPeserta);
            if (result.success) {
                alert(`Data atlet '${nama}' berjaya dikemaskini.`);
            }
        } else {
            // Mode DAFTAR BARU
            result = await registerParticipant(tahunAktif, dataPeserta);
            if (result.success) {
                alert(`Pendaftaran berjaya!\nAtlet: ${nama}\nNo Bib: ${noBib}`);
            }
        }

        // 5. Selesai
        resetBorang();
        muatSenaraiPeserta(); // Refresh jadual

    } catch (error) {
        console.error("Ralat simpan:", error);
        alert("Gagal menyimpan data: " + error.message);
    } finally {
        kunciBorang(false);
    }
});

// Fungsi Reset Borang ke keadaan asal
function resetBorang() {
    el.form.reset();
    el.id.value = "";
    
    // Reset UI Checkbox
    el.containerAcara.innerHTML = '<div class="text-muted small fst-italic p-2">Sila pilih kategori atlet dahulu...</div>';
    el.labelCountAcara.innerText = "0/5 dipilih";
    
    // Reset Butang
    el.btnDaftar.innerHTML = '<i class="bi bi-save me-1"></i> Simpan Pendaftaran';
    el.btnDaftar.className = 'btn btn-primary shadow-sm fw-bold';
    el.btnBatal.classList.add('d-none');
    
    el.nama.focus();
}

function kunciBorang(isLocked, msg = "") {
    el.btnDaftar.disabled = isLocked;
    if (isLocked) {
        el.btnDaftar.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${msg}`;
    }
}

// Event Listener butang Batal
el.btnBatal.addEventListener('click', resetBorang);


// =========================================================
// BAHAGIAN 5: SENARAI PESERTA (PAPARAN SKRIN)
// =========================================================

async function muatSenaraiPeserta() {
    // Tunjuk loader dalam table
    el.tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <div class="mt-2 small text-muted">Mengambil data terkini...</div>
            </td>
        </tr>`;

    try {
        const data = await getRegisteredParticipants(tahunAktif, idRumah);
        globalPesertaList = data || [];
        renderJadual(); // Proses data ke HTML
    } catch (error) {
        console.error(error);
        el.tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger py-4">
                    <i class="bi bi-wifi-off display-6"></i><br>
                    Gagal memuatkan data. Sila semak sambungan internet anda.
                </td>
            </tr>`;
    }
}

function renderJadual() {
    const filterKat = el.filterKat.value;
    const keyword = el.inputCarian.value.toLowerCase();

    // 1. Tapis Data
    let filtered = globalPesertaList.filter(p => {
        const matchKategori = (filterKat === "SEMUA") || (p.kategori === filterKat);
        const matchNama = p.nama.toLowerCase().includes(keyword) || 
                          (p.noBib && p.noBib.toLowerCase().includes(keyword));
        return matchKategori && matchNama;
    });

    // 2. Susun Data (Sorting) untuk paparan Skrin
    // Standard: Kategori (L12->P12) -> Nama (A->Z)
    filtered.sort((a, b) => {
        if (a.kategori < b.kategori) return -1;
        if (a.kategori > b.kategori) return 1;
        return a.nama.localeCompare(b.nama);
    });

    // 3. Bina HTML
    if (filtered.length === 0) {
        el.tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4 fst-italic">- Tiada rekod ditemui -</td></tr>`;
        el.labelJumlah.innerText = "0 Orang";
        return;
    }

    let html = '';
    filtered.forEach(p => {
        const events = Array.isArray(p.acaraDaftar) ? p.acaraDaftar : [];
        const eventCount = events.length;
        const eventsDisplay = eventCount > 0 ? events.join(', ') : '<span class="text-muted fst-italic">Tiada acara</span>';
        
        // Warna badge untuk visual cepat
        let badgeClass = 'bg-secondary';
        if (eventCount > 0 && eventCount < 5) badgeClass = 'bg-success';
        if (eventCount === 5) badgeClass = 'bg-danger';

        html += `
            <tr>
                <td class="text-center">
                    <span class="badge bg-light text-dark border shadow-sm">${p.kategori}</span>
                </td>
                <td class="font-monospace fw-bold text-primary">${p.noBib || '-'}</td>
                <td>
                    <div class="fw-bold text-dark">${p.nama}</div>
                    <div class="small mt-1 d-flex align-items-center">
                        <span class="badge ${badgeClass} me-2" style="font-size:0.65rem">${eventCount}</span>
                        <span class="text-secondary" style="font-size:0.8rem">${eventsDisplay}</span>
                    </div>
                </td>
                <td class="text-end">
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.sediaEdit('${p.id}')" title="Edit">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.padamPeserta('${p.id}', '${p.nama}')" title="Padam">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    el.tbody.innerHTML = html;
    el.labelJumlah.innerText = `${filtered.length} Orang`;
}

// Event Listeners untuk Filter/Search
el.filterKat.addEventListener('change', renderJadual);
el.inputCarian.addEventListener('input', renderJadual);


// =========================================================
// BAHAGIAN 6: FUNGSI EDIT & PADAM
// =========================================================

// Diasingkan ke window scope supaya boleh dipanggil dari onclick HTML
window.sediaEdit = async function(id) {
    const peserta = globalPesertaList.find(p => p.id === id);
    if (!peserta) return;

    // Masukkan data ke dalam form
    el.id.value = peserta.id;
    el.nama.value = peserta.nama;
    el.kat.value = peserta.kategori;
    el.bib.value = peserta.noBib;

    // Tukar UI Button
    el.btnDaftar.innerHTML = '<i class="bi bi-check-circle me-1"></i> Kemaskini Data';
    el.btnDaftar.className = 'btn btn-warning shadow-sm fw-bold text-dark';
    el.btnBatal.classList.remove('d-none');

    // Load acara dan tick checkbox yang berkaitan
    await muatAcara(peserta.kategori, peserta.acaraDaftar);

    // Scroll ke atas
    document.querySelector('.card-body').scrollIntoView({ behavior: 'smooth' });
};

window.padamPeserta = async function(id, nama) {
    if (confirm(`Adakah anda pasti mahu memadam atlet ini?\n\nNama: ${nama}\n\nTindakan ini tidak boleh dikembalikan.`)) {
        try {
            // Jika modul anda ada fungsi deleteParticipant
            if (typeof deleteParticipant === 'function') {
                await deleteParticipant(tahunAktif, id);
                alert("Atlet berjaya dipadam.");
                muatSenaraiPeserta();
            } else {
                alert("Fungsi padam belum diaktifkan dalam sistem.");
            }
        } catch (err) {
            alert("Ralat memadam: " + err.message);
        }
    }
};


// =========================================================
// BAHAGIAN 7: IMPORT CSV (DENGAN LAPORAN PENUH)
// =========================================================

window.prosesCSV = async function() {
    const file = el.inputCsv.files[0];
    if (!file) {
        alert("Sila pilih fail CSV terlebih dahulu.");
        return;
    }

    el.statusCsv.innerHTML = '<div class="alert alert-info py-2"><span class="spinner-border spinner-border-sm"></span> Sedang memproses fail... Sila tunggu.</div>';

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        
        let successCount = 0;
        let failCount = 0;
        let failLog = [];

        // Loop bermula dari 1 untuk skip header
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].trim();
            if (!row) continue; // Skip baris kosong

            const cols = row.split(',');
            // Jangkaan: Nama, Kategori, NoBib
            if (cols.length >= 3) {
                const nama = cols[0].trim().toUpperCase().replace(/["']/g, "");
                const kat = cols[1].trim().toUpperCase().replace(/["']/g, "");
                const bib = cols[2].trim().toUpperCase().replace(/["']/g, "");

                if (nama && kat) {
                    try {
                        await registerParticipant(tahunAktif, {
                            nama: nama,
                            kategori: kat,
                            noBib: bib,
                            idRumah: idRumah,
                            rumah: namaRumah,
                            acaraDaftar: [],
                            kemaskiniOleh: 'import_csv',
                            tarikhDaftar: new Date().toISOString()
                        });
                        successCount++;
                    } catch (err) {
                        failCount++;
                        failLog.push(`${nama} (${err.message})`);
                    }
                }
            }
        }

        // Papar Laporan
        let laporanHTML = `
            <div class="alert alert-${failCount > 0 ? 'warning' : 'success'} mt-3">
                <h6 class="alert-heading fw-bold">Laporan Import</h6>
                <hr>
                <p class="mb-0">Berjaya: <strong>${successCount}</strong></p>
                <p class="mb-0">Gagal: <strong>${failCount}</strong></p>
            </div>
        `;

        if (failCount > 0) {
            laporanHTML += `
                <div class="border rounded p-2 bg-light" style="max-height: 100px; overflow-y: auto;">
                    <small class="text-danger fw-bold">Senarai Gagal:</small><br>
                    <small class="text-muted">${failLog.join('<br>')}</small>
                </div>
            `;
        }

        el.statusCsv.innerHTML = laporanHTML;
        
        if (successCount > 0) {
            muatSenaraiPeserta();
        }
    };

    reader.onerror = () => {
        el.statusCsv.innerHTML = '<div class="text-danger">Ralat membaca fail.</div>';
    };

    reader.readAsText(file);
};


// =========================================================
// BAHAGIAN 8: CETAK SENARAI (CUSTOM SORT L7-L12)
// =========================================================

// Fungsi Helper: Dapatkan nombor daripada string kategori (Cth: L7 -> 7)
function getNomborKategori(kategoriStr) {
    // Buang semua huruf, tinggal nombor sahaja
    const nombor = kategoriStr.replace(/\D/g, ''); 
    return parseInt(nombor) || 0; // Return 0 jika tiada nombor
}

// Fungsi Sort Khas: Susun ikut nombor (7, 8, 9...), jika sama susun ikut nama
function susunanKhasUmur(a, b) {
    const numA = getNomborKategori(a.kategori);
    const numB = getNomborKategori(b.kategori);

    // Bandingkan nombor dahulu
    if (numA < numB) return -1; // A lebih kecil (muda)
    if (numA > numB) return 1;  // A lebih besar (tua)

    // Jika umur sama, susun ikut Nama (Abjad)
    return a.nama.localeCompare(b.nama);
}

window.cetakSenarai = function() {
    if (globalPesertaList.length === 0) {
        alert("Tiada data peserta untuk dicetak.");
        return;
    }

    // 1. Asingkan Data Lelaki dan Perempuan
    const dataLelaki = globalPesertaList.filter(p => p.kategori.startsWith('L'));
    const dataPerempuan = globalPesertaList.filter(p => p.kategori.startsWith('P'));

    // 2. Susun Data Mengikut Kehendak (L7 -> L12)
    dataLelaki.sort(susunanKhasUmur);
    dataPerempuan.sort(susunanKhasUmur);

    // 3. Buka Tetingkap Popup
    const w = window.open('', '_blank', 'width=900,height=800');
    const tarikh = new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' });

    // 4. Fungsi Menjana Baris Jadual (HTML String)
    const binaBarisJadual = (senarai) => {
        if (senarai.length === 0) return '<tr><td colspan="5" class="text-center fst-italic py-3">- Tiada Peserta -</td></tr>';

        let html = '';
        let counter = 1;
        let prevKat = '';

        senarai.forEach(p => {
            const acaraStr = (Array.isArray(p.acaraDaftar) && p.acaraDaftar.length > 0) 
                             ? p.acaraDaftar.join(', ') 
                             : '-';
            
            // Buat garisan tebal sedikit bila kategori berubah (untuk visual jelas)
            const styleRow = (prevKat !== '' && prevKat !== p.kategori) ? 'border-top: 2px solid #aaa;' : '';

            html += `
                <tr style="${styleRow}">
                    <td class="center">${counter++}</td>
                    <td class="center fw-bold">${p.kategori}</td>
                    <td class="center">${p.noBib || ''}</td>
                    <td style="padding-left:10px;">${p.nama}</td>
                    <td style="font-size: 11px; padding-left:5px;">${acaraStr}</td>
                </tr>
            `;
            prevKat = p.kategori;
        });
        return html;
    };

    // 5. Tulis Dokumen HTML Penuh
    w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Senarai Peserta - ${namaRumah}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; margin: 30px; color: #000; }
                .header-doc { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                h1 { margin: 5px 0; font-size: 18px; text-transform: uppercase; letter-spacing: 1px; }
                p { margin: 2px 0; font-size: 12px; }
                
                .section-title { 
                    background-color: #eee; 
                    padding: 8px; 
                    border: 1px solid #000; 
                    text-align: center; 
                    font-weight: bold; 
                    font-size: 14px;
                    margin-top: 20px;
                    margin-bottom: 5px;
                }

                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th, td { border: 1px solid #000; padding: 6px 4px; vertical-align: middle; }
                th { background-color: #f2f2f2; font-size: 11px; text-transform: uppercase; }
                
                .center { text-align: center; }
                .fw-bold { font-weight: bold; }
                
                /* Page Break untuk cetakan */
                .page-break { page-break-before: always; }
                @media print {
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header-doc">
                <h1>SENARAI PENDAFTARAN ATLET KEJOHANAN</h1>
                <p><strong>RUMAH SUKAN:</strong> ${namaRumah.toUpperCase()} | <strong>TAHUN:</strong> ${tahunAktif}</p>
                <p style="font-size: 10px; color: #555;">Tarikh Cetakan: ${tarikh}</p>
            </div>

            <div class="section-title">KATEGORI LELAKI (L7 - L12)</div>
            <table>
                <thead>
                    <tr>
                        <th width="5%" class="center">Bil</th>
                        <th width="8%" class="center">Kat</th>
                        <th width="10%" class="center">No. Bib</th>
                        <th width="40%">Nama Atlet</th>
                        <th width="37%">Acara</th>
                    </tr>
                </thead>
                <tbody>
                    ${binaBarisJadual(dataLelaki)}
                </tbody>
            </table>

            <div class="section-title">KATEGORI PEREMPUAN (P7 - P12)</div>
            <table>
                <thead>
                    <tr>
                        <th width="5%" class="center">Bil</th>
                        <th width="8%" class="center">Kat</th>
                        <th width="10%" class="center">No. Bib</th>
                        <th width="40%">Nama Atlet</th>
                        <th width="37%">Acara</th>
                    </tr>
                </thead>
                <tbody>
                    ${binaBarisJadual(dataPerempuan)}
                </tbody>
            </table>

            <br>
            <div style="text-align: center; font-size: 10px; margin-top: 30px;">
                Dicetak oleh Sistem Kejohanan Olahraga (KOT)
            </div>

            <script>
                // Auto Print
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 800);
            </script>
        </body>
        </html>
    `);

    w.document.close();
};

// Tamat Fail
