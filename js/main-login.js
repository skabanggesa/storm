import { db } from './firebase-config.js';
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// Kod rahsia untuk Admin
const MASTER_ADMIN_CODE = "KOTADMIN2025";

const loginForm = document.getElementById('login-form');
const loginMsg = document.getElementById('login-msg');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Ambil nilai input dari borang
        const tahun = document.getElementById('login-tahun').value.toString();
        const role = document.getElementById('login-role').value;
        const kodInput = document.getElementById('login-kod').value.trim();
        const idRumah = document.getElementById('login-rumah').value;
        const btnLogin = document.getElementById('btn-login');

        // Reset mesej ralat
        loginMsg.innerHTML = "";

        // --- 2. LOGIK KHAS: PENGGUNA AWAM ---
        if (role === 'awam') {
            // Pengguna awam tidak memerlukan pengesahan Firebase
            sessionStorage.setItem("user_role", "awam");
            sessionStorage.setItem("tahun_aktif", tahun);
            
            // Terus ke halaman keputusan
            window.location.href = "keputusan.html";
            return;
        }

        // --- 3. VALIDASI KOD UNTUK ADMIN/GURU ---
        if (!kodInput) {
            tunjukkanRalat("Sila masukkan kod akses!");
            return;
        }

        // Tunjukkan status loading
        const originalBtnText = btnLogin.innerHTML;
        btnLogin.disabled = true;
        btnLogin.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Menyemak...`;

        try {
            if (role === 'admin') {
                // --- LOGIK LOGIN ADMIN ---
                if (kodInput === MASTER_ADMIN_CODE) {
                    sessionStorage.setItem("user_role", "admin");
                    sessionStorage.setItem("tahun_aktif", tahun);
                    
                    window.location.href = "admin.html";
                } else {
                    tunjukkanRalat("Kata Laluan Admin Salah!");
                }
            } 
            else if (role === 'guru') {
                // --- LOGIK LOGIN GURU RUMAH ---
                const rumahIdUpper = idRumah.toLowerCase();
                const rumahRef = doc(db, "kejohanan", tahun, "rumah", rumahIdUpper);
                const rumahSnap = await getDoc(rumahRef);

                if (rumahSnap.exists()) {
                    const dataRumah = rumahSnap.data();
                    
                    // Semak kod akses rumah
                    if (dataRumah.kod && dataRumah.kod.toUpperCase() === kodInput.toUpperCase()) {
                        // Simpan maklumat sesi (Guna snake_case untuk konsistensi)
                        sessionStorage.setItem("user_role", "guru");
                        sessionStorage.setItem("tahun_aktif", tahun);
                        sessionStorage.setItem("user_rumah", rumahIdUpper);
                        sessionStorage.setItem("nama_rumah", dataRumah.nama || rumahIdUpper);

                        console.log("Login Guru sukses.");
                        window.location.href = "guru.html";
                    } else {
                        tunjukkanRalat("Kod Akses Rumah Salah!");
                    }
                } else {
                    tunjukkanRalat(`Data Tahun ${tahun} tidak dijumpai. Sila hubungi Admin.`);
                }
            }
        } catch (error) {
            console.error("Ralat Log Masuk:", error);
            tunjukkanRalat("Ralat sistem: " + error.message);
        } finally {
            // Pulihkan butang jika ada ralat (jika sukses, page sudah bertukar)
            if (btnLogin) {
                btnLogin.disabled = false;
                btnLogin.innerHTML = originalBtnText;
            }
        }
    });
}

/**
 * Fungsi untuk memaparkan mesej ralat di UI
 */
function tunjukkanRalat(mesej) {
    if (loginMsg) {
        loginMsg.innerHTML = `
            <div class="alert alert-danger py-2 mb-0">
                <i class="bi bi-exclamation-triangle-fill me-2"></i> ${mesej}
            </div>`;
    }
}