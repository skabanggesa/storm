import { db } from '../firebase-config.js';
import { 
    doc, 
    setDoc, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc,
    getDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- KONSTANTA SISTEM ---
export const KATEGORI = ["L7", "L8", "L9", "L10", "L11", "L12", "P7", "P8", "P9", "P10", "P11", "P12"];
export const ACARA_BALAPAN = ["100m", "200m", "4x100m", "100m Berpagar", "4x200m"]; 
export const ACARA_PADANG = ["Lompat Jauh", "Lontar Peluru"];
export const ACARA_KHAS = ["Lompat Tinggi"];

/**
 * 1. Ambil Rekod Kejohanan
 */
export async function getEventRecord(namaAcara, kategori) {
    try {
        const recordId = `${namaAcara}_${kategori}`;
        const ref = doc(db, "rekod", recordId);
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error("Ralat ambil rekod:", e);
        return null;
    }
}

/**
 * 2. Simpan Rekod Secara Pukal
 */
export async function saveBulkRecords(recordsArray) {
    try {
        const batch = writeBatch(db);
        recordsArray.forEach(rec => {
            const id = `${rec.acara}_${rec.kategori}`;
            const ref = doc(db, "rekod", id);
            batch.set(ref, {
                ...rec,
                tarikhKemaskini: new Date()
            });
        });
        await batch.commit();
        return { success: true };
    } catch (e) {
        console.error("Ralat simpan rekod pukal:", e);
        throw e;
    }
}

/**
 * 3. Ambil Senarai Acara
 */
export async function getEventsReadyForResults(tahun) {
    try {
        const tStr = tahun.toString();
        const ref = collection(db, "kejohanan", tStr, "acara");
        const snap = await getDocs(ref);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Ralat ambil senarai acara:", e);
        return [];
    }
}

/**
 * 4. Ambil Data Saringan
 */
export async function getHeatsData(tahun, eventId) {
    try {
        const tStr = tahun.toString();
        const ref = collection(db, "kejohanan", tStr, "acara", eventId, "saringan");
        const snapshot = await getDocs(ref);
        let heats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        return heats.sort((a, b) => a.noSaringan - b.noSaringan);
    } catch (e) { 
        console.error("Ralat ambil data saringan:", e);
        return []; 
    }
}

/**
 * 5. Simpan Keputusan Peserta
 */
export async function saveHeatResults(tahun, eventId, heatId, resultsData) {
    try {
        const tStr = tahun.toString();
        const ref = doc(db, "kejohanan", tStr, "acara", eventId, "saringan", heatId);
        await updateDoc(ref, {
            peserta: resultsData,
            status: "selesai",
            tarikhKemaskini: new Date()
        });
        return { success: true };
    } catch (e) { 
        console.error("Ralat simpan keputusan:", e);
        return { success: false, message: e.message }; 
    }
}

/**
 * 6. Ambil Detail Acara
 */
export async function getEventDetail(tahun, eventId) {
    try {
        const tStr = tahun.toString();
        const ref = doc(db, "kejohanan", tStr, "acara", eventId);
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        return null;
    }
}

/**
 * 7. Initialize Kejohanan Tahun Baru (VERSI AUTO-GENERATE - DIKEMASKINI)
 * Menjana rumah sukan dan acara SAHAJA. TIDAK menjana saringan.
 */
export async function initializeTournament(tahun) { 
    console.log("Memulakan inisialisasi automatik untuk tahun:", tahun);
    try {
        const tStr = tahun.toString();
        const batch = writeBatch(db);
        
        // 1. Cipta dokumen induk 'tahun'
        const yearRef = doc(db, "kejohanan", tStr);
        batch.set(yearRef, { 
            status: "aktif", 
            tarikhDicipta: new Date(),
            kemaskiniTerakhir: new Date()
        }, { merge: true });

        // 2. Cipta Sub-koleksi rumah_sukan
        const senaraiRumah = ["merah", "biru", "hijau", "kuning"];
        for (const id of senaraiRumah) {
            const rumahRef = doc(db, "kejohanan", tStr, "rumah", id);
            batch.set(rumahRef, {
                nama: id,
                kod: id.toUpperCase() + "123", 
                mataKeseluruhan: 0,
                tarikhDicipta: new Date()
            }, { merge: true });
        }

        // 3. Jana Senarai Acara Lengkap (Kategori x Acara)
        const semuaAcara = [...ACARA_BALAPAN, ...ACARA_PADANG, ...ACARA_KHAS];
        
        for (const kat of KATEGORI) {
            for (const namaAcara of semuaAcara) {
                // Bina ID unik: Contoh L12_100m
                const eventId = `${kat}_${namaAcara.replace(/\s+/g, '_')}`;
                const acaraRef = doc(db, "kejohanan", tStr, "acara", eventId);
                
                // Tentukan jenis acara untuk logik keputusan nanti
                let jenis = "BALAPAN";
                if (ACARA_PADANG.includes(namaAcara)) jenis = "PADANG";
                if (ACARA_KHAS.includes(namaAcara)) jenis = "KHAS";

                batch.set(acaraRef, { 
                    nama: namaAcara, 
                    kategori: kat,
                    tahun: tStr,
                    status: "buka", // Status 'buka' bermaksud sedia terima pendaftaran
                    jenis: jenis,
                    tarikhDicipta: new Date()
                });

                // PEMBETULAN:
                // Bahagian cipta "Saringan 1" telah DIPADAMKAN.
                // Saringan hanya akan wujud bila Admin tekan butang "Jana Saringan" nanti.
            }
        }

        await batch.commit();
        console.log("--- SETUP SELESAI: STRUKTUR DATA DIJANA (TANPA SARINGAN) ---");
        return { success: true };
    } catch (e) {
        console.error("RALAT SETUP:", e);
        return { success: false, message: e.message };
    }
}

// =========================================================
// TAMBAHAN: FUNGSI JANA SARINGAN (AUTO DRAW)
// =========================================================

/**
 * 8. Jana Saringan Automatik
 * @param {string} tahun - Tahun kejohanan (cth: "2026")
 * @param {string} eventId - ID dokumen acara (cth: "L8_100m")
 * @param {number} maxLorong - Jumlah lorong (default 8)
 */
export async function generateHeats(tahun, eventId, maxLorong = 8) {
    console.log(`Menjana saringan untuk: ${eventId}`);

    try {
        const tStr = tahun.toString();

        // 1. Dapatkan info acara (untuk tahu nama acara sebenar, cth: "100m")
        const eventRef = doc(db, "kejohanan", tStr, "acara", eventId);
        const eventSnap = await getDoc(eventRef);
        
        if (!eventSnap.exists()) throw new Error("Acara tidak dijumpai.");
        const eventData = eventSnap.data();
        
        const namaAcara = eventData.nama; // cth: "100m"
        const kategori = eventData.kategori; // cth: "L8"

        // 2. Cari semua peserta yang daftar acara ini + kategori ini
        const pesertaRef = collection(db, "kejohanan", tStr, "peserta");
        const q = query(
            pesertaRef,
            where("kategori", "==", kategori),
            where("acaraDaftar", "array-contains", namaAcara) // Cari dalam array
        );

        const snapshot = await getDocs(q);
        let senaraiPeserta = [];
        snapshot.forEach(doc => {
            const p = doc.data();
            senaraiPeserta.push({
                id: doc.id,
                nama: p.nama,
                noBib: p.noBib,
                rumah: p.rumah,
                sekolah: p.sekolah || "-" // Jika ada field sekolah
            });
        });

        // Jika tiada peserta
        if (senaraiPeserta.length === 0) {
            return { success: false, message: "Tiada peserta mendaftar untuk acara ini." };
        }

        // 3. Acak Peserta (Shuffle) supaya adil (Random Lane)
        senaraiPeserta = shuffleArray(senaraiPeserta);

        // 4. Bahagikan kepada saringan
        const jumlahPeserta = senaraiPeserta.length;
        let heats = [];
        
        // Logik mudah: Pecahkan ikut maxLorong
        // Contoh: 10 orang, max 8. -> Heat 1 (5 org), Heat 2 (5 org) atau Heat 1 (8), Heat 2 (2)
        // Di sini kita guna logik mudah: Penuhkan saringan 1 dulu.
        
        let currentHeat = 1;
        while (senaraiPeserta.length > 0) {
            // Ambil peserta seramai maxLorong
            const chunk = senaraiPeserta.splice(0, maxLorong);
            
            // Format peserta dengan nombor lorong
            const pesertaDenganLorong = chunk.map((p, index) => ({
                ...p,
                lorong: index + 1, // Lorong 1, 2, 3...
                masa: "", // Kosongkan untuk keputusan nanti
                kedudukan: 0,
                catatan: ""
            }));

            heats.push({
                noSaringan: currentHeat,
                namaSaringan: `Saringan ${currentHeat}`,
                peserta: pesertaDenganLorong
            });
            currentHeat++;
        }

        // 5. Simpan ke Database (Batch Write)
        const batch = writeBatch(db);

        // Padam saringan lama dulu (jika perlu) atau timpa sahaja
        // Kita loop array heats yang baru dijana
        for (const heat of heats) {
            const heatRef = doc(db, "kejohanan", tStr, "acara", eventId, "saringan", heat.namaSaringan);
            batch.set(heatRef, {
                noSaringan: heat.noSaringan,
                peserta: heat.peserta,
                status: "sedia", // Sedia untuk input keputusan
                tarikhJana: new Date()
            });
        }

        // Update status acara induk
        batch.update(eventRef, {
            jumlahPeserta: jumlahPeserta,
            jumlahSaringan: heats.length,
            status: "berlangsung" // Tukar status kepada berlangsung
        });

        await batch.commit();

        return { success: true, message: `${jumlahPeserta} peserta berjaya disusun dalam ${heats.length} saringan.` };

    } catch (error) {
        console.error("Ralat Jana Saringan:", error);
        return { success: false, message: error.message };
    }
}

// Helper: Fisher-Yates Shuffle
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
