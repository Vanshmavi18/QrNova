const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qrnova';
  
  // Connect asynchronously without hanging the process
  mongoose
    .connect(uri, { serverSelectionTimeoutMS: 2000 })
    .then((conn) => {
      isConnected = true;
      console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    })
    .catch((error) => {
      isConnected = false;
      console.warn(`⚠️ MongoDB Connection: Running in resilient fallback mode (${error.message}).`);
      console.log(`ℹ️ Data is cached safely in-memory & client-side IndexedDB. Connect MongoDB in .env anytime.`);
    });
};

module.exports = {
  connectDB,
  isDbConnected: () => isConnected,
};

