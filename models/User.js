const mongoose = require("mongoose");

// لاحقاً نضيف هنا حقول المشاريع (projects) لحفظها سحابياً لكل حساب
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 40 },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
