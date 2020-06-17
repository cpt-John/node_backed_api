const express = require("express");
const cors = require("cors");
const app = express();
const bodyParser = require("body-parser");
const { isNumber } = require("util");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const cryptoRandomString = require("crypto-random-string");
const nodemailer = require("nodemailer");
const mongodb = require("mongodb");

const port = process.env.PORT || 3000;
dotenv.config();

app.use(cors());
app.use(bodyParser.json());

app.listen(port, () => {
  console.log("app listing in port " + port);
});

//mongodb

const uri = `mongodb+srv://${process.env.D_EMAIL}:${process.env.D_PASSWORD}@cluster0-lyx1k.mongodb.net/VarDB?retryWrites=true&w=majority`;
const mongoClient = mongodb.MongoClient;

// room booking api

const rooms = [];

app.get("/", function (req, res) {
  res.send(`availabele end points : \n
 [POST] /addRoom => req should be in the format {number:str,seats:int,rate:int, options:[str]} \n
 [POST] /bookRoom => req should be in the format {roomNo :str,custName:str, date:mn/day/yr,hrTimeStart:int(24hrformat eg. 6),totalHrs:int} \n
 [GET] /getBookings \n
  [GET]/adminDetails 
   `);
});

app.post("/addRoom", function (req, res) {
  if (
    !req.body["number"] ||
    !isNumber(req.body["seats"]) ||
    !isNumber(req.body["rate"]) ||
    !req.body["options"]
  ) {
    res.json({
      message:
        "req should be in the format {number:str,seats:int,rate:int, options:[str]}",
    });
    return;
  }
  let added = addRoom(
    req.body["number"],
    req.body["seats"],
    req.body["rate"],
    req.body["options"]
  );
  if (!added) {
    res.json({ message: "room already exists" });
  } else res.json({ message: `room ${req.body["number"]} added` });
});

function addRoom(number, seats, rate, options) {
  let exists = rooms.some((room) => {
    return room["number"] == number;
  });
  if (exists) {
    return false;
  }
  rooms.push({
    number,
    seats,
    rate,
    options,
    bookings: [],
  });
  return true;
}

app.post("/bookRoom", function (req, res) {
  let date = new Date(req.body["date"]);

  if (
    !req.body["roomNo"] ||
    !req.body["custName"] ||
    isNaN(date) ||
    !isNumber(req.body["hrTimeStart"]) ||
    !isNumber(req.body["totalHrs"])
  ) {
    res.json({
      message:
        "req should be in the format {roomNo :str,custName:str, date:mn/day/yr,hrTimeStart:int(24hrformat eg. 6),totalHrs:int}",
    });
    return;
  }
  let result = bookRoom(
    req.body["roomNo"],
    req.body["custName"],
    date,
    req.body["hrTimeStart"],
    req.body["totalHrs"]
  );
  if (!result)
    res.json({
      message: "booking failed bad request or booking not available",
    });
  else {
    res.json({ message: "room booked!" });
  }
});

function bookRoom(roomNo, custName, date, timeStart, hrs) {
  let startTime = date.getTime() + timeStart * 60 * 60 * 1000;
  let endTime = startTime + hrs * 60 * 60 * 1000;
  let roomIndx = 0;
  let canBook = rooms.some((room, i) => {
    roomIndx = i;
    return room["number"] == roomNo;
  });
  if (canBook) {
    rooms[roomIndx]["bookings"].forEach((booking) => {
      if (!(booking["startTime"] > endTime || booking["endTime"] < startTime)) {
        canBook = false;
      }
    });
  }

  if (canBook) {
    bill =
      (new Date(endTime).getHours() - new Date(startTime).getHours()) *
      rooms[roomIndx]["rate"];
    rooms[roomIndx]["bookings"].push({
      custName,
      startTime,
      endTime,
      bill,
    });
    return true;
  } else return false;
}

