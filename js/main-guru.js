import { 
    registerParticipant, 
    updateParticipant, 
    getEventsByCategory, 
    getRegisteredParticipants 
} from './modules/guru.js';

// =========================================================
// 1. DATA SESI & KAWALAN AKSES
// =========================================================
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();
const idRumah = sessionStorage.getItem("user_rumah");
const namaRumah = sessionStorage.getItem("nama_rumah");
const userRole = sessionStorage.getItem("user_role");

// Redirect jika bukan guru atau tiada sesi
if (userRole !== 'guru' || !idRumah) {
    alert("Sesi tamat atau akses tidak sah. Sila log masuk semula.");
    window.location.href = 'login.html';
}

// Global Variable untuk simpan data tempatan (Client-side caching)
let globalPesertaList = []; 

// Set UI Header
document.getElementById('nama-rumah').innerText = `Rumah: ${namaRumah}`;
document.getElementById('display-tahun').innerText = tahunAktif;

// =========================================================
// 2. REFERENSI ELEMEN DOM
// =========================================================
const el = {
    id: document.getElementById('edit-id-peserta'),
    bib: document.getElementById('no-bib'),
    nama: document.getElementById('nama-atlet'),
    kat: document.getElementById('kategori-atlet'),
    listAcara: document.getElementById('senarai-acara-checkbox'),
    countAcara: document.getElementById('count-acara'),
    form: document.getElementById('form-daftar-atlet'),
    btnDaftar: document.getElementById('btn-daftar'),
    btnBatal: document.getElementById('btn-batal'),
    filterKat: document.getElementById('filter-kategori'),
    inputCarian: document.getElementById('carian-nama'),
    labelJumlah: document.getElementById('jumlah-peserta'),
    tbody: document.querySelector('#list-peserta table tbody')
};

// =========================================================
// 3. FUNGSI: PENGURUSAN ACARA (CHECKBOX)
// =========================================================

/**
 * Memuatkan senarai checkbox acara berdasarkan kategori
 * @param {string} kategori - Kod kategori (L18, P15, dll)
 * @param {Array} terpilih - Array nama acara yang sudah didaftar (untuk mode Edit)
 */
async function muatAcara(kategori, terpilih = []) {
    if (!kategori) {
        el.listAcara.innerHTML = '<div class="text-muted small fst-italic">Sila pilih kategori dahulu...</div>';
        return;
    }

    el.listAcara.innerHTML = '<div class="text-center p-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    try {
        const senaraiAcara = await getEventsByCategory(tahunAktif, kategori);
        
        if (!senaraiAcara || senaraiAcara.length === 0) {
            el.listAcara.innerHTML = '<div class="text-danger small">Tiada acara ditemui untuk kategori ini.</div>';
            return;
        }

        // Pastikan 'terpilih' sentiasa array
        const arrayTerpilih = Array.isArray(terpilih) ? terpilih : [];

        let html = '';
        senaraiAcara.forEach(acara => {
            // Tandakan checked jika acara ini ada dalam senarai atlet
            const isChecked = arrayTerpilih.includes(acara.nama) ? 'checked' : '';
            html += `
                <div class="form-check mb-1">
                    <input class="form-check-input acara-cb" type="checkbox" value="${acara.nama}" id="ev-${acara.id}" ${isChecked}>
                    <label class="form-check-label small" for="ev-${acara.id}">${acara.nama}</label>
                </div>`;
        });
        el.listAcara.innerHTML = html;
        updateCount();
    } catch (err) {
        el.listAcara.innerHTML = `<div class="text-danger small">Ralat: ${err.message}</div>`;
    }
}

// Event Listener: Hadkan maksima 5 acara & update counter
el.listAcara.addEventListener('change', (e) => {
    if (e.target.classList.contains('acara-cb')) {
        const checked = el.listAcara.querySelectorAll('.acara-cb:checked');
        if (checked.length > 5) {
            e.target.checked = false;
            alert("Maksimum 5 acara sahaja dibenarkan!");
        }
        updateCount();
    }
});

function updateCount() {
    const total = el.listAcara.querySelectorAll('.acara-cb:checked').length;
    el.countAcara.innerText = `${total}/5 dipilih`;
    
    // Tukar warna jika 0 atau 5
    if(total === 0) el.countAcara.className = "form-text mt-1 text-end small text-muted";
    else if(total === 5) el.countAcara.className = "form-text mt-1 text-end small text-danger fw-bold";
    else el.countAcara.className = "form-text mt-1 text-end small text-primary";
}

