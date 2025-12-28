import { db } from './firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// 1. TETAPAN TAHUN & KONSTANTA
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();

/**
 * Senarai kata kunci untuk acara Padang (Nilai Terbesar Menang).
 * Termasuk Lompat Tinggi, Jauh, dan acara Lontar/Lempar/Rejam.
 */
const ACARA_PADANG = ["Lompat Tinggi", "Lompat Jauh", "Lontar Peluru", "Rejam Lembing", "Lempar Cakera"];

/**
 * FUNGSI KRITIKAL: Menukar sebarang format pencapaian kepada nilai angka (float).
 * Menyokong format:
 * - "2:25:56" (Relay/Masa Panjang) -> Ditukar ke jumlah saat
 * - "11:31" (Larian) -> Ditukar ke jumlah saat
 * - "12.50" (Larian/Jarak) -> Kekal sebagai float
 */
function tukarKeNilaiMurni(teks, isPadang = false) {
    if (!teks || teks === "0" || teks === "0.00" || teks === "") {
        // Jika data kosong, beri nilai yang sangat buruk supaya tidak menang secara tidak sengaja
        return isPadang ? -1 : 999999;
    }
    
    const bahagian = teks.toString().split(':').map(val => parseFloat(val) || 0);
    
    if (bahagian.length === 3) {
        // Format H:M:S atau M:S:ms (cth: 2:25:56)
        return (bahagian[0] * 60) + bahagian[1] + (bahagian[2] / 100);
    } else if (bahagian.length === 2) {
        // Format M:S (cth: 11:31)
        return (bahagian[0] * 60) + bahagian[1];
    }
    
    // Format nombor tunggal (cth: 12.50)
    return bahagian[0];
}

async function janaKeputusanPenuh() {
    const medalContainer = document.getElementById('medal-tally-container');
    const resultsContainer = document.getElementById('results-list-container');

    if (medalContainer) medalContainer.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div><p>Sila tunggu, sedang menyusun keputusan...</p></div>';

    try {
        const acaraRef = collection(db, "kejohanan", tahunAktif, "acara");
        const acaraSnap = await getDocs(acaraRef);
        
        let senaraiKeputusanAcara = [];
        let dataRumah = {
            'merah': { emas: 0, perak: 0, gangsa: 0, mata: 0, nama: 'MERAH' },
            'biru': { emas: 0, perak: 0, gangsa: 0, mata: 0, nama: 'BIRU' },
            'hijau': { emas: 0, perak: 0, gangsa: 0, mata: 0, nama: 'HIJAU' },
            'kuning': { emas: 0, perak: 0, gangsa: 0, mata: 0, nama: 'KUNING' }
        };

        for (const docAcara of acaraSnap.docs) {
            const acara = docAcara.data();
            const eventId = docAcara.id;

            // Semakan Rekod Sedia Ada
            const recordId = `${acara.nama}_${acara.kategori}`;
            const recordSnap = await getDoc(doc(db, "rekod", recordId));
            const dataRekodSemasa = recordSnap.exists() ? recordSnap.data() : null;

            const saringanRef = collection(db, "kejohanan", tahunAktif, "acara", eventId, "saringan");
            const saringanSnap = await getDocs(saringanRef);
            
            let semuaPeserta = [];
            saringanSnap.forEach(s => {
                const d = s.data();
                if (d.peserta && d.status === "selesai") {
                    // Hanya ambil peserta yang mempunyai catatan
                    const valid = d.peserta.filter(p => p.pencapaian && p.pencapaian !== "0" && p.pencapaian !== "0.00");
                    semuaPeserta.push(...valid);
                }
            });

            if (semuaPeserta.length > 0) {
                // Tentukan jika ini acara padang atau balapan
                const isPadang = ACARA_PADANG.some(p => acara.nama.includes(p));
                
                // --- SUSUNAN PEMENANG (DIPERBAIKI UNTUK RELAY) ---
                semuaPeserta.sort((a, b) => {
                    const valA = tukarKeNilaiMurni(a.pencapaian, isPadang);
                    const valB = tukarKeNilaiMurni(b.pencapaian, isPadang);
                    
                    // Padang: Jarak/Tinggi terbesar (Descending). 
                    // Balapan/Relay: Masa terkecil (Ascending).
                    return isPadang ? valB - valA : valA - valB; 
                });

                // Proses Markah (7-5-3-1) & Semakan Rekod
                semuaPeserta = semuaPeserta.map((p, index) => {
                    const kedudukan = index + 1;
                    const rKey = (p.idRumah || p.rumah || "").toLowerCase();
                    
                    if (dataRumah[rKey]) {
                        if (kedudukan === 1) { dataRumah[rKey].emas++; dataRumah[rKey].mata += 7; }
                        else if (kedudukan === 2) { dataRumah[rKey].perak++; dataRumah[rKey].mata += 5; }
                        else if (kedudukan === 3) { dataRumah[rKey].gangsa++; dataRumah[rKey].mata += 3; }
                        else { dataRumah[rKey].mata += 1; }
                    }

                    // Logik Semakan Rekod Baru
                    let isNewRecord = false;
                    if (dataRekodSemasa && p.pencapaian) {
                        const valP = tukarKeNilaiMurni(p.pencapaian, isPadang);
                        const valR = tukarKeNilaiMurni(dataRekodSemasa.rekod, isPadang);
                        isNewRecord = isPadang ? (valP > valR) : (valP < valR);
                    }

                    return { ...p, kedudukan, isNewRecord };
                });

                senaraiKeputusanAcara.push({
                    id: eventId,
                    namaAcara: `${acara.nama} (${acara.kategori})`,
                    peserta: semuaPeserta
                });
            }
        }

        paparkanMedalTally(dataRumah, medalContainer);
        paparkanKeputusanTerperinci(senaraiKeputusanAcara, resultsContainer);

    } catch (error) {
        console.error("Ralat Penjanaan Keputusan:", error);
    }
}

