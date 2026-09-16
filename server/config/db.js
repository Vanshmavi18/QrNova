const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let isConnected = false;
let retryTimer = null;

// Ensure local persistence directory exists for hybrid reliability
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qrnova';
  
  const options = {
    serverSelectionTimeoutMS: 5000,
    dbName: 'qrnova',
  };

  try {
    const conn = await mongoose.connect(uri, options);
    isConnected = true;
    console.log(`\n==================================================`);
    console.log(`✅ MongoDB Atlas Connected Successfully!`);
    console.log(`🍃 Database: ${conn.connection.name} @ ${conn.connection.host}`);
    console.log(`==================================================\n`);
    if (retryTimer) clearInterval(retryTimer);
  } catch (error) {
    isConnected = false;
    console.warn(`\n⚠️ MongoDB Atlas Connection Notice:`);
    console.warn(`   Could not connect: ${error.message}`);
    if (error.message.includes('whitelisted') || error.message.includes('Could not connect to any servers')) {
      console.log(`\n👉 ACTION REQUIRED IN MONGODB ATLAS:`);
      console.log(`   1. Go to https://cloud.mongodb.com`);
      console.log(`   2. In the left menu, click 'Network Access'`);
      console.log(`   3. Click 'Add IP Address'`);
      console.log(`   4. Select 'Allow Access From Anywhere' (0.0.0.0/0) or add your current IP`);
      console.log(`   5. Click 'Confirm' (The server will automatically connect within seconds!)\n`);
    }

    // Auto-retry connection every 15 seconds so user doesn't need to restart the server!
    if (!retryTimer) {
      retryTimer = setInterval(() => {
        if (!isConnected) {
          console.log('🔄 Retrying MongoDB Atlas connection...');
          mongoose.connect(uri, options)
            .then((conn) => {
              isConnected = true;
              clearInterval(retryTimer);
              console.log(`\n✅ MongoDB Atlas Reconnected Successfully: ${conn.connection.host}/${conn.connection.name}`);
            })
            .catch(() => {});
        }
      }, 15000);
    }
  }
};

module.exports = {
  connectDB,
  isDbConnected: () => isConnected,
};
