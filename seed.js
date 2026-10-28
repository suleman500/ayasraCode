// تشغيل مرة واحدة لإنشاء الحساب:  npm run seed
// يقرأ ADMIN_USER و ADMIN_PASS من متغيرات البيئة. لو الحساب موجود يحدّث كلمة مروره (مفيد عند النسيان).
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

(async () => {
  const { MONGODB_URI, ADMIN_USER, ADMIN_PASS } = process.env;
  if (!MONGODB_URI || !ADMIN_USER || !ADMIN_PASS) {
    console.error("لازم تضبط MONGODB_URI و ADMIN_USER و ADMIN_PASS");
    process.exit(1);
  }
  if (ADMIN_PASS.length < 8) { console.error("كلمة المرور لازم 8 أحرف على الأقل"); process.exit(1); }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const username = ADMIN_USER.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
  const existing = await User.findOne({ username });
  if (existing) {
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`الحساب "${username}" موجود: تم تحديث كلمة المرور.`);
  } else {
    await User.create({ username, passwordHash });
    console.log(`تم إنشاء الحساب "${username}".`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error("فشل:", e.message); process.exit(1); });
