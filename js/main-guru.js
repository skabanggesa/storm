// =========================================================
// FAIL: js/main-guru.js
// =========================================================

import { 
    registerParticipant, 
    updateParticipant, 
    getEventsByCategory, 
    getRegisteredParticipants,
    deleteParticipant 
} from './modules/guru.js';

// --- CONFIG & SESSION ---
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();
const idRumah = sessionStorage.getItem("user_rumah");
const namaRumah = sessionStorage.getItem("nama_rumah");
const userRole = sessionStorage.getItem("user_role");

// Security Check
if (userRole !== 'guru' || !idRumah) {
    alert("Sesi tamat. Sila login semula.");
    window.location.href = 'login.html';
}

// Global Variables
let globalPesertaList = [];
let isEditing = false;
let currentEditId = null;

// --- DOM ELEMENTS ---
const el = {
    form: document.getElementById('form-daftar-atlet'),
    id: document.getElementById('edit-id-peserta'), // Hidden field jika ada, atau guna variable
    nama: document.getElementById('nama-atlet'),
    kat: document.getElementById('kategori-atlet'),
    bib: document.getElementById('no-bib'),
    containerAcara: document.getElementById('senarai-acara-checkbox'),
    labelCount: document.getElementById('count-acara'),
    btnSimpan: document.getElementById('btn-daftar'),
    btnBatal: document.getElementById('btn-batal'),
    tableBody: document.querySelector('#list-peserta table tbody'),
    filterKat: document.getElementById('filter-kategori'),
    search: document.getElementById('carian-nama'),
    totalLabel: document.getElementById('jumlah-peserta'),
    inputFile: document.getElementById('failCsv'),
    statusFile: document.getElementById('status-upload')
};

// =======================================================
    // PEMBETULAN: BUTANG KELUAR DILETAKKAN DI SINI
    // =======================================================
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if(confirm("Adakah anda pasti mahu log keluar?")) {
                sessionStorage.clear();
                window.location.href = 'index.html'; // Atau login.html
            }
        });
    } else {
        console.error("Ralat: Butang ID 'btn-logout' tidak dijumpai dalam HTML.");
    }
});

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nama-rumah').innerText = `RUMAH ${namaRumah ? namaRumah.toUpperCase() : ''}`;
    document.getElementById('display-tahun').innerText = tahunAktif;
    muatSenaraiPeserta();
});

