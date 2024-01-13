const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;
require("dotenv").config();

// middlewares
app.use(cors());
app.use(express.json());

// Verify JWT Token Middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DATABASE_USER}:${process.env.DATABASE_PASS}@cluster0.5732rtt.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const ubJewellersDB = client.db("ubJewellersDB");
    const productCollection = ubJewellersDB.collection("products");
    const reviewCollection = ubJewellersDB.collection("reviews");

    // generate JWT Token related api
    app.post("/jwt", async (req, res) => {
      const userEmailObj = req.body;

      const token = jwt.sign(userEmailObj, process.env.JWT_SECRET_KEY, {
        expiresIn: "2h",
      });

      res.send({ token });
    });

    // PRODUCTS GET METHOD
    app.get("/products", async (req, res) => {
      // search  query
      const productSearchText = req.query?.searchText;

      if (productSearchText === "") {
        return res.send([]);
      }

      if (productSearchText) {
        const result = await productCollection
          .find({
            $or: [
              { name: { $regex: productSearchText, $options: "i" } },
              { category: { $regex: productSearchText, $options: "i" } },
            ],
          })
          .toArray();
        return res.send(result);
      }
      const result = await productCollection.find({}).toArray();
      res.send(result);
    });

    app.get("/products/category/:category", async (req, res) => {
      const category = req.params?.category.toLowerCase();

      if (category === "all") {
        const result = await productCollection.find({}).toArray();
        return res.send(result);
      }
      const result = await productCollection
        .find({ category: { $regex: category, $options: "i" } })
        .toArray();
      res.send(result);
    });

    // ALL REVIEWS GET METHOD
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find({}).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("UB-Jewellers Server is up and running!");
});

app.listen(port, () => {
  console.log("ub-jewellers server is running on port:", port);
});
