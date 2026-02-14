export const highJumpLogic = {
    // 1. Dapatkan ketinggian terakhir yang berjaya dilepasi ('O' wujud)
    getBestHeight(jumps) {
        // Cth: jumps = {"1.10": ["O"], "1.15": ["X", "O"], "1.20": ["X", "X", "X"]}
        const heights = Object.keys(jumps).filter(h => jumps[h].includes("O"));
        return heights.length > 0 ? Math.max(...heights.map(Number)) : 0;
    },

    // 2. Kira jumlah kegagalan ('X') pada aras TERBAIK yang berjaya dilepasi
    countFailuresAtBestHeight(jumps, bestHeight) {
        if (bestHeight === 0) return 0;
        // Cari key string yang sepadan dengan bestHeight (cth: 1.15 sepadan dengan "1.15")
        const heightKey = Object.keys(jumps).find(h => Number(h) === bestHeight);
        if (!heightKey || !jumps[heightKey]) return 0;
        
        return jumps[heightKey].filter(v => v === "X").length;
    },

    // 3. Kira jumlah KESELURUHAN kegagalan ('X') sehingga aras terbaik
    countTotalFailures(jumps, bestHeight) {
        let totalX = 0;
        for (const h of Object.keys(jumps)) {
            // Hanya kira 'X' pada aras yang setara atau lebih rendah daripada aras terbaik
            if (Number(h) <= bestHeight) {
                totalX += jumps[h].filter(v => v === "X").length;
            }
        }
        return totalX;
    },

    // 4. Susun kedudukan mengikut format rasmi olahraga
    rankHighJump(participants) {
        // Langkah A: Kira semua statistik yang diperlukan untuk setiap peserta
        const pWithStats = participants.map(p => {
            const terbaik = this.getBestHeight(p.rekodLompatan);
            return {
                ...p,
                terbaik: terbaik,
                gagalArasTerbaik: this.countFailuresAtBestHeight(p.rekodLompatan, terbaik),
                jumlahGagalKeseluruhan: this.countTotalFailures(p.rekodLompatan, terbaik)
            };
        });

        // Langkah B: Sort (Susun) berdasarkan 3 Syarat Rasmi
        pWithStats.sort((a, b) => {
            // Syarat 1: Banding ketinggian terbaik (Lebih tinggi menang)
            if (b.terbaik !== a.terbaik) return b.terbaik - a.terbaik;
            
            // Syarat 2: Jika sama, kurang gagal ('X') pada aras TERBAIK menang
            if (a.gagalArasTerbaik !== b.gagalArasTerbaik) return a.gagalArasTerbaik - b.gagalArasTerbaik;

            // Syarat 3: Jika masih sama, jumlah 'X' KESELURUHAN paling sedikit menang
            if (a.jumlahGagalKeseluruhan !== b.jumlahGagalKeseluruhan) return a.jumlahGagalKeseluruhan - b.jumlahGagalKeseluruhan;

            // Jika masih sama kesemuanya, kekalkan kedudukan (seri)
            return 0;
        });

        // Langkah C: Agihkan nombor kedudukan (Sokongan sistem Tie / Seri)
        let currentRank = 1;
        return pWithStats.map((p, index, arr) => {
            if (index > 0) {
                const prev = arr[index - 1];
                // Semak sama ada markah betul-betul sama dengan peserta di atasnya
                const isTie = p.terbaik === prev.terbaik &&
                              p.gagalArasTerbaik === prev.gagalArasTerbaik &&
                              p.jumlahGagalKeseluruhan === prev.jumlahGagalKeseluruhan;
                
                // Jika tak seri, nombor kedudukan ikut susunan index semasa
                if (!isTie) {
                    currentRank = index + 1;
                }
            }
            return { ...p, kedudukan: currentRank };
        });
    }
};
