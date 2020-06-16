const express = require("express");
const cors = require("cors");
const app = express();
const bodyParser = require("body-parser");
const { isNumber } = require("util");
const { exists } = require("fs");

const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

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
app.listen(port, () => {
  console.log("app listing in port " + port);
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
  students.unassigned.push({ ...req.body, mentor: "" });
  res.json({ message: "student added" });
});

app.post("/createMentor", function (req, res) {
  if (!req.body["name"]) {
    res.status(400).json({
      message: "req should be in the format {name:str,otherDetails:[str]}",
    });
    return;
  }
  mentors.push(req.body);
  res.json({ message: "mentor added" });
});

app.post("/assignStudents", function (req, res) {
  if (!req.body["mentorName"] || !req.body["students"]) {
    res.status(400).json({
      message: "req should be in the format {mentorName:str,students:[str]}",
    });
    return;
  }
  assignStudents(req.body["mentorName"], req.body["students"]);
  res.json({ message: "students assigned" });
});

function assignStudents(mentorName, students_) {
  let newUnassigned = [];
  students.unassigned.forEach((s) => {
    if (!students_.includes(s["name"])) {
      newUnassigned.push(s);
    } else {
      s["mentor"] = mentorName;
      students.assigned.push(s);
    }
  });
  students.unassigned = [...newUnassigned];
}

app.post("/assignStudent", function (req, res) {
  if (!req.body["mentorName"] || !req.body["student"]) {
    res.status(400).json({
      message: "req should be in the format {mentorName:str,student:[str]}",
    });
    return;
  }
  assignStudents(req.body["mentorName"], [req.body["student"]]);
  res.json({ message: "student assigned" });
});

app.get("/students", function (req, res) {
  res.json(students);
});
app.get("/mentors", function (req, res) {
  res.json(mentors);
});
