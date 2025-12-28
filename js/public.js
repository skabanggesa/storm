import { getLeaderboard } from './modules/scoring.js';

/**
 * MENGAMBIL TAHUN SECARA DINAMIK:
 * 1. Semak 'tahun_aktif' dalam sessionStorage (jika pengguna telah log masuk).
 * 2. Jika tiada (pelawat awam), gunakan tahun semasa dari sistem komputer.
 */
const tahunAktif = sessionStorage.getItem("tahun_aktif") || new Date().getFullYear().toString();

async function updateLiveScore() {
    const container = document.getElementById('leaderboard-container');
    
    // Paparkan indikator tahun di konsol untuk semakan pembangun
    console.log(`Memaparkan papan markah untuk tahun: ${tahunAktif}`);

    // Mengambil data leaderboard berdasarkan tahun yang dikesan
    const scores = await getLeaderboard(tahunAktif);

    if (scores.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center">
                <i class="bi bi-info-circle me-2"></i>
                Tiada data keputusan untuk tahun ${tahunAktif} buat masa ini.
            </div>`;
        return;
    }

    // Jana jadual kedudukan (Leaderboard)
    let html = `
        <table class="table table-hover text-center shadow-sm">
            <thead class="table-dark">
                <tr>
                    <th>KED</th>
                    <th>RUMAH SUKAN</th>
                    <th>MATA TERKUMPUL</th>
                </tr>
            </thead>
            <tbody>`;

    scores.forEach((rumah, index) => {
        // Warna sempadan mengikut tema rumah sukan
        html += `
            <tr style="border-left: 10px solid ${rumah.warna}">
                <td class="align-middle">${index + 1}</td>
                <td class="fw-bold align-middle text-uppercase">${rumah.nama}</td>
                <td class="h4 text-primary align-middle mb-0">${rumah.mataKeseluruhan}</td>
            </tr>`;
    });

    html += `</tbody></table>`;
    
    // Masukkan jadual ke dalam container HTML
    container.innerHTML = html;
}

// Jalankan fungsi serta-merta semasa halaman dimuatkan
updateLiveScore();

/**
 * KEMAS KINI AUTOMATIK (LIVE):
 * Menjalankan fungsi setiap 30 saat untuk memastikan markah sentiasa dikemaskini.
 */
setInterval(updateLiveScore, 30000);