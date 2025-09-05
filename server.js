const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const userRoutes = require("./routes/userRoute");
const cors = require("cors");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/user", userRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT, () =>
      console.log(`Server on port ${process.env.PORT}`)
    );
  })
  .catch((err) => console.error("DB error:", err));
