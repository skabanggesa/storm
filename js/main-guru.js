// ==========================================================================
// FAIL: js/main-guru.js
// KETERANGAN: Pengurusan Pendaftaran Atlet oleh Guru Rumah Sukan
// ==========================================================================

import { 
    registerParticipant, 
    updateParticipant, 
    deleteParticipant, // Pastikan ini ada dalam guru.js
    getEventsByCategory, 
    getRegisteredParticipants 
} from './modules/guru.js';

// ==========================================================================
// 1. KONFIGURASI SESI & KESELAMATAN
// ==========================================================================
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();
const idRumah = sessionStorage.getItem("user_rumah");
const namaRumah = sessionStorage.getItem("nama_rumah");
const userRole = sessionStorage.getItem("user_role");

// Semakan Pantas: Redirect jika tiada sesi
if (userRole !== 'guru' || !idRumah) {
    alert("Sesi telah tamat. Sila log masuk semula.");
    window.location.href = 'login.html';
}

// Variable Global untuk simpanan data sementara (Client-side cache)
let globalPesertaList = [];
let isEditing = false;
let currentEditId = null;

// ==========================================================================
// 2. INISIALISASI HALAMAN (ON LOAD)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Paparkan Info Header
    document.getElementById('nama-rumah').innerText = namaRumah ? `RUMAH ${namaRumah.toUpperCase()}` : "RUMAH";
    document.getElementById('display-tahun').innerText = tahunAktif;

    // Muat data awal
    muatSenaraiPeserta();

    // Reset borang untuk pastikan bersih
    resetBorang();
});

// ==========================================================================
// 3. REFERENSI DOM ELEMENTS
// ==========================================================================
const ui = {
    form: document.getElementById('form-daftar-atlet'),
    inpNama: document.getElementById('nama-atlet'),
    inpKat: document.getElementById('kategori-atlet'),
    inpBib: document.getElementById('no-bib'),
    containerAcara: document.getElementById('senarai-acara-checkbox'),
    labelCountAcara: document.getElementById('count-acara'),
    btnSimpan: document.getElementById('btn-daftar'),
    btnBatal: document.getElementById('btn-batal'),
    tableBody: document.querySelector('#list-peserta table tbody'),
    filterKategori: document.getElementById('filter-kategori'),
    inputCarian: document.getElementById('carian-nama'),
    statJumlah: document.getElementById('jumlah-peserta'),
    modalCsv: new bootstrap.Modal(document.getElementById('modalImportCSV')),
    fileCsv: document.getElementById('failCsv'),
    statusCsv: document.getElementById('status-upload')
};

// ==========================================================================
// 4. PENGURUSAN ACARA (CHECKBOX LOGIC)
// ==========================================================================

// Event Listener: Apabila Kategori Berubah
ui.inpKat.addEventListener('change', async function() {
    const kategori = this.value;
    if (kategori) {
        await muatAcaraKeCheckbox(kategori);
    } else {
        ui.containerAcara.innerHTML = '<div class="text-muted small p-2">Sila pilih kategori dahulu...</div>';
    }
});

// Fungsi: Muat Acara dari DB berdasarkan Kategori
async function muatAcaraKeCheckbox(kategori, acaraTelahDaftar = []) {
    ui.containerAcara.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary"></div> Memuatkan acara...</div>';
    
    try {
        const senaraiAcara = await getEventsByCategory(tahunAktif, kategori);
        
        if (!senaraiAcara || senaraiAcara.length === 0) {
            ui.containerAcara.innerHTML = '<div class="alert alert-warning small py-1">Tiada acara untuk kategori ini.</div>';
            return;
        }

        let html = '';
        senaraiAcara.forEach(ev => {
            // Check jika atlet sudah daftar acara ini (untuk mode edit)
            const isChecked = acaraTelahDaftar.includes(ev.nama) ? 'checked' : '';
            
            html += `
                <div class="form-check mb-1">
                    <input class="form-check-input acara-check" type="checkbox" value="${ev.nama}" id="chk-${ev.id}" ${isChecked}>
                    <label class="form-check-label small" for="chk-${ev.id}">
                        ${ev.nama}
                    </label>
                </div>
            `;
        });

        ui.containerAcara.innerHTML = html;
        kemaskiniKiraAcara(); // Update text "0/5 dipilih"

    } catch (error) {
        console.error(error);
        ui.containerAcara.innerHTML = '<div class="text-danger small">Gagal memuatkan acara.</div>';
    }
}

// Event Listener: Hadkan Maksimum 5 Acara
ui.containerAcara.addEventListener('change', (e) => {
    if (e.target.classList.contains('acara-check')) {
        const checkedBoxes = document.querySelectorAll('.acara-check:checked');
        if (checkedBoxes.length > 5) {
            e.target.checked = false; // Uncheck yang terakhir
            alert("Maksimum 5 acara sahaja dibenarkan untuk seorang atlet.");
        }
        kemaskiniKiraAcara();
    }
});

