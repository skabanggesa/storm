import { 
    registerParticipant, 
    updateParticipant, 
    getEventsByCategory, 
    getRegisteredParticipants 
} from './modules/guru.js';

// 1. DATA SESI & KAWALAN AKSES
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();
const idRumah = sessionStorage.getItem("user_rumah");
const namaRumah = sessionStorage.getItem("nama_rumah");
const userRole = sessionStorage.getItem("user_role");

if (userRole !== 'guru' || !idRumah) {
    window.location.href = 'login.html';
}

// 2. VARIABLES GLOBAL (Untuk Filter & Sort)
let globalPesertaList = []; // Menyimpan data mentah dari database

// 3. KEMASKINI HEADER
document.getElementById('nama-rumah').innerText = `Rumah: ${namaRumah}`;
document.getElementById('display-tahun').innerText = tahunAktif;

// 4. REFERENSI ELEMEN DOM
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
    // Elemen Baru untuk Filter/Search
    filterKat: document.getElementById('filter-kategori'),
    inputCarian: document.getElementById('carian-nama'),
    labelJumlah: document.getElementById('jumlah-peserta'),
    tbody: document.querySelector('#list-peserta table tbody')
};

// =========================================================
// BAHAGIAN 1: PENGURUSAN ACARA (CHECKBOX)
// =========================================================

/**
 * Muat acara berdasarkan kategori yang dipilih
 */
async function muatAcara(kategori, terpilih = []) {
    if (!kategori) {
        el.listAcara.innerHTML = '<div class="text-muted small">Sila pilih kategori dahulu...</div>';
        return;
    }

    el.listAcara.innerHTML = '<div class="text-center p-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    try {
        const senaraiAcara = await getEventsByCategory(tahunAktif, kategori);
        
        if (!senaraiAcara || senaraiAcara.length === 0) {
            el.listAcara.innerHTML = '<div class="text-danger small">Tiada acara ditemui.</div>';
            return;
        }

        const arrayTerpilih = Array.isArray(terpilih) ? terpilih : [];

        let html = '';
        senaraiAcara.forEach(acara => {
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

// Hadkan maksima 5 acara
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
}

el.kat.addEventListener('change', (e) => muatAcara(e.target.value));


// =========================================================
// BAHAGIAN 2: PENDAFTARAN & KEMASKINI (MANUAL)
// =========================================================

el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const docId = el.id.value;
    // Benarkan daftar tanpa acara (array kosong) jika perlu, atau paksa pilih 1
    // Di sini kita benarkan kosong kerana mungkin guru nak daftar nama dulu
    const checkedAcara = Array.from(el.listAcara.querySelectorAll('.acara-cb:checked')).map(cb => cb.value);

    const data = {
        nama: el.nama.value.toUpperCase(),
        kategori: el.kat.value,
        noBib: el.bib.value.toUpperCase(),
        idRumah: idRumah,
        rumah: namaRumah,
        acaraDaftar: checkedAcara,
        kemaskiniOleh: 'guru',
        tarikhDaftar: new Date().toISOString()
    };

    try {
        el.btnDaftar.disabled = true;
        el.btnDaftar.innerText = "Sedang Memproses...";

        let res = docId ? await updateParticipant(tahunAktif, docId, data) : await registerParticipant(tahunAktif, data);

        if (res.success) {
            alert(docId ? "Kemaskini Berjaya!" : "Pendaftaran Berjaya!");
            resetBorang();
            muatSenaraiPeserta(); // Refresh data table
        }
    } catch (err) { alert(err.message); } 
    finally { 
        el.btnDaftar.disabled = false; 
        el.btnDaftar.innerText = docId ? "Simpan Perubahan" : "Simpan Pendaftaran";
    }
});

function resetBorang() {
    el.form.reset();
    el.id.value = "";
    el.btnDaftar.innerText = "Simpan Pendaftaran";
    el.btnBatal.classList.add('d-none');
    el.listAcara.innerHTML = '<div class="text-muted small">Sila pilih kategori dahulu...</div>';
    el.countAcara.innerText = "0/5 dipilih";
}

// =========================================================
// BAHAGIAN 3: SENARAI PESERTA (FETCH + RENDER + FILTER)
// =========================================================

/**
 * Langkah 1: Ambil data dari server dan simpan dalam variable global
 */
async function muatSenaraiPeserta() {
    // Tunjuk loader
    el.tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div><p class="small text-muted mt-2">Memuatkan data...</p></td></tr>`;

    try {
        // Ambil data fresh dari DB
        const peserta = await getRegisteredParticipants(tahunAktif, idRumah);
        
        // Simpan ke variable global untuk kegunaan filter
        globalPesertaList = peserta || [];

        // Panggil fungsi render
        renderJadual();

    } catch (err) { 
        el.tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Ralat: ${err.message}</td></tr>`; 
    }
}

