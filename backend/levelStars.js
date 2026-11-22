// backend/levelStars.js
// LEVEL RULE (sirf 2 source):
//   1) Recharge ke stars   2) Admin ke diye stars
// Inhe kharch karne par hi totalSpent (aur level) badhta hai.
// Convert (TK se aaye), reward, game ke stars kharch karne par level NAHI badhta.
// wallets/{uid}.levelStars = abhi bache hue "level wale" stars.
// Mixed balance me pehle level wale stars kharch hote hain.

// Transaction ke andar, SAARE reads ke time call karo (writes se pehle).
// wallet me levelStars field ho to wahi; na ho (purana user) to purchaseHistory se ek baar nikalta hai.
async function readLevelStars(tx, walletRef, wData) {
  const d = wData || {};
  if (d.levelStars !== undefined && d.levelStars !== null) {
    // balance se zyada nahi (game me haare / nikale gaye stars level wale nahi rehte)
    return Math.max(0, Math.min(Number(d.levelStars) || 0, Number(d.stars) || 0));
  }
  const hs = await tx.get(walletRef.collection("purchaseHistory"));
  let total = 0;
  hs.forEach((h) => {
    const x = h.data() || {};
    const pid = String(x.paymentId || "");
    if (x.status !== "Completed" && x.status !== "Approved") return;
    if (pid.startsWith("REWARD_")) return;
    total += Number(x.stars) || 0;
  });
  const spent = Number(d.totalSpent) || 0;
  const stars = Number(d.stars) || 0;
  return Math.max(0, Math.min(total - spent, stars));
}

// amount kharch hua -> wallet update fields
function spendFields(FieldValue, levelStars, amount) {
  const use = Math.max(0, Math.min(amount, levelStars));
  return {
    stars: FieldValue.increment(-amount),
    totalSpent: FieldValue.increment(use),
    levelStars: Math.max(0, levelStars - use),
  };
}

module.exports = { readLevelStars, spendFields };
