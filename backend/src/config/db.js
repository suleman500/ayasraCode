const mongoose = require("mongoose");

async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  return mongoose.connection;
}

module.exports = { connectDB };
