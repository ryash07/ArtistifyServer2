const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
require("dotenv").config();
const CryptoJS = require("crypto-js");
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_SECRET_KEY);

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
    const userCollection = ubJewellersDB.collection("users");
    const productCollection = ubJewellersDB.collection("products");
    const reviewCollection = ubJewellersDB.collection("reviews");
    const navNotificationCollection =
      ubJewellersDB.collection("navNotifications");
    const categoryCollection = ubJewellersDB.collection("categories");
    const cartCollection = ubJewellersDB.collection("cart");
    const wishlistCollection = ubJewellersDB.collection("wishlist");
    const orderCollection = ubJewellersDB.collection("orders");

    // generate JWT Token related api
    app.post("/jwt", async (req, res) => {
      const userEmailObj = req.body;

      const token = jwt.sign(userEmailObj, process.env.JWT_SECRET_KEY, {
        expiresIn: "2h",
      });

      res.send({ token });
    });

    // USERS RELATED API
    app.get("/user", async (req, res) => {
      const email = req.query.email;
      const result = await userCollection.findOne({ email: email });
      res.send(result);
    });

    app.patch("/update-user", async (req, res) => {
      const email = req.query.email;
      const { fullName, mobileNumber, dob, gender, location } = req.body;
      const filter = { email: email };

      const updatedDoc = {
        $set: {
          name: fullName,
          mobileNumber,
          dob,
          gender,
          location,
        },
      };

      const options = { upsert: true };

      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );

      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const userExists = await userCollection.findOne({ email: user?.email });

      if (userExists) {
        return res.send({ error: true, message: "user already exists" });
      }

      // add createdAt key to user obj
      user.createdAt = new Date();
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // add user's addresses
    app.patch("/users/shipping-address", async (req, res) => {
      const email = req.query.email;
      const body = req.body;
      const filter = { email: email };

      const updatedDoc = {
        $set: {
          shippingAddress: body,
        },
      };

      const options = { upsert: true };

      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // delete user's shipping address
    app.patch("/users/delete-address", async (req, res) => {
      const email = req.query.email;
      const filter = { email: email };
      const updatedDoc = {
        $unset: {
          shippingAddress: null,
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // NAV NOTIFICATIONS GET METHOD
    app.post("/nav-notifications", async (req, res) => {
      const notificationArr = [
        "Flash Sale Going On Till 5th January!",
        "Discount up to 35% for first purchase only this month.",
        "Free Shipping! First in Town.",
        "Exclusive prices only for the month",
        "Black Friday Coming. Hurry Up!",
        "Best offers every week! 40% Off!",
      ];

      for (const notification of notificationArr) {
        // creating hash to uniquely identify notifications
        const notificationHash = CryptoJS.MD5(notification).toString();

        const existingNotification = await navNotificationCollection.findOne({
          notificationHash,
        });
        if (!existingNotification) {
          const today = new Date();
          const expireAt = new Date(today);
          expireAt.setMonth(expireAt.getMonth() + 2);

          const newNotification = {
            notificationHash,
            notification,
            createdAt: today,
            expireAt,
          };

          await navNotificationCollection.insertOne(newNotification);
        }
      }

      res.send({ success: true });
    });

    app.get("/nav-notifications", async (req, res) => {
      const result = await navNotificationCollection.find({}).toArray();
      res.send(result);
    });

    // PRODUCTS RELATED GET METHOD
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

    app.get("/single-product/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const result = await productCollection.findOne(filter);
      result.review.sort(
        (a, b) => new Date(b.reviewDate) - new Date(a.reviewDate)
      );

      res.send(result);
    });

    // filter by category, price, sortOrder size, carate, search
    app.get("/products/filter", async (req, res) => {
      const category = req.query?.category?.toLowerCase() || "all";
      const minPrice = parseFloat(req.query?.minPrice) || 0;
      const maxPrice =
        parseFloat(req.query?.maxPrice) || Number.POSITIVE_INFINITY;
      let priceSortOrder = req.query?.priceOrder || "all";
      const size = req.query?.size?.toLowerCase() || "all";
      const carate = parseInt(req.query?.carate) || "all";
      const searchText = req.query?.search?.toLowerCase() || "";

      let result;

      // filter by category

      if (category === "all") {
        result = await productCollection.find({}).toArray();
      } else {
        result = await productCollection
          .find({ category: { $regex: category, $options: "i" } })
          .toArray();
      }

      // filter by price
      result = result.filter(
        (product) => product.price >= minPrice && product.price <= maxPrice
      );

      // sort by price
      if (priceSortOrder !== "all") {
        result.sort((a, b) => {
          return priceSortOrder === "asc"
            ? a.price - b.price // ascending order
            : b.price - a.price; // descending order?
        });
      }

      // filter by size
      if (size !== "all") {
        result = result.filter(
          (product) => product.size.toLowerCase() === size
        );
      }

      // filter by carate
      if (carate !== "all") {
        result = result.filter((product) => product.carate === carate);
      }

      // filter by search
      if (searchText !== "") {
        result = result.filter(
          (product) =>
            product.name.toLowerCase().includes(searchText) ||
            product.category.toLowerCase().includes(searchText)
        );
      }

      res.send(result);
    });

    // add new review to a product

    app.post("/products/add-review/:id", async (req, res) => {
      const id = req.params.id;
      const newReview = req.body;
      const filter = { _id: new ObjectId(id) };

      newReview.reviewDate = new Date();

      const result = await productCollection.updateOne(filter, {
        $push: { review: newReview },
      });

      res.send(result);
    });

    // delete review of a user from single product reviews
    app.delete(
      "/products/delete-review/:id/reviewer-email/:email",
      async (req, res) => {
        const { id, email } = req.params;
        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          { $pull: { review: { reviewerEmail: email } } }
        );

        res.send(result);
      }
    );

    // CATEGORIES GET METHOD
    app.get("/categories", async (req, res) => {
      const result = await categoryCollection.find({}).toArray();
      res.send(result);
    });

    // ALL REVIEWS GET METHOD
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find({}).toArray();
      res.send(result);
    });

    // CART RELATED API
    app.get("/cart", async (req, res) => {
      const email = req.query?.email;
      const result = await cartCollection.find({ email: email }).toArray();

      result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      res.send(result);
    });

    app.get("/cart/subtotal", async (req, res) => {
      const email = req.query.email;
      const cartData = await cartCollection.find({ email: email }).toArray();

      const subtotal = cartData.reduce((total, item) => {
        const price = item.price || 0;
        const quantity = item.quantity || 0;
        return total + price * quantity;
      }, 0);

      res.send({ subtotal: subtotal.toFixed(2) });
    });

    app.post("/cart", async (req, res) => {
      const body = req.body;
      const result = await cartCollection.insertOne(body);
      res.send(result);
    });

    app.patch("/cart/:id", async (req, res) => {
      const id = req.params.id;
      let quantity = parseInt(req.body.quantity);
      const operation = req.body.operation;

      if (operation === "plus") {
        quantity += 1;
      } else {
        if (quantity > 0) quantity -= 1;
      }

      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          quantity: quantity,
        },
      };

      const options = { upsert: true };

      const result = await cartCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete("/delete-cart-items", async (req, res) => {
      const email = req.query.email;
      const result = await cartCollection.deleteMany({ email: email });
      res.send(result);
    });

    // WISHLIST RELATED API
    app.get("/wishlist", async (req, res) => {
      const email = req.query?.email;
      const result = await wishlistCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.post("/wishlist", async (req, res) => {
      const body = req.body;
      const result = await wishlistCollection.insertOne(body);
      res.send(result);
    });

    // STRIPE PAYMENT RELATED API
    app.post("/create-payment-intent", async (req, res) => {
      const { orderPrice } = req.body;
      const amountInCent = parseInt(parseFloat(orderPrice) * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // ORDERS RELATED API
    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      const result = await orderCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.post("/orders", async (req, res) => {
      const orderObj = req.body;

      // add date to body
      orderObj.date = new Date();
      const result = await orderCollection.insertOne(orderObj);
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
