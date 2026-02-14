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
 * 7. Initialize Kejohanan Tahun Baru (VERSI AUTO-GENERATE)
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

                // NOTA: Kita TIDAK mencipta saringan di sini.
                // Saringan hanya dijana melalui butang "Jana Saringan" (generateHeats).
            }
        }

        await batch.commit();
        console.log("--- SETUP SELESAI: STRUKTUR DATA DIJANA ---");
        return { success: true };
    } catch (e) {
        console.error("RALAT SETUP:", e);
        return { success: false, message: e.message };
    }
}

// =========================================================
// 8. FUNGSI JANA SARINGAN (VERSI PINTAR / SMART AUTO-DRAW)
// =========================================================
export async function generateHeats(tahun, eventId, maxLorong = 8) {
    console.log(`Menjana saringan untuk: ${eventId}`);

    try {
        const tStr = tahun.toString();

        // 1. Dapatkan info acara
        const eventRef = doc(db, "kejohanan", tStr, "acara", eventId);
        const eventSnap = await getDoc(eventRef);
        
        if (!eventSnap.exists()) throw new Error("Acara tidak dijumpai.");
        const eventData = eventSnap.data();
        
        const namaAcara = eventData.nama; 
        const kategori = eventData.kategori;

        // Tentukan Jenis Acara (PENTING UNTUK LOGIK AKHIR)
        const isRelay = namaAcara.toLowerCase().startsWith("4x");
        const isPadang = ACARA_PADANG.includes(namaAcara) || ACARA_KHAS.includes(namaAcara);

        // 2. Cari peserta yang daftar
        const pesertaRef = collection(db, "kejohanan", tStr, "peserta");
        const q = query(
            pesertaRef,
            where("kategori", "==", kategori),
            where("acaraDaftar", "array-contains", namaAcara)
        );

        const snapshot = await getDocs(q);
        let senaraiPeserta = [];
        snapshot.forEach(doc => {
            const p = doc.data();
            senaraiPeserta.push({
                idPeserta: doc.id,
                nama: p.nama,
                noBib: p.noBib || p.noBip || "-",
                idRumah: p.idRumah || p.rumah,
                sekolah: p.sekolah || "-" 
            });
        });

        if (senaraiPeserta.length === 0) {
            return { success: false, message: "Tiada peserta mendaftar untuk acara ini." };
        }

        // 3. Acak Peserta (Shuffle)
        senaraiPeserta = shuffleArray(senaraiPeserta);
        const jumlahPeserta = senaraiPeserta.length;

        // 4. LOGIK PENENTUAN: SARINGAN ATAU AKHIR?
        let isTerusAkhir = false;

        if (isPadang) {
            isTerusAkhir = true; // Acara padang sentiasa Akhir
        } else if (isRelay) {
            isTerusAkhir = jumlahPeserta <= 4; // Relay <= 4 pasukan -> Akhir
        } else {
            isTerusAkhir = jumlahPeserta <= 8; // Individu <= 8 orang -> Akhir
        }

        // 5. Bina Struktur Saringan / Akhir
        let heats = [];
        let jenisDokumen = isTerusAkhir ? "akhir" : "saringan";
        let statusAcara = isTerusAkhir ? "akhir" : "saringan";

        if (isTerusAkhir) {
            // --- SENARIO 1: ACARA AKHIR ---
            // Semua peserta masuk dalam satu kumpulan
            
            // Susun lorong/giliran
            const pesertaFinal = senaraiPeserta.map((p, index) => ({
                ...p,
                lorong: index + 1, 
                pencapaian: "",
                kedudukan: 0
            }));

            heats.push({
                noSaringan: 1,
                namaDokumen: "Saringan 1", // Kita kekalkan ID dokumen sebagai Saringan 1
                jenis: "akhir", // TAPI jenisnya adalah 'akhir' (UI akan baca ini)
                peserta: pesertaFinal
            });

        } else {
            // --- SENARIO 2: SARINGAN BIASA ---
            // Pecahkan ikut maxLorong (8)
            let currentHeat = 1;
            let tempPeserta = [...senaraiPeserta];

            while (tempPeserta.length > 0) {
                const chunk = tempPeserta.splice(0, maxLorong);
                
                const pesertaHeat = chunk.map((p, index) => ({
                    ...p,
                    lorong: index + 1,
                    pencapaian: "",
                    kedudukan: 0
                }));

                heats.push({
                    noSaringan: currentHeat,
                    namaDokumen: `Saringan ${currentHeat}`,
                    jenis: "saringan",
                    peserta: pesertaHeat
                });
                currentHeat++;
            }
        }

        // 6. Simpan ke Database (Batch Write)
        const batch = writeBatch(db);
        
        for (const heat of heats) {
            const heatRef = doc(db, "kejohanan", tStr, "acara", eventId, "saringan", heat.namaDokumen);
            batch.set(heatRef, {
                noSaringan: heat.noSaringan,
                peserta: heat.peserta,
                jenis: heat.jenis, // Field PENTING: UI akan baca ini untuk tulis "ACARA AKHIR"
                status: "sedia",
                tarikhJana: new Date()
            });
        }

        // Update status acara induk
        batch.update(eventRef, {
            jumlahPeserta: jumlahPeserta,
            jumlahSaringan: heats.length,
            status: statusAcara, // 'akhir' atau 'saringan'
            tarikhKemaskini: new Date()
        });

        await batch.commit();

        let mesej = isTerusAkhir 
            ? `Berjaya! ${jumlahPeserta} peserta disusun terus ke ACARA AKHIR.`
            : `Berjaya! ${jumlahPeserta} peserta disusun ke dalam ${heats.length} SARINGAN.`;

        return { success: true, message: mesej };

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