// --- FUNGSI UTAMA: DAPATKAN DATA ---
async function muatSenaraiPeserta() {
    el.tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4"><div class="spinner-border text-primary"></div></td></tr>`;
    try {
        const data = await getRegisteredParticipants(tahunAktif, idRumah);
        globalPesertaList = data || [];
        renderJadual();
    } catch (err) {
        console.error(err);
        el.tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Ralat memuatkan data database.</td></tr>`;
    }
}

function renderJadual() {
    const filter = el.filterKat.value;
    const keyword = el.search.value.toLowerCase();

    let filtered = globalPesertaList.filter(p => {
        const matchKat = (filter === "SEMUA") || (p.kategori === filter);
        const matchName = p.nama.toLowerCase().includes(keyword) || (p.noBib && p.noBib.toLowerCase().includes(keyword));
        return matchKat && matchName;
    });

    // Sort Kategori -> Nama
    filtered.sort((a, b) => {
        if (a.kategori < b.kategori) return -1;
        if (a.kategori > b.kategori) return 1;
        return a.nama.localeCompare(b.nama);
    });

    if (filtered.length === 0) {
        el.tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted fst-italic">- Tiada rekod -</td></tr>`;
        el.totalLabel.innerText = "0 Orang";
        return;
    }

    let html = '';
    filtered.forEach(p => {
        const acara = (p.acaraDaftar && p.acaraDaftar.length > 0) ? p.acaraDaftar.join(', ') : '-';
        html += `
            <tr>
                <td class="text-center"><span class="badge bg-light text-dark border">${p.kategori}</span></td>
                <td class="font-monospace fw-bold">${p.noBib}</td>
                <td>
                    <div class="fw-bold">${p.nama}</div>
                    <small class="text-muted">${acara}</small>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.editPeserta('${p.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.hapusPeserta('${p.id}', '${p.nama}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    });
    el.tableBody.innerHTML = html;
    el.totalLabel.innerText = `${filtered.length} Orang`;
}

// --- FUNGSI ACARA (CHECKBOX) ---
el.kat.addEventListener('change', async function() {
    await muatCheckboxAcara(this.value);
});

async function muatCheckboxAcara(kategori, selected = []) {
    el.containerAcara.innerHTML = 'Loading...';
    try {
        const events = await getEventsByCategory(tahunAktif, kategori);
        if(!events.length) {
            el.containerAcara.innerHTML = '<small class="text-muted">Tiada acara.</small>';
            return;
        }
        let html = '';
        events.forEach(ev => {
            const isChecked = selected.includes(ev.nama) ? 'checked' : '';
            html += `
                <div class="form-check">
                    <input class="form-check-input chk-acara" type="checkbox" value="${ev.nama}" id="ev-${ev.id}" ${isChecked}>
                    <label class="form-check-label small" for="ev-${ev.id}">${ev.nama}</label>
                </div>
            `;
        });
        el.containerAcara.innerHTML = html;
        updateCount();
    } catch (e) {
        el.containerAcara.innerHTML = 'Ralat acara.';
    }
}

el.containerAcara.addEventListener('change', (e) => {
    if(e.target.classList.contains('chk-acara')){
        const total = document.querySelectorAll('.chk-acara:checked').length;
        if(total > 5) {
            e.target.checked = false;
            alert("Maksimum 5 acara sahaja.");
        }
        updateCount();
    }
});

function updateCount() {
    const total = document.querySelectorAll('.chk-acara:checked').length;
    el.labelCount.innerText = `${total}/5 dipilih`;
}

// --- SUBMIT FORM ---
el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = el.nama.value.trim().toUpperCase();
    const kat = el.kat.value;
    const bib = el.bib.value.trim().toUpperCase();
    const acara = Array.from(document.querySelectorAll('.chk-acara:checked')).map(c => c.value);

    if(!nama || !kat || !bib) return alert("Sila isi semua maklumat.");

    const data = {
        nama, kategori: kat, noBib: bib, acaraDaftar: acara,
        idRumah, rumah: namaRumah, tahun: tahunAktif,
        tarikhKemaskini: new Date().toISOString()
    };

    el.btnSimpan.disabled = true;
    el.btnSimpan.innerText = "Memproses...";

    try {
        if(isEditing && currentEditId) {
            await updateParticipant(tahunAktif, currentEditId, data);
            alert("Berjaya dikemaskini.");
        } else {
            data.tarikhDaftar = new Date().toISOString();
            await registerParticipant(tahunAktif, data);
            alert("Pendaftaran berjaya.");
        }
        resetForm();
        muatSenaraiPeserta();
    } catch (err) {
        alert("Ralat: " + err.message);
    } finally {
        el.btnSimpan.disabled = false;
        el.btnSimpan.innerText = isEditing ? "Kemaskini" : "Simpan Pendaftaran";
    }
});

function resetForm() {
    el.form.reset();
    isEditing = false;
    currentEditId = null;
    el.containerAcara.innerHTML = '<small class="text-muted">Pilih kategori dahulu...</small>';
    el.labelCount.innerText = "0/5 dipilih";
    el.btnSimpan.innerText = "Simpan Pendaftaran";
    el.btnSimpan.className = "btn btn-primary w-100";
    el.btnBatal.classList.add('d-none');
}

el.btnBatal.onclick = resetForm;

// --- EDIT & DELETE (Global) ---
window.editPeserta = async function(id) {
    const p = globalPesertaList.find(x => x.id === id);
    if(!p) return;
    
    isEditing = true;
    currentEditId = id;
    
    el.nama.value = p.nama;
    el.kat.value = p.kategori;
    el.bib.value = p.noBib;
    
    await muatCheckboxAcara(p.kategori, p.acaraDaftar);
    
    el.btnSimpan.innerText = "Kemaskini Data";
    el.btnSimpan.className = "btn btn-warning w-100 text-dark fw-bold";
    el.btnBatal.classList.remove('d-none');
    document.querySelector('.card-body').scrollIntoView();
};

window.hapusPeserta = async function(id, nama) {
    if(confirm(`Padam atlet ${nama}?`)) {
        try {
            await deleteParticipant(tahunAktif, id);
            muatSenaraiPeserta();
        } catch(e) { alert("Gagal padam: " + e.message); }
    }
};

// --- IMPORT CSV ---
window.prosesCSV = function() {
    const file = el.inputFile.files[0];
    if(!file) return alert("Pilih fail CSV.");
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const rows = e.target.result.split('\n').slice(1); // Skip header
        let success = 0, fail = 0;
        
        el.statusFile.innerHTML = "Memproses...";
        
        for(let row of rows) {
            const cols = row.split(',');
            if(cols.length >= 3) {
                const n = cols[0].trim().toUpperCase().replace(/["']/g, "");
                const k = cols[1].trim().toUpperCase().replace(/["']/g, "");
                const b = cols[2].trim().toUpperCase().replace(/["']/g, "");
                
                if(n && k) {
                    try {
                        await registerParticipant(tahunAktif, {
                            nama: n, kategori: k, noBib: b, idRumah, rumah: namaRumah, 
                            acaraDaftar: [], tarikhDaftar: new Date().toISOString()
                        });
                        success++;
                    } catch { fail++; }
                }
            }
        }
        el.statusFile.innerHTML = `Berjaya: ${success}, Gagal: ${fail}`;
        muatSenaraiPeserta();
    };
    reader.readAsText(file);
};

// --- CETAK SENARAI (Logic Susunan L7-L12) ---
function getAgeNum(kat) {
    const num = parseInt(kat.replace(/\D/g, ''));
    return isNaN(num) ? 0 : num;
}

function sortUmur(a, b) {
    const ageA = getAgeNum(a.kategori);
    const ageB = getAgeNum(b.kategori);
    if(ageA !== ageB) return ageA - ageB; // 7, 8, 9...
    return a.nama.localeCompare(b.nama);
}

window.cetakSenarai = function() {
    if(!globalPesertaList.length) return alert("Tiada data.");

    const lelaki = globalPesertaList.filter(p => p.kategori.startsWith('L')).sort(sortUmur);
    const perempuan = globalPesertaList.filter(p => p.kategori.startsWith('P')).sort(sortUmur);

    const win = window.open('', '', 'width=900,height=800');
    
    const tableHTML = (list) => {
        if(!list.length) return '<tr><td colspan="5" class="text-center">-</td></tr>';
        return list.map((p, i) => `
            <tr>
                <td class="text-center">${i+1}</td>
                <td class="text-center fw-bold">${p.kategori}</td>
                <td class="text-center">${p.noBib}</td>
                <td>${p.nama}</td>
                <td style="font-size:11px">${(p.acaraDaftar||[]).join(', ')}</td>
            </tr>`).join('');
    };

    win.document.write(`
        <html>
        <head>
            <title>Senarai Atlet</title>
            <style>
                body { font-family: sans-serif; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #000; padding: 5px; }
                th { background: #eee; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; }
                .text-center { text-align: center; }
                .fw-bold { font-weight: bold; }
                .cat-header { background: #333; color: #fff; padding: 5px; font-weight: bold; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h3>SENARAI PENDAFTARAN ATLET - ${namaRumah}</h3>
            </div>
            
            <div class="cat-header">KATEGORI LELAKI</div>
            <table>
                <thead><tr><th width="5%">No</th><th width="10%">Kat</th><th width="10%">Bib</th><th>Nama</th><th>Acara</th></tr></thead>
                <tbody>${tableHTML(lelaki)}</tbody>
            </table>

            <div class="cat-header">KATEGORI PEREMPUAN</div>
            <table>
                <thead><tr><th width="5%">No</th><th width="10%">Kat</th><th width="10%">Bib</th><th>Nama</th><th>Acara</th></tr></thead>
                <tbody>${tableHTML(perempuan)}</tbody>
            </table>
            
            <script>setTimeout(()=>window.print(), 500);</script>
        </body>
        </html>
    `);
    win.document.close();
};

// Listeners
el.filterKat.addEventListener('change', renderJadual);
el.search.addEventListener('keyup', renderJadual);

