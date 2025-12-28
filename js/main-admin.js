import { 
    initializeTournament, 
    getEventsReadyForResults, 
    getHeatsData, 
    saveHeatResults,
    getEventDetail,
    getEventRecord,
    saveBulkRecords,
    ACARA_PADANG,
    ACARA_KHAS
} from './modules/admin.js';
import { highJumpLogic } from './modules/highjump-logic.js'; 
import { db } from './firebase-config.js';
// Import fungsi Firestore yang diperlukan (Ditambah: collection, query, where, getDocs)
import { 
    doc, 
    getDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- 0. TETAPAN TAHUN AKTIF ---
let tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString(); 

console.log("Sistem STORMS dimulakan...");
console.log("Tahun yang dikesan dari Storan:", sessionStorage.getItem("tahun_aktif"));
console.log("Tahun yang sedang digunakan oleh sistem:", tahunAktif);

const contentArea = document.getElementById('content-area');

// --- 1. PENGURUSAN NAVIGASI ---
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

function switchActive(activeId) {
    const menus = ['menu-setup', 'menu-acara', 'menu-keputusan'];
    menus.forEach(id => {
        document.getElementById(id)?.classList.toggle('active', id === activeId);
    });
}

// --- 2. LOGIK PROSES CSV ---
document.getElementById('btn-proses-csv')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('file-csv');
    const btn = document.getElementById('btn-proses-csv');
    const file = fileInput.files[0];

    if (!file) return alert("Sila pilih fail CSV rekod dahulu!");

    btn.disabled = true;
    btn.innerText = "Memproses...";

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
                alert(`${records.length} Rekod Berjaya Dikemaskini!`);
                location.reload();
            } catch (err) {
                alert("Ralat: " + err.message);
            }
        }
        btn.disabled = false;
        btn.innerText = "Proses Fail";
    };
    reader.readAsText(file);
});

// --- 3. SETUP KEJOHANAN ---
function renderSetupForm() {
    contentArea.innerHTML = `
        <div class="card p-4 shadow-sm border-0">
            <h4><i class="bi bi-gear-fill me-2"></i>Setup Kejohanan (${tahunAktif})</h4>
            <p class="text-muted small">Klik butang di bawah untuk menjana struktur database tahun ini.</p>
            <button class="btn btn-primary" id="btn-init">Jana Struktur Data</button>
        </div>`;
    
    document.getElementById('btn-init').onclick = async () => {
        if(!confirm(`Adakah anda pasti mahu menjana struktur data untuk tahun ${tahunAktif}?`)) return;
        
        const defaultEvents = [
            { nama: "100m", kategori: "L12", jenis: "Balapan" },
            { nama: "Lompat Tinggi", kategori: "L12", jenis: "Padang" }
        ];
        const res = await initializeTournament(tahunAktif, defaultEvents);
        if(res.success) alert("Struktur berjaya dijana!");
        else alert("Ralat: " + res.message);
    };
}