/**
 * Langkah 2: Render jadual berdasarkan Filter dan Carian
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

    // 2. SORT (Susun ikut Kategori -> Nama)
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
        html = `<tr><td colspan="4" class="text-center text-muted py-4">Tiada rekod ditemui.</td></tr>`;
    } else {
        filteredData.forEach((p, index) => {
            const listAcara = Array.isArray(p.acaraDaftar) ? p.acaraDaftar : [];
            const count = listAcara.length;
            const badgeClass = count > 0 ? 'bg-success' : 'bg-secondary';
            const displayAcara = count > 0 ? listAcara.join(', ') : '<span class="text-muted fst-italic">Tiada acara</span>';

            // Kita guna index array asal atau hantar ID object untuk edit
            html += `
            <tr>
                <td><span class="badge bg-light text-dark border">${p.kategori}</span></td>
                <td class="fw-bold text-primary">${p.noBib || '-'}</td>
                <td>
                    <div class="fw-bold text-uppercase text-dark">${p.nama}</div>
                    <small class="d-block mt-1" style="font-size: 0.75rem;">
                        <span class="badge ${badgeClass} me-1" style="font-size: 0.65rem;">${count}</span>
                        ${displayAcara}
                    </small>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary shadow-sm" onclick="window.sediaEdit('${p.id}')">
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
// BAHAGIAN 4: FUNGSI IMPORT CSV (BULK UPLOAD)
// =========================================================

window.prosesCSV = async function() {
    const inputFail = document.getElementById('failCsv');
    const statusDiv = document.getElementById('status-upload');
    const file = inputFail.files[0];

    if (!file) {
        alert("Sila pilih fail dahulu!");
        return;
    }

    statusDiv.innerHTML = '<span class="text-primary fw-bold"><i class="spinner-border spinner-border-sm"></i> Sedang membaca fail...</span>';

    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;
        const baris = text.split('\n'); // Pecahkan ikut baris
        
        let berjaya = 0;
        let gagal = 0;
        let jumlahProses = 0;

        // Loop bermula index 1 (skip header CSV)
        // Jika CSV tiada header, tukar kepada let i = 0
        for (let i = 1; i < baris.length; i++) {
            const row = baris[i].trim();
            if (row) {
                const cols = row.split(',');
                
                // Pastikan ada 3 lajur: Nama, Kategori, NoBib
                if (cols.length >= 3) {
                    jumlahProses++;
                    const nama = cols[0].trim().toUpperCase();
                    const kategori = cols[1].trim().toUpperCase(); // L18, P15
                    const noBib = cols[2].trim().toUpperCase();

                    // Objek Data
                    const dataBaru = {
                        nama: nama,
                        kategori: kategori,
                        noBib: noBib,
                        idRumah: idRumah,
                        rumah: namaRumah,
                        acaraDaftar: [], // Default kosong
                        kemaskiniOleh: 'guru (csv)',
                        tarikhDaftar: new Date().toISOString()
                    };

                    try {
                        // Panggil API Register (Sequential supaya tak jam server)
                        await registerParticipant(tahunAktif, dataBaru);
                        berjaya++;
                        statusDiv.innerHTML = `<span class="text-primary">Memproses... (${berjaya} berjaya)</span>`;
                    } catch (err) {
                        console.error("Gagal daftar:", nama, err);
                        gagal++;
                    }
                }
            }
        }

        // Selesai
        statusDiv.innerHTML = `
            <div class="alert alert-success mt-2">
                <strong>Selesai!</strong><br>
                Berjaya: ${berjaya}<br>
                Gagal: ${gagal}
            </div>`;
        
        if (berjaya > 0) {
            alert(`Proses selesai.\n${berjaya} atlet berjaya didaftarkan.`);
            // Tutup modal secara manual (pilihan)
            // bootstrap.Modal.getInstance(document.getElementById('modalImportCSV')).hide();
            
            // Refresh senarai
            muatSenaraiPeserta();
        }
    };

    reader.readAsText(file);
};


// =========================================================
// BAHAGIAN 5: EDIT & RESET
// =========================================================

window.sediaEdit = async (id) => {
    // Cari data dalam globalPesertaList (tak perlu fetch baru, jimat data)
    const p = globalPesertaList.find(item => item.id === id);
    
    if (p) {
        el.id.value = p.id;
        el.bib.value = p.noBib || '';
        el.nama.value = p.nama;
        el.kat.value = p.kategori; // Dropdown akan bertukar
        el.btnDaftar.innerText = "Simpan Perubahan";
        el.btnBatal.classList.remove('d-none');
        
        // Panggil muat acara untuk kategori tersebut & tandakan checkbox
        await muatAcara(p.kategori, p.acaraDaftar);
        
        // Scroll ke atas
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Fokus pada borang
        el.nama.focus();
    }
};

el.btnBatal.onclick = () => resetBorang();

document.getElementById('btn-logout').onclick = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};

// =========================================================
// MULAKAN SISTEM
// =========================================================

// Muat senarai awal
muatSenaraiPeserta();