app.get("/getBookings", function (req, res) {
  let result = rooms.map((room) => {
    let bookings = room["bookings"].map((booking) => {
      return {
        customer_name: booking["custName"],
        start: new Date(booking["startTime"]).toLocaleString(),
        end: new Date(booking["endTime"]).toLocaleString(),
        bill: booking["bill"],
      };
    });
    return { Room: room["number"], bookings };
  });
  res.json({ message: result });
});

app.get("/adminDetails", function (req, res) {
  res.json({ message: rooms });
});

// student mentor api
let students = { assigned: [], unassigned: [] };
let mentors = [];

app.post("/createStudent", function (req, res) {
  if (!req.body["name"]) {
    res.status(400).json({
      message: "req should be in the format {name:str,otherDetails:[str]}",
    });
    return;
  }
  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
    }
    const collection = client.db("VarDB").collection("variables");
    collection.updateOne(
      { _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450") },
      { $push: { "students.unassigned": { ...req.body, mentor: "" } } },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
        } else {
          res.json({ message: "student added" });
        }
      }
    );
    client.close();
  });
});

app.post("/createMentor", function (req, res) {
  if (!req.body["name"]) {
    res.status(400).json({
      message: "req should be in the format {name:str,otherDetails:[str]}",
    });
    return;
  }

  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
    }
    const collection = client.db("VarDB").collection("variables");
    collection.updateOne(
      { _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450") },
      { $push: { mentors: req.body } },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
        } else {
          res.json({ message: "mentor added" });
        }
      }
    );
    client.close();
  });
});

app.post("/assignStudents", function (req, res) {
  if (!req.body["mentorName"] || !req.body["students"]) {
    res.status(400).json({
      message: "req should be in the format {mentorName:str,students:[str]}",
    });
    return;
  }
  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
      throw "failed!";
    }
    const collection = client.db("VarDB").collection("variables");
    collection.findOne(
      {
        _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450"),
      },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
          throw "failed!";
        } else {
          assignStudents(
            req.body["mentorName"],
            req.body["students"],
            result["students"]["unassigned"],
            res
          );
        }
      }
    );
    client.close();
  });
});

function assignStudents(mentorName, students_, unassigned, res) {
  let newUnassigned = [];
  let newAssigned = [];
  unassigned.forEach((s) => {
    if (!students_.includes(s["name"])) {
      newUnassigned.push(s);
    } else {
      s["mentor"] = mentorName;
      newAssigned.push(s);
    }
  });
  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
      throw "failed!";
    }
    const collection = client.db("VarDB").collection("variables");
    collection.updateOne(
      { _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450") },
      { $push: { "students.assigned": { $each: newAssigned } } },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
          throw "failed!";
        } else {
        }
      }
    );
    collection.updateOne(
      { _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450") },
      { $set: { "students.unassigned": newUnassigned } },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
          throw "failed!";
        } else {
          res.json({ message: "students assigned" });
        }
      }
    );
    client.close();
  });
}

app.post("/assignStudent", function (req, res) {
  if (!req.body["mentorName"] || !req.body["student"]) {
    res.status(400).json({
      message: "req should be in the format {mentorName:str,student:[str]}",
    });
    return;
  }
  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
      throw "failed!";
    }
    const collection = client.db("VarDB").collection("variables");
    let index = 0;
    collection.findOne(
      {
        _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450"),
      },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
          throw "failed!";
        } else {
          result["students"]["assigned"].forEach((student, i) => {
            if (student["name"] == req.body["student"]) {
              index = i;
            }
          });
        }
      }
    );
    collection.updateOne(
      { _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450") },
      {
        $set: {
          ["students.assigned." + index + ".mentor"]: req.body["mentorName"],
        },
      },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to add" });
          throw "failed!";
        } else {
          res.json({ message: "student assigned" });
        }
      }
    );
    client.close();
  });
});