// --- 4. SENARAI ACARA ---
async function renderSenaraiAcara(mode) {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Memuatkan senarai...</p></div>';
    
    let acara = await getEventsReadyForResults(tahunAktif);

    acara.sort((a, b) => {
        const namaA = a.nama.toUpperCase();
        const namaB = b.nama.toUpperCase();
        if (namaA !== namaB) return namaA < namaB ? -1 : 1;
        const katA = a.kategori.toUpperCase();
        const katB = b.kategori.toUpperCase();
        return katA < katB ? -1 : 1;
    });

    let title = mode === 'urus' ? 'Urus Acara & Saringan' : 'Input Keputusan Acara';
    let btnText = mode === 'urus' ? 'Urus & Cetak' : 'Input Keputusan';

    let html = `
        <div class="row align-items-center mb-4">
            <div class="col-md-6">
                <h4 class="fw-bold mb-0">${title}</h4>
                <span class="badge bg-primary">${acara.length} Acara (${tahunAktif})</span>
            </div>
            <div class="col-md-6 mt-3 mt-md-0 d-print-none">
                <div class="input-group shadow-sm">
                    <span class="input-group-text bg-white border-end-0"><i class="bi bi-search"></i></span>
                    <input type="text" id="search-acara" class="form-control border-start-0" placeholder="Cari nama acara atau kategori...">
                </div>
            </div>
        </div>
        <div class="row" id="container-acara">`;
    
    acara.forEach(a => {
        html += `
            <div class="col-md-4 mb-3 acara-card-container">
                <div class="card shadow-sm border-0 h-100">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <div>
                            <h6 class="fw-bold text-dark mb-1">${a.nama}</h6>
                            <p class="badge bg-light text-primary border border-primary mb-3">${a.kategori}</p>
                        </div>
                        <button class="btn btn-sm ${mode === 'urus' ? 'btn-outline-primary' : 'btn-primary'} w-100" 
                                onclick="pilihAcara('${a.id}', '${a.nama} ${a.kategori}', '${mode}')">
                            <i class="bi ${mode === 'urus' ? 'bi-printer' : 'bi-pencil-square'} me-1"></i> ${btnText}
                        </button>
                    </div>
                </div>
            </div>`;
    });
    
    contentArea.innerHTML = html + `</div>`;

    document.getElementById('search-acara')?.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        document.querySelectorAll('.acara-card-container').forEach(card => {
            card.style.display = card.innerText.toLowerCase().includes(keyword) ? "block" : "none";
        });
    });
}

// --- 5. PILIH SARINGAN/HEAT ---
window.pilihAcara = async (eventId, label, mode) => {
    const heats = await getHeatsData(tahunAktif, eventId);
    let html = `
        <div class="d-flex align-items-center mb-3 d-print-none">
            <button class="btn btn-sm btn-outline-secondary me-3" onclick="renderSenaraiAcara('${mode}')">
                <i class="bi bi-arrow-left"></i> Kembali
            </button>
            <h5 class="mb-0 fw-bold">${label} (${tahunAktif})</h5>
        </div>
        <hr class="d-print-none">
        <div class="list-group">`;
    
    if (heats.length === 0) {
        html += `<div class="alert alert-info">Tiada saringan dijumpai.</div>`;
    } else {
        heats.forEach(h => {
            html += `
                <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                        onclick="pilihSaringan('${eventId}', '${h.id}', '${label}', '${mode}')">
                    <span><i class="bi bi-flag-fill me-2 text-danger"></i>Saringan ${h.noSaringan}</span>
                    <span class="badge rounded-pill ${h.status === 'selesai' ? 'bg-success' : 'bg-warning text-dark'} d-print-none">
                        ${h.status === 'selesai' ? 'Selesai' : 'Belum Selesai'}
                    </span>
                </button>`;
        });
    }
    contentArea.innerHTML = html + `</div>`;
};

