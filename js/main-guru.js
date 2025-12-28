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

// 2. KEMASKINI HEADER
document.getElementById('nama-rumah').innerText = `Rumah: ${namaRumah}`;
document.getElementById('display-tahun').innerText = tahunAktif;

// 3. REFERENSI ELEMEN DOM (SESUAI DENGAN guru.html)
const el = {
    id: document.getElementById('edit-id-peserta'),
    bib: document.getElementById('no-bib'),
    nama: document.getElementById('nama-atlet'),
    kat: document.getElementById('kategori-atlet'),
    listAcara: document.getElementById('senarai-acara-checkbox'),
    countAcara: document.getElementById('count-acara'),
    form: document.getElementById('form-daftar-atlet'),
    btnDaftar: document.getElementById('btn-daftar'),
    btnBatal: document.getElementById('btn-batal')
};

/**
 * FUNGSI: MUAT ACARA BERDASARKAN KATEGORI
 * @param {string} kategori - L12, P11, dll
 * @param {Array} terpilih - Senarai nama acara dari 'acaraDaftar'
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

        // Pastikan 'terpilih' sentiasa Array untuk elakkan ralat .includes()
        const arrayTerpilih = Array.isArray(terpilih) ? terpilih : [];

        let html = '';
        senaraiAcara.forEach(acara => {
            // Logik padanan nama acara dengan data 'acaraDaftar'
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

// HAD 5 ACARA SAHAJA
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

/**
 * FUNGSI: SIMPAN / KEMASKINI PESERTA
 */
el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const docId = el.id.value;
    const checkedAcara = Array.from(el.listAcara.querySelectorAll('.acara-cb:checked')).map(cb => cb.value);

    if (checkedAcara.length === 0) return alert("Sila pilih sekurang-kurangnya 1 acara!");

    const data = {
        nama: el.nama.value.toUpperCase(),
        kategori: el.kat.value,
        noBib: el.bib.value.toUpperCase(),
        idRumah: idRumah,
        rumah: namaRumah,
        acaraDaftar: checkedAcara, // Simpan ke medan acaraDaftar
        kemaskiniOleh: 'guru',
        tarikhDaftar: new Date().toISOString()
    };

    try {
        el.btnDaftar.disabled = true;
        let res = docId ? await updateParticipant(tahunAktif, docId, data) : await registerParticipant(tahunAktif, data);

        if (res.success) {
            alert(docId ? "Kemaskini Berjaya!" : "Pendaftaran Berjaya!");
            resetBorang();
            muatSenaraiPeserta();
        }
    } catch (err) { alert(err.message); } 
    finally { el.btnDaftar.disabled = false; }
});

function resetBorang() {
    el.form.reset();
    el.id.value = "";
    el.btnDaftar.innerText = "Simpan Pendaftaran";
    el.btnBatal.classList.add('d-none');
    el.listAcara.innerHTML = '<div class="text-muted small">Sila pilih kategori dahulu...</div>';
    el.countAcara.innerText = "0/5 dipilih";
}

/**
 * FUNGSI: PAPAR SENARAI PESERTA (MEDAN ACARA DIPERBAIKI)
 */
async function muatSenaraiPeserta() {
    const listDiv = document.getElementById('list-peserta');
    try {
        const peserta = await getRegisteredParticipants(tahunAktif, idRumah);
        if (peserta.length === 0) {
            listDiv.innerHTML = '<div class="p-4 text-center text-muted">Tiada atlet terdaftar.</div>';
            return;
        }

        let html = `<table class="table table-hover mb-0 small">
            <thead class="table-light"><tr><th>BIB</th><th>NAMA</th><th>ACARA</th><th class="text-center">AKSI</th></tr></thead>
            <tbody>`;
        
        peserta.forEach(p => {
            // Ambil data dari 'acaraDaftar' secara selamat
            const paparanAcara = Array.isArray(p.acaraDaftar) ? p.acaraDaftar.join(', ') : 'Tiada Acara';
            
            html += `
                <tr>
                    <td class="fw-bold">${p.noBib || '-'}</td>
                    <td><strong>${p.nama}</strong><br><span class="badge bg-light text-dark border">${p.kategori}</span></td>
                    <td style="max-width: 200px; font-size: 0.75rem;">${paparanAcara}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-primary" onclick="window.sediaEdit('${p.id}')">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                    </td>
                </tr>`;
        });
        listDiv.innerHTML = html + `</tbody></table>`;
    } catch (err) { listDiv.innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
}

/**
 * FUNGSI GLOBAL: SEDIA EDIT (CHECKBOX DIPERBAIKI)
 */
window.sediaEdit = async (id) => {
    // Ambil senarai terkini untuk cari data atlet
    const atlet = await getRegisteredParticipants(tahunAktif, idRumah);
    const p = atlet.find(item => item.id === id);
    
    if (p) {
        el.id.value = p.id;
        el.bib.value = p.noBib || '';
        el.nama.value = p.nama;
        el.kat.value = p.kategori;
        el.btnDaftar.innerText = "Simpan Perubahan";
        el.btnBatal.classList.remove('d-none');
        
        // KRITIKAL: Hantar 'acaraDaftar' ke fungsi muatAcara untuk tandakan checkbox
        await muatAcara(p.kategori, p.acaraDaftar);
        window.scrollTo(0,0);
    }
};

el.btnBatal.onclick = () => resetBorang();

document.getElementById('btn-logout').onclick = () => {
    sessionStorage.clear();
    window.location.href = 'login.html';
};

// Mulakan sistem
muatSenaraiPeserta();