function paparkanMedalTally(data, container) {
    const ranking = Object.values(data).sort((a, b) => b.mata - a.mata);
    let html = `
        <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-dark text-white py-3">
                <h5 class="mb-0"><i class="bi bi-trophy-fill me-2 text-warning"></i>Kedudukan Keseluruhan</h5>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-center">
                    <thead class="table-light">
                        <tr>
                            <th>KED</th>
                            <th class="text-start">RUMAH SUKAN</th>
                            <th>🥇 EMAS</th>
                            <th>🥈 PERAK</th>
                            <th>🥉 GANGSA</th>
                            <th class="bg-primary text-white">MATA</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    ranking.forEach((r, i) => {
        html += `
            <tr>
                <td class="fw-bold">${i + 1}</td>
                <td class="text-start fw-bold text-uppercase">${r.nama}</td>
                <td>${r.emas}</td>
                <td>${r.perak}</td>
                <td>${r.gangsa}</td>
                <td class="fw-bold text-primary">${r.mata}</td>
            </tr>`;
    });
    
    container.innerHTML = html + `</tbody></table></div></div>`;
}

function paparkanKeputusanTerperinci(senarai, container) {
    let dropdownHtml = `
        <div class="mb-4 d-print-none">
            <label class="form-label small fw-bold">PILIH ACARA UNTUK NAVIGASI:</label>
            <select class="form-select" onchange="const el = document.getElementById(this.value); if(el) el.scrollIntoView({behavior: 'smooth'})">
                <option value="">-- Pilih Acara --</option>
                ${senarai.map(a => `<option value="${a.id}">${a.namaAcara}</option>`).join('')}
            </select>
        </div>`;

    let contentHtml = "";
    senarai.forEach(acara => {
        contentHtml += `
            <div id="${acara.id}" class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-primary text-white">
                    <h6 class="mb-0 fw-bold">${acara.namaAcara}</h6>
                </div>
                <div class="table-responsive">
                    <table class="table table-bordered table-hover mb-0">
                        <thead class="table-light small text-center">
                            <tr>
                                <th width="10%">KED</th>
                                <th width="45%" class="text-start">NAMA PESERTA / PASUKAN</th>
                                <th width="25%">RUMAH</th>
                                <th width="20%">CATATAN</th>
                            </tr>
                        </thead>
                        <tbody>`;

        acara.peserta.forEach(p => {
            const medal = p.kedudukan === 1 ? '🥇' : p.kedudukan === 2 ? '🥈' : p.kedudukan === 3 ? '🥉' : '';
            contentHtml += `
                <tr class="${p.kedudukan <= 3 ? 'table-success-subtle' : ''}">
                    <td class="text-center fw-bold">${medal} ${p.kedudukan}</td>
                    <td>${p.nama}</td>
                    <td class="text-center"><span class="badge bg-light text-dark border text-uppercase">${p.idRumah || p.rumah}</span></td>
                    <td class="text-center fw-bold">
                        ${p.pencapaian}
                        ${p.isNewRecord ? '<br><span class="badge bg-danger" style="font-size:0.65rem">REKOD BARU</span>' : ''}
                    </td>
                </tr>`;
        });

        contentHtml += `</tbody></table></div></div>`;
    });

    container.innerHTML = dropdownHtml + contentHtml;
}

// Inisialisasi Penjanaan
janaKeputusanPenuh();