app.get("/students", function (req, res) {
  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
      throw "failed!";
    }
    const collection = client.db("VarDB").collection("variables");
    collection.findOne(
      {
        _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450"),
      },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to retreive students" });
          throw "failed!";
        } else {
          res.json(result["students"]);
        }
      }
    );
    client.close();
  });
});
app.get("/mentors", function (req, res) {
  mongoClient.connect(uri, (err, client) => {
    if (err) {
      res.status(500).json({ message: "filed to connect db" });
      throw "failed!";
    }
    const collection = client.db("VarDB").collection("variables");
    collection.findOne(
      {
        _id: mongodb.ObjectID("5ee8c7061f687a4ca447a450"),
      },
      function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to retreive mentors" });
          throw "failed!";
        } else {
          res.json(result["mentors"]);
        }
      }
    );
    client.close();
  });
});

//login and register api
//mailing
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.C_EMAIL,
    pass: process.env.C_PASSWORD,
  },
});

async function verificationMail(toMail, sessionLink) {
  link = "http://localhost:4200/#/resetpass/";
  let mailOptions = {
    from: process.env.EMAIL,
    to: toMail,
    subject: "verification link",

    html: `<p>follow this link to reset password:</p></br>
    <a href=${link + sessionLink}>Click HERE</a>`,
  };
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log("error is " + error);
        resolve({ status: false, message: error });
      } else {
        console.log("Email sent: " + info.response);
        resolve({ status: true });
      }
    });
  });
}

app.post("/login", function (req, res) {
  if (!req.body["email"] || !req.body["password"]) {
    res.status(400).json({
      message: "email or password missing",
    });
    return;
  }
  mongoClient.connect(
    uri,
    {
      useUnifiedTopology: true,
    },
    (err, client) => {
      if (err) {
        res.status(500).json({ message: "filed to connect db" });
        client.close();
        return;
      }
      const collection = client.db("VarDB").collection("users");
      collection.findOne({ email: req.body["email"] }, async function (
        err,
        result
      ) {
        if (err) {
          res.status(500).json({ message: "filed to retreive" });
        } else {
          if (!result) res.status(401).json({ message: "email dosent exist" });
          else {
            await bcrypt.compare(
              req.body["password"],
              result["password"],
              function (err, result_) {
                if (err)
                  res.status(500).json({
                    message: "virification failed!",
                  });
                else if (result_)
                  res.status(200).json({
                    message: "logged in!",
                  });
                else
                  res.status(401).json({
                    message: "password wrong!",
                  });
              }
            );
          }
        }
        client.close();
      });
    }
  );
});

app.post("/register", async function (req, res) {
  if (!req.body["email"] || !req.body["password"] || !req.body["name"]) {
    res.status(400).json({
      message: "email or password or name missing",
    });
    return;
  }
  let continue_ = true;
  await bcrypt.hash(req.body["password"], 10, function (err, hash) {
    if (err) {
      res.status(500).json({ message: "filed to hash password" });
      continue_ = false;
    } else {
      console.log(hash);
      req.body["password"] = hash;
    }
  });
  if (!continue_) return;
  mongoClient.connect(
    uri,
    {
      useUnifiedTopology: true,
    },
    (err, client) => {
      if (err) {
        res.status(500).json({ message: "filed to connect db" });
        client.close();
        return;
      }
      const collection = client.db("VarDB").collection("users");

      //verify existing

      collection.findOne({ email: req.body["email"] }, function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to retreive" });
        } else {
          if (result) {
            res.status(400).json({ message: "email already exists" });
            client.close();
          } else {
            //insert
            collection.insertOne(req.body, function (err, result) {
              if (err) {
                res.status(500).json({ message: "filed to register" });
              } else {
                res.status(200).json({
                  message: "Registered!",
                });
              }
              client.close();
            });
          }
        }
      });
    }
  );
});