// Event Listener: Muat acara bila Kategori berubah
el.kat.addEventListener('change', (e) => muatAcara(e.target.value));


// =========================================================
// 4. FUNGSI: PENDAFTARAN & KEMASKINI
// =========================================================

el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const docId = el.id.value;
    const checkedAcara = Array.from(el.listAcara.querySelectorAll('.acara-cb:checked')).map(cb => cb.value);

    // Validasi Acara: Wajib pilih 1 jika mendaftar manual?
    // Jika tidak mahu wajib, boleh buang baris ini.
    if (checkedAcara.length === 0) {
        if(!confirm("Anda tidak memilih sebarang acara. Teruskan simpan?")) return;
    }

    const data = {
        nama: el.nama.value.toUpperCase().trim(),
        kategori: el.kat.value,
        noBib: el.bib.value.toUpperCase().trim(),
        idRumah: idRumah,
        rumah: namaRumah,
        acaraDaftar: checkedAcara,
        kemaskiniOleh: 'guru',
        tarikhDaftar: new Date().toISOString()
    };

    try {
        // UI Loading State
        el.btnDaftar.disabled = true;
        const originalText = el.btnDaftar.innerHTML;
        el.btnDaftar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Menyimpan...`;

        let res = docId ? await updateParticipant(tahunAktif, docId, data) : await registerParticipant(tahunAktif, data);

        if (res.success) {
            alert(docId ? "Data berjaya dikemaskini!" : "Pendaftaran berjaya!");
            resetBorang();
            muatSenaraiPeserta(); // Refresh data table
        }
    } catch (err) { 
        alert("Ralat: " + err.message); 
    } 
    finally { 
        // Reset UI Button
        el.btnDaftar.disabled = false; 
        el.btnDaftar.innerHTML = docId ? `<i class="bi bi-pencil-square me-1"></i> Simpan Perubahan` : `<i class="bi bi-save me-1"></i> Simpan Pendaftaran`;
    }
});

function resetBorang() {
    el.form.reset();
    el.id.value = "";
    el.btnDaftar.innerHTML = `<i class="bi bi-save me-1"></i> Simpan Pendaftaran`;
    el.btnDaftar.classList.remove('btn-warning');
    el.btnDaftar.classList.add('btn-primary');
    el.btnBatal.classList.add('d-none');
    el.listAcara.innerHTML = '<div class="text-muted small fst-italic">Sila pilih kategori dahulu...</div>';
    el.countAcara.innerText = "0/5 dipilih";
    el.nama.focus();
}

// =========================================================
// 5. FUNGSI: SENARAI PESERTA (FETCH + FILTER + RENDER)
// =========================================================

/**
 * Langkah 1: Ambil semua data dari server
 */
async function muatSenaraiPeserta() {
    el.tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div><p class="small text-muted mt-2">Sedang mengambil data...</p></td></tr>`;

    try {
        const peserta = await getRegisteredParticipants(tahunAktif, idRumah);
        globalPesertaList = peserta || [];
        renderJadual(); // Terus render lepas dapat data
    } catch (err) { 
        el.tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Ralat Sambungan: ${err.message}</td></tr>`; 
    }
}

/**
 * Langkah 2: Tapis, Susun dan Papar data ke HTML
 */
function renderJadual() {
    const filterKat = el.filterKat.value;
    const kataKunci = el.inputCarian.value.toLowerCase();

    // 1. FILTER & SEARCH
    let filteredData = globalPesertaList.filter(p => {
        const matchKategori = (filterKat === "SEMUA") || (p.kategori === filterKat);
        const matchNama = p.nama.toLowerCase().includes(kataKunci) || 
                          (p.noBib && p.noBib.toLowerCase().includes(kataKunci));
        return matchKategori && matchNama;
    });

    // 2. SORT (Susun ikut Kategori A-Z, kemudian Nama A-Z)
    filteredData.sort((a, b) => {
        if (a.kategori < b.kategori) return -1;
        if (a.kategori > b.kategori) return 1;
        if (a.nama < b.nama) return -1;
        if (a.nama > b.nama) return 1;
        return 0;
    });

    // 3. GENERATE HTML
    let html = '';
    
    if (filteredData.length === 0) {
        html = `<tr><td colspan="4" class="text-center text-muted py-4 fst-italic">Tiada rekod ditemui.</td></tr>`;
    } else {
        filteredData.forEach((p) => {
            const listAcara = Array.isArray(p.acaraDaftar) ? p.acaraDaftar : [];
            const count = listAcara.length;
            
            // Logik UI Badge
            let badgeColor = 'bg-secondary';
            if(count > 0 && count < 5) badgeColor = 'bg-success';
            if(count === 5) badgeColor = 'bg-danger';

            const displayAcara = count > 0 ? listAcara.join(', ') : '<span class="text-muted small fst-italic">Tiada acara</span>';

            html += `
            <tr>
                <td><span class="badge bg-light text-dark border">${p.kategori}</span></td>
                <td class="fw-bold text-primary font-monospace">${p.noBib || '-'}</td>
                <td>
                    <div class="fw-bold text-dark text-uppercase small">${p.nama}</div>
                    <div class="mt-1" style="font-size: 0.75rem; line-height: 1.2;">
                        <span class="badge ${badgeColor} me-1" style="font-size: 0.65rem;">${count}</span>
                        ${displayAcara}
                    </div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary shadow-sm" onclick="window.sediaEdit('${p.id}')" title="Edit Peserta">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                </td>
            </tr>`;
        });
    }

    el.tbody.innerHTML = html;
    el.labelJumlah.innerText = `${filteredData.length} Orang`;
}

// Event Listeners untuk Filter
el.filterKat.addEventListener('change', renderJadual);
el.inputCarian.addEventListener('input', renderJadual);


// =========================================================
// 6. FUNGSI: IMPORT CSV (BULK UPLOAD)
// =========================================================

window.prosesCSV = async function() {
    const inputFail = document.getElementById('failCsv');
    const statusDiv = document.getElementById('status-upload');
    const file = inputFail.files[0];

    if (!file) {
        alert("Sila pilih fail dahulu!");
        return;
    }

    statusDiv.innerHTML = '<span class="text-primary fw-bold"><div class="spinner-border spinner-border-sm"></div> Sedang membaca fail...</span>';

    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;
        const baris = text.split('\n'); // Pecahkan ikut baris
        
        let berjaya = 0;
        let gagal = 0;
        let jumlahProses = 0;

        // Loop bermula index 1 (anggap ada header)
        for (let i = 1; i < baris.length; i++) {
            const row = baris[i].trim();
            if (row) {
                const cols = row.split(',');
                
                // Pastikan ada sekurang-kurangnya 3 lajur
                if (cols.length >= 3) {
                    jumlahProses++;
                    const nama = cols[0].trim().toUpperCase().replace(/"/g, ''); // Buang quote jika ada
                    const kategori = cols[1].trim().toUpperCase().replace(/"/g, '');
                    const noBib = cols[2].trim().toUpperCase().replace(/"/g, '');

                    // Data Objek untuk API
                    const dataBaru = {
                        nama: nama,
                        kategori: kategori,
                        noBib: noBib,
                        idRumah: idRumah,
                        rumah: namaRumah,
                        acaraDaftar: [], // Default kosong untuk CSV
                        kemaskiniOleh: 'guru (csv)',
                        tarikhDaftar: new Date().toISOString()
                    };

                    try {
                        statusDiv.innerHTML = `<span class="text-primary">Mendaftar ${nama}...</span>`;
                        // Panggil API (Await supaya sequential)
                        await registerParticipant(tahunAktif, dataBaru);
                        berjaya++;
                    } catch (err) {
                        console.error("Gagal daftar:", nama, err);
                        gagal++;
                    }
                }
            }
        }

        statusDiv.innerHTML = `
            <div class="alert alert-success mt-2 py-2">
                <h6 class="alert-heading fw-bold">Selesai!</h6>
                <div class="small">
                    Berjaya: <strong>${berjaya}</strong><br>
                    Gagal: <strong>${gagal}</strong>
                </div>
            </div>`;
        
        if (berjaya > 0) {
            alert(`Proses selesai.\n${berjaya} atlet berjaya didaftarkan.`);
            muatSenaraiPeserta(); // Refresh senarai
        }
    };

    reader.readAsText(file);
};


// =========================================================
// 7. FUNGSI: CETAK SENARAI
// =========================================================

window.cetakSenarai = function() {
    if (globalPesertaList.length === 0) {
        alert("Tiada data untuk dicetak.");
        return;
    }

    // 1. Susun data: Kategori -> Nama
    const dataCetak = [...globalPesertaList].sort((a, b) => {
        if (a.kategori < b.kategori) return -1;
        if (a.kategori > b.kategori) return 1;
        if (a.nama < b.nama) return -1;
        if (a.nama > b.nama) return 1;
        return 0;
    });

    // 2. Setup Tetingkap
    const tetingkapCetak = window.open('', '', 'height=600,width=800');
    const tarikh = new Date().toLocaleDateString('ms-MY');
    const masa = new Date().toLocaleTimeString('ms-MY');

    // 3. Tulis HTML Cetakan
    let htmlContent = `
        <html>
        <head>
            <title>Senarai Peserta - ${namaRumah}</title>
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 12px; margin: 20px; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                h1 { margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
                p { margin: 2px 0; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: top; }
                th { background-color: #f0f0f0; font-weight: bold; font-size: 11px; text-transform: uppercase; }
                .text-center { text-align: center; }
                @media print {
                    @page { margin: 1cm; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>SENARAI PENDAFTARAN ATLET KEJOHANAN OLAHRAGA TAHUNAN</h1>
                <p><strong>RUMAH SUKAN:</strong> ${namaRumah} (${tahunAktif})</p>
                <p style="font-size: 10px; color: #555;">Dicetak pada: ${tarikh} (${masa})</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="5%" class="text-center">Bil</th>
                        <th width="10%" class="text-center">No. Bib</th>
                        <th width="40%">Nama Atlet</th>
                        <th width="10%" class="text-center">Kategori</th>
                        <th width="35%">Acara</th>
                    </tr>
                </thead>
                <tbody>
    `;

    let bil = 1;
    dataCetak.forEach(p => {
        const acara = Array.isArray(p.acaraDaftar) && p.acaraDaftar.length > 0 
                      ? p.acaraDaftar.join(', ') 
                      : '-';
        htmlContent += `
            <tr>
                <td class="text-center">${bil++}</td>
                <td class="text-center">${p.noBib || ''}</td>
                <td>${p.nama}</td>
                <td class="text-center">${p.kategori}</td>
                <td>${acara}</td>
            </tr>
        `;
    });

    htmlContent += `
                </tbody>
            </table>
            <br>
            <div style="text-align: center; font-size: 10px; margin-top: 20px;">
                - Akhir Dokumen -
            </div>
        </body>
        </html>
    `;

    tetingkapCetak.document.write(htmlContent);
    tetingkapCetak.document.close();
    tetingkapCetak.focus();
    
    // Auto print selepas load
    setTimeout(() => {
        tetingkapCetak.print();
        tetingkapCetak.close();
    }, 500);
};


// =========================================================
// 8. FUNGSI: SETUP EDIT
// =========================================================

window.sediaEdit = async (id) => {
    // Cari data dalam cache global
    const p = globalPesertaList.find(item => item.id === id);
    
    if (p) {
        // Isi Form
        el.id.value = p.id;
        el.bib.value = p.noBib || '';
        el.nama.value = p.nama;
        el.kat.value = p.kategori;
        
        // Tukar butang kepada Mode Edit
        el.btnDaftar.innerHTML = `<i class="bi bi-pencil-square me-1"></i> Simpan Perubahan`;
        el.btnDaftar.classList.remove('btn-primary');
        el.btnDaftar.classList.add('btn-warning');
        el.btnBatal.classList.remove('d-none');
        
        // Load Acara untuk kategori ini DAN tandakan yang dah daftar
        await muatAcara(p.kategori, p.acaraDaftar);
        
        // Scroll ke atas dan fokus
        window.scrollTo({ top: 0, behavior: 'smooth' });
        el.nama.focus();
    }
};

el.btnBatal.onclick = () => resetBorang();

// Butang Logout
document.getElementById('btn-logout').onclick = () => {
    if(confirm("Anda pasti mahu log keluar?")) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
};

// =========================================================
// MULAKAN SISTEM
// =========================================================
muatSenaraiPeserta();
