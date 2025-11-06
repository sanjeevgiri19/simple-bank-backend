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
const PORT=5000

    // "mongodb+srv://girisanjib191_db_user:2gvBzXgR4jy7L5VA@clusterwow.axae718.mongodb.net/?appName=Clusterwow"
    // "mongodb+srv://projectbank_db_user:ClfwhRT3svMumg7y@cluster0.kqlv90f.mongodb.net/?appName=Cluster0"
mongoose
  .connect(
      "mongodb+srv://subekshyasapkota686_db_user:utUGQO3tYrvgFCW6@bank.nt6ah60.mongodb.net/?appName=Bank"
  )
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server on port ${PORT} running`));
  })
  .catch((err) => console.error("DB error:", err));