app.post("/verificationMail", function (req, res) {
  if (!req.body["email"]) {
    res.status(400).json({
      message: "email  missing",
    });
    return;
  }
  mongoClient.connect(
    uri,
    {
      useUnifiedTopology: true,
    },
    (err, client) => {
      if (err) {
        res.status(500).json({ message: "filed to connect db" });
        client.close();
        return;
      }
      const collection = client.db("VarDB").collection("users");
      collection.findOne({ email: req.body["email"] }, function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to retreive" });
        } else {
          if (!result) res.status(401).json({ message: "email dosent exist" });
          else {
            let key = cryptoRandomString({ length: 10, type: "url-safe" });
            let sessionLink = `${result["email"]}/${key}`;
            collection.updateOne(
              { email: result["email"] },
              { $set: { sessionKey: key } },
              async function (err, result) {
                if (err) {
                  res.status(500).json({ message: "filed to reset" });
                } else {
                  let mailStatus = await verificationMail(
                    req.body["email"],
                    sessionLink
                  );
                  if (mailStatus["status"]) {
                    res.status(200).json({
                      message: "verification send to: " + req.body["email"],
                    });
                  } else
                    res.status(500).json({
                      message: "mailing failed",
                    });
                }
                client.close();
              }
            );
          }
        }
      });
    }
  );
});

app.post("/resetPassSession", function (req, res) {
  if (!req.body["email"] || !req.body["sessionKey"]) {
    res.status(400).json({
      message: "error in link!",
    });
    return;
  }
  mongoClient.connect(
    uri,
    {
      useUnifiedTopology: true,
    },
    (err, client) => {
      if (err) {
        res.status(500).json({ message: "filed to connect db" });
        client.close();
        return;
      }
      const collection = client.db("VarDB").collection("users");
      collection.findOne({ email: req.body["email"] }, function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to retreive" });
        } else {
          if (!result) res.status(401).json({ message: "email dosent exist" });
          else if (
            result["sessionKey"] == req.body["sessionKey"] &&
            result["sessionKey"]
          )
            res.status(200).json({
              message: "can reset password!",
            });
          else
            res.status(401).json({
              message: "error in session!",
            });
        }
        client.close();
      });
    }
  );
});

app.post("/resetPassword", async function (req, res) {
  if (
    !req.body["email"] ||
    !req.body["newPassword"] ||
    !req.body["sessionKey"]
  ) {
    res.status(400).json({
      message: "email or password or key missing",
    });
    return;
  }
  let continue_ = true;
  await bcrypt.hash(req.body["newPassword"], 10, function (err, hash) {
    if (err) {
      res.status(500).json({ message: "filed to hash password" });
      continue_ = false;
    } else {
      req.body["newPassword"] = hash;
    }
  });
  if (!continue_) {
    return;
  }
  mongoClient.connect(
    uri,
    {
      useUnifiedTopology: true,
    },
    (err, client) => {
      if (err) {
        res.status(500).json({ message: "filed to connect db" });
        client.close();
        return;
      }
      const collection = client.db("VarDB").collection("users");

      //verify existing

      collection.findOne({ email: req.body["email"] }, function (err, result) {
        if (err) {
          res.status(500).json({ message: "filed to retreive" });
        } else {
          if (!result) {
            res.status(400).json({ message: "email does not exist" });
            client.close();
          } else if (
            result["sessionKey"] != req.body["sessionKey"] ||
            !result["sessionKey"]
          ) {
            res.status(400).json({ message: "key is wrong" });
            client.close();
          } else {
            //insert

            collection.updateMany(
              { email: result["email"] },
              {
                $set: { password: req.body.newPassword },
                $unset: { sessionKey: "" },
              },
              function (err, result) {
                if (err) {
                  res.status(500).json({ message: "filed to reset" });
                } else {
                  res.status(200).json({
                    message: "password updated!",
                  });
                }
                client.close();
              }
            );
          }
        }
      });
    }
  );
});