function kemaskiniKiraAcara() {
    const total = document.querySelectorAll('.acara-check:checked').length;
    ui.labelCountAcara.innerText = `${total}/5 dipilih`;
    ui.labelCountAcara.className = total === 5 ? 'form-text mt-1 text-end text-danger fw-bold' : 'form-text mt-1 text-end text-muted';
}

// ==========================================================================
// 5. PROSES PENDAFTARAN & KEMASKINI (SUBMIT FORM)
// ==========================================================================
ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Ambil Data
    const nama = ui.inpNama.value.trim().toUpperCase();
    const kategori = ui.inpKat.value;
    const noBib = ui.inpBib.value.trim().toUpperCase();
    
    // Ambil senarai acara yang ditanda
    const acaraDipilih = Array.from(document.querySelectorAll('.acara-check:checked')).map(cb => cb.value);

    // 2. Validasi Input
    if (!nama || !kategori || !noBib) {
        alert("Sila lengkapkan semua medan wajib.");
        return;
    }

    // 3. Bina Objek Data
    const dataPeserta = {
        nama: nama,
        kategori: kategori,
        noBib: noBib,
        idRumah: idRumah,
        rumah: namaRumah,
        acaraDaftar: acaraDipilih,
        kemaskiniOleh: 'guru',
        tarikhKemaskini: new Date().toISOString()
    };

    // 4. Hantar ke Database
    try {
        kunciButang(true); // Disable button supaya tak tekan dua kali

        if (isEditing && currentEditId) {
            // MODE EDIT
            await updateParticipant(tahunAktif, currentEditId, dataPeserta);
            alert("Data berjaya dikemaskini!");
        } else {
            // MODE DAFTAR BARU
            dataPeserta.tarikhDaftar = new Date().toISOString();
            await registerParticipant(tahunAktif, dataPeserta);
            alert("Pendaftaran berjaya!");
        }

        resetBorang();
        muatSenaraiPeserta(); // Refresh table

    } catch (error) {
        console.error("Ralat Submit:", error);
        alert("Terdapa ralat semasa menyimpan data:\n" + error.message);
    } finally {
        kunciButang(false);
    }
});

function kunciButang(status) {
    ui.btnSimpan.disabled = status;
    ui.btnSimpan.innerHTML = status ? '<span class="spinner-border spinner-border-sm"></span> Memproses...' : (isEditing ? 'Kemaskini' : 'Simpan Pendaftaran');
}

function resetBorang() {
    ui.form.reset();
    isEditing = false;
    currentEditId = null;
    
    ui.btnSimpan.innerText = "Simpan Pendaftaran";
    ui.btnSimpan.classList.remove('btn-warning');
    ui.btnSimpan.classList.add('btn-primary');
    ui.btnBatal.classList.add('d-none');
    
    ui.containerAcara.innerHTML = '<div class="text-muted small fst-italic">Sila pilih kategori dahulu...</div>';
    ui.labelCountAcara.innerText = "0/5 dipilih";
}

ui.btnBatal.addEventListener('click', resetBorang);

