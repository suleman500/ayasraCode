const mongoose = require("mongoose");

// لاحقاً نضيف Project.js لحفظ المشاريع سحابياً لكل حساب
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 40 },
    passwordHash: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 },     // رفعه يُبطل كل الجلسات القديمة
    failedLogins: { type: Number, default: 0 },     // محاولات دخول خاطئة متتالية
    lockUntil: { type: Date, default: null },       // الحساب مقفل مؤقتاً حتى هذا الوقت
  },
  { timestamps: true }
);

userSchema.methods.isLocked = function isLocked() {
  return !!this.lockUntil && new Date(this.lockUntil).getTime() > Date.now();
};

// زيادة ذرّية لعدّاد الفشل، وقفل الحساب عند بلوغ الحد
userSchema.statics.recordFailure = async function recordFailure(user, maxFailures, minutes) {
  const u = await this.findOneAndUpdate({ _id: user._id }, { $inc: { failedLogins: 1 } }, { new: true });
  if (u && u.failedLogins >= maxFailures) {
    await this.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() + minutes * 60000), failedLogins: 0 } });
  }
};

userSchema.statics.recordSuccess = function recordSuccess(user) {
  return this.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockUntil: null } });
};

// إبطال كل الجلسات (خروج من كل الأجهزة)
userSchema.statics.revokeSessions = function revokeSessions(id) {
  return this.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
};

module.exports = mongoose.model("User", userSchema);
