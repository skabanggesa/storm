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