// ==========================================================================
// 6. FUNGSI MUAT TURUN & PAPARAN SENARAI (TABLE)
// ==========================================================================
async function muatSenaraiPeserta() {
    ui.tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 small">Memuatkan data...</p></td></tr>`;

    try {
        const data = await getRegisteredParticipants(tahunAktif, idRumah);
        globalPesertaList = data || [];
        renderJadual();
    } catch (error) {
        console.error(error);
        ui.tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Ralat memuatkan data. Sila refresh halaman.</td></tr>`;
    }
}

function renderJadual() {
    const filterKat = ui.filterKategori.value;
    const carian = ui.inputCarian.value.toLowerCase();

    // Filtering
    let filtered = globalPesertaList.filter(p => {
        const matchKat = (filterKat === "SEMUA") || (p.kategori === filterKat);
        const matchNama = p.nama.toLowerCase().includes(carian) || (p.noBib && p.noBib.toLowerCase().includes(carian));
        return matchKat && matchNama;
    });

    // Sorting Standard untuk paparan skrin (Kat -> Nama)
    filtered.sort((a, b) => {
        if (a.kategori < b.kategori) return -1;
        if (a.kategori > b.kategori) return 1;
        return a.nama.localeCompare(b.nama);
    });

    // Render HTML
    if (filtered.length === 0) {
        ui.tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted fst-italic py-4">- Tiada rekod dijumpai -</td></tr>`;
        ui.statJumlah.innerText = "0 Orang";
        return;
    }

    let html = '';
    filtered.forEach(p => {
        const acaraList = (p.acaraDaftar && p.acaraDaftar.length > 0) ? p.acaraDaftar.join(', ') : '<span class="text-muted small">Tiada acara</span>';
        
        html += `
            <tr>
                <td class="text-center"><span class="badge bg-light text-dark border">${p.kategori}</span></td>
                <td class="fw-bold font-monospace">${p.noBib || '-'}</td>
                <td>
                    <div class="fw-bold">${p.nama}</div>
                    <div class="small text-secondary"><i class="bi bi-person-running"></i> ${acaraList}</div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.sediaEdit('${p.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.padamPeserta('${p.id}', '${p.nama}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    });

    ui.tableBody.innerHTML = html;
    ui.statJumlah.innerText = `${filtered.length} Orang`;
}

// Event Listeners untuk Filter & Search
ui.filterKategori.addEventListener('change', renderJadual);
ui.inputCarian.addEventListener('keyup', renderJadual);

// ==========================================================================
// 7. FUNGSI EDIT & PADAM (GLOBAL WINDOW SCOPE)
// ==========================================================================
window.sediaEdit = async function(id) {
    const peserta = globalPesertaList.find(p => p.id === id);
    if (!peserta) return;

    // Set Flag
    isEditing = true;
    currentEditId = id;

    // Isi Borang
    ui.inpNama.value = peserta.nama;
    ui.inpKat.value = peserta.kategori;
    ui.inpBib.value = peserta.noBib;

    // Tukar butang
    ui.btnSimpan.innerText = "Kemaskini Data";
    ui.btnSimpan.classList.remove('btn-primary');
    ui.btnSimpan.classList.add('btn-warning');
    ui.btnBatal.classList.remove('d-none');

    // Muat acara dan tick box
    await muatAcaraKeCheckbox(peserta.kategori, peserta.acaraDaftar);

    // Scroll ke atas
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
};

window.padamPeserta = async function(id, nama) {
    if (confirm(`Adakah anda pasti mahu memadam atlet ini?\nNama: ${nama}\n\nTindakan ini tidak boleh dikembalikan.`)) {
        try {
            await deleteParticipant(tahunAktif, id);
            alert("Rekod berjaya dipadam.");
            muatSenaraiPeserta();
        } catch (error) {
            alert("Gagal memadam: " + error.message);
        }
    }
};

// ==========================================================================
// 8. IMPORT CSV (ADVANCED)
// ==========================================================================
window.prosesCSV = function() {
    const file = ui.fileCsv.files[0];
    if (!file) {
        alert("Sila pilih fail CSV.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const baris = text.split('\n');
        
        let berjaya = 0;
        let gagal = 0;
        let logRalat = [];

        ui.statusCsv.innerHTML = '<div class="alert alert-info py-2">Sedang memproses data... Jangan tutup tetingkap ini.</div>';

        // Loop setiap baris (Skip header baris 0)
        for (let i = 1; i < baris.length; i++) {
            const row = baris[i].trim();
            if (row) {
                // Andaian Format CSV: Nama, Kategori, NoBib
                const cols = row.split(',');
                
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
                                acaraDaftar: [], // Default kosong
                                kemaskiniOleh: 'import_csv',
                                tarikhDaftar: new Date().toISOString()
                            });
                            berjaya++;
                        } catch (err) {
                            gagal++;
                            logRalat.push(`Baris ${i+1}: ${nama} - ${err.message}`);
                        }
                    }
                }
            }
        }

        // Papar Laporan
        let htmlLaporan = `
            <div class="mt-3">
                <p class="text-success fw-bold mb-1">Berjaya: ${berjaya}</p>
                <p class="text-danger fw-bold mb-1">Gagal: ${gagal}</p>
            </div>
        `;
        
        if (gagal > 0) {
            htmlLaporan += `
                <div class="bg-light border p-2 mt-2" style="max-height:150px; overflow-y:auto; font-size:12px;">
                    <strong>Log Ralat:</strong><br>
                    ${logRalat.join('<br>')}
                </div>
            `;
        }

        ui.statusCsv.innerHTML = htmlLaporan;
        muatSenaraiPeserta(); // Refresh table utama
    };
    reader.readAsText(file);
};

// ==========================================================================
// 9. FUNGSI CETAKAN (CUSTOM SORTING L7-L12 & SEPARATE GENDER)
// ==========================================================================

// Helper: Tukar string kategori kepada nombor untuk sorting (L7 -> 7)
function getCategoryNumber(cat) {
    const num = parseInt(cat.replace(/\D/g, ''));
    return isNaN(num) ? 0 : num;
}

// Logic Sorting Khas
function customSort(a, b) {
    const numA = getCategoryNumber(a.kategori);
    const numB = getCategoryNumber(b.kategori);

    // Sort ikut nombor umur (Kecil ke Besar: 7, 8, 9...)
    if (numA !== numB) return numA - numB;
    
    // Jika umur sama, sort ikut Nama
    return a.nama.localeCompare(b.nama);
}

window.cetakSenarai = function() {
    if (globalPesertaList.length === 0) {
        alert("Tiada data untuk dicetak.");
        return;
    }

    // 1. Asingkan Data Mengikut Jantina
    const lelaki = globalPesertaList.filter(p => p.kategori.toUpperCase().startsWith('L'));
    const perempuan = globalPesertaList.filter(p => p.kategori.toUpperCase().startsWith('P'));

    // 2. Susun Data (L7 -> L12)
    lelaki.sort(customSort);
    perempuan.sort(customSort);

    // 3. Setup Popup Cetakan
    const w = window.open('', '_blank', 'width=900,height=800');
    const tarikhCetakan = new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' });

    // 4. Fungsi Menjana HTML Row
    const generateRows = (list) => {
        if (list.length === 0) return '<tr><td colspan="5" class="text-center">- Tiada Peserta -</td></tr>';
        
        let html = '';
        let bil = 1;
        let prevKat = '';

        list.forEach(p => {
            const acara = (p.acaraDaftar && p.acaraDaftar.length > 0) ? p.acaraDaftar.join(', ') : '-';
            // Garisan pemisah jika kategori berubah
            const borderStyle = (prevKat !== '' && prevKat !== p.kategori) ? 'border-top: 2px solid #000;' : '';
            
            html += `
                <tr style="${borderStyle}">
                    <td class="center">${bil++}</td>
                    <td class="center fw-bold">${p.kategori}</td>
                    <td class="center">${p.noBib || ''}</td>
                    <td style="padding-left:10px;">${p.nama}</td>
                    <td style="font-size: 11px;">${acara}</td>
                </tr>
            `;
            prevKat = p.kategori;
        });
        return html;
    };

    // 5. Tulis HTML Penuh
    w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cetakan Senarai Atlet - ${namaRumah}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #000; }
                .header-doc { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                h1 { font-size: 18px; margin: 5px 0; text-transform: uppercase; }
                p { margin: 2px 0; font-size: 12px; }
                .section-header { background: #eee; padding: 5px; text-align: center; font-weight: bold; border: 1px solid #000; margin-top: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                th, td { border: 1px solid #000; padding: 5px; vertical-align: middle; }
                th { background: #f2f2f2; text-transform: uppercase; font-size: 11px; }
                .center { text-align: center; }
                .page-break { page-break-before: always; }
                @media print { .page-break { page-break-before: always; } }
            </style>
        </head>
        <body>
            <div class="header-doc">
                <h1>SENARAI PENDAFTARAN ATLET RUMAH ${namaRumah.toUpperCase()}</h1>
                <p>KEJOHANAN OLAHRAGA TAHUNAN ${tahunAktif}</p>
                <p>Tarikh Cetakan: ${tarikhCetakan}</p>
            </div>

            <div class="section-header">KATEGORI LELAKI (L7 - L12)</div>
            <table>
                <thead>
                    <tr>
                        <th width="5%">Bil</th>
                        <th width="10%">Kategori</th>
                        <th width="10%">No. Bib</th>
                        <th width="45%">Nama Atlet</th>
                        <th width="30%">Acara</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateRows(lelaki)}
                </tbody>
            </table>

            <div class="page-break"></div>

            <div class="header-doc">
                <h1>SENARAI PENDAFTARAN ATLET RUMAH ${namaRumah.toUpperCase()}</h1>
                <p>(Sambungan)</p>
            </div>

            <div class="section-header">KATEGORI PEREMPUAN (P7 - P12)</div>
            <table>
                <thead>
                    <tr>
                        <th width="5%">Bil</th>
                        <th width="10%">Kategori</th>
                        <th width="10%">No. Bib</th>
                        <th width="45%">Nama Atlet</th>
                        <th width="30%">Acara</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateRows(perempuan)}
                </tbody>
            </table>

            <div style="margin-top: 30px; text-align: center; font-size: 10px;">
                Dicetak oleh Sistem Pengurusan Kejohanan
            </div>

            <script>
                setTimeout(() => { window.print(); window.close(); }, 800);
            </script>
        </body>
        </html>
    `);

    w.document.close();
};

// ==========================================================================
// 10. LAIN-LAIN (LOGOUT DLL)
// ==========================================================================
document.getElementById('btn-logout').onclick = () => {
    if(confirm("Log keluar?")) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
};

// Tamat Fail
