const mongoose = require('mongoose');

let connecting = null;

const isLambda = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    if (!isLambda()) process.exit(1);
    return null;
  }

  connecting = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 10000 })
    .then((conn) => {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      connecting = null;
      return conn;
    })
    .catch((error) => {
      connecting = null;
      console.error('MongoDB connection error:', error.message);
      if (!isLambda()) process.exit(1);
      return null;
    });

  return connecting;
};

module.exports = connectDB;
