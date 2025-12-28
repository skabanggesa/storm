import { db } from '../firebase-config.js';
import { 
    doc, 
    updateDoc, 
    increment, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

/**
 * Skema Mata Standar:
 * No 1: 6 Mata
 * No 2: 4 Mata
 * No 3: 2 Mata
 * No 4: 1 Mata
 */
const MATA_PEMENANG = {
    1: 6,
    2: 4,
    3: 2,
    4: 1
};

/**
 * FUNGSI 1: Kemas kini jumlah mata terkumpul Rumah Sukan secara atomik
 */
async function updateHouseTotal(tahun, idRumah, mata) {
    try {
        const rumahRef = doc(db, "kejohanan", tahun, "rumahSukan", idRumah);
        await updateDoc(rumahRef, {
            mataKeseluruhan: increment(mata) // Guna increment untuk elak ralat data serentak
        });
    } catch (e) {
        console.error(`Gagal kemas kini mata rumah ${idRumah}:`, e);
    }
}

/**
 * FUNGSI 2: Sahkan Keputusan Akhir & Agih Mata
 * Digunakan untuk Balapan, Padang, dan Lompat Tinggi
 */
export async function finalizeEventResults(tahun, eventId, senaraiKeputusan) {
    /**
     * senaraiKeputusan dijangka dalam format array yang sudah disusun mengikut kedudukan:
     * [
     * { idPeserta: '...', idRumah: 'merah', kedudukan: 1, catatan: '12.5s' },
     * { idPeserta: '...', idRumah: 'biru', kedudukan: 2, catatan: '12.8s' },
     * ...
     * ]
     */
    try {
        const acaraDocRef = doc(db, "kejohanan", tahun, "acara", eventId);
        
        // 1. Simpan keputusan ke dalam dokumen acara
        await updateDoc(acaraDocRef, {
            keputusanRasmi: senaraiKeputusan,
            status: "selesai", // Tukar status supaya tidak boleh diubah lagi
            tarikhSelesai: new Date()
        });

        // 2. Proses agihan mata berdasarkan kedudukan
        const janjiMata = senaraiKeputusan.map(res => {
            const mataDapat = MATA_PEMENANG[res.kedudukan] || 0;
            if (mataDapat > 0) {
                // Panggil fungsi kemas kini mata rumah
                return updateHouseTotal(tahun, res.idRumah, mataDapat);
            }
            return Promise.resolve();
        });

        await Promise.all(janjiMata);

        console.log("Mata telah berjaya diagihkan ke semua rumah sukan!");
        return { success: true };

    } catch (e) {
        console.error("Ralat finalizeEventResults:", e);
        return { success: false, message: e.message };
    }
}

/**
 * FUNGSI 3: Ambil Papan Markah (Leaderboard)
 * Digunakan untuk paparan Live di skrin besar/utama
 */
export async function getLeaderboard(tahun) {
    try {
        const rumahSukanRef = collection(db, "kejohanan", tahun, "rumahSukan");
        const querySnapshot = await getDocs(rumahSukanRef);
        
        let scores = [];
        querySnapshot.forEach((doc) => {
            scores.push({ id: doc.id, ...doc.data() });
        });

        // Susun rumah dari mata tertinggi ke terendah
        return scores.sort((a, b) => b.mataKeseluruhan - a.mataKeseluruhan);
    } catch (e) {
        console.error("Ralat mengambil leaderboard:", e);
        return [];
    }
}