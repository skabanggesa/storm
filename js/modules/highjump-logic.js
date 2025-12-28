export const highJumpLogic = {
    // Dapatkan ketinggian terakhir yang berjaya dilepasi (O)
    getBestHeight(jumps) {
        // jumps = {"1.10": ["O"], "1.15": ["X", "O"], "1.20": ["X", "X", "X"]}
        const heights = Object.keys(jumps).filter(h => jumps[h].includes("O"));
        return heights.length > 0 ? Math.max(...heights.map(Number)) : 0;
    },

    // Kira jumlah kegagalan pada aras terakhir yang dicuba
    countFailuresAtLastHeight(jumps, bestHeight) {
        const nextHeight = Math.max(...Object.keys(jumps).map(Number));
        return jumps[nextHeight] ? jumps[nextHeight].filter(v => v === "X").length : 0;
    },

    rankHighJump(participants) {
        return participants
            .map(p => ({
                ...p,
                terbaik: this.getBestHeight(p.rekodLompatan),
                gagalArasTerakhir: this.countFailuresAtLastHeight(p.rekodLompatan)
            }))
            .sort((a, b) => {
                // 1. Banding ketinggian terbaik
                if (b.terbaik !== a.terbaik) return b.terbaik - a.terbaik;
                // 2. Jika sama, yang kurang gagal pada aras tersebut menang
                return a.gagalArasTerakhir - b.gagalArasTerakhir;
            })
            .map((p, index) => ({ ...p, kedudukan: index + 1 }));
    }
};