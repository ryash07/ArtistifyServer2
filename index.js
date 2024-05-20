const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
require("dotenv").config();
const CryptoJS = require("crypto-js");
const { calculateComparingPercentage } = require("./calculatePercentageChange");
const { formatSalesData } = require("./formatSalesData");
const stripe = require("stripe")(`${process.env.PAYMENT_GATEWAY_SECRET_KEY}`);
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;

// middlewares
app.use(cors({
    origin: ["https://artistify-omega.vercel.app"],
    methods: ["GET","POST","PUT","DELETE"],
    credentials:true
}));
app.use(express.json({ limit: "200mb" }));

// Verify JWT Token Middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: err.message });
    }

    req.decoded = decoded;
    next();
  });
};

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// MongoDB Connection
// const uri = `mongodb+srv://${process.env.DATABASE_USER}:${process.env.DATABASE_PASS}@cluster0.5732rtt.mongodb.net/?retryWrites=true&w=majority`;
const uri = 'mongodb+srv://yrs:Pass%40123@artistify.durrmc7.mongodb.net/';

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

    const ubJewellersDB = client.db("artistifyDB");
    const userCollection = ubJewellersDB.collection("users");
    // const userCollection2 = ubJewellersDB.collection("sellerUser");
    const productCollection = ubJewellersDB.collection("products");
    const productCollection2 = ubJewellersDB.collection("sellerProducts");
    const reviewCollection = ubJewellersDB.collection("reviews");
    const navNotificationCollection =
      ubJewellersDB.collection("navNotifications");
    const categoryCollection = ubJewellersDB.collection("categories");
    const categoryCollection2 = ubJewellersDB.collection("sellerCategories");
    const cartCollection = ubJewellersDB.collection("cart");
    const wishlistCollection = ubJewellersDB.collection("wishlist");
    const orderCollection = ubJewellersDB.collection("orders");
    const orderCollection2 = ubJewellersDB.collection("sellerOrders");

    // GENERATE JWT TOKEN
    app.post("/jwt", async (req, res) => {
      const userEmailObj = req.body;

      const token = jwt.sign(userEmailObj, process.env.JWT_SECRET_KEY, {
        expiresIn: "1h",
      });

      res.status(200).send({ token });
    });

    // VERIFY ADMIN MIDDLEWARE
    const verifyAdmin = async (req, res, next) => {
      const email = req?.decoded?.email;
      const user = await userCollection.findOne({ email: email });

      if (!user?.admin) {
        return res
          .status(404)
          .send({ error: true, message: "Forbidden Access" });
      }

      next();
    };

    // VERIFY SELLER MIDDLEWARE
    const verifySeller = async (req, res, next) => {
      const email = req?.decoded?.email;
      const user = await userCollection.findOne({ email: email });

      if (!user?.seller) {
        return res
          .status(404)
          .send({ error: true, message: "Forbidden Access" });
      }

      next();
    };

    // USERS RELATED API
    app.get("/user", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await userCollection.findOne({ email: email });
      res.send(result);
    });

    app.patch("/update-user", verifyJWT, async (req, res) => {
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
    app.patch("/users/shipping-address", verifyJWT, async (req, res) => {
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
    app.patch("/users/delete-address", verifyJWT, async (req, res) => {
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

    // UPLOAD USER IMAGE TO CLOUDINARY
    app.post("/cloudinary-upload", async (req, res) => {
      const { name, img } = req.body;

      cloudinary.uploader.upload(
        img,
        {
          public_id: name,
          resource_type: "image",
          overwrite: false,
          folder: "ub-jewellers-users-pic",
        },
        function (error, result) {
          if (error) {
            return res.send({ success: false, error: error });
          }

          return res.send({ success: true, imgURL: result.secure_url });
        }
      );
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

    // PRODUCTS RELATED API
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

      result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

      res.send(result);
    });

     // PRODUCTS RELATED API OF SELLER
     app.get("/products/seller", async (req, res) => {
      // search  query
      const productSearchText = req.query?.searchText;

      if (productSearchText === "") {
        return res.send([]);
      }

      if (productSearchText) {
        const result = await productCollection2
          .find({
            $or: [
              { name: { $regex: productSearchText, $options: "i" } },
              { category: { $regex: productSearchText, $options: "i" } },
            ],
          })
          .toArray();
        return res.send(result);
      }
      const result = await productCollection2.find({}).toArray();

      result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

      res.send(result);
    });

    // ADMIN PRODUCT POST API
    app.post("/products", verifyJWT, verifyAdmin, async (req, res) => {
      const body = req.body;

      const result = await productCollection.insertOne(body);
      res.send(result);
    });

     // PRODUCT POST API OF SELLER
     app.post("/products/seller", verifyJWT, async (req, res) => {
      const body = req.body;

      const result = await productCollection2.insertOne(body);
      res.send(result);
    });

    // ADMIN PRODUCTS API WITH ID
    app.put("/products/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedDoc = req.body;

      const result = await productCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedDoc }
      );
      res.send(result);
    });

    // PRODUCTS API WITH ID OF SELLER
    app.put("/products/seller/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updatedDoc = req.body;

      const result = await productCollection2.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedDoc }
      );
      res.send(result);
    });

    app.get("/single-product/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: id };
      const result = await productCollection.findOne(filter);
      result?.review?.sort(
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
      // const carate = parseInt(req.query?.carate) || "all";
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
        (product) =>
          parseFloat(product.price) >= minPrice &&
          parseFloat(product.price) <= maxPrice
      );

      // sort by price
      if (priceSortOrder !== "all") {
        result.sort((a, b) => {
          return priceSortOrder === "asc"
            ? parseFloat(a.price) - parseFloat(b.price) // ascending order
            : parseFloat(b.price) - parseFloat(a.price); // descending order?
        });
      }

      // filter by size
      if (size !== "all") {
        result = result.filter(
          (product) => product.size.toLowerCase() === size
        );
      }

      // filter by carate
      // if (carate !== "all") {
      //   result = result.filter((product) => product.carate === carate);
      // }

      // filter by search
      if (searchText !== "") {
        result = result.filter(
          (product) =>
            product.name.toLowerCase().includes(searchText) ||
            product.category.toLowerCase().includes(searchText)
        );
      }

      if (priceSortOrder === "all") {
        result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      }
      res.send(result);
    });

    // add new review to a product
    app.post("/products/add-review/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const newReview = req.body;
      const filter = { _id: id };

      newReview.reviewDate = new Date();

      const result = await productCollection.updateOne(filter, {
        $push: { review: newReview },
      });

      res.send(result);
    });

    // delete review of a user from single product reviews
    app.delete(
      "/products/delete-review/:id/reviewer-email/:email",
      verifyJWT,
      async (req, res) => {
        const { id, email } = req.params;
        const result = await productCollection.updateOne(
          { _id: id },
          { $pull: { review: { reviewerEmail: email } } }
        );

        res.send(result);
      }
    );

    // update like status of review of a single product
    app.post("/single-product-like-update", verifyJWT, async (req, res) => {
      const { productId, reviewId, email } = req.body;

      const product = await productCollection.findOne({
        _id: productId,
      });
      const review = product?.review?.find((r) => r._id == reviewId);

      // initialize likeCount and likedBy array
      if (!review?.likeCount) {
        review.likeCount = 0;
      }
      if (!review.likedBy) {
        review.likedBy = [];
      }

      // check if user already like the review
      const likedByLoggedUser = review?.likedBy?.includes(email);

      if (likedByLoggedUser) {
        if (review.likeCount > 0) {
          review.likeCount -= 1;
          review.likedBy = review.likedBy.filter(
            (userEmail) => userEmail !== email
          );
        } else {
          review.likeCount = 0;
          review.likedBy = review.likedBy.filter(
            (userEmail) => userEmail !== email
          );
        }
      } else {
        review.likeCount += 1;
        review.likedBy.push(email);
      }

      const result = await productCollection.updateOne(
        { _id: new ObjectId(productId) },
        {
          $set: { review: product.review },
        }
      );

      res.send(result);
    });

    // CATEGORIES API
    app.get("/categories", async (req, res) => {
      const result = await categoryCollection.find({}).toArray();
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.send(result);
    });

    app.post("/categories", verifyJWT, verifyAdmin, async (req, res) => {
      const body = req.body;
      body.createdAt = new Date();

      const result = await categoryCollection.insertOne(body);
      res.send(result);
    });

    app.patch("/categories/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const body = req.body;

      // keep category's prev/original state
      const prevCategory = await categoryCollection.findOne({
        _id: new ObjectId(id),
      });
      const prevCategoryName = prevCategory?.categoryName;

      const result = await categoryCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            categoryName: body.categoryName,
            categoryPic: body.categoryPic,
          },
        },
        { upsert: true }
      );

      // update category in products as well
      await productCollection.updateMany(
        { category: prevCategoryName },
        { $set: { category: body.categoryName } }
      );

      res.send(result);
    });

    // ALL REVIEWS GET METHOD
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find({}).toArray();
      result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      res.send(result);
    });
    app.post("/add-review", verifyJWT, async (req, res) => {
      const body = req.body;
      body.addedAt = new Date(body.addedAt);
      const result = await reviewCollection.insertOne(body);
      res.send(result);
    });

    app.delete("/delete-review/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const result = await reviewCollection.deleteOne({ email: email });
      res.send(result);
    });

    // CART RELATED API
    app.get("/cart", verifyJWT, async (req, res) => {
      const email = req.query?.email;
      const result = await cartCollection.find({ email: email }).toArray();

      result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      res.send(result);
    });

    app.get("/cart/subtotal", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const cartData = await cartCollection.find({ email: email }).toArray();

      const subtotal = cartData.reduce((total, item) => {
        const price = item.price || 0;
        const quantity = item.quantity || 0;
        return total + price * quantity;
      }, 0);

      res.send({ subtotal: subtotal.toFixed(2) });
    });

    app.post("/cart", verifyJWT, async (req, res) => {
      const body = req.body;
      const result = await cartCollection.insertOne(body);
      res.send(result);
    });

    app.patch("/cart/:id", verifyJWT, async (req, res) => {
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

    app.delete("/cart/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete("/delete-cart-items", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await cartCollection.deleteMany({ email: email });
      res.send(result);
    });

    // WISHLIST RELATED API
    app.get("/wishlist", verifyJWT, async (req, res) => {
      const email = req.query?.email;
      const result = await wishlistCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.post("/wishlist", verifyJWT, async (req, res) => {
      const body = req.body;
      const result = await wishlistCollection.insertOne(body);
      res.send(result);
    });

    app.delete("/wishlist/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const result = await wishlistCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // STRIPE PAYMENT RELATED API
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
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
    app.get("/orders", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await orderCollection.find({ email: email }).toArray();

      result.sort((a, b) => new Date(b.date) - new Date(a.date));

      res.send(result);
    });

    app.post("/orders", verifyJWT, async (req, res) => {
      const orderObj = req.body;

      // add date to body
      orderObj.date = new Date();
      const result = await orderCollection.insertOne(orderObj);

      // increment sold value of the products that are ordered
      for (const orderItem of orderObj.orderDetails) {
        const productId = orderItem.productId;
        const quantity = orderItem.quantity;

        await productCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $inc: { sold: quantity, stock: -quantity } }
        );
      }

      res.send(result);
    });

    app.delete("/delete-order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const orderObj = await orderCollection.findOne({ _id: new ObjectId(id) });

      // decrease sold value of the deleted ordered products
      for (const orderItem of orderObj.orderDetails) {
        const productId = orderItem.productId;
        const quantity = orderItem.quantity;

        await productCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $inc: { sold: -quantity, stock: quantity } }
        );
      }

      const result = await orderCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ADMIN DASHBOARD RELATED API
    app.get(
      "/admin-dashboard/stats",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        // Get current month and last month start dates
        const currentDate = new Date();
        const currentMonthStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          1
        );
        const lastMonthStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1
        );

        let lastMonth = new Date();
        lastMonth.setMonth(new Date().getMonth() - 1);
        lastMonth = lastMonth.toLocaleString("default", { month: "long" });

        // Calculating sales, orders, averageOrder for current month
        const currentMonthStats = await orderCollection
          .aggregate([
            {
              $match: {
                date: {
                  $gte: currentMonthStart,
                  $lt: currentDate,
                },
              },
            },
            {
              $group: {
                _id: null,
                totalSells: { $sum: { $toDouble: "$total" } },
                totalOrders: { $sum: 1 },
                averageOrderValue: { $avg: { $toDouble: "$total" } },
              },
            },
          ])
          .toArray();

        // calculating values of last month
        const lastMonthStats = await orderCollection
          .aggregate([
            {
              $match: {
                date: { $gte: lastMonthStart, $lt: currentMonthStart },
              },
            },
            {
              $group: {
                _id: null,
                totalSells: { $sum: { $toDouble: "$total" } },
                totalOrders: { $sum: 1 },
                averageOrderValue: { $avg: { $toDouble: "$total" } },
              },
            },
          ])
          .toArray();

        const currentMonthStatsData = currentMonthStats[0] || {
          totalSells: 0,
          totalOrders: 0,
          averageOrderValue: 0,
        };
        const lastMonthStatsData = lastMonthStats[0] || {
          totalSells: 0,
          totalOrders: 0,
          averageOrderValue: 0,
        };

        // Calculate customers data
        const newCustomers = await userCollection.countDocuments({
          createdAt: {
            $gte: currentMonthStart,
            $lt: currentDate,
          },
        });

        const lastMonthCustomers = await userCollection.countDocuments({
          createdAt: {
            $gte: lastMonthStart,
            $lt: currentMonthStart,
          },
        });

        const customerStatsData = { newCustomers, lastMonthCustomers };

        const response = {
          currentMonthStatsData,
          lastMonthStatsData: {
            ...lastMonthStatsData,
            lastMonth,
            year: lastMonthStart.getFullYear(),
          },

          customerStatsData,

          lastMonthComparisonPercentage: {
            totalSellsPercentage: calculateComparingPercentage(
              currentMonthStatsData?.totalSells,
              lastMonthStatsData?.totalSells
            ),
            totalOrdersPercentage: calculateComparingPercentage(
              currentMonthStatsData.totalOrders,
              lastMonthStatsData.totalOrders
            ),
            averageOrderValuePercentage: calculateComparingPercentage(
              currentMonthStatsData.averageOrderValue,
              lastMonthStatsData.averageOrderValue
            ),
            customersPercentage: calculateComparingPercentage(
              customerStatsData.newCustomers,
              customerStatsData.lastMonthCustomers
            ),
          },
        };

        res.send(response);
      }
    );

     // SELLER DASHBOARD RELATED API
    app.get(
      "/seller-dashboard/stats",
      verifyJWT,
      verifySeller,
      async (req, res) => {
        // Get current month and last month start dates
        const currentDate = new Date();
        const currentMonthStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          1
        );
        const lastMonthStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1
        );

        let lastMonth = new Date();
        lastMonth.setMonth(new Date().getMonth() - 1);
        lastMonth = lastMonth.toLocaleString("default", { month: "long" });

        // Calculating sales, orders, averageOrder for current month
        const currentMonthStats = await orderCollection2
          .aggregate([
            {
              $match: {
                date: {
                  $gte: currentMonthStart,
                  $lt: currentDate,
                },
              },
            },
            {
              $group: {
                _id: null,
                totalSells: { $sum: { $toDouble: "$total" } },
                totalOrders: { $sum: 1 },
                averageOrderValue: { $avg: { $toDouble: "$total" } },
              },
            },
          ])
          .toArray();

        // calculating values of last month
        const lastMonthStats = await orderCollection2
          .aggregate([
            {
              $match: {
                date: { $gte: lastMonthStart, $lt: currentMonthStart },
              },
            },
            {
              $group: {
                _id: null,
                totalSells: { $sum: { $toDouble: "$total" } },
                totalOrders: { $sum: 1 },
                averageOrderValue: { $avg: { $toDouble: "$total" } },
              },
            },
          ])
          .toArray();

        const currentMonthStatsData = currentMonthStats[0] || {
          totalSells: 0,
          totalOrders: 0,
          averageOrderValue: 0,
        };
        const lastMonthStatsData = lastMonthStats[0] || {
          totalSells: 0,
          totalOrders: 0,
          averageOrderValue: 0,
        };

        // Calculate customers data
        const newCustomers = await userCollection.countDocuments({
          createdAt: {
            $gte: currentMonthStart,
            $lt: currentDate,
          },
        });

        const lastMonthCustomers = await userCollection.countDocuments({
          createdAt: {
            $gte: lastMonthStart,
            $lt: currentMonthStart,
          },
        });

        const customerStatsData = { newCustomers, lastMonthCustomers };

        const response = {
          currentMonthStatsData,
          lastMonthStatsData: {
            ...lastMonthStatsData,
            lastMonth,
            year: lastMonthStart.getFullYear(),
          },

          customerStatsData,

          lastMonthComparisonPercentage: {
            totalSellsPercentage: calculateComparingPercentage(
              currentMonthStatsData?.totalSells,
              lastMonthStatsData?.totalSells
            ),
            totalOrdersPercentage: calculateComparingPercentage(
              currentMonthStatsData.totalOrders,
              lastMonthStatsData.totalOrders
            ),
            averageOrderValuePercentage: calculateComparingPercentage(
              currentMonthStatsData.averageOrderValue,
              lastMonthStatsData.averageOrderValue
            ),
            customersPercentage: calculateComparingPercentage(
              customerStatsData.newCustomers,
              customerStatsData.lastMonthCustomers
            ),
          },
        };

        res.send(response);
      }
    );

    app.get(
      "/admin-dashboard/top-selling-categories",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        // total number of categories
        const totalCategories =
          await categoryCollection.estimatedDocumentCount();

        // find top sold categories
        const result = await productCollection
          .aggregate([
            {
              $group: {
                _id: "$category",
                totalSold: { $sum: "$sold" },
              },
            },
            {
              $sort: { totalSold: -1 },
            },
            {
              $limit: 6,
            },
          ])
          .toArray();

        res.send({ totalCategories, topCategories: result });
      }
    );

    app.get(
      "/seller-dashboard/top-selling-categories",
      verifyJWT,
      verifySeller,
      async (req, res) => {
        // total number of categories
        const totalCategories =
          await categoryCollection2.estimatedDocumentCount();

        // find top sold categories
        const result = await productCollection2
          .aggregate([
            {
              $group: {
                _id: "$category",
                totalSold: { $sum: "$sold" },
              },
            },
            {
              $sort: { totalSold: -1 },
            },
            {
              $limit: 6,
            },
          ])
          .toArray();

        res.send({ totalCategories, topCategories: result });
      }
    );

    // Income Statistics data for last 5 and current month
    app.get(
      "/admin-dashboard/income-stats",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;

        // Calculate sales for the last 5 months and the current month
        let salesData = await Promise.all(
          Array.from({ length: 6 }).map(async (_, index) => {
            const month = currentMonth - index;
            const monthName = new Date(2000, month - 1, 1).toLocaleString(
              "en-US",
              { month: "long" }
            );

            const startOfMonth = new Date(
              currentDate.getFullYear(),
              month - 1,
              1
            );
            const endOfMonth = new Date(
              currentDate.getFullYear(),
              month,
              0,
              23,
              59,
              59,
              999
            );

            const totalSales = await orderCollection
              .find({ date: { $gte: startOfMonth, $lte: endOfMonth } })
              .toArray()
              .then((orders) =>
                orders.reduce((acc, order) => acc + parseFloat(order.total), 0)
              )
              .catch((err) => {
                throw err;
              });

            const totalOrders = await orderCollection
              .find({
                date: { $gte: startOfMonth, $lte: endOfMonth },
              })
              .toArray();

            return {
              monthName,
              totalSales: totalSales?.toFixed(2) || 0,
              totalOrders: totalOrders?.length,
            };
          })
        );

        salesData = salesData.sort();
        salesData = salesData.reverse();
        res.json(salesData);
      }
    );

    // Seller Income Statistics data for last 5 and current month 
    app.get(
      "/seller-dashboard/income-stats",
      verifyJWT,
      // verifySeller,
      async (req, res) => {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;

        // Calculate sales for the last 5 months and the current month
        let salesData = await Promise.all(
          Array.from({ length: 6 }).map(async (_, index) => {
            const month = currentMonth - index;
            const monthName = new Date(2000, month - 1, 1).toLocaleString(
              "en-US",
              { month: "long" }
            );

            const startOfMonth = new Date(
              currentDate.getFullYear(),
              month - 1,
              1
            );
            const endOfMonth = new Date(
              currentDate.getFullYear(),
              month,
              0,
              23,
              59,
              59,
              999
            );

            const totalSales = await orderCollection2
              .find({ date: { $gte: startOfMonth, $lte: endOfMonth } })
              .toArray()
              .then((orders) =>
                orders.reduce((acc, order) => acc + parseFloat(order.total), 0)
              )
              .catch((err) => {
                throw err;
              });

            const totalOrders = await orderCollection2
              .find({
                date: { $gte: startOfMonth, $lte: endOfMonth },
              })
              .toArray();

            return {
              monthName,
              totalSales: totalSales?.toFixed(2) || 0,
              totalOrders: totalOrders?.length,
            };
          })
        );

        salesData = salesData.sort();
        salesData = salesData.reverse();
        res.json(salesData);
      }
    );

    // Best Selling/Popular Products
    app.get(
      "/admin-dashboard/popular-products",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const products = await productCollection.find({}).toArray();

        let popularProducts = products?.sort((a, b) => b.sold - a.sold);

        // top 10 best selling products
        popularProducts = popularProducts.slice(0, 10);

        res.send(popularProducts);
      }
    );

    // Best Selling/Popular Products Seller
    app.get(
      "/seller-dashboard/popular-products",
      verifyJWT,
      // verifySeller,
      async (req, res) => {
        const products = await productCollection2.find({}).toArray();

        let popularProducts = products?.sort((a, b) => b.sold - a.sold);

        // top 10 best selling products
        popularProducts = popularProducts.slice(0, 10);

        res.send(popularProducts);
      }
    );

    // Recent Reviews
    app.get(
      "/admin-dashboard/recent-reviews",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const reviews = await reviewCollection.find({}).toArray();

        let recentReviews = reviews?.sort(
          (a, b) => new Date(b.addedAt) - new Date(a.addedAt)
        );

        res.send(recentReviews?.slice(0, 4));
      }
    );

    // ADMIN CATEGORIES ROUTE API
    app.get("/admin/categories", verifyJWT, verifyAdmin, async (req, res) => {
      const products = await productCollection.find({}).toArray();
      const categories = await categoryCollection.find({}).toArray();
      let updatedCategories = categories?.map((c) => {
        return {
          categoryId: c._id,
          categoryName: c.categoryName,
          categoryPic: c.categoryPic,
          createdAt: c.createdAt,
          itemCount: 0,
        };
      });

      for (const item of products) {
        for (let i = 0; i < updatedCategories.length; i++) {
          if (
            updatedCategories[i].categoryName?.toLowerCase() ===
            item.category.toLowerCase()
          ) {
            updatedCategories[i].itemCount += 1;
            matchedFlag = 1;
            break;
          }
        }
      }

      updatedCategories.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      res.send(updatedCategories);
    });

    // ADMIN PRODUCTS ROUTE API
    app.delete(
      "/admin/delete-product/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        const result = await productCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    // ADMIN ORDER ROUTE API
    app.get("/admin/orders", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await orderCollection.find({}).toArray();
      result.sort((a, b) => new Date(b.date) - new Date(a.date));
      res.send(result);
    });

    app.patch(
      "/admin/update-order/:orderId",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.orderId;
        const body = req.body;

        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus: body.orderStatus } },
          { upsert: true }
        );

        res.send(result);
      }
    );

    app.get("/admin/total-spent", verifyJWT, verifyAdmin, async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: "$email",
            totalOrdersCount: { $sum: 1 },
            totalSpent: { $sum: { $toDouble: "$total" } },
          },
        },
        {
          $project: {
            email: "$_id",
            totalOrdersCount: 1,
            totalSpent: 1,
            _id: 0,
          },
        },
      ];

      const result = await orderCollection.aggregate(pipeline).toArray();

      res.send(result);
    });

    // ADMIN USERS ROUTE API
    app.get("/admin/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find({}).toArray();
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.send(result);
    });

    app.patch(
      "/admin/users/make-admin/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const body = req.body;

        const result = await userCollection.updateOne(
          { email: email },
          { $set: { admin: body.admin } },
          { upsert: true }
        );

        res.send(result);
      }
    );

    app.delete(
      "/admin/delete-user/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const userEmail = req.params.email;

        // Collections to cascade delete from
        const collectionsToCascadeDelete = [
          "users",
          "orders",
          "cart",
          "wishlist",
        ];

        const deletePromises = collectionsToCascadeDelete.map(
          async (collectionName) => {
            return await ubJewellersDB
              .collection(collectionName)
              .deleteMany({ email: userEmail });
          }
        );

        const deleteResults = await Promise.all(deletePromises);

        res.status(200).json({
          deleteResults,
          success: true,
          message: `User '${userEmail}' and associated data deleted successfully.`,
        });
      }
    );

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
  res.send("Artistify Server is up and running!");
});

app.listen(port, () => {
  console.log("artistify server is running on port:", port);
});
