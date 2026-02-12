// Import fungsi Firebase yang diperlukan
import { db } from '../firebase-config.js'; 
import { 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, // <--- Pastikan ini ada
    getDocs, 
    query, 
    where,
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================
// 1. DAFTAR PESERTA BARU
// =========================================================
export async function registerParticipant(tahun, data) {
    try {
        // Gunakan No Kad Pengenalan atau Gabungan Unik sebagai ID Dokumen
        // Jika tiada ID unik, biarkan Firestore generate (tapi lebih baik custom ID untuk elak duplikasi)
        // Di sini kita guna auto-generate ID oleh Firestore melalui doc() collection reference
        
        const pesertaRef = doc(collection(db, "sukantara", tahun, "peserta"));
        
        // Masukkan ID dokumen ke dalam data supaya senang dirujuk nanti
        const dataLengkap = {
            ...data,
            id: pesertaRef.id
        };

        await setDoc(pesertaRef, dataLengkap);
        return { success: true, id: pesertaRef.id };

    } catch (error) {
        console.error("Ralat Mendaftar:", error);
        throw new Error("Gagal mendaftar peserta. Sila cuba lagi.");
    }
}

// =========================================================
// 2. KEMASKINI DATA PESERTA
// =========================================================
export async function updateParticipant(tahun, docId, data) {
    try {
        const pesertaRef = doc(db, "sukantara", tahun, "peserta", docId);
        await updateDoc(pesertaRef, data);
        return { success: true };
    } catch (error) {
        console.error("Ralat Kemaskini:", error);
        throw new Error("Gagal mengemaskini data.");
    }
}

// =========================================================
// 3. PADAM PESERTA (FUNGSI YANG HILANG SEBELUM INI)
// =========================================================
export async function deleteParticipant(tahun, docId) {
    try {
        const pesertaRef = doc(db, "sukantara", tahun, "peserta", docId);
        await deleteDoc(pesertaRef);
        return { success: true };
    } catch (error) {
        console.error("Ralat Padam:", error);
        throw new Error("Gagal memadam peserta.");
    }
}

// =========================================================
// 4. DAPATKAN SENARAI ACARA IKUT KATEGORI
// =========================================================
export async function getEventsByCategory(tahun, kategori) {
    try {
        // Logik: Acara disimpan dalam collection 'acara'
        // Struktur: sukantara/{tahun}/acara
        // Kita filter di Client-side atau query mudah
        
        const q = query(collection(db, "sukantara", tahun, "acara"));
        const snapshot = await getDocs(q);
        
        let events = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Tapis sama ada kategori ini layak (L18, P15 dll)
            // Andaikan dalam DB ada array 'kategoriLayak' atau string
            // Jika data acara simple, kita ambil semua dan filter
            
            // CONTOH MUDAH: Ambil semua acara, nanti filter manual jika perlu
            // ATAU: Pastikan DB acara ada field 'kategori' array
            events.push({ id: doc.id, ...data });
        });

        return events;

    } catch (error) {
        console.error("Ralat Acara:", error);
        throw new Error("Gagal memuatkan senarai acara.");
    }
}

// =========================================================
// 5. DAPATKAN PESERTA YANG SUDAH DAFTAR (FILTER RUMAH)
// =========================================================
export async function getRegisteredParticipants(tahun, idRumah) {
    try {
        const q = query(
            collection(db, "sukantara", tahun, "peserta"),
            where("idRumah", "==", idRumah)
        );

        const snapshot = await getDocs(q);
        let list = [];
        
        snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() });
        });

        return list;

    } catch (error) {
        console.error("Ralat Senarai Peserta:", error);
        throw new Error("Gagal mendapatkan senarai peserta.");
    }
}