// --- 6. BORANG DINAMIK ---
window.pilihSaringan = async (eventId, heatId, label, mode) => {
    contentArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    const heats = await getHeatsData(tahunAktif, eventId);
    const h = heats.find(item => item.id === heatId);
    const eventDetail = await getEventDetail(tahunAktif, eventId);
    const record = await getEventRecord(eventDetail.nama, eventDetail.kategori);

    const isReadOnly = (mode === 'urus');

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h5 class="fw-bold text-primary mb-0">${label} - Saringan ${h.noSaringan}</h5>
                <div class="d-flex gap-3 d-print-none">
                    <button class="btn btn-link btn-sm p-0 text-decoration-none" 
                            onclick="jalankanSync('${eventId}', '${heatId}', '${label}', '${mode}')">
                        <i class="bi bi-arrow-repeat me-1"></i>Kemaskini No. Bip Peserta
                    </button>
                    ${isReadOnly ? `
                    <button class="btn btn-link btn-sm p-0 text-decoration-none text-warning fw-bold" 
                            onclick="window.agihanAuto('${eventId}', '${heatId}', '${label}', '${mode}')">
                        <i class="bi bi-magic me-1"></i>Agihan Auto Peserta
                    </button>` : ''}
                </div>
            </div>
            <div class="d-print-none">
                ${isReadOnly ? '<button class="btn btn-sm btn-dark me-2" onclick="window.print()"><i class="bi bi-printer me-1"></i> Cetak</button>' : ''}
                <button class="btn btn-sm btn-secondary" onclick="pilihAcara('${eventId}', '${label}', '${mode}')">Kembali</button>
            </div>
        </div>
        <div class="card bg-white mb-3 border-0 shadow-sm">
            <div class="card-body py-2 row text-center small">
                <div class="col-4 border-end"><strong>Rekod:</strong><br><span class="text-danger fw-bold">${record?.rekod || '-'}</span></div>
                <div class="col-4 border-end"><strong>Tahun:</strong><br>${record?.tahun || '-'}</div>
                <div class="col-4"><strong>Nama:</strong><br>${record?.nama || '-'}</div>
            </div>
        </div>`;

    if (ACARA_KHAS.includes(eventDetail.nama)) {
        html += renderBorangLompatTinggi(h, isReadOnly);
    } else if (ACARA_PADANG.includes(eventDetail.nama)) {
        html += renderBorangPadang(h, isReadOnly);
    } else {
        html += renderBorangBalapan(h, isReadOnly);
    }
    
    contentArea.innerHTML = html;
    if (!isReadOnly) attachEvents(h, eventId, heatId, label, eventDetail.nama);
};

// --- 7. LOGIK RENDER ---
function renderBorangBalapan(h, isReadOnly) {
    let t = `<div class="table-responsive"><table class="table table-bordered bg-white align-middle">
        <thead class="table-dark"><tr>
            <th width="60">Lorong</th>
            <th width="100">No. Bip</th>
            <th>Nama Atlet / Rumah</th>
            <th width="150">Masa (s)</th>
        </tr></thead><tbody>`;
        
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="4" class="text-center py-4 text-muted">Tiada peserta. Klik 'Agihan Auto' untuk menarik data dari pendaftaran guru.</td></tr>`;
    } else {
        h.peserta.forEach((p, idx) => {
            const bipDisplay = p.noBip || p.noBib || '-';
            t += `<tr>
                <td class="text-center fw-bold">${p.lorong || (idx + 1)}</td>
                <td class="text-center">${bipDisplay}</td>
                <td><div class="fw-bold">${p.nama}</div><div class="small text-muted text-uppercase">${p.idRumah || p.rumah || ''}</div></td>
                <td>${isReadOnly ? '<div style="border-bottom: 1px dotted #000; height: 25px; margin-top:10px;"></div>' : 
                    `<input type="text" class="form-control text-center res-input" data-idx="${idx}" value="${p.pencapaian || ''}" placeholder="00.00">`}</td>
            </tr>`;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `<button class="btn btn-primary w-100 py-2 fw-bold mt-3" id="btn-save-results">SIMPAN KEPUTUSAN</button>`);
}

function renderBorangPadang(h, isReadOnly) {
    let t = `<div class="table-responsive"><table class="table table-bordered bg-white text-center align-middle">
        <thead class="table-dark"><tr>
            <th width="100">No. Bip</th>
            <th class="text-start">Atlet / Rumah</th>
            <th width="80">T1</th><th width="80">T2</th><th width="80">T3</th>
            <th width="100">Terbaik</th>
        </tr></thead><tbody>`;
    
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="6" class="text-center py-4 text-muted">Tiada peserta. Klik 'Agihan Auto'.</td></tr>`;
    } else {
        h.peserta.forEach((p, idx) => {
            const bipDisplay = p.noBip || p.noBib || '-';
            const tr = p.percubaan || ['', '', ''];
            t += `<tr data-idx="${idx}">
                <td class="text-center">${bipDisplay}</td>
                <td class="text-start"><div class="fw-bold">${p.nama}</div><div class="small text-muted">${p.idRumah || p.rumah || ''}</div></td>
                ${[0,1,2].map(i => `<td>${isReadOnly ? '<div style="height:25px;"></div>' : `<input type="number" step="0.01" class="form-control form-control-sm trial-input" data-trial="${i}" value="${tr[i]}">`}</td>`).join('')}
                <td class="fw-bold text-primary">${p.pencapaian || '0.00'}</td>
            </tr>`;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `<button class="btn btn-primary w-100 py-2 fw-bold mt-3" id="btn-save-results">SIMPAN KEPUTUSAN</button>`);
}

function renderBorangLompatTinggi(h, isReadOnly) {
    let allHeights = new Set();
    h.peserta.forEach(p => p.rekodLompatan && Object.keys(p.rekodLompatan).forEach(ht => allHeights.add(ht)));
    let sorted = Array.from(allHeights).sort((a,b) => parseFloat(a) - parseFloat(b));

    let t = `${isReadOnly ? '' : `<div class="mb-2 text-end d-print-none"><button class="btn btn-sm btn-dark" id="btn-add-height"><i class="bi bi-plus-circle me-1"></i>Tambah Aras</button></div>`}
        <div class="table-responsive"><table class="table table-bordered bg-white text-center align-middle" id="high-jump-table">
        <thead class="table-dark"><tr>
            <th width="100">No. Bip</th>
            <th class="text-start">Atlet / Rumah</th>
            ${sorted.map(ht => `<th>${ht}m</th>`).join('')}
            <th>Terbaik</th>
        </tr></thead><tbody>`;
    
    if (!h.peserta || h.peserta.length === 0) {
        t += `<tr><td colspan="${sorted.length + 3}" class="text-center py-4 text-muted">Tiada peserta. Klik 'Agihan Auto'.</td></tr>`;
    } else {
        h.peserta.forEach((p, idx) => {
            const bipDisplay = p.noBip || p.noBib || '-';
            t += `<tr data-idx="${idx}">
                <td class="text-center">${bipDisplay}</td>
                <td class="text-start"><div class="fw-bold">${p.nama}</div><div class="small text-muted">${p.idRumah || p.rumah || ''}</div></td>
                ${sorted.map(ht => `<td>${isReadOnly ? '' : `<input type="text" class="form-control form-control-sm hj-input" data-ht="${ht}" value="${p.rekodLompatan?.[ht]?.join('') || ''}">`}</td>`).join('')}
                <td class="fw-bold text-primary">${p.pencapaian || '0.00'}</td></tr>`;
        });
    }
    return t + `</tbody></table></div>` + (isReadOnly ? '' : `<button class="btn btn-primary w-100 mt-3 py-2 fw-bold" id="btn-save-results">SIMPAN KEPUTUSAN</button>`);
}

// --- 8. LOGIK SIMPAN ---
function attachEvents(h, eventId, heatId, label, jenisAcara) {
    document.getElementById('btn-save-results').onclick = async () => {
        const updated = [...h.peserta];
        if (ACARA_KHAS.includes(jenisAcara)) {
            document.querySelectorAll('#high-jump-table tbody tr').forEach(row => {
                const idx = row.dataset.idx;
                let jumps = {};
                row.querySelectorAll('.hj-input').forEach(inp => {
                    const val = inp.value.toUpperCase().split('').filter(v => ['O','X','-'].includes(v));
                    if (val.length > 0) jumps[inp.dataset.ht] = val;
                });
                updated[idx].rekodLompatan = jumps;
                updated[idx].pencapaian = highJumpLogic.getBestHeight(jumps);
            });
        } else if (ACARA_PADANG.includes(jenisAcara)) {
            document.querySelectorAll('tbody tr').forEach(row => {
                const idx = row.dataset.idx;
                const trials = Array.from(row.querySelectorAll('.trial-input')).map(i => parseFloat(i.value) || 0);
                updated[idx].percubaan = trials;
                updated[idx].pencapaian = Math.max(...trials).toFixed(2);
            });
        } else {
            document.querySelectorAll('.res-input').forEach(inp => { updated[inp.dataset.idx].pencapaian = inp.value; });
        }
        
        const res = await saveHeatResults(tahunAktif, eventId, heatId, updated);
        if(res.success) {
            alert("Keputusan berjaya disimpan!");
            pilihSaringan(eventId, heatId, label, 'keputusan');
        } else {
            alert("Ralat: " + res.message);
        }
    };

    document.getElementById('btn-add-height')?.addEventListener('click', () => {
        const val = prompt("Masukkan Ketinggian Baru (m):", "1.10");
        if (!val || isNaN(val)) return;
        const head = document.querySelector('#high-jump-table thead tr');
        const th = document.createElement('th'); th.innerText = val + "m";
        head.insertBefore(th, head.lastElementChild);
        document.querySelectorAll('#high-jump-table tbody tr').forEach(row => {
            const td = document.createElement('td');
            td.innerHTML = `<input type="text" class="form-control form-control-sm hj-input" data-ht="${val}" value="">`;
            row.insertBefore(td, row.lastElementChild);
        });
    });
}

// --- 9. LOGIK SYNC & AGIHAN AUTO ---
window.jalankanSync = async (eventId, heatId, label, mode) => {
    if(!confirm(`Kemaskini No. Bip dari profil atlet tahun ${tahunAktif}?`)) return;
    
    console.log(`--- PROSES SYNC BERMULA (Tahun: ${tahunAktif}) ---`);
    try {
        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        const heatSnap = await getDoc(heatRef);
        
        if (heatSnap.exists()) {
            const data = heatSnap.data();
            const pesertaUpdated = await Promise.all(data.peserta.map(async (p) => {
                const atletRef = doc(db, "kejohanan", tahunAktif, "peserta", p.idPeserta);
                const atletSnap = await getDoc(atletRef);
                
                if (atletSnap.exists()) {
                    const atletData = atletSnap.data();
                    const bibBetul = atletData.noBib || atletData.noBip || p.idPeserta;
                    return { ...p, noBip: bibBetul, noBib: bibBetul };
                } else {
                    return p;
                }
            }));

            await updateDoc(heatRef, { peserta: pesertaUpdated });
            alert("Sync Selesai! Nombor badan telah dikemaskini.");
            pilihSaringan(eventId, heatId, label, mode);
        }
    } catch (e) {
        alert("Ralat Sync: " + e.message);
    }
};

window.agihanAuto = async (eventId, heatId, label, mode) => {
    const eventDetail = await getEventDetail(tahunAktif, eventId);
    if (!confirm(`Agih semua peserta yang mendaftar acara ${eventDetail.nama} (${eventDetail.kategori}) ke dalam saringan ini?`)) return;

    console.log("Memulakan Agihan Auto...");
    try {
        const q = query(
            collection(db, "kejohanan", tahunAktif, "peserta"),
            where("kategori", "==", eventDetail.kategori),
            where("acaraDaftar", "array-contains", eventDetail.nama)
        );

        const snap = await getDocs(q);
        const senarai = snap.docs.map((d, index) => {
            const data = d.data();
            return {
                idPeserta: d.id,
                nama: data.nama,
                noBip: data.noBib || d.id,
                idRumah: data.rumah || '',
                lorong: index + 1,
                pencapaian: ""
            };
        });

        if (senarai.length === 0) {
            alert("Tiada peserta ditemui bagi kategori dan acara ini.");
            return;
        }

        const heatRef = doc(db, "kejohanan", tahunAktif, "acara", eventId, "saringan", heatId);
        await updateDoc(heatRef, { peserta: senarai });

        alert(`${senarai.length} peserta berjaya diagihkan!`);
        pilihSaringan(eventId, heatId, label, mode);

    } catch (e) {
        console.error(e);
        alert("Ralat Agihan: " + e.message);
    }
};

// Lancarkan paparan pertama
renderSetupForm();