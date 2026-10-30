// تشغيل مرة واحدة لإنشاء الحساب:  npm run seed   (من مجلد backend)
// يقرأ ADMIN_USER و ADMIN_PASS من متغيرات البيئة.
// لو الحساب موجود: يحدّث كلمة المرور، ويفكّ القفل، ويُبطل كل الجلسات القديمة.
const config = require("./src/config/env");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");

(async () => {
  const { ADMIN_USER, ADMIN_PASS } = process.env;
  if (!config.mongoUri || !ADMIN_USER || !ADMIN_PASS) {
    console.error("لازم تضبط MONGODB_URI و ADMIN_USER و ADMIN_PASS");
    process.exit(1);
  }
  if (ADMIN_PASS.length < 8) { console.error("كلمة المرور لازم 8 أحرف على الأقل"); process.exit(1); }

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const username = ADMIN_USER.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
  const existing = await User.findOne({ username });
  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      { $set: { passwordHash, failedLogins: 0, lockUntil: null }, $inc: { tokenVersion: 1 } }
    );
    console.log(`الحساب "${username}" موجود: تم تحديث كلمة المرور وفكّ القفل وإنهاء كل الجلسات القديمة.`);
  } else {
    await User.create({ username, passwordHash });
    console.log(`تم إنشاء الحساب "${username}".`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error("فشل:", e.message); process.exit(1); });
