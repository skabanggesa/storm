import { db } from '../firebase-config.js';
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    doc, 
    getDoc,
    addDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

/**
 * Fungsi utiliti untuk mengocok (shuffle) senarai peserta atau pasukan secara rawak.
 * Memastikan agihan lorong adalah adil dan tidak mengikut urutan pendaftaran.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * FUNGSI UTAMA: Jana Saringan atau Terus ke Akhir
 * Menguruskan pembahagian peserta (individu) atau pasukan (relay) ke lorong balapan.
 */
export async function generateHeats(tahun, eventId) {
    try {
        // 1. Ambil butiran acara untuk menyemak sama ada ia acara Berpasukan (4x)
        const eventRef = doc(db, "kejohanan", tahun, "acara", eventId);
        const eventSnap = await getDoc(eventRef);
        
        if (!eventSnap.exists()) throw new Error("Acara tidak dijumpai.");
        const eventData = eventSnap.data();
        const isRelay = eventData.nama.toLowerCase().startsWith("4x");

        // 2. Ambil semua peserta yang mendaftar untuk acara ini
        const pesertaRef = collection(db, "kejohanan", tahun, "peserta");
        const q = query(pesertaRef, where("acaraDaftar", "array-contains", eventId));
        const querySnapshot = await getDocs(q);
        
        let senaraiPesertaRaw = [];
        querySnapshot.forEach((doc) => {
            senaraiPesertaRaw.push({ id: doc.id, ...doc.data() });
        });

        if (senaraiPesertaRaw.length === 0) {
            return { success: false, message: "Tiada peserta didaftarkan untuk acara ini." };
        }

        let senaraiTandingan = [];

        // 3. LOGIK PENGUMPULAN (INDIVIDU VS PASUKAN)
        if (isRelay) {
            // Jika Lari Berganti-ganti: Kumpulkan peserta mengikut rumah
            const groupRumah = senaraiPesertaRaw.reduce((acc, p) => {
                const rumahId = p.idRumah || p.rumah;
                if (!acc[rumahId]) acc[rumahId] = [];
                acc[rumahId].push(p.nama);
                return acc;
            }, {});

            // Tukar kumpulan rumah menjadi entri pasukan tunggal
            senaraiTandingan = Object.keys(groupRumah).map(rId => ({
                idRumah: rId,
                nama: `Rumah ${rId.toUpperCase()} (${groupRumah[rId].join(', ')})`,
                isPasukan: true
            }));
        } else {
            // Jika Acara Individu: Gunakan senarai asal
            senaraiTandingan = senaraiPesertaRaw.map(p => ({
                idPeserta: p.id,
                nama: p.nama,
                idRumah: p.idRumah || p.rumah,
                isPasukan: false
            }));
        }

        // 4. Rawakkan urutan untuk agihan lorong
        senaraiTandingan = shuffleArray(senaraiTandingan);
        const jumlahEntri = senaraiTandingan.length;
        
        // 5. Tentukan Status: Saringan atau Terus ke Akhir
        // Biasanya 4x100m hanya ada 4 rumah, maka ia akan sentiasa jadi 'akhir'
        const isTerusAkhir = jumlahEntri <= 8;
        const statusBaru = isTerusAkhir ? "akhir" : "saringan";
        const jenisDokumen = isTerusAkhir ? "akhir" : "saringan";
        
        const jumlahKumpulan = Math.ceil(jumlahEntri / 8);
        const saringanRef = collection(db, "kejohanan", tahun, "acara", eventId, "saringan");

        // 6. Simpan dokumen Saringan/Akhir ke Firestore
        for (let i = 0; i < jumlahKumpulan; i++) {
            const mula = i * 8;
            const tamat = mula + 8;
            const entriKumpulan = senaraiTandingan.slice(mula, tamat);

            const dataLorong = entriKumpulan.map((e, index) => ({
                idPeserta: e.idPeserta || null,
                idRumah: e.idRumah,
                nama: e.nama,
                lorong: index + 1,
                pencapaian: "",
                status: "menunggu",
                isPasukan: e.isPasukan
            }));

            await addDoc(saringanRef, {
                noSaringan: i + 1,
                peserta: dataLorong,
                status: "aktif",
                jenis: jenisDokumen,
                tarikhJana: new Date()
            });
        }

        // 7. Kemaskini status acara utama
        await updateDoc(eventRef, {
            status: statusBaru,
            infoJanaan: {
                totalEntri: jumlahEntri,
                jenisTandingan: isRelay ? "pasukan" : "individu",
                tarikh: new Date()
            }
        });

        return { 
            success: true, 
            status: statusBaru, 
            jumlahSaringan: jumlahKumpulan 
        };

    } catch (e) {
        console.error("Ralat dalam generateHeats:", e);
        return { success: false, message: e.message };
    }
}

/**
 * FUNGSI 2: Promote ke Akhir
 * Digunakan untuk membawa pemenang saringan ke peringkat akhir (hanya untuk individu).
 */
export async function promoteToFinal(tahun, eventId) {
    try {
        const saringanRef = collection(db, "kejohanan", tahun, "acara", eventId, "saringan");
        const q = query(saringanRef, where("jenis", "==", "saringan"), where("status", "==", "selesai"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return { success: false, message: "Keputusan saringan belum lengkap atau semua saringan belum selesai." };
        }

        let senaraiLayak = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.peserta.forEach(p => {
                if (p.pencapaian) {
                    senaraiLayak.push({ ...p, saringanAsal: data.noSaringan });
                }
            });
        });

        // Susun berdasarkan pencapaian (andaikan masa: paling rendah adalah terbaik)
        senaraiLayak.sort((a, b) => parseFloat(a.pencapaian) - parseFloat(b.pencapaian));
        
        const lapanTerbaik = senaraiLayak.slice(0, 8).map((p, idx) => ({
            ...p,
            lorong: idx + 1,
            pencapaian: "",
            status: "menunggu"
        }));

        await addDoc(saringanRef, {
            noSaringan: 1,
            peserta: lapanTerbaik,
            status: "aktif",
            jenis: "akhir",
            tarikhJana: new Date()
        });

        await updateDoc(doc(db, "kejohanan", tahun, "acara", eventId), {
            status: "akhir"
        });

        return { success: true };
    } catch (e) {
        console.error("Ralat promoteToFinal:", e);
        return { success: false, message: e.message };
    }
}