import { db } from '../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

export async function validateAccessCode(tahun, kodInput) {
    try {
        // Cari dalam sub-koleksi rumahSukan bagi tahun spesifik
        const rumahRef = collection(db, "kejohanan", tahun, "rumahSukan");
        const q = query(rumahRef, where("kodAkses", "==", kodInput));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Kod betul, ambil data rumah sukan
            let dataRumah = {};
            querySnapshot.forEach((doc) => {
                dataRumah = { id: doc.id, ...doc.data() };
            });
            
            // Simpan dalam Session Storage supaya guru tak perlu login semula
            sessionStorage.setItem("guru_rumah", JSON.stringify(dataRumah));
            sessionStorage.setItem("tahun_aktif", tahun);
            
            return { success: true, data: dataRumah };
        } else {
            return { success: false, message: "Kod Akses Salah atau Tahun Tidak Sah!" };
        }
    } catch (e) {
        console.error("Ralat pengesahan kod: ", e);
        return { success: false, message: "Ralat teknikal berlaku." };
    }
}